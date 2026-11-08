export type PresetName = 'pond' | 'rain' | 'storm' | 'glass' | 'ocean'
export type FitMode = 'cover' | 'contain' | 'fill'
export type ImageInput = string | HTMLImageElement | HTMLCanvasElement | ImageBitmap | 'auto'

export interface RippleOptions {
  /** Water personality. Default: 'pond'. */
  preset?: PresetName
  /** Opt-in image refraction. A URL, an <img>, a canvas, an ImageBitmap, or 'auto' (use the element's CSS background-image). */
  image?: ImageInput | null
  /** How the image fills the area. Default: 'cover'. */
  fit?: FitMode
  /** Water body color, any CSS color (alpha allowed). Default: none (transparent, shows what is behind). */
  color?: string | null
  /** Highlight color. Default: white. */
  highlight?: string
  /** Shadow color. Default: deep navy. */
  shadow?: string
  /** Overall opacity of the effect, 0 to 1. */
  opacity?: number
  /** Strength of lighting and refraction. 1 = preset default. */
  intensity?: number
  /** Drop radius in CSS px. */
  radius?: number
  /** Multiplier for drop strength. 1 = preset default. */
  strength?: number
  /** Wave speed multiplier. 1 = about 300 px per second. */
  speed?: number
  /** Roughly how many seconds a ripple takes to fade out. */
  lifetime?: number
  /** Ripples follow the pointer. Default: true (false on buttons). */
  hover?: boolean
  /** Ripples on click or tap. Default: true. */
  click?: boolean
  /** Automatic drops. true = preset rate, false = off, number = drops per second. */
  auto?: boolean | number
  /** Light patterns on the bottom. true, false or 0 to 1. */
  caustics?: boolean | number
  /** What waves do at the edges. Default: 'reflect' (waves bounce), or 'absorb' on small areas like buttons. */
  edges?: 'reflect' | 'absorb'
  /** 'under' draws behind the content, 'over' draws on top (never blocks clicks). */
  layer?: 'under' | 'over'
  /** z-index of the canvas when layer is 'over' or in fullscreen. */
  zIndex?: number
  /** Force a renderer. Default: 'auto' (WebGL2, falling back to Canvas 2D). */
  renderer?: 'auto' | 'webgl' | 'canvas'
  /** Simulation cell size in CSS px. Bigger = faster and softer. */
  resolution?: number
  /** Canvas pixel ratio cap. Default: min(devicePixelRatio, 2). */
  pixelRatio?: number
  /** 'respect' (default) calms the effect when the user prefers reduced motion. */
  reducedMotion?: 'respect' | 'ignore'
  /** Pause when scrolled out of view. Default: true. */
  pauseOffscreen?: boolean
  /** Called once the effect is running. */
  onReady?: (controller: RippleController) => void
}

export interface PointerLike { clientX: number; clientY: number }

export interface RippleController {
  readonly element: HTMLElement | null
  readonly canvas: HTMLCanvasElement | null
  readonly renderer: 'webgl' | 'canvas' | 'none'
  /** Drop a ripple at a pointer event, or at x/y (CSS px inside the area). No arguments = random spot. */
  drop(event: PointerLike, strength?: number, radius?: number): void
  drop(x?: number, y?: number, strength?: number, radius?: number): void
  pause(): void
  resume(): void
  /** Flatten the water instantly. */
  clear(): void
  setPreset(name: PresetName): void
  update(options: RippleOptions): void
  destroy(): void
}

export type Target = string | Element | Window | Document | ArrayLike<Element> | null | undefined
