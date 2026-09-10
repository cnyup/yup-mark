/**
 * 工作区服务：目录树读取、递归监听（引用计数）、文件 CRUD、
 * 最近文件与会话持久化（userData/state.json）。
 */
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readdir, readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import { dirname, join } from 'node:path'
import { IPC, type FileEntry, type Result, type SessionState } from '../shared/ipc'
import { compareEntries, isIgnoredEntry, type RawEntry } from '../shared/fsutils'

const MAX_TREE_ENTRIES = 20000
const stateFilePath = () => join(app.getPath('userData'), 'state.json')

// ---------------------------------------------------------------------------
// 持久化（最近文件 + 会话）
// ---------------------------------------------------------------------------
interface PersistedState {
  recent: string[]
  recentDirs: string[]
  session: SessionState | null
}

function loadPersisted(): PersistedState {
  try {
    if (!existsSync(stateFilePath())) return { recent: [], recentDirs: [], session: null }
    const parsed = JSON.parse(readFileSync(stateFilePath(), 'utf8')) as Partial<PersistedState>
    return { recent: parsed.recent ?? [], recentDirs: parsed.recentDirs ?? [], session: parsed.session ?? null }
  } catch {
    return { recent: [], recentDirs: [], session: null }
  }
}

let persisted: PersistedState = { recent: [], recentDirs: [], session: null }
const recentChangedCallbacks: Array<() => void> = []

function flushPersisted(): void {
  try {
    writeFileSync(stateFilePath(), JSON.stringify(persisted))
  } catch {
    // 持久化失败不打断主流程
  }
}

export function pushRecent(path: string): void {
  persisted.recent = [path, ...persisted.recent.filter((p) => p !== path)].slice(0, 12)
  flushPersisted()
  for (const cb of recentChangedCallbacks) cb()
}

export function getRecent(): string[] {
  return persisted.recent
}

/** 最近打开的工作区目录（去重，最新在前，最多 8 个） */
export function pushRecentDir(dir: string): void {
  persisted.recentDirs = [dir, ...persisted.recentDirs.filter((d) => d !== dir)].slice(0, 8)
  flushPersisted()
}

export function getRecentDirs(): string[] {
  return persisted.recentDirs
}

export function saveSession(session: SessionState): void {
  persisted.session = session
  flushPersisted()
}

export function takeSession(): SessionState | null {
  return persisted.session
}

export function onRecentChanged(cb: () => void): void {
  recentChangedCallbacks.push(cb)
}

// ---------------------------------------------------------------------------
// 目录树
// ---------------------------------------------------------------------------
async function buildTree(dir: string, budget: { count: number }): Promise<FileEntry[]> {
  const dirents = await readdir(dir, { withFileTypes: true })
  const entries: RawEntry[] = dirents
    .filter((d) => !isIgnoredEntry(d.name, d.isDirectory()))
    .map((d) => ({ name: d.name, path: join(dir, d.name), dir: d.isDirectory() }))
    .sort(compareEntries)

  const out: FileEntry[] = []
  for (const e of entries) {
    if (++budget.count > MAX_TREE_ENTRIES) return out
    const node: FileEntry = { name: e.name, path: e.path, dir: e.dir }
    if (e.dir) {
      try {
        node.children = await buildTree(e.path, budget)
      } catch {
        node.children = []
      }
    } else {
      // 列表视图排序（修改/创建时间）与内容预览行依赖 stat；取不到时静默降级
      try {
        const st = await stat(e.path)
        node.mtime = st.mtimeMs
        node.birthtime = st.birthtimeMs
        if (st.size > 0 && st.size <= 262144) {
          const raw = await readFile(e.path, 'utf8')
          const brief = raw.replace(/\s+/g, ' ').trim()
          if (brief) node.preview = brief.slice(0, 120)
        }
      } catch {
        // 文件可能刚被删除
      }
    }
    out.push(node)
  }
  return out
}

