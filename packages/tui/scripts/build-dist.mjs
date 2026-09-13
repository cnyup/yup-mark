/**
 * 发布构建（MT5）：esbuild 打包 src/cli.tsx → dist/cli.mjs 单文件可执行。
 *
 * 产物策略：
 * - 我们自己的代码（packages/tui + @yupmark/live-cm 源码）全部内联；
 * - ink 内联并应用 ink-patches.mjs 三补丁（满屏闪烁/尾随换行/绝对定位绘制器）——
 *   补丁改的是 ink 自身代码，ink 必须内联；
 * - @codemirror/language-data 保持外部依赖（其语言包经动态 import 运行时加载，
 *   内联会饿死懒加载并使产物暴涨），发布包 dependencies 声明之；
 * - react-devtools-core / katex / mermaid 以空桩替换（TUI 路径不执行 DOM 渲染）。
 * bin 入口带 node shebang；npm 在三平台都会生成对应 shim。
 */
import { build } from 'esbuild'
import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { patchInkFullscreen, stubDomHeavyDeps, stubReactDevtools } from './ink-patches.mjs'

const pkgRoot = join(import.meta.dirname, '..')
const outfile = join(pkgRoot, 'dist', 'cli.mjs')

const result = await build({
  entryPoints: [join(pkgRoot, 'src', 'cli.tsx')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  metafile: true,
  external: ['@codemirror/language-data'],
  plugins: [stubReactDevtools, stubDomHeavyDeps, patchInkFullscreen],
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __yupCr } from \'node:module\'; const require = __yupCr(import.meta.url);',
  },
})

const kb = Math.round(statSync(outfile).size / 1024)
const mods = Object.keys(result.metafile.inputs).length
console.log(`dist/cli.mjs built: ${kb} KB, ${mods} modules`)

// LICENSE 随包分发（npm 只打包包目录内文件）
mkdirSync(join(pkgRoot, 'dist'), { recursive: true })
copyFileSync(join(pkgRoot, '..', '..', 'LICENSE'), join(pkgRoot, 'dist', 'LICENSE'))
console.log('LICENSE copied into package')
