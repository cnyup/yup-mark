import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/** 仅在生产构建时向 index.html 注入严格 CSP（dev 需要 inline HMR 脚本，不能上 CSP） */
function prodCsp(): Plugin {
  return {
    name: 'yupmark:prod-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: yup-file: https: http:; font-src 'self'" />`,
      )
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react(), prodCsp()],
    resolve: {
      alias: [
        { find: '@shared', replacement: resolve(__dirname, 'src/shared') },
        { find: '@renderer', replacement: resolve(__dirname, 'src/renderer') },
      ],
    },
  },
})
