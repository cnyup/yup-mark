/* 布局检测台主进程：加载打包好的 page.html，捕获 console 输出 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })

  win.webContents.on('console-message', (event, ...args) => {
    const msg =
      typeof args[0] === 'object' && args[0] !== null && args[0] !== undefined && 'message' in args[0]
        ? String(args[0].message)
        : String(args[1] ?? '')
    process.stdout.write(msg + '\n')
    if (msg.includes('DONE')) {
      setTimeout(() => app.quit(), 200)
    }
  })

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    process.stdout.write(`[HARNESS] LOAD FAILED ${code} ${desc} ${url}\n`)
    app.quit()
  })

  win.webContents.on('render-process-gone', (_e, details) => {
    process.stdout.write(`[HARNESS] RENDERER CRASHED: ${details.reason}\n`)
    app.quit()
  })

  const mode = process.argv[2] || 'full'
  const rules = process.argv[3] || ''
  const engine = process.argv[4] || ''
  const query = { mode }
  if (rules) query.rules = rules
  if (engine) query.engine = engine
  void win.loadFile(path.join(__dirname, 'page.html'), { query })

  setTimeout(() => {
    process.stdout.write('[HARNESS] TIMEOUT\n')
    app.quit()
  }, 30000)
})
