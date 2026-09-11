/** 压测运行器：esbuild 打包 perf-probe.ts → 临时 ESM → node 运行 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const stubReactDevtools = {
  name: 'stub-react-devtools',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({ path: 'stub', namespace: 'stub' }))
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default {}', loader: 'js' }))
  },
}

const tmp = mkdtempSync(join(tmpdir(), 'yupmark-perf-'))
const outfile = join(tmp, 'perf.mjs')
try {
  await build({
    entryPoints: [join(import.meta.dirname, 'perf-probe.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
    plugins: [stubReactDevtools],
  })
  await import(pathToFileURL(outfile).href)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
