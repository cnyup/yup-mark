import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { basename, dirname } from 'node:path'
import { IPC, type MenuAction, type MenuEvent } from '../shared/ipc'
import { getRecent, onRecentChanged } from './workspaceService'

const isMac = process.platform === 'darwin'

/** 自定义菜单项文案（role 系项由系统自动本地化） */
const LABELS = {
  en: {
    file: 'File',
    new: 'New',
    open: 'Open…',
    openFolder: 'Open Folder…',
    openRecent: 'Open Recent',
    noRecent: 'No Recent Files',
    save: 'Save',
    saveAs: 'Save As…',
    view: 'View',
    toggleSidebar: 'Toggle Sidebar',
    nextDoc: 'Next Document',
    prevDoc: 'Previous Document',
    sourceMode: 'Source Code Mode',
    focusMode: 'Focus Mode',
    typewriterMode: 'Typewriter Mode',
    preferences: 'Preferences…',
    help: 'Help',
    about: 'About YupMark',
  },
  zh: {
    file: '文件',
    new: '新建',
    open: '打开…',
    openFolder: '打开文件夹…',
    openRecent: '最近打开',
    noRecent: '暂无最近文件',
    save: '保存',
    saveAs: '另存为…',
    view: '视图',
    toggleSidebar: '切换侧栏',
    nextDoc: '下一个文档',
    prevDoc: '上一个文档',
    sourceMode: '源码模式',
    focusMode: '专注模式',
    typewriterMode: '打字机模式',
    preferences: '偏好设置…',
    help: '帮助',
    about: '关于 YupMark',
  },
} as const

let menuLang: 'zh' | 'en' = 'en'

export function setMenuLanguage(lang: 'zh' | 'en'): void {
  if (menuLang === lang) return
  menuLang = lang
  Menu.setApplicationMenu(buildMenu())
}

function broadcast(action: MenuAction): void {
  const event: MenuEvent = { action }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.push.menuAction, event)
  }
}

function showAbout(): void {
  void dialog.showMessageBox({
    type: 'info',
    title: 'YupMark',
    message: 'YupMark',
    detail: `Version ${app.getVersion()}\nAn open-source, Typora-like Markdown editor.\nMIT License`,
  })
}

export function buildMenu(): Menu {
  const L = LABELS[menuLang]
  const recent = getRecent()
  const recentSubmenu: MenuItemConstructorOptions[] =
    recent.length > 0
      ? recent.map((path) => ({
          label: `${basename(path)} — ${dirname(path)}`,
          click: () => broadcast({ action: 'file:open-path', path }),
        }))
      : [{ label: L.noRecent, enabled: false }]

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: L.file,
      submenu: [
        { label: L.new, accelerator: 'CmdOrCtrl+N', click: () => broadcast('file:new') },
        { label: L.open, accelerator: 'CmdOrCtrl+O', click: () => broadcast('file:open') },
        { label: L.openFolder, accelerator: 'CmdOrCtrl+Shift+O', click: () => broadcast('workspace:open') },
        { label: L.openRecent, submenu: recentSubmenu },
        { type: 'separator' },
        { label: L.save, accelerator: 'CmdOrCtrl+S', click: () => broadcast('file:save') },
        { label: L.saveAs, accelerator: 'CmdOrCtrl+Shift+S', click: () => broadcast('file:save-as') },
        { type: 'separator' },
        { label: L.preferences, accelerator: 'CmdOrCtrl+,', click: () => broadcast('app:settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: L.view,
      submenu: [
        // Typora：切换侧栏 Ctrl+Shift+L / ⌘⇧L（不能占 ⌘\，那是「清除格式」）
        {
          label: L.toggleSidebar,
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => broadcast('view:toggle-sidebar'),
        },
        // Typora：切换文档 Win Ctrl(+Shift)+Tab / mac ⌘(`)
        {
          label: L.nextDoc,
          accelerator: isMac ? 'Command+`' : 'Control+Tab',
          click: () => broadcast('view:next-doc'),
        },
        {
          label: L.prevDoc,
          accelerator: isMac ? 'Command+Shift+`' : 'Control+Shift+Tab',
          click: () => broadcast('view:prev-doc'),
        },
        { type: 'separator' },
        // Typora：视图三件套（源码 ⌘/、专注 F8、打字机 F9）
        { label: L.sourceMode, accelerator: 'CmdOrCtrl+/', click: () => broadcast('view:source-mode') },
        { label: L.focusMode, accelerator: 'F8', click: () => broadcast('view:focus-mode') },
        { label: L.typewriterMode, accelerator: 'F9', click: () => broadcast('view:typewriter-mode') },
        { type: 'separator' },
        // Typora：缩放用 Ctrl+Shift±=（让出 ⌘=/⌘-/⌘0 给标题升降级与正文）
        { role: 'resetZoom', accelerator: 'CmdOrCtrl+Shift+0' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+Shift+=' },
        { role: 'zoomOut', accelerator: 'CmdOrCtrl+Shift+-' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      label: L.help,
      submenu: [{ label: L.about, click: showAbout }],
    },
  ]

  return Menu.buildFromTemplate(template)
}

/** 渲染进程 IPC：设置菜单语言；最近文件变化时重建菜单 */
export function registerMenuIpc(): void {
  ipcMain.handle(IPC.invoke.setLanguage, (_e, lang: 'zh' | 'en') => {
    setMenuLanguage(lang)
    return { ok: true as const, data: null }
  })
  onRecentChanged(() => Menu.setApplicationMenu(buildMenu()))
}
