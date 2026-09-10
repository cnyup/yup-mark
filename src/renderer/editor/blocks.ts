/**
 * 块模型：文档 = 块序列。块是"渲染态/源码态"切换的活动单元（Typora 语义）。
 * 列表容器递归展开到 ListItem 粒度（Typora 中每个列表项是独立块）。
 */
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { EditorState, SelectionRange } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'

export interface Block {
  name: string
  from: number
  to: number
}

const LIST_CONTAINERS = new Set(['BulletList', 'OrderedList', 'TaskList'])

/** 收集一个列表容器下的 ListItem；嵌套列表在遍历子节点时递归展开 */
function expandList(list: SyntaxNode, out: Block[]): void {
  let child = list.firstChild
  while (child) {
    if (child.name === 'ListItem') {
      out.push({ name: 'ListItem', from: child.from, to: child.to })
      // 列表项内部可能嵌套子列表，继续展开其子项
      let sub = child.firstChild
      while (sub) {
        if (LIST_CONTAINERS.has(sub.name)) expandList(sub, out)
        sub = sub.nextSibling
      }
    }
    child = child.nextSibling
  }
}

/** 文档的全部块（按出现顺序） */
export function topLevelBlocks(state: EditorState): Block[] {
  const out: Block[] = []
  // 懒解析只覆盖视口区域：块模型/大纲/空闲锚点都需要全文档语法树，
  // 否则初始解析范围之外的标题会丢失（大纲截断、装饰缺失）
  const tree = ensureSyntaxTree(state, state.doc.length, 100) ?? syntaxTree(state)
  let node = tree.topNode.firstChild
  while (node) {
    if (LIST_CONTAINERS.has(node.name)) {
      expandList(node, out)
    } else {
      out.push({ name: node.name, from: node.from, to: node.to })
    }
    node = node.nextSibling
  }
  return out
}

/**
 * 位置所属的最内层块：在所有 from <= pos <= to 的块中取 from 最大（最深层）者。
 * 不属于任何块（块间空行等）返回 null。
 */
export function nearestBlock(blocks: Block[], pos: number): Block | null {
  let best: Block | null = null
  for (const b of blocks) {
    if (b.from <= pos && pos <= b.to) {
      if (!best || b.from > best.from) best = b
    }
  }
  return best
}

/**
 * 活跃块集合：与任一选区相交（含边界）的块，加上额外强制活跃的范围（IME 冻结）。
 * 活跃块 = 显示源码；非活跃块 = 语法隐藏。
 */
export function computeActiveSet(
  blocks: Block[],
  ranges: readonly SelectionRange[],
  extraActive: { from: number; to: number }[] = [],
): Set<Block> {
  const active = new Set<Block>()
  for (const b of blocks) {
    for (const r of ranges) {
      if (b.from <= r.to && b.to >= r.from) {
        active.add(b)
        break
      }
    }
    if (!active.has(b)) {
      for (const e of extraActive) {
        if (b.from <= e.to && b.to >= e.from) {
          active.add(b)
          break
        }
      }
    }
  }
  return active
}

/**
 * 空闲锚点：找一个不属于任何块的位置（块间空隙或文末空行）。
 * 打开文件/静默重载时把光标放在这里，所有块保持渲染态（Typora 打开文档即全渲染），
 * 直到用户真正点击进入某个块。
 */
export function findGapAnchor(state: EditorState): number {
  const doc = state.doc
  const blocks = topLevelBlocks(state)
  if (blocks.length === 0) return doc.length
  // 文档末尾在最后一块之外（常见：文件以换行结尾）→ 文末即空隙
  const last = blocks[blocks.length - 1]
  if (last && last.to < doc.length) return doc.length
  // 否则找块与块之间的空隙（块尾的下一行行首）
  for (let i = 0; i < blocks.length - 1; i++) {
    const cand = blocks[i].to + 1
    if (nearestBlock(blocks, cand) === null) return cand
  }
  // 紧凑文档无空隙：回退文末（最后一块将显示源码，可接受）
  return doc.length
}
