/* eslint-disable */
// 布局检测台入口：真实 Chromium 布局下逐行对比 CM6 坐标模型 vs 实际 DOM 位置
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { baseExtensions } from '../../src/renderer/editor/extensions'
import { findGapAnchor } from '../../src/renderer/editor/blocks'
import { forceFullMeasure } from '../../src/renderer/editor/fullMeasure'
import designDoc from '../../docs/DESIGN.md'
import '../../src/renderer/assets/base.css'

const MINIMAL_DOC = [
  '# Title',
  '',
  'intro line',
  '',
  '| H1 | H2 |',
  '| --- | --- |',
  '| a1 | a2 |',
  '| b1 | b2 |',
  '| c1 | c2 |',
  '',
  'AFTER TABLE LINE 1',
  'AFTER TABLE LINE 2',
].join('\n')

function raf(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

function actualTop(view: EditorView, pos: number): number | null {
  const { node, offset } = view.domAtPos(pos)
  const range = document.createRange()
  range.setStart(node, offset)
  range.setEnd(node, offset)
  const rect = range.getBoundingClientRect()
  return rect.height === 0 && rect.top === 0 ? null : rect.top
}

function realClickTest(view: EditorView, label: string): void {
  const doc = view.state.doc
  const bad: unknown[] = []
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const m = /^(#{1,6}\s+)(.*)$/.exec(line.text)
    if (!m) continue
    const textStart = line.from + (m[1]?.length ?? 0)
    const half = Math.floor(((m[2]?.length ?? 1) || 1) / 2)
    const coords = view.coordsAtPos(textStart + half)
    if (!coords) continue
    const domLine = (() => {
      const { node } = view.domAtPos(textStart)
      const p = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
      return p?.closest('.cm-line') as HTMLElement | null
    })()
    const dr = domLine?.getBoundingClientRect()
    if (!dr || dr.top < 4 || dr.bottom > window.innerHeight - 4) continue
    const opts = { bubbles: true, cancelable: true, clientX: coords.left + 2, clientY: coords.top + 6, button: 0 }
    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', opts))
    view.contentDOM.dispatchEvent(new MouseEvent('mouseup', opts))
    view.contentDOM.dispatchEvent(new MouseEvent('click', opts))
    const selLine = doc.lineAt(view.state.selection.main.head).number
    if (selLine !== i) bad.push({ line: i, selLine, text: line.text.slice(0, 18) })
  }
  console.log(
    `[HARNESS] ${label} real-click: bad=${bad.length}` +
      (bad.length ? ' ' + JSON.stringify(bad.slice(0, 10)) : ''),
  )
}

function checkView(view: EditorView, label: string): void {
  const mismatches: unknown[] = []
  const doc = view.state.doc
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const model = view.coordsAtPos(line.from)
    const actual = actualTop(view, line.from)
    if (!model || actual === null) continue
    const delta = actual - model.top
    if (Math.abs(delta) > 1.5) {
      mismatches.push({
        line: i,
        delta: Math.round(delta * 10) / 10,
        text: line.text.slice(0, 30),
      })
    }
  }
  console.log(
    `[HARNESS] ${label}: ${doc.lines} lines, mismatches=${mismatches.length}` +
      (mismatches.length ? ' ' + JSON.stringify(mismatches.slice(0, 12)) : ''),
  )

  // posAtCoords 回环测试：点击每个标题行【可见文本】的中点应落回同一行
  const badClicks: unknown[] = []
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const m = /^(#{1,6}\s+)(.*)$/.exec(line.text)
    if (!m) continue
    const textStart = line.from + (m[1]?.length ?? 0)
    const half = Math.floor(((m[2]?.length ?? 1) || 1) / 2)
    const coords = view.coordsAtPos(textStart + half)
    if (!coords) continue
    // DOM 实测可见性过滤（coordsAtPos 对未绘制位置会返回外推坐标，不可信）
    const domLine = (() => {
      const { node } = view.domAtPos(textStart)
      const p = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
      return p?.closest('.cm-line') as HTMLElement | null
    })()
    const dr = domLine?.getBoundingClientRect()
    if (!dr || dr.top < 4 || dr.bottom > window.innerHeight - 4) continue
    const hit = view.posAtCoords({ x: coords.left + 2, y: coords.top + 4 })
    if (hit === null) continue
    const hitLine = doc.lineAt(hit).number
    if (hitLine !== i) {
      badClicks.push({ line: i, hitLine, text: line.text.slice(0, 24) })
    }
  }
  console.log(
    `[HARNESS] ${label} click-roundtrip: bad=${badClicks.length}` +
      (badClicks.length ? ' ' + JSON.stringify(badClicks.slice(0, 12)) : ''),
  )
}

