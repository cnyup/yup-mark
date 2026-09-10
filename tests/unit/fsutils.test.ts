import { describe, expect, it } from 'vitest'
import { compareEntries, isIgnoredEntry } from '@shared/fsutils'

describe('compareEntries 文件树排序', () => {
  it('目录优先于文件', () => {
    expect(compareEntries({ name: 'z', path: '', dir: true }, { name: 'a', path: '', dir: false })).toBeLessThan(0)
  })

  it('自然排序：file2 < file10', () => {
    expect(
      compareEntries({ name: 'file2.md', path: '', dir: false }, { name: 'file10.md', path: '', dir: false }),
    ).toBeLessThan(0)
  })

  it('忽略大小写（大小写敏感时 B 会排在 a 前面）', () => {
    expect(compareEntries({ name: 'a.md', path: '', dir: false }, { name: 'B.md', path: '', dir: false })).toBeLessThan(0)
  })
})

describe('isIgnoredEntry 干扰目录过滤', () => {
  it('过滤依赖与构建目录', () => {
    expect(isIgnoredEntry('node_modules', true)).toBe(true)
    expect(isIgnoredEntry('.git', true)).toBe(true)
    expect(isIgnoredEntry('dist', true)).toBe(true)
    expect(isIgnoredEntry('docs', true)).toBe(false)
  })

  it('文件仅过滤 .DS_Store', () => {
    expect(isIgnoredEntry('.DS_Store', false)).toBe(true)
    expect(isIgnoredEntry('notes.md', false)).toBe(false)
  })
})
