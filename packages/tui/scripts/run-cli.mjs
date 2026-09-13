/**
 * 开发运行器：esbuild 打包 src/cli.tsx → 临时 ESM → node 运行。
 * （live-cm 内部为无扩展名的 TS 相对导入，纯 node 无法直接跑 TS，
 *   借 esbuild 打通；发布构建见 build-dist.mjs，两者共用 ink 补丁。）
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { patchInkFullscreen, stubDomHeavyDeps, stubReactDevtools } from './ink-patches.mjs'

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
    plugins: [stubReactDevtools, stubDomHeavyDeps, patchInkFullscreen],
    // CJS 依赖（signal-exit 等）在 ESM 产物里动态 require 内置模块，需 require 桥
    banner: {
      js: "import { createRequire as __yupCr } from 'node:module'; const require = __yupCr(import.meta.url);",
    },
  })
  await import(pathToFileURL(outfile).href)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
