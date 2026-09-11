/**
 * 开发运行器：esbuild 打包 src/cli.tsx → 临时 ESM → node 运行。
 * （live-cm 内部为无扩展名的 TS 相对导入，纯 node 无法直接跑 TS，
 *   借 esbuild 打通；正式 bin 产物在 MT5 落地。）
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
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
    plugins: [stubReactDevtools],
    // CJS 依赖（signal-exit 等）在 ESM 产物里动态 require 内置模块，需 require 桥
    banner: {
      js: "import { createRequire as __yupCr } from 'node:module'; const require = __yupCr(import.meta.url);",
    },
  })
  await import(pathToFileURL(outfile).href)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
