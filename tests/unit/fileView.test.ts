import { describe, expect, it } from 'vitest'
import {
  fileCompare,
  filterFlat,
  filterTree,
  flattenFiles,
  groupFlat,
  sortFlat,
  sortTree,
  splitNameExt,
} from '@renderer/app/fileView'
import type { FileEntry } from '@shared/ipc'

const f = (name: string, path: string, mtime?: number, birthtime?: number): FileEntry => ({
  name,
  path,
  dir: false,
  mtime,
  birthtime,
})
const d = (name: string, path: string, children: FileEntry[]): FileEntry => ({ name, path, dir: true, children })

const tree: FileEntry[] = [
  d('docs', '/w/docs', [
    d('m4', '/w/docs/m4', [f('theme.md', '/w/docs/m4/theme.md', 200, 900), f('notes.md', '/w/docs/m4/notes.md', 100, 800)]),
    f('readme.md', '/w/docs/readme.md', 300, 700),
  ]),
  f('intro.md', '/w/intro.md', 50, 600),
]

describe('fileCompare / sortTree', () => {
  it('目录始终排在文件前；folder 模式文件按自然序', () => {
    const mixed: FileEntry[] = [f('b10.md', '/w/b10.md'), f('b2.md', '/w/b2.md'), d('dir', '/w/dir', []), f('a.md', '/w/a.md')]
    expect(sortTree(mixed, 'folder').map((n) => n.name)).toEqual(['dir', 'a.md', 'b2.md', 'b10.md'])
  })

  it('自然降序：反转自然序', () => {
    const sorted = sortFlat(
      [
        { name: 'a.md', path: '/a', relDir: '' },
        { name: 'b10.md', path: '/b10', relDir: '' },
        { name: 'b2.md', path: '/b2', relDir: '' },
      ],
      'natural-desc',
    )
    expect(sorted.map((x) => x.name)).toEqual(['b10.md', 'b2.md', 'a.md'])
  })

  it('文件名升序（字典序，非自然序）', () => {
    const cmp = fileCompare('name')
    expect(cmp({ name: 'file10.md' }, { name: 'file2.md' })).toBeLessThan(0)
    expect(cmp({ name: 'b.md' }, { name: 'a.md' })).toBeGreaterThan(0)
  })

  it('按修改时间：新的在前，缺省排最后', () => {
    const sorted = sortTree(tree, 'mtime')
    const docs = sorted[0].children!
    expect(docs.map((n) => n.name)).toEqual(['m4', 'readme.md'])
    expect(docs[0].children!.map((n) => n.name)).toEqual(['theme.md', 'notes.md'])
    // 无 mtime 的排在有 mtime 的之后
    expect(fileCompare('mtime')({ name: 'z.md' }, { name: 'a.md', mtime: 1 })).toBeGreaterThan(0)
  })

  it('按创建时间：新的在前', () => {
    const sorted = sortTree(tree, 'created')
    const docs = sorted[0].children!
    expect(docs[0].children!.map((n) => n.name)).toEqual(['theme.md', 'notes.md']) // 900 > 800
  })

  it('不修改入参', () => {
    const before = JSON.stringify(tree)
    sortTree(tree, 'created')
    expect(JSON.stringify(tree)).toBe(before)
  })
})

describe('filterTree', () => {
  it('空查询原样返回', () => {
    expect(filterTree(tree, '  ')).toBe(tree)
  })

  it('保留匹配文件与祖先目录', () => {
    const out = filterTree(tree, 'theme')!
    expect(out).toHaveLength(1)
    expect(out[0].children![0].children![0].name).toBe('theme.md')
  })

  it('目录名匹配时保留其整棵子树', () => {
    const out = filterTree(tree, 'm4')!
    expect(out[0].children![0].children).toHaveLength(2)
  })

  it('无匹配返回 null', () => {
    expect(filterTree(tree, 'zzz')).toBeNull()
  })

  it('忽略大小写', () => {
    expect(filterTree(tree, 'README')).not.toBeNull()
  })
})

describe('flattenFiles / groupFlat / sortFlat', () => {
  it('平铺全部文件并计算相对目录（不排序）', () => {
    const flat = flattenFiles(tree, '/w')
    expect(flat.map((x) => x.path)).toEqual([
      '/w/docs/m4/theme.md',
      '/w/docs/m4/notes.md',
      '/w/docs/readme.md',
      '/w/intro.md',
    ])
    expect(flat.find((x) => x.name === 'theme.md')?.relDir).toBe('docs/m4')
    expect(flat.find((x) => x.name === 'intro.md')?.relDir).toBe('')
  })

  it('根路径带尾斜杠时仍正确剥离', () => {
    const flat = flattenFiles([f('a.md', '/w/a.md', 1)], '/w/')
    expect(flat[0].relDir).toBe('')
  })

  it('分组：组按目录自然序（根组在前），组内自然升序', () => {
    const groups = groupFlat(flattenFiles(tree, '/w'))
    expect(groups.map((g) => g.dir)).toEqual(['', 'docs', 'docs/m4'])
    expect(groups[2].files.map((x) => x.name)).toEqual(['notes.md', 'theme.md'])
  })

  it('sortFlat 按模式排序（mtime 新的在前）', () => {
    const flat = sortFlat(flattenFiles(tree, '/w'), 'mtime')
    expect(flat.map((x) => x.name)).toEqual(['readme.md', 'theme.md', 'notes.md', 'intro.md'])
  })
})

describe('filterFlat', () => {
  const flat = flattenFiles(tree, '/w')

  it('匹配文件名', () => {
    expect(filterFlat(flat, 'theme').map((x) => x.name)).toEqual(['theme.md'])
  })

  it('匹配相对目录', () => {
    const out = filterFlat(flat, 'm4')
    expect(out.map((x) => x.name).sort()).toEqual(['notes.md', 'theme.md'])
  })

  it('空查询原样返回', () => {
    expect(filterFlat(flat, '')).toBe(flat)
  })
})

describe('splitNameExt', () => {
  it('常规扩展名拆分', () => {
    expect(splitNameExt('DESIGN.md')).toEqual({ stem: 'DESIGN', ext: '.md' })
    expect(splitNameExt('a.b.md')).toEqual({ stem: 'a.b', ext: '.md' })
  })

  it('无扩展名 / 点开头的文件', () => {
    expect(splitNameExt('README')).toEqual({ stem: 'README', ext: '' })
    expect(splitNameExt('.gitignore')).toEqual({ stem: '.gitignore', ext: '' })
  })
})
