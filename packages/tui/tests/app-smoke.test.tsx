// @vitest-environment node
// TuiApp 组件 renderToString 冒烟（MT1）：不依赖 TTY 的整树渲染
import { describe, expect, it } from 'vitest'
import { renderToString } from 'ink'
import { stripAnsi } from '../src/editor/testutil'
import { EditorSession } from '../src/editor/session'
import { TuiApp } from '../src/editor/app'

const doc = [
  '# 冒烟标题',
  '',
  '正文 **加粗** 与 *斜体* 和 `code`',
  '',
  '> 引用 **重点**',
  '> 第二行引用',
  '',
  '| 名称 | 数量 |',
  '| --- | ---: |',
  '| 苹果 | 3 |',
  '',
  '```js',
  "const value = 'ok'",
  '```',
  '',
  '- 列表项',
].join('\n')

describe('TuiApp renderToString 冒烟', () => {
  it('渲染出混合 Markdown 语法与状态栏', () => {
    const session = new EditorSession(null, doc, 0)
    const out = stripAnsi(renderToString(<TuiApp session={session} totalHeight={24} />))
    expect(out).toContain('冒烟标题')
    expect(out).toContain('加粗')
    expect(out).toContain('斜体')
    expect(out).toContain('│ 引用 重点')
    expect(out).toContain('苹果')
    expect(out).toContain("const value = 'ok'")
    expect(out).toContain('列表项')
    expect(out).toContain('Ln 1')
    expect(out).toContain('untitled.md')
  })

  it('dispatch 后新内容可渲染（订阅链路通）', () => {
    const session = new EditorSession(null, 'aaa\n', 0)
    session.dispatch({ changes: { from: 3, insert: 'Z' } })
    const out = stripAnsi(renderToString(<TuiApp session={session} totalHeight={20} />))
    expect(out).toContain('aaaZ')
  })
})
