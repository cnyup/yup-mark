/**
 * 图片 src 解析为可加载的 URL：
 * - 绝对协议地址（http/https/data/blob/asset）原样返回
 * - 相对路径 → 基于文档目录解析 → 宿主协议：
 *   - Electron：自定义协议 yup-file://（主进程 protocol.handle 提供本地文件）
 *   - Tauri：宿主注入的 resolveAssetUrl 钩子（asset 协议，见 src/renderer/lib/tauriApi.ts）
 */
import { resolveRelPath } from './paths'

type AssetUrlBridge = { yupmark?: { resolveAssetUrl?: (absPath: string) => string } }

export function resolveImgSrc(src: string, docDir: string | null): string {
  if (/^(https?:|data:|blob:|asset:)/i.test(src)) return src
  if (!docDir) return src
  const abs = resolveRelPath(docDir, src)
  const viaHost = (globalThis as { window?: AssetUrlBridge }).window?.yupmark?.resolveAssetUrl
  return viaHost ? viaHost(abs) : `yup-file://md/${encodeURIComponent(abs)}`
}
