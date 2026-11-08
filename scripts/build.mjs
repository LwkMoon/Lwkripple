import { build } from 'esbuild'
import { execSync } from 'node:child_process'
import { cpSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const define = { __VERSION__: JSON.stringify(pkg.version) }
const common = { bundle: true, target: 'es2020', define, legalComments: 'none' }
// The React entry must share the core with 'lwkripple' instead of bundling a second copy.
const sharedCore = { name: 'shared-core', setup(b) { b.onResolve({ filter: /^\.\/index$/ }, () => ({ path: 'lwkripple', external: true })) } }

rmSync('dist', { recursive: true, force: true })
await Promise.all([
  build({ ...common, entryPoints: ['src/index.ts'], format: 'esm', outfile: 'dist/index.js', minify: true }),
  build({ ...common, entryPoints: ['src/index.ts'], format: 'cjs', outfile: 'dist/index.cjs', minify: true }),
  build({ ...common, entryPoints: ['src/react.ts'], format: 'esm', outfile: 'dist/react.js', minify: true, external: ['react'], plugins: [sharedCore] }),
  build({ ...common, entryPoints: ['src/react.ts'], format: 'cjs', outfile: 'dist/react.cjs', minify: true, external: ['react'], plugins: [sharedCore] }),
  build({ ...common, entryPoints: ['src/global.ts'], format: 'iife', globalName: 'Lwkripple', outfile: 'dist/lwkripple.global.js', minify: true }),
])
execSync('npx tsc -p tsconfig.json --noEmit false --declaration --emitDeclarationOnly --outDir dist/types', { stdio: 'inherit' })
// Flatten declarations: one self-contained .d.ts (+ .d.cts) per entry, no internals shipped.
cpSync('dist/types', 'dist', { recursive: true })
const rd = (f) => readFileSync('dist/' + f, 'utf8')
const noImports = (t) => t.split('\n').filter((l) => !/^import type .* from '\.\/types';?$/.test(l)).join('\n')
const typesDts = rd('types.d.ts')
const autoDts = noImports(rd('auto.d.ts'))
const indexBody = noImports(rd('index.d.ts'))
  .split('\n').filter((l) => !/^export type \{.*\} from '\.\/types';?$/.test(l))
  .join('\n').replace("export { autoInit } from './auto';", autoDts)
const indexDts = typesDts.trimEnd() + '\n' + indexBody
const reactDts = rd('react.d.ts').replace(/'\.\/types'/g, "'lwkripple'")
writeFileSync('dist/index.d.ts', indexDts)
writeFileSync('dist/index.d.cts', indexDts)
writeFileSync('dist/react.d.ts', reactDts)
writeFileSync('dist/react.d.cts', reactDts)
for (const f of readdirSync('dist')) {
  if (/\.d\.ts$/.test(f) && !['index.d.ts', 'react.d.ts'].includes(f)) rmSync('dist/' + f)
}
rmSync('dist/types', { recursive: true, force: true })
rmSync('dist/renderers', { recursive: true, force: true })

for (const f of ['index.js', 'index.cjs', 'react.js', 'lwkripple.global.js']) {
  const buf = readFileSync('dist/' + f)
  console.log(f.padEnd(22), (statSync('dist/' + f).size / 1024).toFixed(1) + ' KB', ' gzip', (gzipSync(buf).length / 1024).toFixed(1) + ' KB')
}
