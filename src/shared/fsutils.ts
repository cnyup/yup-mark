/** 文件树构建的纯逻辑（无 fs 依赖，可单测） */

export interface RawEntry {
  name: string
  path: string
  dir: boolean
}

/** 自然排序：数字段按数值比较（file2 < file10），目录优先，忽略大小写 */
export function compareEntries(a: RawEntry, b: RawEntry): number {
  if (a.dir !== b.dir) return a.dir ? -1 : 1
  return naturalCompare(a.name.toLowerCase(), b.name.toLowerCase())
}

export function naturalCompare(a: string, b: string): number {
  let ia = 0
  let ib = 0
  while (ia < a.length && ib < b.length) {
    const ca = a.charCodeAt(ia)
    const cb = b.charCodeAt(ib)
    const aDigit = ca >= 48 && ca <= 57
    const bDigit = cb >= 48 && cb <= 57
    if (aDigit && bDigit) {
      let ja = ia
      while (ja < a.length && a.charCodeAt(ja) >= 48 && a.charCodeAt(ja) <= 57) ja++
      let jb = ib
      while (jb < b.length && b.charCodeAt(jb) >= 48 && b.charCodeAt(jb) <= 57) jb++
      const na = Number(a.slice(ia, ja))
      const nb = Number(b.slice(ib, jb))
      if (na !== nb) return na - nb
      ia = ja
      ib = jb
    } else {
      if (ca !== cb) return ca - cb
      ia++
      ib++
    }
  }
  return a.length - ia - (b.length - ib)
}

/** 常见干扰目录（依赖、构建产物、版本库）不入树 */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.DS_Store',
  'dist',
  'out',
  'build',
  '.next',
  '.vercel',
  'coverage',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
])

export function isIgnoredEntry(name: string, dir: boolean): boolean {
  if (!dir) return name === '.DS_Store'
  return IGNORED_DIRS.has(name)
}
