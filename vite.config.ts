import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/**
 * Tauri 桌面版的 renderer 构建（原 electron-vite renderer 段的等价迁移）。
 * - CSP 由 src-tauri/tauri.conf.json 的 app.security.csp 注入（Tauri 侧职责），此处不再做插件注入
 * - 产物 dist/ 供 tauri.conf.json frontendDist 消费
 */
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@shared', replacement: resolve(__dirname, 'src/shared') },
      { find: '@renderer', replacement: resolve(__dirname, 'src/renderer') },
    ],
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