function diagLine(view: EditorView, lineNo: number, label: string): void {
  const line = view.state.doc.line(lineNo)
  const domRect = (() => {
    const { node, offset } = view.domAtPos(line.from)
    const parent = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
    return parent?.closest('.cm-line')?.getBoundingClientRect() ?? null
  })()
  const block = view.lineBlockAt(line.from)
  console.log(
    `[HARNESS] diag ${label} line#${lineNo} "${line.text.slice(0, 16)}" ` +
      `block.top=${Math.round(block.top)} h=${Math.round(block.height)} ` +
      `dom.top=${domRect ? Math.round(domRect.top) : '?'} domH=${domRect ? Math.round(domRect.height) : '?'}`,
  )
  const scans: string[] = []
  for (let dy = 0; dy < (block.height ?? 0); dy += 3) {
    const hit = view.posAtCoords({ x: (block.left ?? 0) + 30, y: (block.top ?? 0) + dy })
    const hitLine = hit === null ? -1 : view.state.doc.lineAt(hit).number
    scans.push(`${Math.round(dy)}:${hitLine}`)
  }
  console.log(`[HARNESS] diag ${label} scan(y:hitLine) = ${scans.join(' ')}`)
}

function firstDivergence(view: EditorView, upTo: number): void {
  const doc = view.state.doc
  // 前 12 行逐行打印模型高度 vs DOM 高度
  for (let i = 1; i <= 12; i++) {
    const line = doc.line(i)
    const block = view.lineBlockAt(line.from)
    const { node } = view.domAtPos(line.from)
    const parent = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
    const domLine = parent?.closest('.cm-line')
    const domH = domLine ? Math.round(domLine.getBoundingClientRect().height) : -1
    console.log(
      `[HARNESS] line#${i} model.top=${Math.round(block.top)} model.h=${Math.round(block.height)} dom.h=${domH} "${line.text.slice(0, 20)}"`,
    )
  }

  let first: { line: number; delta: number; text: string } | null = null
  const all: { line: number; delta: number }[] = []
  for (let i = 1; i <= Math.min(upTo, doc.lines); i++) {
    const line = doc.line(i)
    const block = view.lineBlockAt(line.from)
    const { node } = view.domAtPos(line.from)
    const parent = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
    const domLine = parent?.closest('.cm-line')
    if (!domLine) {
      all.push({ line: i, delta: NaN })
      continue
    }
    const delta = Math.round(domLine.getBoundingClientRect().top - block.top)
    all.push({ line: i, delta })
    if (!first && Math.abs(delta) > 1.5) first = { line: i, delta, text: line.text.slice(0, 26) }
  }
  console.log(`[HARNESS] first-divergence: ${JSON.stringify(first)}`)
  // 找出 delta 发生跳变（新增偏移）的行：那些行就是"罪魁元素"
  let prev = 0
  const jumps: string[] = []
  for (const { line, delta } of all) {
    if (Number.isFinite(delta) && Math.abs(delta - prev) > 1.5) {
      jumps.push(`L${line}:${prev}->${delta} "${doc.line(line).text.slice(0, 18)}"`)
    }
    if (Number.isFinite(delta)) prev = delta
  }
  console.log(`[HARNESS] delta-jumps: ${jumps.join(' | ')}`)
}

