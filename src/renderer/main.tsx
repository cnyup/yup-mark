import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import './i18n'
import 'katex/dist/katex.min.css'
import './assets/base.css'
import './themes/github.css'
import './themes/github-dark.css'
import './themes/newsprint.css'
import './themes/dracula.css'
import { initAppSettings } from './app/store/appSettings'
import { readPersisted, resolveTheme } from './app/store/settingsPersist'
import { installTauriApi } from './lib/tauriApi'

// Tauri WebView 下安装 window.yupmark（须早于任何消费者；纯浏览器/测试环境跳过）
installTauriApi()

// 防闪白：在 React 挂载前先把主题写到 <html data-theme>
document.documentElement.dataset.theme = resolveTheme(readPersisted().themeMode)

initAppSettings()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
