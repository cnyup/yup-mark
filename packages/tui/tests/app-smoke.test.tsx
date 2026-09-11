// @vitest-environment node
// TuiApp 组件 renderToString 冒烟（MT1）：不依赖 TTY 的整树渲染
import { describe, expect, it } from 'vitest'
import { renderToString } from 'ink'
import { stripAnsi } from '../src/editor/testutil'
import { EditorSession } from '../src/editor/session'
import { TuiApp } from '../src/editor/app'

const doc = '# 冒烟标题\n\n正文**加粗**与 `code`\n\n- 列表项\n'

describe('TuiApp renderToString 冒烟', () => {
  it('渲染出标题文本与状态栏（含行列信息）', () => {
    const session = new EditorSession(null, doc, 0)
    const out = stripAnsi(renderToString(<TuiApp session={session} />))
    expect(out).toContain('冒烟标题')
    expect(out).toContain('列表项')
    expect(out).toContain('Ln 1')
    expect(out).toContain('untitled.md')
  })

  it('dispatch 后新内容可渲染（订阅链路通）', () => {
    const session = new EditorSession(null, 'aaa\n', 0)
    session.dispatch({ changes: { from: 3, insert: 'Z' } })
    const out = stripAnsi(renderToString(<TuiApp session={session} />))
    expect(out).toContain('aaaZ')
  })
})