async function main(): Promise<void> {
  const mode = new URLSearchParams(location.search).get('mode') ?? 'full'
  ;(globalThis as { __RULES_MODE__?: string }).__RULES_MODE__ =
    new URLSearchParams(location.search).get('rules') ?? undefined
  ;(globalThis as { __ENGINE_MODE__?: string }).__ENGINE_MODE__ =
    new URLSearchParams(location.search).get('engine') ?? undefined
  const app = document.createElement('div')
  app.className = 'app'
  const main = document.createElement('div')
  main.className = 'app__main'
  const editorArea = document.createElement('div')
  editorArea.className = 'app__editor'
  const host = document.createElement('div')
  host.className = 'editor-host'
  editorArea.appendChild(host)
  main.appendChild(editorArea)
  app.appendChild(main)
  document.body.appendChild(app)
  if (mode === 'plain') {
    // 去掉标题行的 padding/border（保留字号字号层级）
    const st = document.createElement('style')
    st.textContent = '.cm-h-line{padding:0 !important;border:0 !important}'
    document.head.appendChild(st)
  }

  const source = mode === 'minimal' ? MINIMAL_DOC : designDoc
  const extensions =
    mode === 'nodeco'
      ? [EditorView.lineWrapping, markdown({ base: markdownLanguage, codeLanguages: [] })]
      : baseExtensions()

  const base = EditorState.create({ doc: source, extensions })
  const state = EditorState.create({
    doc: source,
    extensions,
    selection: { anchor: findGapAnchor(base) },
  })
  const view = new EditorView({ state, parent: host })

  await raf(); await raf(); await raf()
  view.requestMeasure()
  await raf()

  if (mode === 'minimal') {
    // 表格下方每一行：模型 vs 实际
    const doc = view.state.doc
    const lines: string[] = []
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i)
      const block = view.lineBlockAt(line.from)
      const { node } = view.domAtPos(line.from)
      const parent = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
      const domLine = parent?.closest('.cm-line')
      const domTop = domLine ? Math.round(domLine.getBoundingClientRect().top) : null
      const widget = view.domAtPos(line.from)
      lines.push(
        `L${i} model=${Math.round(block.top)}/${Math.round(block.height)} dom=${domTop} "${line.text.slice(0, 14)}"`,
      )
    }
    console.log(`[HARNESS] minimal lines: ${lines.join(' ;; ')}`)
    // 表格 widget 实际渲染高度
    const tableEl = host.querySelector('.cm-table-wrap')
    console.log(
      `[HARNESS] table-widget dom height=${tableEl ? Math.round(tableEl.getBoundingClientRect().height) : 'none'}`,
    )
    console.log('[HARNESS] DONE')
    return
  }

  checkView(view, `A:open-at-top(${mode})`)

  const midPos = designDoc.indexOf('### 3.1')
  view.dispatch({ effects: EditorView.scrollIntoView(midPos) })
  await raf(); await raf(); view.requestMeasure(); await raf()
  console.log(`[HARNESS] B: scrolled-to-mid (mode=${mode})`)
  checkView(view, `B:mid(${mode})`)
  realClickTest(view, `B:mid(${mode})`)

  // 收敛实验：等待 600ms + 多轮测量后再测一次
  await new Promise((r) => setTimeout(r, 600))
  view.requestMeasure()
  await raf(); await raf(); view.requestMeasure(); await raf()
  checkView(view, `B2:mid-settled(${mode})`)

  // 全量测量前后 Δ 对照
  const probeDelta = (label: string) => {
    const pos = designDoc.indexOf('### 3.1')
    const b = view.lineBlockAt(pos)
    const { node } = view.domAtPos(pos)
    const p = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
    const dl = p?.closest('.cm-line') as HTMLElement | null
    const cTop = view.contentDOM.getBoundingClientRect().top
    const dTop = dl ? dl.getBoundingClientRect().top - cTop : -9999
    console.log(`[HARNESS] PROBE ${label}: delta=${Math.round(dTop - b.top)} (map=${Math.round(b.top)} real=${Math.round(dTop)})`)
  }
  // 逐行 Δ 走查：滚到表格区，找第一个 map 与 DOM 发散的行
  view.dispatch({ effects: EditorView.scrollIntoView(designDoc.indexOf('| # | 决策点 |')) })
  await raf(); await raf(); await raf(); view.requestMeasure(); await raf(); await raf()
  {
    const tblWrapEl = host.querySelector('.cm-table-wrap')
    const tblReal = tblWrapEl ? Math.round(tblWrapEl.getBoundingClientRect().height) : -1
    const tblPos0 = designDoc.indexOf('| # | 决策点 |')
    console.log(`[HARNESS] TABLE-AT-SCROLL map.h=${Math.round(view.lineBlockAt(tblPos0).height)} real.h=${tblReal}`)
    // 表格 wrap 与其后第一个 .cm-line 之间的 DOM 元素清单
    if (tblWrapEl) {
      let sib = tblWrapEl.parentElement
      const between: string[] = []
      const wrapBottom = tblWrapEl.getBoundingClientRect().bottom
      if (sib) {
        for (const child of Array.from(sib.children)) {
          const r = (child as HTMLElement).getBoundingClientRect()
          if (r.top >= wrapBottom - 2 && r.top < wrapBottom + 80) {
            between.push(`${child.tagName}.${(child as HTMLElement).className || '?'} top+${Math.round(r.top - wrapBottom)} h=${Math.round(r.height)}`)
          }
        }
      }
      console.log(`[HARNESS] AFTER-TABLE DOM: ${between.join(' | ')}`)
    }
    const cTop = view.contentDOM.getBoundingClientRect().top
    const jumps: string[] = []
    let prevDelta = 0
    for (let i = 1; i <= 33; i++) {
      const line = view.state.doc.line(i)
      const b = view.lineBlockAt(line.from)
      const { node } = view.domAtPos(line.from)
      const p = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
      const dl = p?.closest('.cm-line') as HTMLElement | null
      const inWidget = !!p?.closest('.cm-table-wrap, .cm-mermaid-wrap, .cm-math-block')
      if (!dl || inWidget) continue
      const delta = Math.round(dl.getBoundingClientRect().top - cTop - b.top)
      if (Math.abs(delta - prevDelta) >= 2) {
        jumps.push(`L${i}:${prevDelta}->${delta} h=${Math.round(b.height)} "${line.text.slice(0, 16)}"`)
        prevDelta = delta
      }
    }
    console.log(`[HARNESS] DELTA-WALK: ${jumps.join(' | ')}`)
  }
  probeDelta('before-pass')
  const tblPos = designDoc.indexOf('| # | 决策点 |')
  const tblBlock = view.lineBlockAt(tblPos)
  const tblEl = view.domAtPos(tblPos)
  const tblP = tblEl.node.nodeType === 1 ? (tblEl.node as HTMLElement) : tblEl.node.parentElement
  const tblWrap = tblP?.closest('.cm-table-wrap')?.getBoundingClientRect().height ?? -1
  console.log(`[HARNESS] TABLE map.h=${Math.round(tblBlock.height)} dom.h=${Math.round(tblWrap)}`)
  await forceFullMeasure(view)
  probeDelta('after-pass')
  const tblBlock2 = view.lineBlockAt(tblPos)
  console.log(`[HARNESS] TABLE after-pass map.h=${Math.round(tblBlock2.height)}`)
  await raf(); view.requestMeasure(); await raf()
  checkView(view, `B3:after-full-measure(${mode})`)
  firstDivergence(view, 110)

  // 决定性诊断：视口内标题行，用 .cm-line 的 client rect 逐像素扫描映射翻转点
  const targetLineNo = view.state.doc.lineAt(designDoc.indexOf('### 3.1')).number
  const tline = view.state.doc.line(targetLineNo)
  const tpos = tline.from + 5
  const domLineEl = (() => {
    const { node } = view.domAtPos(tpos)
    const parent = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
    return parent?.closest('.cm-line') as HTMLElement | null
  })()
  if (domLineEl) {
    const rect = domLineEl.getBoundingClientRect()
    // 正确的 doc-space 对照：D = domTop - contentTop（contentTop 已含 -scrollTop，不能再加）
    const contentTop = view.contentDOM.getBoundingClientRect().top
    const realDocTop = rect.top - contentTop + view.scrollDOM.scrollTop - view.scrollDOM.scrollTop
    const blockInfo = view.lineBlockAt(tline.from)
    console.log(
      `[HARNESS] DELTA line#${targetLineNo}: map.top=${Math.round(blockInfo.top)} realDocTop=${Math.round(realDocTop)} delta=${Math.round(realDocTop - blockInfo.top)}`,
    )
    const styled = host.querySelectorAll('.cm-h-line')
    console.log(
      `[HARNESS] focus line#${targetLineNo} rect.top=${Math.round(rect.top)} h=${Math.round(rect.height)} class="${domLineEl.className}" h-line-count=${styled.length} first3=${Array.from(styled).slice(0, 3).map((e) => `"${(e as HTMLElement).className}"`).join(',')}`,
    )
    const scans: string[] = []
    for (let dy = 0; dy < rect.height; dy += 2) {
      const hit = view.posAtCoords({ x: rect.left + 40, y: rect.top + dy })
      const hl = hit === null ? -1 : view.state.doc.lineAt(hit).number
      scans.push(`${Math.round(dy)}→${hl}`)
    }
    console.log(`[HARNESS] focus scan(dy→hitLine): ${scans.join(' ')}`)
    const c = view.coordsAtPos(tpos)
    console.log(
      `[HARNESS] focus coordsAtPos(${tpos}) = ${c ? `top=${Math.round(c.top)} bottom=${Math.round(c.bottom)} left=${Math.round(c.left)}` : 'null'}`,
    )

    // E1: 滚走再滚回，重扫
    const st = view.scrollDOM.scrollTop
    view.scrollDOM.scrollTop = 0
    await raf(); await raf()
    view.scrollDOM.scrollTop = st
    await raf(); await raf(); view.requestMeasure(); await raf()
    const scan2: string[] = []
    for (let dy = 0; dy < rect.height; dy += 6) {
      const hit = view.posAtCoords({ x: rect.left + 40, y: rect.top + dy })
      scan2.push(`${dy}→${hit === null ? -1 : view.state.doc.lineAt(hit).number}`)
    }
    console.log(`[HARNESS] E1 rescan after scroll-away-back: ${scan2.join(' ')}`)

    // E2: 全部就绪后新建第二个视图对照
    const host2 = document.createElement('div')
    host2.className = 'editor-host'
    document.body.appendChild(host2)
    const view2 = new EditorView({ state: view.state, parent: host2 })
    await raf(); await raf(); view2.requestMeasure(); await raf()
    const el2 = (() => {
      const { node } = view2.domAtPos(tpos)
      const p = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
      return p?.closest('.cm-line') as HTMLElement | null
    })()
    if (el2) {
      const r2 = el2.getBoundingClientRect()
      const scan3: string[] = []
      for (let dy = 0; dy < r2.height; dy += 6) {
        const hit = view2.posAtCoords({ x: r2.left + 40, y: r2.top + dy })
        scan3.push(`${dy}→${hit === null ? -1 : view2.state.doc.lineAt(hit).number}`)
      }
      console.log(`[HARNESS] E2 fresh-view scan: ${scan3.join(' ')}`)
    }
    view2.destroy()
  }

  // 焦点诊断：3.1 标题行逐像素扫描
  const lineNo = view.state.doc.lineAt(designDoc.indexOf('### 3.1')).number
  diagLine(view, lineNo, `3.1(${mode})`)
  // 再诊断一个 h2（## 3. 总体架构）
  const h2No = designDoc.indexOf('## 3. 总体架构')
  if (h2No >= 0) diagLine(view, view.state.doc.lineAt(h2No).number, `h2(${mode})`)

  console.log('[HARNESS] DONE')
}

void main()
