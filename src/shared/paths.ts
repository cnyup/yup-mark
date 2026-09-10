/** 任意平台分隔符的路径工具（渲染进程不可用 node:path，自带实现） */

/** 取文件名：`/a/b.md` → `b.md` */
export function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx === -1 ? normalized : normalized.slice(idx + 1)
}

/** 取目录：`/a/b.md` → `/a`；无分隔符返回 '' */
export function dirname(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx === -1 ? '' : normalized.slice(0, idx)
}

/**
 * 以文档所在目录为基准解析相对路径，返回规范化的绝对路径形式。
 * 处理 `.`、`..` 与多余的 `/`；base 为空时原样返回（规范化分隔符）。
 */
export function resolveRelPath(baseDir: string, rel: string): string {
  const normalizedRel = rel.replace(/\\/g, '/')
  if (baseDir === '') return normalizedRel.replace(/^\.\//, '')
  const isAbs = normalizedRel.startsWith('/')
  const base = baseDir.replace(/\\/g, '/')
  const combined = isAbs ? normalizedRel : `${base}/${normalizedRel}`
  const parts = combined.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  const joined = out.join('/')
  return combined.startsWith('/') ? `/${joined}` : joined
}
