/** 大纲提取：从编辑器状态抽取标题树（纯函数，可无头测试） */
import type { EditorState } from '@codemirror/state'
import { topLevelBlocks } from './blocks'

export interface OutlineItem {
  level: number
  text: string
  from: number
  to: number
}

const ATX = /^ATXHeading(\d)$/
const SETEXT = /^SetextHeading(\d)$/

/** 光标位置 → 当前所在章节的标题（其后的最近标题）；无标题返回 null */
export function activeOutlineItem(items: OutlineItem[], pos: number): OutlineItem | null {
  let current: OutlineItem | null = null
  for (const item of items) {
    if (item.from <= pos) current = item
    else break
  }
  return current
}

export function extractOutline(state: EditorState): OutlineItem[] {
  const doc = state.doc
  const items: OutlineItem[] = []
  for (const block of topLevelBlocks(state)) {
    const atx = ATX.exec(block.name)
    const setext = SETEXT.exec(block.name)
    if (atx || setext) {
      const level = Number((atx ?? setext)![1])
      const raw = doc.sliceString(block.from, block.to)
      // Setext 的原文含下划线行，标题文本只取首行
      const text = (setext ? (raw.split('\n')[0] ?? raw) : raw)
        .replace(/^#{1,6}\s*/, '')
        .replace(/\s+#+\s*$/, '')
        .trim()
      items.push({ level, text, from: block.from, to: block.to })
    }
  }
  return items
}
