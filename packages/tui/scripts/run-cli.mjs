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
 * ink 6.8 的满屏/增量渲染缺陷，打包期修补（锚点失配显式抛错；MT5 发布打包需带上本插件）：
 * 1) ink.js「帧高 ≥ 终端行数」绕过增量 renderer，每帧 clearTerminal 整帧重写 → 满屏
 *    TUI 整屏闪烁（2026 同步输出在 ConPTY/WSL interop 不透传，清屏可见）。放行增量路径。
 * 2) isFullscreen 判定恒置 isTTY：帧永不带尾随换行，可见行数即内容行数。
 * 3) log-update.js 增量 renderer 整体替换为「绝对定位绘制」：每帧 ESC[H 归位、
 *    变化行按绝对坐标写入（ESC[r;1H + ESC[K）、帧变矮清到底（ESC[J）、光标后缀
 *    绝对定位。原实现对帧的可见行数记账与实际写入不一致（空行折叠/光标屏幕边缘
 *    钳制），任何帧高变化或 resize 都会累积出整帧漂移 → 状态栏残影/内容重影。
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
    build.onLoad({ filter: /[/\\]node_modules[/\\]ink[/\\]build[/\\]log-update\.js$/ }, async (args) => {
      const js = await readFile(args.path, 'utf8')
      if (!js.includes('export default logUpdate')) {
        throw new Error('patch-ink-fullscreen: log-update.js 表面不符（ink 升级后需复核补丁）')
      }
      return {
        contents: await readFile(join(import.meta.dirname, 'log-update-absolute.mjs'), 'utf8'),
        loader: 'js',
      }
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
