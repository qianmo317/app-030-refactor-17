#!/usr/bin/env node
/** 等价性对拍：esbuild 打包 scripts/consolidation-check.ts 后由 node 执行（不入构建产物）。 */
const path = require('path')
const esbuild = require(path.join(__dirname, '..', 'app-030', 'node_modules', 'esbuild'))

const outfile = path.join(__dirname, '.check.cjs')
esbuild
  .build({
    entryPoints: [path.join(__dirname, 'consolidation-check.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  .then(() => {
    require(outfile)
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    try {
      require('fs').rmSync(outfile, { force: true })
    } catch {
      /* ignore */
    }
  })
