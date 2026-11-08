// node scripts/calibrate.mjs <preset> <W> <H> <seconds> <edges> <out.ppm> [clickAtSec,x,y,strength ...]
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'
mkdirSync('test/.tmp', { recursive: true })
await build({ entryPoints: ['src/sim.ts', 'src/lighting.ts', 'src/presets.ts'], outdir: 'test/.tmp', format: 'esm', outExtension: { '.js': '.mjs' } })
const imp = (n) => import(pathToFileURL(process.cwd() + `/test/.tmp/${n}.mjs`))
const { WaveField } = await imp('sim'); const L = await imp('lighting'); const { PRESETS } = await imp('presets')
const [preset = 'storm', Ws = '800', Hs = '300', secs = '6', edges = 'reflect', out = 'test/.tmp/cal.ppm', ...clicks] = process.argv.slice(2)
const W = +Ws, H = +Hs, def = PRESETS[preset]
let cell = Math.min(W, H) < 140 ? 2 : 4
const gw = Math.ceil(W / cell), gh = Math.ceil(H / cell)
const f = new WaveField(gw, gh); f.setEdges(edges)
const p = L.physics(cell, def.speed, def.lifetime)
const addDrop = (x, y, s, r) => { s = Math.min(s, 1.8); r = Math.min(r, Math.max(5, 0.45 * Math.min(W, H))); const rc = r / cell; f.drop(x / cell, y / cell, rc, s * L.AMP_K * rc) }
const ck = clicks.map((c) => c.split(',').map(Number))
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const rr = (a, b) => a + rnd() * (b - a)
let autoAcc = 0
const frames = Math.round(+secs * 60)
for (let fr = 0; fr < frames; fr++) {
  const t = fr / 60
  autoAcc += def.auto.rate / 60
  while (autoAcc >= 1) { autoAcc--; let x = rr(0.05, 0.95) * W, y = rr(0.05, 0.95) * H
    if (def.auto.edge) { const s = (rnd() * 4) | 0; if (s === 0) y = 0; else if (s === 1) y = H; else if (s === 2) x = 0; else x = W }
    addDrop(x, y, rr(...def.auto.strength), rr(...def.auto.radius)) }
  for (const c of ck) if (Math.abs(c[0] - t) < 1 / 120) addDrop(c[1], c[2], c[3] * def.strength * 1.3, def.radius * 1.2)
  for (let s = 0; s < p.substeps; s++) f.step(p.k, p.damping)
}
const field = new Float32Array(gw * gh * 4); f.fillField(field)
const buf = Buffer.alloc(W * H * 3), px = [0, 0, 0, 0]
const caustic = L.CAUSTIC_GAIN * def.caustics * def.intensity
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const gx = Math.min(gw - 1, Math.floor(x / cell)), gy = Math.min(gh - 1, Math.floor(y / cell)), o = (gy * gw + gx) * 4
  L.shade(field[o], field[o + 1], field[o + 2], L.GAIN * def.intensity, caustic, [1, 1, 1], [0, 0.03, 0.08], px)
  const t = y / H, a = px[3], i = (y * W + x) * 3
  const bg = [(10 + 20 * t) / 255, (37 + 50 * t) / 255, (64 + 70 * t) / 255]
  for (let k = 0; k < 3; k++) buf[i + k] = Math.round(255 * (px[k] + bg[k] * (1 - a)))
}
writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), buf]))
let cover = 0, n = 0; for (let i = 0; i < W * H; i++) { n++; } 
let lit = 0; for (let i = 0; i < gw * gh; i++) { const s = Math.hypot(field[i * 4], field[i * 4 + 1]) * L.GAIN * def.intensity; if (s > 0.5) lit++ }
console.log(`${preset} ${W}x${H} edges=${edges}: ${(100 * lit / (gw * gh)).toFixed(1)}% of surface strongly lit, substeps=${p.substeps}`)
