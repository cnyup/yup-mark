/**
 * ink 6.8 渲染缺陷补丁（run-cli.mjs 开发运行与 build-dist.mjs 发布构建共用；MT5 起发布产物必须内含）。
 *
 * 1) ink.js「帧高 ≥ 终端行数」绕过增量 renderer，每帧 clearTerminal 整帧重写 →
 *    满屏 TUI 整屏闪烁（2026 同步输出在 ConPTY/WSL interop 不透传，清屏可见）。放行增量路径。
 * 2) isFullscreen 判定恒置 isTTY：帧永不带尾随换行，可见行数即内容行数。
 * 3) log-update.js 整文件替换为「绝对定位帧绘制器」（./log-update-absolute.mjs）：
 *    原增量 renderer 光标相对寻址 + 帧行数随内容变化 + 屏幕边缘钳制 → 记账脱节
 *    逐帧累积成整帧漂移（残影/重影）。绝对定位不依赖上一帧光标状态，三类漂移源
 *    全部消除。语义详见该文件头注。
 *
 * 锚点/表面失配时显式抛错——ink 升级后需人工复核补丁。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = import.meta.dirname ?? fileURLToPath(new URL('.', import.meta.url))

const INK_NEEDLES = [
  [
    'if (this.lastOutputHeight >= this.options.stdout.rows) {',
    'if (!this.options.incrementalRendering && this.lastOutputHeight >= this.options.stdout.rows) {',
  ],
  [
    'const isFullscreen = this.options.stdout.isTTY && outputHeight >= this.options.stdout.rows;',
    'const isFullscreen = this.options.stdout.isTTY;',
  ],
]

function patchMacBackspace(js) {
  const keyCodeNeedle = "127: 'delete',"
  if (js.includes(keyCodeNeedle)) return js.replace(keyCodeNeedle, "127: 'backspace',")

  const legacyStart = "else if (s === '\\x7f' || s === '\\x1b\\x7f') {"
  const start = js.indexOf(legacyStart)
  const end = start < 0 ? -1 : js.indexOf("key.name = 'delete';", start)
  if (end >= 0) {
    return `${js.slice(0, end)}key.name = 'backspace';${js.slice(end + "key.name = 'delete';".length)}`
  }

  throw new Error('patch-ink-fullscreen: macOS Backspace 锚点未找到（Ink 升级后需复核补丁）')
}

export const stubReactDevtools = {
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
 * TUI 永不调用 DOM 侧重依赖（MathWidget.toDOM / mermaid 动态渲染仅在桌面渲染进程执行；
 * TUI 只用 widget 实例做 instanceof 与字段读取）——打包期替换为空桩，发布包保持精瘦。
 * mermaid 为动态 import，运行时若真被调用会 reject 而非崩溃。
 */
export const stubDomHeavyDeps = {
  name: 'stub-dom-heavy-deps',
  setup(build) {
    for (const name of ['katex', 'mermaid']) {
      build.onResolve({ filter: new RegExp(`^${name}$`) }, () => ({
        path: `${name}-stub`,
        namespace: 'stub',
      }))
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents:
          name === 'mermaid'
            ? 'const mermaid = { initialize() {}, render() { return Promise.reject(new Error("mermaid unavailable in TUI bundle")) } };\nexport default mermaid;'
            : 'const katex = { render() {}, renderToString() { return "" } };\nexport default katex;',
        loader: 'js',
      }))
    }
  },
}

export const patchInkFullscreen = {
  name: 'patch-ink-fullscreen',
  setup(build) {
    build.onLoad({ filter: /[/\\]node_modules[/\\]ink[/\\]build[/\\]ink\.js$/ }, async (args) => {
      const js = await readFile(args.path, 'utf8')
      let out = js
      for (const [needle, patched] of INK_NEEDLES) {
        if (!out.includes(needle)) {
          throw new Error(`patch-ink-fullscreen: ink.js 锚点未找到（ink 升级后需复核补丁）: ${needle}`)
        }
        out = out.replace(needle, patched)
      }
      return { contents: out, loader: 'js' }
    })
    build.onLoad({ filter: /[/\\]node_modules[/\\]ink[/\\]build[/\\]parse-keypress\.js$/ }, async (args) => ({
      contents: patchMacBackspace(await readFile(args.path, 'utf8')),
      loader: 'js',
    }))
    build.onLoad({ filter: /[/\\]node_modules[/\\]ink[/\\]build[/\\]log-update\.js$/ }, async (args) => {
      const js = await readFile(args.path, 'utf8')
      if (!js.includes('export default logUpdate')) {
        throw new Error('patch-ink-fullscreen: log-update.js 表面不符（ink 升级后需复核补丁）')
      }
      return {
        contents: await readFile(join(here, 'log-update-absolute.mjs'), 'utf8'),
        loader: 'js',
      }
    })
  },
}
