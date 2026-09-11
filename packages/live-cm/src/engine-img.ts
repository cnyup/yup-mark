/**
 * 图片 src 解析为可加载的 URL：
 * - 绝对协议地址（http/https/data/blob）原样返回
 * - 相对路径 → 基于文档目录解析 → 自定义协议 yup-file://（由主进程 protocol.handle 提供本地文件）
 */
import { resolveRelPath } from './paths'

export function resolveImgSrc(src: string, docDir: string | null): string {
  if (/^(https?:|data:|blob:|yup-file:)/i.test(src)) return src
  if (!docDir) return src
  const abs = resolveRelPath(docDir, src)
  return `yup-file://md/${encodeURIComponent(abs)}`
}
