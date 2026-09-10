import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type FsEventData, type MenuEvent } from '../shared/ipc'

const api = {
  openFileDialog: () => ipcRenderer.invoke(IPC.invoke.openDialog),
  saveFile: (path: string, content: string) => ipcRenderer.invoke(IPC.invoke.save, path, content),
  saveFileDialog: (content: string) => ipcRenderer.invoke(IPC.invoke.saveAs, content),

  readFile: (path: string) => ipcRenderer.invoke(IPC.invoke.read, path),

  openWorkspaceDialog: () => ipcRenderer.invoke(IPC.invoke.openWorkspaceDialog),
  readTree: (root: string) => ipcRenderer.invoke(IPC.invoke.readTree, root),
  closeWorkspace: () => ipcRenderer.invoke(IPC.invoke.closeWorkspace),

  createFile: (parentDir: string, name: string) =>
    ipcRenderer.invoke(IPC.invoke.createFile, parentDir, name),
  createFolder: (parentDir: string, name: string) =>
    ipcRenderer.invoke(IPC.invoke.createFolder, parentDir, name),
  renameEntry: (path: string, newName: string) => ipcRenderer.invoke(IPC.invoke.rename, path, newName),
  trashEntry: (path: string) => ipcRenderer.invoke(IPC.invoke.trash, path),
  revealInFileManager: (path: string) => ipcRenderer.invoke(IPC.invoke.reveal, path),

  watchDir: (dir: string, workspace: boolean) =>
    ipcRenderer.invoke(IPC.invoke.watchDir, dir, workspace),
  unwatchDir: (dir: string, workspace: boolean) =>
    ipcRenderer.invoke(IPC.invoke.unwatchDir, dir, workspace),

  recentFiles: () => ipcRenderer.invoke(IPC.invoke.recentList),
  recentDirs: () => ipcRenderer.invoke(IPC.invoke.recentDirsList),
  readClipboardText: () => ipcRenderer.invoke(IPC.invoke.clipboardRead),
  writeClipboardText: (text: string) => ipcRenderer.invoke(IPC.invoke.clipboardWrite, text),
  setLanguage: (lang: 'zh' | 'en') => ipcRenderer.invoke(IPC.invoke.setLanguage, lang),

  loadSession: () => ipcRenderer.invoke(IPC.invoke.sessionLoad),
  saveSession: (state: unknown) => ipcRenderer.invoke(IPC.invoke.sessionSave, state),

  onMenuAction: (handler: (event: MenuEvent) => void) => {
    const listener = (_e: unknown, event: MenuEvent) => handler(event)
    ipcRenderer.on(IPC.push.menuAction, listener as never)
    return () => {
      ipcRenderer.removeListener(IPC.push.menuAction, listener as never)
    }
  },
  onFsEvent: (handler: (event: FsEventData) => void) => {
    const listener = (_e: unknown, event: FsEventData) => handler(event)
    ipcRenderer.on(IPC.push.fsEvent, listener as never)
    return () => {
      ipcRenderer.removeListener(IPC.push.fsEvent, listener as never)
    }
  },
}

contextBridge.exposeInMainWorld('yupmark', api)
