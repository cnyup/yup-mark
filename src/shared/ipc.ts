/**
 * IPC 协议定义：主进程、preload、渲染进程三方共用的类型契约。
 * 所有跨进程通信必须走这里声明的通道，禁止散落的裸字符串协议。
 */

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface OpenFileData {
  path: string
  content: string
}

/** 文件树节点（整棵一次性读出，UI 侧控制展开） */
export interface FileEntry {
  name: string
  path: string
  dir: boolean
  /** 文件修改时间（毫秒；列表视图排序用，目录无此字段） */
  mtime?: number
  /** 文件创建时间（毫秒；按创建时间排序用，部分文件系统不可用） */
  birthtime?: number
  /** 内容摘要（列表视图预览行；大文件/二进制无此字段） */
  preview?: string
  children?: FileEntry[]
}

/** 文件面板排序模式 */
export type FileSortMode = 'folder' | 'natural-desc' | 'name' | 'created' | 'mtime'

/** 文件系统监听事件（主进程 → 渲染进程） */
export interface FsEventData {
  dir: string
  file: string // 相对 dir 的文件名
}

/** 会话持久化状态 */
export interface SessionState {
  workspaceRoot: string | null
  sidebarOpen: boolean
  sidebarPanel: 'files' | 'outline'
  /** 文件面板视图：树 / 平铺列表 */
  fileView?: 'tree' | 'list'
  /** 文件排序模式 */
  fileSort?: FileSortMode
  /** 打开的标签；dirty 的未命名文档带内容以便恢复 */
  tabs: { path: string | null; content?: string }[]
  activePath: string | null
}

/** 原生菜单触发、推送给渲染进程的动作；带参数的动作用 payload */
export type MenuAction =
  | 'file:new'
  | 'file:open'
  | 'file:save'
  | 'file:save-as'
  | 'workspace:open'
  | 'view:toggle-sidebar'
  | 'view:next-doc'
  | 'view:prev-doc'
  | 'view:source-mode'
  | 'view:focus-mode'
  | 'view:typewriter-mode'
  | 'app:settings'
  | { action: 'file:open-path'; path: string }

export type MenuEvent = { action: MenuAction }

export const IPC = {
  invoke: {
    openDialog: 'file:open-dialog',
    save: 'file:save',
    saveAs: 'file:save-as',
    read: 'fs:read',
    openWorkspaceDialog: 'workspace:open-dialog',
    readTree: 'workspace:read-tree',
    closeWorkspace: 'workspace:close',
    createFile: 'fs:create-file',
    createFolder: 'fs:create-folder',
    rename: 'fs:rename',
    trash: 'fs:trash',
    reveal: 'fs:reveal',
    watchDir: 'watch:add-dir',
    unwatchDir: 'watch:remove-dir',
    recentList: 'recent:list',
    recentDirsList: 'workspace:recent-dirs',
    clipboardRead: 'clipboard:read-text',
    clipboardWrite: 'clipboard:write-text',
    setLanguage: 'app:set-language',
    sessionLoad: 'session:load',
    sessionSave: 'session:save',
  },
  push: {
    menuAction: 'menu:action',
    fsEvent: 'fs:event',
  },
} as const

/** preload 通过 contextBridge 暴露给渲染进程的 API 面 */
export interface SoyupmarkApi {
  openFileDialog(): Promise<Result<OpenFileData>>
  saveFile(path: string, content: string): Promise<Result<null>>
  saveFileDialog(content: string): Promise<Result<OpenFileData>>

  /** 读取任意文件内容（外部修改检测用） */
  readFile(path: string): Promise<Result<string>>

  /** 打开文件夹为工作区，返回根目录路径；取消返回 ok:true + null */
  openWorkspaceDialog(): Promise<Result<string | null>>
  readTree(root: string): Promise<Result<FileEntry[]>>
  closeWorkspace(): Promise<Result<null>>

  createFile(parentDir: string, name: string): Promise<Result<{ path: string }>>
  createFolder(parentDir: string, name: string): Promise<Result<{ path: string }>>
  renameEntry(path: string, newName: string): Promise<Result<{ path: string }>>
  trashEntry(path: string): Promise<Result<null>>
  revealInFileManager(path: string): Promise<Result<null>>

  /** 目录监听（引用计数）；变更经 onFsEvent 推送 */
  watchDir(dir: string, workspace: boolean): Promise<Result<null>>
  unwatchDir(dir: string, workspace: boolean): Promise<Result<null>>

  recentFiles(): Promise<string[]>
  /** 最近打开过的文件夹（工作区） */
  recentDirs(): Promise<string[]>
  readClipboardText(): Promise<Result<string>>
  writeClipboardText(text: string): Promise<Result<null>>

  /** 设置原生菜单语言（'zh' | 'en'），主进程重建菜单 */
  setLanguage(lang: 'zh' | 'en'): Promise<Result<null>>

  loadSession(): Promise<SessionState | null>
  saveSession(state: SessionState): Promise<Result<null>>

  /** 订阅原生菜单动作，返回取消订阅函数 */
  onMenuAction(handler: (event: MenuEvent) => void): () => void
  /** 订阅文件系统变更事件，返回取消订阅函数 */
  onFsEvent(handler: (event: FsEventData) => void): () => void
}
