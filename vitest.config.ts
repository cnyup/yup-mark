import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'packages/tui/tests/**/*.test.{ts,tsx,mjs}'],
  },
  esbuild: {
    // tui 的 tsx（无显式 React 导入）按自动运行时转换
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
})
