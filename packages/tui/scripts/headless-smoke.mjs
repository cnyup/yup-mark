/**
 * MT0 无头冒烟（TUI.md §9 验收项）：
 *   `node packages/tui/scripts/headless-smoke.mjs`
 *
 * 用 esbuild 把一段消费 @yupmark/live-cm 的入口打成临时 ESM 包再运行——
 * 证明内核（含 @codemirror/view 的 Decoration）在无 DOM 的纯 Node 里
 * 导入、建状态、算装饰全链路可用，且产物无 DOM 依赖。
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ENTRY = `
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { buildLiveDecorations } from '@yupmark/live-cm/rules'

const doc = '# 标题\\n\\n正文 **加粗**、\`code\` 与 [链接](https://example.com)\\n\\n> 引用\\n\\n- 列表一\\n- 列表二\\n'
const state = EditorState.create({ doc, extensions: [markdown()], selection: { anchor: doc.length } })
const decos = buildLiveDecorations(state)

console.log('装饰总数:', decos.length)
for (const d of decos) {
  const spec = d.value.spec ?? {}
  const kind = spec.widget != null ? 'widget' : spec.class !== undefined ? String(spec.class) : 'hidden'
  console.log('  [' + String(d.from).padStart(3) + ', ' + String(d.to).padEnd(3) + ') ' + kind.padEnd(14) + ' ' + JSON.stringify(doc.slice(d.from, d.to)))
}

const hidden = decos.filter((d) => d.value.spec.class === undefined && d.value.spec.widget === undefined)
if (decos.length === 0 || hidden.length === 0) {
  console.error('SMOKE FAIL: 装饰为空或无隐藏区间')
  process.exit(1)
}
console.log('HEADLESS SMOKE OK —— 内核无 DOM 运行，隐藏区间', hidden.length, '个')
`

const tmp = mkdtempSync(join(tmpdir(), 'yupmark-smoke-'))
const outfile = join(tmp, 'smoke.mjs')
try {
  await build({
    stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  await import(pathToFileURL(outfile).href)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
