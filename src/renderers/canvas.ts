import type { FitMode } from '../types'
import { shade } from '../lighting'
import { imageSize } from './types'
import type { ImageSrc, RenderParams, Renderer } from './types'

/** CPU fallback. Same water, same lighting, drawn at grid resolution and scaled up. */
export class CanvasRenderer implements Renderer {
  readonly kind = 'canvas' as const
  private ctx: CanvasRenderingContext2D
  private off: HTMLCanvasElement
  private offCtx: CanvasRenderingContext2D
  private img: ImageData | null = null
  private src: Uint8ClampedArray | null = null
  private image: ImageSrc | null = null
  private fit: FitMode = 'cover'
  private gw = 0
  private gh = 0
  private cssW = 1
  private px = [0, 0, 0, 0]

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('lwkripple: Canvas 2D is not available')
    this.ctx = ctx
    this.off = document.createElement('canvas')
    this.offCtx = this.off.getContext('2d', { willReadFrequently: true })!
  }

  resize(cssW: number, _cssH: number, pxW: number, pxH: number, gw: number, gh: number): void {
    this.cssW = cssW
    this.canvas.width = pxW
    this.canvas.height = pxH
    this.gw = gw; this.gh = gh
    this.off.width = gw; this.off.height = gh
    this.img = this.offCtx.createImageData(gw, gh)
    this.buildSource()
  }

  setImage(src: ImageSrc | null, fit: FitMode): boolean {
    this.image = src
    this.fit = fit
    return this.buildSource()
  }

  private buildSource(): boolean {
    this.src = null
    if (!this.image || !this.gw) return true
    const [iw, ih] = imageSize(this.image)
    if (!iw || !ih) return false
    const { gw, gh } = this
    let dw = gw, dh = gh
    if (this.fit !== 'fill') {
      const s = this.fit === 'cover' ? Math.max(gw / iw, gh / ih) : Math.min(gw / iw, gh / ih)
      dw = iw * s; dh = ih * s
    }
    try {
      this.offCtx.clearRect(0, 0, gw, gh)
      this.offCtx.drawImage(this.image, (gw - dw) / 2, (gh - dh) / 2, dw, dh)
      this.src = this.offCtx.getImageData(0, 0, gw, gh).data
      return true
    } catch {
      this.src = null
      return false
    }
  }

  render(field: Float32Array, p: RenderParams): void {
    if (!this.img) return
    const { gw, gh, src, px } = this
    const data = this.img.data
    const rc = p.refractPx / (this.cssW / gw)
    const [cr, cg, cb, ca] = p.color
    const n = gw * gh
    for (let i = 0; i < n; i++) {
      const o = i * 4
      const sx = field[o], sy = field[o + 1]
      let br = cr, bg = cg, bb = cb, ba = ca
      if (src) {
        let tx = Math.round((i % gw) + sx * rc)
        let ty = Math.round(((i / gw) | 0) + sy * rc)
        tx = tx < 0 ? 0 : tx >= gw ? gw - 1 : tx
        ty = ty < 0 ? 0 : ty >= gh ? gh - 1 : ty
        const si = (ty * gw + tx) * 4
        const a = src[si + 3] / 255
        const k = 1 - ca
        br += (src[si] / 255) * a * k
        bg += (src[si + 1] / 255) * a * k
        bb += (src[si + 2] / 255) * a * k
        ba += a * k
      }
      shade(sx, sy, field[o + 2], p.gain, p.causticK, p.highlight, p.shadow, px)
      const inv = 1 - px[3]
      const A = (px[3] + ba * inv) * p.opacity
      if (A <= 0.0004) { data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0; continue }
      const un = p.opacity / A
      data[o] = Math.min(255, (px[0] + br * inv) * un * 255)
      data[o + 1] = Math.min(255, (px[1] + bg * inv) * un * 255)
      data[o + 2] = Math.min(255, (px[2] + bb * inv) * un * 255)
      data[o + 3] = A * 255
    }
    this.offCtx.putImageData(this.img, 0, 0)
    const c = this.ctx
    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    c.imageSmoothingEnabled = true
    c.imageSmoothingQuality = 'high'
    c.drawImage(this.off, 0, 0, this.canvas.width, this.canvas.height)
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  destroy(): void { /* nothing to release */ }
}
