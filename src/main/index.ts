import { app, BrowserWindow, Menu, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildMenu, registerMenuIpc } from './menu'
import { registerFileIpc } from './fileService'
import { registerWorkspaceIpc } from './workspaceService'

/**
 * 本地图片协议：渲染进程通过 soyup-file://md/<encodeURIComponent(绝对路径)>
 * 加载文档同目录的相对资源（http/file 页面直接引用对方 scheme 的资源会被拦截）。
 */
protocol.registerSchemesAsPrivileged([
  { scheme: 'soyup-file', privileges: { standard: true, secure: true } },
])

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 640,
    minHeight: 400,
    title: 'SoyupMark',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('ready-to-show', () => win.show())

  // 编辑器里 ⌘/Ctrl+点击链接 → 系统默认浏览器打开（渲染进程 window.open 全部拒绝，仅此用途放行外链）
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  protocol.handle('soyup-file', (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''))
    return net.fetch(pathToFileURL(path).toString())
  })
  registerFileIpc()
  registerWorkspaceIpc()
  registerMenuIpc()
  Menu.setApplicationMenu(buildMenu())
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
