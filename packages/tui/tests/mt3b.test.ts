// MT3b 单测：文件树纯函数 + 上下文菜单动作
import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { flattenTree, scanTree, rootLabel, isDirectory } from '../src/filetree'
import { EditorSession } from '../src/editor/session'
import { MENU_ACTIONS } from '../src/editor/context-menu'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'yupmark-tree-'))
  writeFileSync(join(root, 'b.md'), 'b')
  writeFileSync(join(root, 'a.md'), 'a')
  writeFileSync(join(root, 'note.txt'), 'ignore') // 非 md
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'docs', 'd1.md'), 'd')
  mkdirSync(join(root, 'node_modules')) // 忽略
  writeFileSync(join(root, 'node_modules', 'x.md'), 'x')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})


describe('文件树（scan/flatten）', () => {
  it('扫描：只收 md、目录排前、忽略 node_modules、按名排序', () => {
    const tree = scanTree(root)
    expect(tree.children?.map((c) => c.name)).toEqual(['docs', 'a.md', 'b.md'])
    const docs = tree.children?.[0]
    expect(docs?.type).toBe('dir')
    expect(docs?.children?.map((c) => c.name)).toEqual(['d1.md'])
  })

  it('flatten：未展开只到第一层；展开后含子层缩进深度', () => {
    const tree = scanTree(root)
    const closed = flattenTree(tree, new Set())
    expect(closed).toHaveLength(3)
    expect(closed[0]?.depth).toBe(0)
    const open = flattenTree(tree, new Set(['docs']))
    expect(open).toHaveLength(4)
    expect(open[1]?.node.name).toBe('d1.md')
    expect(open[1]?.depth).toBe(1)
  })

  it('rootLabel / isDirectory', () => {
    expect(rootLabel('/a/b/c/')).toBe('c')
    expect(isDirectory(root)).toBe(true)
    expect(isDirectory(join(root, 'a.md'))).toBe(false)
    expect(isDirectory('/not/exists')).toBe(false)
  })
})

describe('上下文菜单动作', () => {
  it('粗体包裹选区', () => {
    const s = new EditorSession(null, 'ab cd', 2)
    s.dispatch({ selection: { anchor: 0, head: 2 } })
    MENU_ACTIONS[0]?.run(s)
    expect(s.doc).toBe('**ab** cd')
    expect(s.state.selection.main.head).toBe(4)
  })

  it('无选区时插入空标记对', () => {
    const s = new EditorSession(null, 'xy', 1)
    MENU_ACTIONS[3]?.run(s) // 行内代码
    expect(s.doc).toBe('x``y')
  })

  it('插入表格模板在光标行下方', () => {
    const s = new EditorSession(null, '# 标题', 3)
    MENU_ACTIONS[4]?.run(s)
    expect(s.doc).toContain('| 列一 | 列二 | 列三 |')
    expect(s.doc.split('\n')).toHaveLength(5)
  })

  it('每个动作都有键与标签', () => {
    for (const a of MENU_ACTIONS) {
      expect(a.key).toMatch(/^[0-9]$/)
      expect(a.label.length).toBeGreaterThan(0)
    }
  })
})
