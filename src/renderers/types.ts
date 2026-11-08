import type { FitMode } from '../types'
import type { RGB } from '../lighting'

export type ImageSrc = HTMLImageElement | HTMLCanvasElement | ImageBitmap

export interface RenderParams {
  gain: number
  causticK: number
  refractPx: number
  opacity: number
  /** Premultiplied base fill. */
  color: [number, number, number, number]
  highlight: RGB
  shadow: RGB
}

export interface Renderer {
  readonly kind: 'webgl' | 'canvas'
  resize(cssW: number, cssH: number, pxW: number, pxH: number, gw: number, gh: number): void
  /** Returns false when the image cannot be used (for example, blocked by CORS). */
  setImage(src: ImageSrc | null, fit: FitMode): boolean
  render(field: Float32Array, params: RenderParams): void
  clear(): void
  destroy(): void
}

export function imageSize(src: ImageSrc): [number, number] {
  if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight]
  const s = src as { width: number; height: number }
  return [s.width, s.height]
}
