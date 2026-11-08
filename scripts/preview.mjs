// Renders the shared lighting model to a PPM so the look can be calibrated without a browser.
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'
mkdirSync('test/.tmp', { recursive: true })
await build({ entryPoints: ['src/sim.ts', 'src/lighting.ts'], outdir: 'test/.tmp', format: 'esm', outExtension: { '.js': '.mjs' } })
const { WaveField } = await import(pathToFileURL(process.cwd() + '/test/.tmp/sim.mjs'))
const L = await import(pathToFileURL(process.cwd() + '/test/.tmp/lighting.mjs'))

const W = 800, H = 400, cell = 4, gw = W / cell, gh = H / cell
const mode = process.argv[2] || 'light'
const intensity = Number(process.argv[3] || 1)
const out = process.argv[4] || 'test/.tmp/preview.ppm'
const f = new WaveField(gw, gh)
const p = L.physics(cell, 1, 4)
const drop = (x, y, r, s) => { const rc = r / cell; f.drop(x / cell, y / cell, rc, s * L.AMP_K * rc) }
const stepFrames = n => { for (let i = 0; i < n * p.substeps; i++) f.step(p.k, p.damping) }
drop(250, 200, 20, 1.3); stepFrames(30)
drop(560, 140, 16, 1); stepFrames(18)
drop(430, 300, 10, 0.8); stepFrames(14)
const field = new Float32Array(gw * gh * 4); f.fillField(field)

const bg = (x, y) => { // navy gradient + faint grid + bright stripes, to read refraction
  const t = y / H
  let r = 10 + 20 * t, g = 37 + 50 * t, b = 64 + 70 * t
  if (mode === 'image') {
    const cx = Math.floor(x / 40), cy = Math.floor(y / 40)
    if ((cx + cy) % 2 === 0) { r += 70; g += 60; b += 40 }
    if (Math.abs(((x + 20) % 160) - 80) < 3) { r = 255; g = 220; b = 120 }
  }
  return [r / 255, g / 255, b / 255]
}
const buf = Buffer.alloc(W * H * 3)
const px = [0, 0, 0, 0]
const rc = L.REFRACT_PX * intensity
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const gx = Math.min(gw - 1, Math.max(0, Math.round((x + 0.5) / cell - 0.5)))
  const gy = Math.min(gh - 1, Math.max(0, Math.round((y + 0.5) / cell - 0.5)))
  const o = (gy * gw + gx) * 4
  const sx = field[o], sy = field[o + 1], lap = field[o + 2]
  L.shade(sx, sy, lap, L.GAIN * intensity, L.CAUSTIC_GAIN * 0.3 * intensity, [1, 1, 1], [0, 0.03, 0.08], px)
  const [r, g, b] = mode === 'image' ? bg(x + sx * rc, y + sy * rc) : bg(x, y)
  const i = (y * W + x) * 3, a = px[3]
  buf[i] = Math.round(255 * (px[0] + r * (1 - a)))
  buf[i + 1] = Math.round(255 * (px[1] + g * (1 - a)))
  buf[i + 2] = Math.round(255 * (px[2] + b * (1 - a)))
}
writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), buf]))
let mx = 0; for (let i = 0; i < gw * gh; i++) mx = Math.max(mx, Math.hypot(field[i * 4], field[i * 4 + 1]))
console.log('max slope', mx.toFixed(3), 'substeps', p.substeps, 'k', p.k.toFixed(3))
