// @vitest-environment node
// TUI 前提验证（docs/TUI.md §2 / §9 MT0）：
// CM6 装饰管线必须能在纯 Node（无 DOM、无 jsdom）环境导入并运行——
// 这是 packages/tui 复用 packages/live-cm 内核的基石，禁止引用任何 DOM API。
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import type { Range } from '@codemirror/state'
import { buildLiveDecorations } from '@yupmark/live-cm/rules'

const doc = [
  '# 标题',
  '',
  '正文带 **加粗**、`code` 与 [链接](https://example.com)',
  '',
  '> 引用行',
  '',
  '- 列表一',
  '- 列表二',
  '',
].join('\n')

function stateAt(anchor: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown()],
    selection: { anchor },
  })
}

function hiddenTexts(decos: Range<Decoration>[]): string[] {
  return decos
    .filter((d) => d.value.spec.class === undefined && d.value.spec.widget === undefined)
    .map((d) => doc.slice(d.from, d.to))
}

describe('headless decoration pipeline（纯 Node，无 DOM）', () => {
  it('@codemirror/view 的 Decoration 可在无 DOM 环境导入与构造', () => {
    const mark = Decoration.mark({ class: 'cm-strong' })
    const replace = Decoration.replace({})
    expect(mark.spec.class).toBe('cm-strong')
    expect(replace.spec).toEqual({})
  })

  it('buildLiveDecorations 在纯 Node 运行：非活跃块隐藏行级标记', () => {
    // 光标放在文档末尾（列表块内）→ 标题/引用块非活跃 → `# ` 与 `> ` 应被隐藏
    const decos = buildLiveDecorations(stateAt(doc.length))
    const hidden = hiddenTexts(decos)
    expect(decos.length).toBeGreaterThan(0)
    expect(hidden).toContain('# ')
    expect(hidden).toContain('> ')
    expect(hidden).toContain('**')
  })

  it('光标所在块激活：标记转淡显而非隐藏', () => {
    // 光标放在标题行首 → 标题块活跃 → `# ` 不应被隐藏（淡显 mark 而非 replace）
    const decos = buildLiveDecorations(stateAt(0))
    const hidden = hiddenTexts(decos)
    expect(hidden).not.toContain('# ')
    // 引用块此时仍非活跃 → 依旧隐藏
    expect(hidden).toContain('> ')
  })

  it('mark 装饰（样式）在纯 Node 可产出', () => {
    const decos = buildLiveDecorations(stateAt(doc.length))
    const classes = decos
      .filter((d) => typeof d.value.spec.class === 'string')
      .map((d) => String(d.value.spec.class))
    expect(classes).toContain('cm-strong')
  })
})
