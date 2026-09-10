import { dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { IPC } from '../shared/ipc'
import { pushRecent } from './workspaceService'

const MARKDOWN_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mkd', 'mdown'] },
  { name: 'All Files', extensions: ['*'] },
]

export function registerFileIpc(): void {
  ipcMain.handle(IPC.invoke.openDialog, async () => {
    try {
      const res = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: MARKDOWN_FILTERS,
      })
      const path = res.filePaths[0]
      if (res.canceled || !path) return { ok: false as const, error: 'canceled' }
      const content = await readFile(path, 'utf8')
      pushRecent(path)
      return { ok: true as const, data: { path, content } }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  ipcMain.handle(IPC.invoke.save, async (_event, path: string, content: string) => {
    try {
      await writeFile(path, content, 'utf8')
      pushRecent(path)
      return { ok: true as const, data: null }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  ipcMain.handle(IPC.invoke.saveAs, async (_event, content: string) => {
    try {
      const res = await dialog.showSaveDialog({
        defaultPath: 'untitled.md',
        filters: MARKDOWN_FILTERS,
      })
      if (res.canceled || !res.filePath) return { ok: false as const, error: 'canceled' }
      await writeFile(res.filePath, content, 'utf8')
      pushRecent(res.filePath)
      return { ok: true as const, data: { path: res.filePath, content } }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })
}
