/**
 * window.yupmark 的 Tauri 实现：与 @shared/ipc.ts 的 YupmarkApi 契约一一对应。
 * - Rust 命令名用 snake_case（通道名含冒号不能做 Rust fn 名），映射表是唯一对账点
 * - invoke 的 Err(String) 在 JS 侧 reject，此处统一包回 Result<T>；对话框取消 = 'canceled'
 * - 参数键保持 camelCase，Tauri 自动换算 Rust snake_case 形参
 */
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  IPC,
  type FileEntry,
  type FsEventData,
  type MenuEvent,
  type OpenFileData,
  type Result,
  type SessionState,
  type YupmarkApi,
} from '@shared/ipc'

/** IPC 通道名 → Rust 命令名（src-tauri/src/commands/ 的 generate_handler 清单与此对账） */
const RUST_CMD = {
  [IPC.invoke.openDialog]: 'open_dialog',
  [IPC.invoke.save]: 'save_file',
  [IPC.invoke.saveAs]: 'save_as_dialog',
  [IPC.invoke.read]: 'read_file',
  [IPC.invoke.openWorkspaceDialog]: 'open_workspace_dialog',
  [IPC.invoke.readTree]: 'read_tree',
  [IPC.invoke.closeWorkspace]: 'close_workspace',
  [IPC.invoke.createFile]: 'create_file',
  [IPC.invoke.createFolder]: 'create_folder',
  [IPC.invoke.rename]: 'rename_entry',
  [IPC.invoke.trash]: 'trash_entry',
  [IPC.invoke.reveal]: 'reveal_in_file_manager',
  [IPC.invoke.watchDir]: 'watch_dir',
  [IPC.invoke.unwatchDir]: 'unwatch_dir',
  [IPC.invoke.clipboardRead]: 'clipboard_read_text',
  [IPC.invoke.clipboardWrite]: 'clipboard_write_text',
  [IPC.invoke.setLanguage]: 'set_language',
  [IPC.invoke.sessionSave]: 'session_save',
} as const

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<Result<T>> {
  try {
    return { ok: true, data: await invoke<T>(cmd, args) }
  } catch (e) {
    return { ok: false, error: typeof e === 'string' ? e : String(e) }
  }
}

/** Tauri 事件订阅 → YupmarkApi 的“同步返回退订函数”签名 */
function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  const pending = listen<T>(event, (e) => handler(e.payload))
  return () => {
    void pending.then((unlisten) => unlisten())
  }
}

function createTauriApi(): YupmarkApi {
  return {
    openFileDialog: () => call<OpenFileData>(RUST_CMD[IPC.invoke.openDialog]),
    saveFile: (path, content) => call<null>(RUST_CMD[IPC.invoke.save], { path, content }),
    saveFileDialog: (content) => call<OpenFileData>(RUST_CMD[IPC.invoke.saveAs], { content }),
    readFile: (path) => call<string>(RUST_CMD[IPC.invoke.read], { path }),
    openWorkspaceDialog: () => call<string | null>(RUST_CMD[IPC.invoke.openWorkspaceDialog]),
    readTree: (root) => call<FileEntry[]>(RUST_CMD[IPC.invoke.readTree], { root }),
    closeWorkspace: () => call<null>(RUST_CMD[IPC.invoke.closeWorkspace]),
    createFile: (parentDir, name) => call<{ path: string }>(RUST_CMD[IPC.invoke.createFile], { parentDir, name }),
    createFolder: (parentDir, name) => call<{ path: string }>(RUST_CMD[IPC.invoke.createFolder], { parentDir, name }),
    renameEntry: (path, newName) => call<{ path: string }>(RUST_CMD[IPC.invoke.rename], { path, newName }),
    trashEntry: (path) => call<null>(RUST_CMD[IPC.invoke.trash], { path }),
    revealInFileManager: (path) => call<null>(RUST_CMD[IPC.invoke.reveal], { path }),
    watchDir: (dir, workspace) => call<null>(RUST_CMD[IPC.invoke.watchDir], { dir, workspace }),
    unwatchDir: (dir, workspace) => call<null>(RUST_CMD[IPC.invoke.unwatchDir], { dir, workspace }),
    // 裸返回值通道（非 Result 协议）
    recentFiles: () => invoke<string[]>('recent_list'),
    recentDirs: () => invoke<string[]>('recent_dirs'),
    readClipboardText: () => call<string>(RUST_CMD[IPC.invoke.clipboardRead]),
    writeClipboardText: (text) => call<null>(RUST_CMD[IPC.invoke.clipboardWrite], { text }),
    setLanguage: (lang) => call<null>(RUST_CMD[IPC.invoke.setLanguage], { lang }),
    loadSession: () => invoke<SessionState | null>('session_load'),
    // Rust 形参名为 session（避开 Tauri State 注入），键名与此对齐
    saveSession: (session) => call<null>(RUST_CMD[IPC.invoke.sessionSave], { session }),
    onMenuAction: (handler: (event: MenuEvent) => void) => subscribe<MenuEvent>(IPC.push.menuAction, handler),
    onFsEvent: (handler: (event: FsEventData) => void) => subscribe<FsEventData>(IPC.push.fsEvent, handler),
    // 本地图片：绝对路径 → asset 协议 URL（engine-img.ts 的可选钩子）
    resolveAssetUrl: (absPath: string) => convertFileSrc(absPath),
  }
}

/**
 * 在 Tauri WebView 里安装 window.yupmark（main.tsx 最先调用，须早于任何消费者）。
 * 纯浏览器/jsdom 环境不安装：测试自行注入 mock，浏览器态文件能力不可用（与无 preload 的 Electron 同语义）。
 */
export function installTauriApi(): void {
  if (!isTauri()) return
  const w = globalThis as { window?: Window }
  if (w.window?.yupmark) return
  if (w.window) {
    w.window.yupmark = createTauriApi()
    patchWindowOpen()
  }
}

/** 是否运行在 Tauri WebView（App.tsx 关闭冲刷等宿主差异分支用） */
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in globalThis
}

/**
 * ⌘点击外链（内核 engine.ts 走 window.open）：Electron 由主进程 setWindowOpenHandler
 * 转系统浏览器；Tauri WebView 会直接拒掉外部导航，这里改道 Rust open_external 命令。
 */
function patchWindowOpen(): void {
  const rawOpen = window.open.bind(window)
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = typeof url === 'string' ? url : (url?.href ?? '')
    if (/^https?:/i.test(href)) {
      void invoke('open_external', { url: href }).catch(() => rawOpen(url, target, features))
      return null
    }
    return rawOpen(url, target, features)
  }) as typeof window.open
}
