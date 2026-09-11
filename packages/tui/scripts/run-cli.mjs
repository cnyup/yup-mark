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
 * ink 6.8 的两个满屏相关缺陷，打包期修补（锚点失配显式抛错；MT5 发布打包需带上本插件）：
 * 1) 「帧高 ≥ 终端行数」时绕过增量 renderer，每帧 clearTerminal 整帧重写 → 满屏
 *    TUI 整屏闪烁（2026 同步输出在 ConPTY/WSL interop 不透传，清屏可见）。放行增量路径。
 * 2) 非满屏帧会被追加尾随换行，而增量 renderer 的回退光标计算（cursorUp(N-1)、
 *    returnToBottom）全部按「无尾随换行、光标停在最后一行」假设——每帧整体下移一行，
 *    状态栏逐帧堆叠残影（帧高略小于终端行数时触发）。令 isFullscreen 恒为 isTTY，
 *    帧永不带尾随换行，增量假设恒成立。
 */
const patchInkFullscreen = {
  name: 'patch-ink-fullscreen',
  setup(build) {
    build.onLoad({ filter: /[/\\]node_modules[/\\]ink[/\\]build[/\\]ink\.js$/ }, async (args) => {
      const js = await readFile(args.path, 'utf8')
      const needles = [
        [
          'if (this.lastOutputHeight >= this.options.stdout.rows) {',
          'if (!this.options.incrementalRendering && this.lastOutputHeight >= this.options.stdout.rows) {',
        ],
        [
          'const isFullscreen = this.options.stdout.isTTY && outputHeight >= this.options.stdout.rows;',
          'const isFullscreen = this.options.stdout.isTTY;',
        ],
      ]
      let out = js
      for (const [needle, patched] of needles) {
        if (!out.includes(needle)) {
          throw new Error(`patch-ink-fullscreen: ink.js 锚点未找到（ink 升级后需复核补丁）: ${needle}`)
        }
        out = out.replace(needle, patched)
      }
      return { contents: out, loader: 'js' }
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
