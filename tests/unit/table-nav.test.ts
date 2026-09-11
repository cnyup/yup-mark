// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorView } from '@codemirror/view'
import { createEditorState } from '@yupmark/live-cm/extensions'
import { enterNeighborTable } from '@yupmark/live-cm/engine'

/** 键盘 ↑/↓ 进出表格（含全空数据行的表格） */
describe('表格键盘导航', () => {
  it('光标在表格末尾按 ↑ → 聚焦最后一行首个单元格（空表格同样适用）', async () => {
    const doc = '段落\n\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|   |   |   |\n'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: createEditorState(doc, doc.length - 1), parent: host })
    await new Promise((r) => setTimeout(r, 150))

    expect(enterNeighborTable(view, 'up')).toBe(true)
    const active = document.activeElement as HTMLElement
    expect(active.tagName).toBe('TD')
    expect(active.dataset.row).toBe('1')
    expect(active.dataset.col).toBe('0')
    view.destroy()
    host.remove()
  })

  it('光标在表格上方按 ↓ → 聚焦表头首个单元格', async () => {
    const doc = '段落\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n结尾'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: createEditorState(doc, 2), parent: host })
    await new Promise((r) => setTimeout(r, 150))

    expect(enterNeighborTable(view, 'down')).toBe(true)
    const active = document.activeElement as HTMLElement
    expect(active.tagName).toBe('TH')
    view.destroy()
    host.remove()
  })

  it('相邻块不是表格 → 不接管', async () => {
    const doc = '段落一\n\n段落二'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: createEditorState(doc, 2), parent: host })
    await new Promise((r) => setTimeout(r, 150))
    expect(enterNeighborTable(view, 'down')).toBe(false)
    view.destroy()
    host.remove()
  })
})

describe('空隙位置（块间空行）的表格导航', () => {
  it('光标在表格下方空行按 ↑ → 聚焦末行首格（不塌源码）', async () => {
    const doc = '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n结尾段落\n'
    const host = document.createElement('div')
    document.body.appendChild(host)
    // 光标在表格后的空行（pos = 表格结束+1 处的行首）
    const gap = doc.indexOf('\n\n') + 1
    const view = new EditorView({ state: createEditorState(doc, gap), parent: host })
    await new Promise((r) => setTimeout(r, 150))

    const headBefore = view.state.selection.main.head
    expect(enterNeighborTable(view, 'up')).toBe(true)
    const active = document.activeElement as HTMLElement
    expect(active.tagName).toBe('TD')
    expect(active.dataset.row).toBe('1')
    // 文档选区未变（没有落进表格源码）
    expect(view.state.selection.main.head).toBe(headBefore)
    view.destroy()
    host.remove()
  })

  it('光标在表格上方空行按 ↓ → 聚焦表头首格', async () => {
    const doc = '段落\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const gap = doc.indexOf('\n\n| a') + 1
    const view = new EditorView({ state: createEditorState(doc, gap), parent: host })
    await new Promise((r) => setTimeout(r, 150))

    expect(enterNeighborTable(view, 'down')).toBe(true)
    const active = document.activeElement as HTMLElement
    expect(active.tagName).toBe('TH')
    view.destroy()
    host.remove()
  })
})
