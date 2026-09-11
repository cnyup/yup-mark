// 滚动决策单测（MT1）
import { describe, expect, it } from 'vitest'
import { adjustFirstLine, centerOnCursor } from '../src/editor/viewport'

describe('adjustFirstLine（行级滚动）', () => {
  it('光标行进入视口则不动', () => {
    expect(adjustFirstLine(10, 15, 1000, 24)).toBe(10)
  })

  it('光标行在 firstLine 之上 → 上滚留 1 行上下文', () => {
    expect(adjustFirstLine(10, 8, 1000, 24)).toBe(7)
  })

  it('光标行超出视口末行 → 下滚留 2 行', () => {
    expect(adjustFirstLine(1, 30, 1000, 24)).toBe(8) // 30 - (24-2)
  })

  it('短文档（不满一屏）钉顶', () => {
    expect(adjustFirstLine(5, 3, 10, 24)).toBe(1)
  })

  it('不许滚出文档底部', () => {
    expect(adjustFirstLine(998, 1000, 1000, 24)).toBe(977) // 1000-24+1
  })
})

describe('centerOnCursor（视觉越界兜底）', () => {
  it('光标行居中并夹在文档范围内', () => {
    expect(centerOnCursor(100, 1000, 24)).toBe(88) // 100 - 12
    expect(centerOnCursor(2, 30, 24)).toBe(1) // 居中出负 → 夹顶（底夹不遮光标）
    expect(centerOnCursor(1, 10, 24)).toBe(1)
  })
})
