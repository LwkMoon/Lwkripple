import type { PresetName, RippleController, RippleOptions } from './types'
import { PRESET_NAMES } from './presets'
import { ripple } from './index'

const num = (v: string | undefined): number | undefined => (v === undefined || v === '' ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined)
const bool = (v: string | undefined): boolean | undefined => (v === undefined ? undefined : v !== 'false' && v !== '0')

/**
 * Turn markup into effects: <section data-lwkripple="rain">.
 * Extra knobs: data-lwkripple-image, -color, -intensity, -radius, -speed, -lifetime, -auto, -hover, -click, -layer.
 * Putting it on <body> makes it a fullscreen effect.
 */
export function autoInit(root: ParentNode = document): RippleController[] {
  const out: RippleController[] = []
  root.querySelectorAll<HTMLElement>('[data-lwkripple]').forEach((el) => {
    const d = el.dataset
    const name = d.lwkripple as PresetName
    const o: RippleOptions = {
      preset: PRESET_NAMES.includes(name) ? name : 'pond',
      image: d.lwkrippleImage || undefined,
      color: d.lwkrippleColor,
      intensity: num(d.lwkrippleIntensity),
      radius: num(d.lwkrippleRadius),
      speed: num(d.lwkrippleSpeed),
      lifetime: num(d.lwkrippleLifetime),
      hover: bool(d.lwkrippleHover),
      click: bool(d.lwkrippleClick),
      layer: d.lwkrippleLayer === 'over' || d.lwkrippleLayer === 'under' ? d.lwkrippleLayer : undefined,
    }
    if (d.lwkrippleAuto !== undefined) o.auto = d.lwkrippleAuto === 'true' ? true : d.lwkrippleAuto === 'false' ? false : num(d.lwkrippleAuto)
    for (const k of Object.keys(o) as (keyof RippleOptions)[]) if (o[k] === undefined) delete o[k]
    out.push(ripple(el, o))
  })
  return out
}
