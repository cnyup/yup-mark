/**
 * 工作区文件树（MT3b）：扫描 + 展开态扁平化（纯函数，可单测）。
 * 只收 .md/.markdown 文件与目录；目录排前、其余按名排序（不区分大小写）。
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface TreeNode {
  name: string
  /** 相对工作区根的路径（根为 '.'） */
  rel: string
  type: 'dir' | 'file'
  children?: TreeNode[]
}

const MD_EXT = /\.(md|markdown)$/i
const IGNORE = new Set(['node_modules', '.git', 'release', 'out', 'dist', '.cache'])

/** 递归扫描（同步；500+ 文件量级毫秒级） */
export function scanTree(rootDir: string, depth = 6): TreeNode {
  return scanDir(rootDir, '.', depth)
}

function scanDir(absDir: string, rel: string, depth: number): TreeNode {
  const name = rel === '.' ? rel : (rel.split(/[\\/]/).pop() ?? rel)
  const node: TreeNode = { name, rel, type: 'dir' }
  if (depth <= 0) {
    node.children = []
    return node
  }
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(absDir, { withFileTypes: true })
  } catch {
    node.children = []
    return node
  }
  const children: TreeNode[] = []
  for (const e of entries) {
    if (e.name.startsWith('.') || IGNORE.has(e.name)) continue
    if (e.isDirectory()) {
      children.push(scanDir(join(absDir, e.name), join(rel, e.name), depth - 1))
    } else if (e.isFile() && MD_EXT.test(e.name)) {
      children.push({ name: e.name, rel: join(rel, e.name), type: 'file' })
    }
  }
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0
  })
  node.children = children
  return node
}

export interface FlatNode {
  node: TreeNode
  depth: number
}

/** 按展开集合扁平化（只走展开的目录） */
export function flattenTree(root: TreeNode, expanded: Set<string>): FlatNode[] {
  const out: FlatNode[] = []
  const walk = (node: TreeNode, depth: number): void => {
    for (const child of node.children ?? []) {
      out.push({ node: child, depth })
      if (child.type === 'dir' && expanded.has(child.rel)) walk(child, depth + 1)
    }
  }
  walk(root, 0)
  return out
}

/** 工作区根显示名 */
export function rootLabel(rootDir: string): string {
  const norm = rootDir.replace(/[\\/]+$/, '')
  return norm.split(/[\\/]/).pop() ?? norm
}

/** 目录是否含 md 文件（用于空目录提示） */
export function isEmptyTree(root: TreeNode): boolean {
  return (root.children ?? []).length === 0
}

/** 探测给定路径是文件还是目录（cli 参数分流用） */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
