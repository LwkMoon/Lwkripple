import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { HTMLAttributes } from 'react'
import { ripple } from './index'
import type { RippleController, RippleOptions } from './types'

export type { RippleController, RippleOptions } from './types'

const OPTION_KEYS = new Set([
  'preset', 'image', 'fit', 'color', 'highlight', 'shadow', 'opacity', 'intensity', 'radius', 'strength', 'speed',
  'lifetime', 'hover', 'click', 'auto', 'caustics', 'edges', 'layer', 'zIndex', 'renderer', 'resolution',
  'pixelRatio', 'reducedMotion', 'pauseOffscreen', 'onReady',
])

export interface RippleProps extends RippleOptions, Omit<HTMLAttributes<HTMLElement>, keyof RippleOptions> {
  /** Element to render. Default: 'div'. */
  as?: string
}

/**
 * <Ripple preset="rain" className="hero">...content...</Ripple>
 * The ref gives you the controller: ref.current.drop(x, y).
 */
export const Ripple = forwardRef<RippleController | null, RippleProps>(function Ripple(props, ref) {
  const { as = 'div', ...all } = props
  const options: Record<string, unknown> = {}
  const domProps: Record<string, unknown> = {}
  for (const k of Object.keys(all)) (OPTION_KEYS.has(k) ? options : domProps)[k] = (all as Record<string, unknown>)[k]
  const host = useRef<HTMLElement | null>(null)
  const ctl = useRef<RippleController | null>(null)
  const optionsKey = JSON.stringify({ ...options, image: typeof options.image === 'string' ? options.image : undefined, onReady: undefined })

  useImperativeHandle(ref, () => ({
    get element() { return ctl.current?.element ?? null },
    get canvas() { return ctl.current?.canvas ?? null },
    get renderer() { return ctl.current?.renderer ?? 'none' },
    drop: (...a: unknown[]) => (ctl.current?.drop as (...x: unknown[]) => void)?.(...a),
    pause: () => ctl.current?.pause(),
    resume: () => ctl.current?.resume(),
    clear: () => ctl.current?.clear(),
    setPreset: (n) => ctl.current?.setPreset(n),
    update: (o) => ctl.current?.update(o),
    destroy: () => ctl.current?.destroy(),
  }) as RippleController, [])

  useEffect(() => {
    if (!host.current) return
    ctl.current = ripple(host.current, options as RippleOptions)
    return () => { ctl.current?.destroy(); ctl.current = null }
    // Created once per mount; later prop changes go through update() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { ctl.current?.update(options as RippleOptions) }, [optionsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return createElement(as, { ...domProps, ref: host })
})

/** Hook flavor: const ref = useRipple('storm'); <section ref={ref}>...</section> */
export function useRipple<T extends HTMLElement = HTMLElement>(options?: RippleOptions | RippleOptions['preset']) {
  const ref = useRef<T | null>(null)
  const ctl = useRef<RippleController | null>(null)
  useEffect(() => {
    if (!ref.current) return
    ctl.current = ripple(ref.current, options)
    return () => { ctl.current?.destroy(); ctl.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return Object.assign(ref, { controller: ctl })
}
