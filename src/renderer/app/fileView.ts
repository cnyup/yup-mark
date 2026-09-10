/**
 * 文件面板视图逻辑（纯函数，可单测）：
 * - 排序：按文件夹分组 / 自然降序 / 文件名升序 / 创建时间 / 修改时间
 * - 树视图：搜索时剪枝到「匹配文件 + 祖先目录」，按排序模式重排
 * - 列表视图：全工作区文件平铺（分组模式带目录小标题）
 */
import type { FileEntry, FileSortMode } from '@shared/ipc'
import { compareEntries, naturalCompare } from '@shared/fsutils'

export type { FileSortMode }

/** 自然升序（忽略大小写，数字段按数值） */
function byNatural(a: { name: string }, b: { name: string }): number {
  return naturalCompare(a.name.toLowerCase(), b.name.toLowerCase())
}

/** 文件名升序（字典序，非自然序：file10 < file2） */
function byLex(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

type Sortable = { name: string; mtime?: number; birthtime?: number }

/** 各排序模式对应的文件比较器（目录永远在前，不经过这里） */
export function fileCompare(mode: FileSortMode): (a: Sortable, b: Sortable) => number {
  switch (mode) {
    case 'natural-desc':
      return (a, b) => byNatural(b, a)
    case 'name':
      return byLex
    case 'created':
      return (a, b) => (b.birthtime ?? b.mtime ?? 0) - (a.birthtime ?? a.mtime ?? 0) || byNatural(a, b)
    case 'mtime':
      return (a, b) => (b.mtime ?? 0) - (a.mtime ?? 0) || byNatural(a, b)
    case 'folder':
    default:
      return byNatural
  }
}

/** 目录优先（自然升序），文件按所选模式排序；不修改入参 */
export function sortTree(nodes: FileEntry[], mode: FileSortMode): FileEntry[] {
  const cmp = fileCompare(mode)
  const dirs = nodes.filter((n) => n.dir).sort(compareEntries)
  const files = nodes.filter((n) => !n.dir).sort(cmp)
  const out: FileEntry[] = []
  for (const d of dirs) out.push(d.children ? { ...d, children: sortTree(d.children, mode) } : d)
  out.push(...files)
  return out
}

/** 名称包含查询串（忽略大小写） */
function nameMatches(entry: FileEntry, q: string): boolean {
  return entry.name.toLowerCase().includes(q)
}

/**
 * 搜索剪枝：只保留匹配的文件、名称匹配的目录（连同整棵子树）以及包含匹配的祖先目录。
 * 返回 null 表示无匹配（调用方展示空态）。
 */
export function filterTree(nodes: FileEntry[], query: string): FileEntry[] | null {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  const out: FileEntry[] = []
  for (const n of nodes) {
    if (n.dir) {
      if (nameMatches(n, q)) {
        out.push(n)
        continue
      }
      const kids = n.children ? filterTree(n.children, q) : null
      if (kids && kids.length > 0) out.push({ ...n, children: kids })
    } else if (nameMatches(n, q)) {
      out.push(n)
    }
  }
  return out.length > 0 ? out : null
}

/** 列表视图条目：文件 + 相对工作区根的目录前缀 + 预览 */
export interface FlatFile {
  name: string
  path: string
  mtime?: number
  birthtime?: number
  preview?: string
  /** 相对目录（根下为空串），如 "docs/m4" */
  relDir: string
}

/** 全工作区文件平铺（不含目录、不排序；由 sortFlat/groupFlat 决定呈现） */
export function flattenFiles(nodes: FileEntry[], rootPath: string): FlatFile[] {
  const out: FlatFile[] = []
  const walk = (list: FileEntry[], dir: string): void => {
    for (const n of list) {
      if (n.dir) {
        walk(n.children ?? [], dir ? `${dir}/${n.name}` : n.name)
      } else {
        out.push({ name: n.name, path: n.path, mtime: n.mtime, birthtime: n.birthtime, preview: n.preview, relDir: dir })
      }
    }
  }
  walk(nodes, '')
  const withRoot = rootPath.endsWith('/') ? rootPath : `${rootPath}/`
  for (const f of out) {
    if (f.path.startsWith(withRoot)) {
      const rel = f.path.slice(withRoot.length)
      const slash = rel.lastIndexOf('/')
      f.relDir = slash >= 0 ? rel.slice(0, slash) : ''
    }
  }
  return out
}

/** 平铺排序（新数组） */
export function sortFlat(files: FlatFile[], mode: FileSortMode): FlatFile[] {
  return [...files].sort(fileCompare(mode))
}

/** 按文件夹分组的列表（组内自然升序，组按目录自然升序；根目录组在最前） */
export interface FileGroup {
  dir: string
  files: FlatFile[]
}

export function groupFlat(files: FlatFile[]): FileGroup[] {
  const map = new Map<string, FlatFile[]>()
  for (const f of files) {
    const bucket = map.get(f.relDir)
    if (bucket) bucket.push(f)
    else map.set(f.relDir, [f])
  }
  return [...map.entries()]
    .sort((a, b) => naturalCompare(a[0].toLowerCase(), b[0].toLowerCase()))
    .map(([dir, list]) => ({ dir, files: [...list].sort(byNatural) }))
}

/** 列表视图搜索过滤：匹配文件名或相对路径 */
export function filterFlat(files: FlatFile[], query: string): FlatFile[] {
  const q = query.trim().toLowerCase()
  if (!q) return files
  return files.filter((f) => f.name.toLowerCase().includes(q) || f.relDir.toLowerCase().includes(q))
}

/** 文件名拆主名 + 扩展名（含点；无扩展名时 ext 为空串） */
export function splitNameExt(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { stem: name, ext: '' }
  return { stem: name.slice(0, dot), ext: name.slice(dot) }
}