// ---------------------------------------------------------------------------
// 目录监听（引用计数；工作区递归，单文件目录非递归）
// ---------------------------------------------------------------------------
interface WatchRecord {
  watcher: FSWatcher
  refs: number
}

const watchers = new Map<string, WatchRecord>()

function emitFsEvent(dir: string, file: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.push.fsEvent, { dir, file })
  }
}

function watchDir(dir: string, recursive: boolean): void {
  const key = `${recursive ? 'r' : 's'}:${dir}`
  const existing = watchers.get(key)
  if (existing) {
    existing.refs++
    return
  }
  try {
    const watcher = watch(dir, { recursive }, (_event, filename) => {
      if (filename) emitFsEvent(dir, String(filename))
    })
    watchers.set(key, { watcher, refs: 1 })
  } catch {
    // 目录可能刚被删除；忽略
  }
}

function unwatchDir(dir: string, recursive: boolean): void {
  const key = `${recursive ? 'r' : 's'}:${dir}`
  const existing = watchers.get(key)
  if (!existing) return
  if (--existing.refs <= 0) {
    existing.watcher.close()
    watchers.delete(key)
  }
}

// ---------------------------------------------------------------------------
// IPC 注册
// ---------------------------------------------------------------------------
const ok = <T>(data: T): Result<T> => ({ ok: true, data })
const fail = (error: unknown): Result<never> => ({ ok: false, error: String(error) })

export function registerWorkspaceIpc(): void {
  persisted = loadPersisted()

  ipcMain.handle(IPC.invoke.read, async (_e, path: string) => {
    try {
      return ok(await readFile(path, 'utf8'))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.invoke.openWorkspaceDialog, async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || !res.filePaths[0]) return ok(null)
    pushRecentDir(res.filePaths[0])
    return ok(res.filePaths[0])
  })

  ipcMain.handle(IPC.invoke.readTree, async (_e, root: string) => {
    try {
      return ok(await buildTree(root, { count: 0 }))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.invoke.closeWorkspace, async () => ok(null))

  ipcMain.handle(IPC.invoke.createFile, async (_e, parentDir: string, name: string) => {
    try {
      const path = join(parentDir, name.endsWith('.md') ? name : `${name}.md`)
      await writeFile(path, '', { flag: 'wx' })
      return ok({ path })
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.invoke.createFolder, async (_e, parentDir: string, name: string) => {
    try {
      const path = join(parentDir, name)
      await mkdir(path)
      return ok({ path })
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.invoke.rename, async (_e, path: string, newName: string) => {
    try {
      const newPath = join(dirname(path), newName)
      await rename(path, newPath)
      return ok({ path: newPath })
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.invoke.trash, async (_e, path: string) => {
    try {
      await shell.trashItem(path)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.invoke.reveal, async (_e, path: string) => {
    try {
      shell.showItemInFolder(path)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.invoke.watchDir, async (_e, dir: string, workspace: boolean) => {
    watchDir(dir, workspace)
    return ok(null)
  })

  ipcMain.handle(IPC.invoke.unwatchDir, async (_e, dir: string, workspace: boolean) => {
    unwatchDir(dir, workspace)
    return ok(null)
  })

  ipcMain.handle(IPC.invoke.recentList, async () => persisted.recent)

  ipcMain.handle(IPC.invoke.recentDirsList, async () => getRecentDirs())

  ipcMain.handle(IPC.invoke.clipboardRead, async () => ok(clipboard.readText()))

  ipcMain.handle(IPC.invoke.clipboardWrite, async (_e, text: string) => {
    clipboard.writeText(String(text ?? ''))
    return ok(null)
  })

  ipcMain.handle(IPC.invoke.sessionLoad, async () => takeSession())

  ipcMain.handle(IPC.invoke.sessionSave, async (_e, session: SessionState) => {
    try {
      saveSession(session)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })
}
