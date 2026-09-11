/**
 * 开发运行器：esbuild 打包 src/cli.tsx → 临时 ESM → node 运行。
 * （live-cm 内部为无扩展名的 TS 相对导入，纯 node 无法直接跑 TS，
 *   借 esbuild 打通；正式 bin 产物在 MT5 落地。）
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** ink 的 devtools 集成引用未安装的可选依赖 react-devtools-core，打包时替换为空桩 */
const stubReactDevtools = {
  name: 'stub-react-devtools',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-stub',
      namespace: 'stub',
    }))
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export default {}',
      loader: 'js',
    }))
  },
}

/**
 * ink 6.8 对「帧高 ≥ 终端行数」的满屏应用绕过增量 renderer，每帧
 * clearTerminal（\x1b[2J\x1b[3J\x1b[H）+ 整帧重写——满屏 TUI 因此整屏闪烁
 * （2026 同步输出在 ConPTY/WSL interop 下不透传，清屏瞬间可见）。
 * 增量 renderer 本就为无尾随换行的满屏帧设计（其 hasTrailingNewline 分支），
 * 这里放行：incrementalRendering 时走 throttledLog 的逐行 diff。
 * ink 升级后锚点失配会显式抛错，提醒复核。MT5 发布打包需带上本插件。
 */
const patchInkFullscreen = {
  name: 'patch-ink-fullscreen',
  setup(build) {
    build.onLoad({ filter: /[/\\]node_modules[/\\]ink[/\\]build[/\\]ink\.js$/ }, async (args) => {
      const js = await readFile(args.path, 'utf8')
      const needle = 'if (this.lastOutputHeight >= this.options.stdout.rows) {'
      const patched =
        'if (!this.options.incrementalRendering && this.lastOutputHeight >= this.options.stdout.rows) {'
      if (!js.includes(needle)) {
        throw new Error('patch-ink-fullscreen: ink.js 锚点未找到（ink 升级后需复核补丁）')
      }
      return { contents: js.replace(needle, patched), loader: 'js' }
    })
  },
}

const tmp = mkdtempSync(join(tmpdir(), 'yupmark-tui-'))
const outfile = join(tmp, 'cli.mjs')
try {
  await build({
    entryPoints: [join(import.meta.dirname, '..', 'src', 'cli.tsx')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    outfile,
    logLevel: 'silent',
    plugins: [stubReactDevtools, patchInkFullscreen],
    // CJS 依赖（signal-exit 等）在 ESM 产物里动态 require 内置模块，需 require 桥
    banner: {
      js: "import { createRequire as __yupCr } from 'node:module'; const require = __yupCr(import.meta.url);",
    },
  })
  await import(pathToFileURL(outfile).href)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
