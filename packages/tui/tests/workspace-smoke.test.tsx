// @vitest-environment node
// WorkspaceApp renderToString 冒烟（MT3a）：标签栏/编辑面/状态栏整树渲染
import { describe, expect, it } from 'vitest'

import { renderToString } from 'ink'
import { stripAnsi } from '../src/editor/testutil'
import { makeTab, WorkspaceApp } from '../src/workspace'

describe('WorkspaceApp renderToString 冒烟', () => {
  it('多标签渲染：标签栏 + 激活文档内容', () => {
    const tabs = [
      makeTab(null, '# 第一个文档\n\n内容甲\n'),
      makeTab(null, '# 第二个文档\n\n内容乙\n'),
    ]
    const out = stripAnsi(renderToString(<WorkspaceApp initialTabs={tabs} />))
    expect(out).toContain('1:untitled')
    expect(out).toContain('2:untitled')
    expect(out).toContain('第一个文档')
    expect(out).toContain('Ln 1')
    expect(out).toContain('Alt+')
  })

  it('单标签：内容与快捷键提示', () => {
    const tabs = [makeTab(null, '仅一个标签\n')]
    const out = stripAnsi(renderToString(<WorkspaceApp initialTabs={tabs} />))
    expect(out).toContain('仅一个标签')
    expect(out).toContain('查找')
  })
})
