import type { FitMode } from './types'

export type HostKind = 'fullscreen' | Element

const FULL_WORDS = ['fullscreen', 'page', 'viewport', 'window']

export function resolveTargets(target: unknown): HostKind[] {
  if (target == null) return ['fullscreen']
  if (typeof window !== 'undefined' && (target === window || target === document || target === document.body || target === document.documentElement)) return ['fullscreen']
  if (typeof target === 'string') {
    if (FULL_WORDS.includes(target.trim().toLowerCase())) return ['fullscreen']
    try { return Array.from(document.querySelectorAll(target)) } catch { return [] }
  }
  if (target instanceof Element) return [target]
  if (typeof (target as ArrayLike<Element>).length === 'number') {
    return Array.from(target as ArrayLike<Element>).filter((e) => e instanceof Element)
  }
  return []
}

export function warn(msg: string): void {
  if (typeof console !== 'undefined') console.warn('[lwkripple] ' + msg)
}

let colorCtx: CanvasRenderingContext2D | null = null

/** Parse any CSS color to [r, g, b, a] in 0..1 (not premultiplied). */
export function parseColor(css: string): [number, number, number, number] | null {
  if (!colorCtx) {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    colorCtx = c.getContext('2d', { willReadFrequently: true })
  }
  const x = colorCtx
  if (!x) return null
  x.fillStyle = '#123456'
  x.fillStyle = css
  if (x.fillStyle === '#123456' && css.trim().toLowerCase() !== '#123456') return null
  x.clearRect(0, 0, 1, 1)
  x.fillRect(0, 0, 1, 1)
  const d = x.getImageData(0, 0, 1, 1).data
  const a = d[3] / 255
  if (a === 0) return [0, 0, 0, 0]
  return [d[0] / 255 / a, d[1] / 255 / a, d[2] / 255 / a, a]
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('could not load ' + url.slice(0, 80) + ' (missing file, or the server blocks cross-origin use)'))
    img.src = url
  })
}

export function backgroundUrl(el: Element): string | null {
  const m = /url\((['"]?)(.*?)\1\)/.exec(getComputedStyle(el).backgroundImage)
  return m ? m[2] : null
}

export function fitFromCss(value: string): FitMode {
  if (value === 'contain' || value === 'scale-down') return 'contain'
  if (value === 'fill') return 'fill'
  return 'cover'
}
