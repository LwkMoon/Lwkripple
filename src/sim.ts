/**
 * Height-field water simulation (the wave equation on a grid).
 * Pure TypeScript, no DOM, so it can be tested in Node and drives both renderers.
 */
export type Edges = 'reflect' | 'absorb'

/** Tiny leak so tiny drifts relax back to flat. */
const LEAK = 0.9998

export class WaveField {
  readonly w: number
  readonly h: number
  readonly height: Float32Array
  readonly vel: Float32Array
  /** Largest |velocity| seen in the last step. Used to decide when the water is calm. */
  maxVel = 0
  private sponge: Float32Array | null = null

  constructor(w: number, h: number) {
    this.w = Math.max(3, Math.floor(w))
    this.h = Math.max(3, Math.floor(h))
    this.height = new Float32Array(this.w * this.h)
    this.vel = new Float32Array(this.w * this.h)
  }

  setEdges(mode: Edges): void {
    if (mode !== 'absorb') { this.sponge = null; return }
    const { w, h } = this
    const width = Math.max(4, Math.min(16, Math.floor(Math.min(w, h) * 0.12)))
    const s = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.min(x, y, w - 1 - x, h - 1 - y)
        const t = d >= width ? 1 : d / width
        s[y * w + x] = 1 - 0.3 * (1 - t) * (1 - t)
      }
    }
    this.sponge = s
  }

  clear(): void {
    this.height.fill(0)
    this.vel.fill(0)
    this.maxVel = 0
  }

  /**
   * One symplectic Euler step. Stable while k < 0.5.
   * k = (cells per step)^2, damping is the per-step velocity multiplier.
   */
  step(k: number, damping: number): void {
    const { w, h, height, vel, sponge } = this
    for (let y = 0; y < h; y++) {
      const row = y * w
      const up = (y > 0 ? y - 1 : y) * w
      const dn = (y < h - 1 ? y + 1 : y) * w
      for (let x = 0; x < w; x++) {
        const i = row + x
        const c = height[i]
        const l = height[row + (x > 0 ? x - 1 : x)]
        const r = height[row + (x < w - 1 ? x + 1 : x)]
        let v = (vel[i] + k * (l + r + height[up + x] + height[dn + x] - 4 * c)) * damping
        if (sponge) v *= sponge[i]
        vel[i] = v
      }
    }
    let maxV = 0
    const n = w * h
    for (let i = 0; i < n; i++) {
      let v = vel[i]
      let hv = (height[i] + v) * LEAK
      const av = v < 0 ? -v : v
      if (av < 1e-6 && hv < 1e-6 && hv > -1e-6) { v = 0; hv = 0; vel[i] = 0 }
      if (av > maxV) maxV = av
      height[i] = hv
    }
    this.maxVel = maxV
  }

  /**
   * Add a drop. cx, cy and radius are in cells.
   * The shape is a Ricker wavelet with zero net volume, so the water never drifts up or down.
   */
  drop(cx: number, cy: number, radius: number, amp: number): void {
    const { w, h, height } = this
    const sigma = Math.max(0.75, radius / 2)
    const reach = Math.ceil(sigma * 4.9)
    const x0 = Math.max(0, Math.floor(cx) - reach)
    const x1 = Math.min(w - 1, Math.floor(cx) + reach)
    const y0 = Math.max(0, Math.floor(cy) - reach)
    const y1 = Math.min(h - 1, Math.floor(cy) + reach)
    const inv = 1 / (sigma * sigma)
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx
        const u2 = (dx * dx + dy * dy) * inv
        if (u2 > 24) continue
        height[y * w + x] -= amp * 0.5 * (2 - u2) * Math.exp(-u2 / 2)
      }
    }
  }

  /** Write RGBA floats per cell: slopeX, slopeY, laplacian, height. */
  fillField(out: Float32Array): void {
    const { w, h, height } = this
    let o = 0
    for (let y = 0; y < h; y++) {
      const row = y * w
      const up = (y > 0 ? y - 1 : y) * w
      const dn = (y < h - 1 ? y + 1 : y) * w
      for (let x = 0; x < w; x++) {
        const xl = x > 0 ? x - 1 : x
        const xr = x < w - 1 ? x + 1 : x
        const c = height[row + x]
        const l = height[row + xl]
        const r = height[row + xr]
        const u = height[up + x]
        const d = height[dn + x]
        out[o] = (r - l) * 0.5
        out[o + 1] = (d - u) * 0.5
        out[o + 2] = l + r + u + d - 4 * c
        out[o + 3] = c
        o += 4
      }
    }
  }
}
