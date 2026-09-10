import { describe, expect, it } from 'vitest'
import { countStats } from '@shared/stats'

describe('countStats', () => {
  it('空文本为 1 行、零计数', () => {
    expect(countStats('')).toEqual({ chars: 0, words: 0, lines: 1 })
  })

  it('英文按词计数', () => {
    expect(countStats('hello world')).toEqual({ chars: 10, words: 2, lines: 1 })
  })

  it('中文逐字计数', () => {
    expect(countStats('你好世界')).toEqual({ chars: 4, words: 4, lines: 1 })
  })

  it('中英混排各按各自规则计数', () => {
    // 拉丁词: Hello, Typora = 2；CJK 字: 世 界 的 开 源 替 代 = 7
    const s = countStats('Hello 世界，Typora 的开源替代。')
    expect(s.words).toBe(9)
  })

  it('空白不计入字符数但影响行数', () => {
    expect(countStats('a\n\nb')).toEqual({ chars: 2, words: 2, lines: 3 })
  })

  it('数字串按一个词计', () => {
    expect(countStats('v2 and 2026')).toEqual({ chars: 9, words: 3, lines: 1 })
  })
})
