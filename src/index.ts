import { RippleGroup, RippleInstance } from './instance'
import { resolveTargets, warn } from './dom'
import { PRESET_NAMES } from './presets'
import type { PresetName, RippleController, RippleOptions, Target } from './types'

export type { FitMode, ImageInput, PointerLike, PresetName, RippleController, RippleOptions, Target } from './types'
export { autoInit } from './auto'

export const version: string = __VERSION__
export const presets: readonly PresetName[] = PRESET_NAMES

const NOOP: RippleController = {
  element: null, canvas: null, renderer: 'none',
  drop() {}, pause() {}, resume() {}, clear() {}, setPreset() {}, update() {}, destroy() {},
}

/**
 * Make a surface behave like water.
 *
 *   ripple('#hero', 'rain')              // a section
 *   ripple('.buy-button', 'glass')       // a button
 *   ripple('img.product', 'pond')        // an image (refracts itself)
 *   ripple('fullscreen', 'storm')        // the whole viewport
 */
export function ripple(target?: Target, options?: RippleOptions | PresetName): RippleController {
  const opts: RippleOptions = typeof options === 'string' ? { preset: options } : options ?? {}
  if (typeof window === 'undefined' || typeof document === 'undefined') return NOOP
  if (opts.preset && !PRESET_NAMES.includes(opts.preset)) {
    warn(`unknown preset "${opts.preset}", using "pond". Available: ${PRESET_NAMES.join(', ')}`)
    opts.preset = 'pond'
  }
  const hosts = resolveTargets(target)
  if (!hosts.length) { warn('nothing matched ' + String(target)); return NOOP }
  const items = hosts.map((h) => RippleInstance.create(h, opts))
  return items.length === 1 ? items[0] : new RippleGroup(items)
}

/** Does this browser have WebGL2 (the fast, refracting renderer)? Canvas 2D works everywhere else. */
export function supported(): { webgl: boolean } {
  try {
    const c = document.createElement('canvas')
    return { webgl: !!c.getContext('webgl2') }
  } catch {
    return { webgl: false }
  }
}

export default ripple
