/**
 * 10k 行压测探针（MT1 验收）：模拟连续输入，测量每键耗时
 * （dispatch + 全量装饰计算 + 视口装配）。运行：node scripts/perf.mjs
 */
import { buildLiveDecorations } from '@yupmark/live-cm/rules'
import { layoutViewport } from '../src/editor/layout'
import { docState } from '../src/state'

const para =
  '这是用于压测的中文段落，包含**加粗**、*斜体*、`code` 与[链接](https://example.com)，以及中英文混排 width 计算边界。'
const doc = Array.from({ length: 10000 }, (_, i) =>
  i % 7 === 0 ? `# 标题 ${i}` : i % 5 === 0 ? `- 列表项 ${i}` : para,
).join('\n')
console.log('doc lines:', doc.split('\n').length, 'chars:', doc.length)

let state = docState(doc, 0)
// 换成与 TUI 真实路径相同的工厂（含 language-data 懒加载表）后预热解析
layoutViewport(state, { width: 100, height: 40, firstLine: 1, cursorPos: 0 })

// 模拟连续输入（每次键入后：视口滚动检查 + 渲染装配——两处共用 memo 缓存）
let t0 = performance.now()
for (let i = 0; i < 30; i++) {
  const head = state.selection.main.head
  state = state.update({
    changes: { from: head, insert: '字' },
    selection: { anchor: head + 1 },
  }).state
  const cur = state.selection.main.head
  const layout1 = layoutViewport(state, { width: 100, height: 40, firstLine: 1, cursorPos: cur })
  const layout2 = layoutViewport(state, { width: 100, height: 40, firstLine: 1, cursorPos: cur })
  if (i === 0) console.log('首帧 cursor:', JSON.stringify(layout2.cursor ?? layout1.cursor))
}
console.log('平均每键（dispatch+区间装饰+装配×2 含 memo）:', ((performance.now() - t0) / 30).toFixed(1), 'ms')

// 对照：全量装饰（桌面当前口径）
t0 = performance.now()
for (let i = 0; i < 10; i++) buildLiveDecorations(state)
console.log('全量 buildLiveDecorations 单次:', ((performance.now() - t0) / 10).toFixed(1), 'ms')
