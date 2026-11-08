import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { mkdirSync } from 'node:fs'

mkdirSync('test/.tmp', { recursive: true })
await build({ entryPoints: ['src/sim.ts', 'src/lighting.ts'], outdir: 'test/.tmp', bundle: false, format: 'esm', outExtension: { '.js': '.mjs' } })
const { WaveField } = await import(pathToFileURL(process.cwd() + '/test/.tmp/sim.mjs'))
const { physics, shade } = await import(pathToFileURL(process.cwd() + '/test/.tmp/lighting.mjs'))

test('drop has zero net volume (no drift)', () => {
  const f = new WaveField(120, 120)
  f.drop(60, 60, 8, 1)
  let sum = 0
  for (const v of f.height) sum += v
  assert.ok(Math.abs(sum) < 0.05, 'sum ' + sum)
})

test('stable at the CFL limit, no NaN, calms down', () => {
  const f = new WaveField(80, 60)
  f.drop(20, 20, 6, 1)
  f.drop(60, 40, 4, 1)
  const p = physics(4, 1.2, 3)
  for (let i = 0; i < 3000; i++) f.step(0.49, p.damping)
  for (const v of f.height) assert.ok(Number.isFinite(v))
  assert.ok(f.maxVel < 1.5e-3, 'maxVel ' + f.maxVel)
})

test('radially symmetric from the center', () => {
  const f = new WaveField(101, 101)
  f.drop(50.5, 50.5, 8, 1)
  for (let i = 0; i < 40; i++) f.step(0.3, 0.998)
  for (let x = 0; x < 50; x++) assert.ok(Math.abs(f.height[50 * 101 + x] - f.height[50 * 101 + (100 - x)]) < 1e-4)
  for (let d = 0; d < 50; d++) assert.ok(Math.abs(f.height[50 * 101 + 50 + d] - f.height[(50 + d) * 101 + 50]) < 1e-3)
})

test('wave front travels at the expected speed', () => {
  const f = new WaveField(301, 11)
  f.drop(150.5, 5.5, 3, 1)
  const k = 0.25, steps = 100
  for (let i = 0; i < steps; i++) f.step(k, 1)
  // find the outer crest on the right half
  let best = 0, at = 0
  for (let x = 160; x < 301; x++) { const a = Math.abs(f.height[5 * 301 + x]); if (a > best) { best = a; at = x } }
  const expected = 150 + Math.sqrt(k) * steps * 0.95
  assert.ok(Math.abs(at - expected) < 12, `front at ${at}, expected about ${expected}`)
})

test('reflects off edges, absorbs when asked', () => {
  const run = (mode) => {
    const f = new WaveField(60, 60)
    f.setEdges(mode)
    f.drop(30, 30, 6, 1)
    for (let i = 0; i < 400; i++) f.step(0.3, 0.999)
    return f.maxVel
  }
  assert.ok(run('absorb') < run('reflect') * 0.6)
})

test('fillField slope points uphill', () => {
  const f = new WaveField(10, 10)
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) f.height[y * 10 + x] = x * 0.1
  const out = new Float32Array(10 * 10 * 4)
  f.fillField(out)
  const o = (5 * 10 + 5) * 4
  assert.ok(Math.abs(out[o] - 0.1) < 1e-6 && Math.abs(out[o + 1]) < 1e-6)
})

test('physics keeps wave speed independent of cell size', () => {
  for (const cell of [2, 4, 8, 12]) {
    const p = physics(cell, 1, 4)
    const pxPerSec = Math.sqrt(p.k) * p.substeps * 60 * cell
    assert.ok(Math.abs(pxPerSec - 300) < 15 || p.k >= 0.49, `cell ${cell}: ${pxPerSec}`)
    assert.ok(p.k <= 0.49)
  }
})

test('shade: flat water is invisible, slopes light and shadow', () => {
  const o = [0, 0, 0, 0]
  shade(0, 0, 0, 5.5, 0, [1, 1, 1], [0, 0, 0], o)
  assert.equal(o[3], 0)
  shade(0.2, 0.2, 0, 5.5, 0, [1, 1, 1], [0, 0, 0], o)
  assert.ok(o[3] > 0.2 && o[0] > 0.2)
  shade(-0.2, -0.2, 0, 5.5, 0, [1, 1, 1], [0, 0.03, 0.08], o)
  assert.ok(o[3] > 0.1 && o[0] < 0.01)
})
