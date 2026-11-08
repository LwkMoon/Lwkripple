import { WaveField } from './sim'
import { PRESETS } from './presets'
import type { PresetDef } from './presets'
import { AMP_K, CAUSTIC_GAIN, GAIN, REFRACT_PX, physics } from './lighting'
import type { Physics, RGB } from './lighting'
import { CanvasRenderer } from './renderers/canvas'
import { WebGLRenderer } from './renderers/webgl'
import type { ImageSrc, RenderParams, Renderer } from './renderers/types'
import { backgroundUrl, fitFromCss, loadImage, parseColor, warn } from './dom'
import type { HostKind } from './dom'
import type { FitMode, PointerLike, PresetName, RippleController, RippleOptions } from './types'

const STEP = 1 / 60
const MAX_CELLS = 90000
const MAX_PX = 4.5e6
const IDLE_V = 1.5e-3
const NO_CHILDREN = new Set(['CANVAS', 'VIDEO', 'AUDIO', 'INPUT', 'TEXTAREA', 'SELECT', 'IFRAME', 'BR', 'HR', 'OBJECT', 'EMBED', 'PROGRESS', 'METER'])

const registry = new WeakMap<Element, RippleInstance>()
let fullscreenInstance: RippleInstance | null = null

const rand = (a: number, b: number): number => a + Math.random() * (b - a)

export class RippleInstance implements RippleController {
  private user: RippleOptions
  private hostEl: HTMLElement | null = null
  private fullscreen: boolean
  private wrapper: HTMLElement | null = null
  private canvasEl: HTMLCanvasElement
  private rend!: Renderer
  private sim: WaveField | null = null
  private field = new Float32Array(0)
  private phys: Physics = { substeps: 2, k: 0.2, damping: 0.99 }
  private cssW = 0
  private cssH = 0
  private cellX = 4
  private cellY = 4
  private dirty = true
  private raf = 0
  private last = 0
  private acc = 0
  private idle = 0
  private autoAcc = 0
  private paused = false
  private offscreen = false
  private destroyed = false
  private lastPt: { x: number; y: number; t: number } | null = null
  private ro: ResizeObserver | null = null
  private mo: MutationObserver | null = null
  private io: IntersectionObserver | null = null
  private mq: MediaQueryList | null = null
  private imgToken = 0
  private sourceEl: HTMLElement | null = null
  private sourceHidden = false
  private savedOpacity = ''
  private savedHost: { position: string; isolation: string } | null = null
  private readySent = false
  private regKey: Element | null = null

  // derived options
  private radiusPx = 20
  private clickStrength = 1
  private hoverStrength = 0.35
  private autoRate = 0
  private autoDef: PresetDef['auto'] = PRESETS.pond.auto
  private doHover = true
  private doClick = true
  private params: RenderParams = { gain: GAIN, causticK: 0, refractPx: REFRACT_PX, opacity: 1, color: [0, 0, 0, 0], highlight: [1, 1, 1], shadow: [0, 0.03, 0.08] }

  static create(host: HostKind, options: RippleOptions): RippleInstance {
    if (host === 'fullscreen') fullscreenInstance?.destroy()
    else registry.get(host)?.destroy()
    return new RippleInstance(host, options)
  }

  private constructor(host: HostKind, options: RippleOptions) {
    this.user = { ...options }
    this.fullscreen = host === 'fullscreen'
    this.canvasEl = document.createElement('canvas')
    if (host === 'fullscreen') {
      fullscreenInstance = this
      document.body.appendChild(this.canvasEl)
    } else {
      let el = host as HTMLElement
      if (el instanceof HTMLImageElement) {
        el = this.wrapImage(el)
      } else if (NO_CHILDREN.has(el.tagName)) {
        throw new Error(`lwkripple: <${el.tagName.toLowerCase()}> cannot hold an effect. Wrap it in a container and target that.`)
      }
      this.hostEl = el
      this.regKey = host as Element
      registry.set(host as Element, this)
      this.savedHost = { position: el.style.position, isolation: el.style.isolation }
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
      el.insertBefore(this.canvasEl, el.firstChild)
    }
    this.canvasEl.setAttribute('aria-hidden', 'true')
    this.canvasEl.setAttribute('data-lwkripple-canvas', '')
    this.recompute()
    this.styleCanvas()
    this.makeRenderer()

    // If page code replaces the host's children (textContent, innerHTML, a framework re-render), put the canvas back.
    if (this.hostEl && typeof MutationObserver !== 'undefined') {
      const host = this.hostEl
      this.mo = new MutationObserver(() => {
        if (!this.destroyed && this.canvasEl.parentNode !== host) host.insertBefore(this.canvasEl, host.firstChild)
      })
      this.mo.observe(host, { childList: true })
    }
    this.ro = new ResizeObserver(() => this.rebuild())
    this.ro.observe(this.canvasEl)
    const target: HTMLElement | Window = this.hostEl ?? window
    target.addEventListener('pointermove', this.onMove as EventListener, { passive: true })
    target.addEventListener('pointerdown', this.onDown as EventListener, { passive: true })
    target.addEventListener('pointerleave', this.onLeave as EventListener, { passive: true })
    if (this.hostEl && this.user.pauseOffscreen !== false && typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((es) => {
        this.offscreen = !es[es.length - 1].isIntersecting
        if (this.offscreen) this.stopRaf(); else this.wake()
      })
      this.io.observe(this.hostEl)
    }
    if (typeof matchMedia === 'function') {
      this.mq = matchMedia('(prefers-reduced-motion: reduce)')
      this.mq.addEventListener?.('change', this.onMotion)
    }
    this.rebuild()
    void this.setupImage()
  }

  // ---------- public API ----------
  get element(): HTMLElement | null { return this.hostEl }
  get canvas(): HTMLCanvasElement | null { return this.destroyed ? null : this.canvasEl }
  get renderer(): 'webgl' | 'canvas' | 'none' { return this.destroyed ? 'none' : this.rend.kind }

  drop(a?: PointerLike | number, b?: number, c?: number, d?: number): void {
    if (this.destroyed || !this.sim) return
    let x: number, y: number, strength: number | undefined, radius: number | undefined
    if (typeof a === 'object' && a !== null) {
      const r = this.canvasEl.getBoundingClientRect()
      x = a.clientX - r.left; y = a.clientY - r.top; strength = b; radius = c
    } else if (typeof a === 'number' && typeof b === 'number') {
      x = a; y = b; strength = c; radius = d
    } else {
      x = rand(0.1, 0.9) * this.cssW; y = rand(0.1, 0.9) * this.cssH
    }
    this.addDrop(x, y, (strength ?? 1) * this.clickStrength, radius ?? this.radiusPx)
  }

  pause(): void { this.paused = true; this.stopRaf() }
  resume(): void { this.paused = false; this.wake() }
  clear(): void { this.sim?.clear(); this.dirty = true; this.wake() }
  setPreset(name: PresetName): void { this.update({ preset: name }) }

  update(options: RippleOptions): void {
    if (this.destroyed) return
    const prev = this.user
    this.user = { ...prev, ...options }
    this.recompute()
    const changed = (k: keyof RippleOptions): boolean => k in options && options[k] !== prev[k]
    if (changed('renderer')) { this.recreateCanvas(); this.makeRenderer() }
    if (changed('layer') || changed('zIndex')) this.styleCanvas()
    if (changed('edges') || changed('resolution') || changed('pixelRatio') || changed('renderer') || changed('preset') || changed('speed') || changed('lifetime')) this.rebuild(changed('edges') || changed('resolution') || changed('pixelRatio') || changed('renderer'))
    if (changed('image') || changed('fit') || changed('renderer')) void this.setupImage()
    this.dirty = true
    this.wake()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.stopRaf()
    this.mo?.disconnect()
    this.ro?.disconnect()
    this.io?.disconnect()
    this.mq?.removeEventListener?.('change', this.onMotion)
    const target: HTMLElement | Window = this.hostEl ?? window
    target.removeEventListener('pointermove', this.onMove as EventListener)
    target.removeEventListener('pointerdown', this.onDown as EventListener)
    target.removeEventListener('pointerleave', this.onLeave as EventListener)
    this.releaseSource()
    this.rend.destroy()
    this.canvasEl.remove()
    if (this.hostEl && this.savedHost) {
      this.hostEl.style.position = this.savedHost.position
      this.hostEl.style.isolation = this.savedHost.isolation
    }
    if (this.wrapper && this.wrapper.parentNode) {
      const img = this.sourceEl ?? this.wrapper.querySelector('img')
      if (img) this.wrapper.parentNode.insertBefore(img, this.wrapper)
      this.wrapper.remove()
    }
    if (this.regKey) registry.delete(this.regKey)
    if (fullscreenInstance === this) fullscreenInstance = null
  }

  // ---------- setup ----------
  private wrapImage(img: HTMLImageElement): HTMLElement {
    const cs = getComputedStyle(img)
    const wrap = document.createElement('span')
    wrap.setAttribute('data-lwkripple-wrap', '')
    wrap.style.cssText = `position:relative;display:${cs.display === 'inline' ? 'inline-block' : cs.display};line-height:0;max-width:100%;`
    img.parentNode?.insertBefore(wrap, img)
    wrap.appendChild(img)
    this.wrapper = wrap
    this.sourceEl = img
    if (this.user.image === undefined) this.user.image = img
    if (this.user.fit === undefined) this.user.fit = fitFromCss(cs.objectFit)
    return wrap
  }

  private effectiveLayer(): 'under' | 'over' {
    if (this.user.layer) return this.user.layer
    if (this.fullscreen) return 'over'
    // The source image sits in the content flow, so if it is still visible the water has to go on top.
    if (this.sourceEl && !this.sourceHidden) return 'over'
    return 'under'
  }

  private styleCanvas(): void {
    const layer = this.effectiveLayer()
    const s = this.canvasEl.style
    s.cssText = this.fullscreen
      ? 'position:fixed;left:0;top:0;right:0;bottom:0;width:100%;height:100%;pointer-events:none;display:block;'
      : 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:block;border-radius:inherit;'
    s.zIndex = String(layer === 'under' ? -1 : (this.user.zIndex ?? (this.fullscreen ? 9999 : 1)))
    if (this.hostEl && this.savedHost) this.hostEl.style.isolation = layer === 'under' ? 'isolate' : this.savedHost.isolation
  }

  private recreateCanvas(): void {
    const old = this.canvasEl
    const fresh = document.createElement('canvas')
    for (const a of Array.from(old.attributes)) fresh.setAttribute(a.name, a.value)
    old.replaceWith(fresh)
    this.ro?.unobserve(old)
    this.canvasEl = fresh
    this.ro?.observe(fresh)
    this.styleCanvas()
  }

  private makeRenderer(): void {
    this.rend?.destroy()
    const want = this.user.renderer ?? 'auto'
    if (want !== 'canvas') {
      try {
        const r = new WebGLRenderer(this.canvasEl)
        r.onRestore = () => { this.dirty = true; this.wake() }
        this.rend = r
        return
      } catch (e) {
        if (want === 'webgl') warn(String((e as Error).message))
        this.recreateCanvas() // a canvas that tried WebGL cannot give out a 2D context
      }
    }
    this.rend = new CanvasRenderer(this.canvasEl)
  }

  private reduced(): boolean {
    return (this.user.reducedMotion ?? 'respect') === 'respect' && !!this.mq?.matches
  }

  private onMotion = (): void => { this.recompute(); this.rebuild(); this.wake() }

  private recompute(): void {
    const u = this.user
    const def = PRESETS[u.preset ?? 'pond'] ?? PRESETS.pond
    const reduce = this.reduced()
    const s = u.strength ?? 1
    const isButton = !!this.hostEl && (this.hostEl.tagName === 'BUTTON' || this.hostEl.getAttribute('role') === 'button')
    this.radiusPx = u.radius ?? def.radius
    this.clickStrength = def.strength * s * (reduce ? 0.5 : 1)
    this.hoverStrength = def.hoverStrength * s
    this.autoDef = def.auto
    this.autoRate = reduce || u.auto === false ? 0 : typeof u.auto === 'number' ? u.auto : u.auto === true ? (def.auto.rate || 1) : def.auto.rate
    this.doHover = !reduce && (u.hover ?? !isButton)
    this.doClick = u.click ?? true
    const intensity = (u.intensity ?? 1) * def.intensity
    const caustics = u.caustics === true ? Math.max(def.caustics, 0.5) : u.caustics === false ? 0 : typeof u.caustics === 'number' ? u.caustics : def.caustics
    const parse = (c: string | null | undefined, dflt: RGB): RGB => { const p = c ? parseColor(c) : null; return p ? [p[0], p[1], p[2]] : dflt }
    let color: [number, number, number, number] = [0, 0, 0, 0]
    if (u.color) { const p = parseColor(u.color); if (p) color = [p[0] * p[3], p[1] * p[3], p[2] * p[3], p[3]]; else warn('unknown color: ' + u.color) }
    this.params = {
      gain: GAIN * intensity,
      causticK: CAUSTIC_GAIN * caustics * intensity,
      refractPx: REFRACT_PX * intensity,
      opacity: Math.max(0, Math.min(1, u.opacity ?? 1)),
      color,
      highlight: parse(u.highlight, [1, 1, 1]),
      shadow: parse(u.shadow, [0, 0.03, 0.08]),
    }
    this.lifetime = (u.lifetime ?? def.lifetime) * (reduce ? 0.5 : 1)
    this.speed = (u.speed ?? 1) * def.speed
  }
  private lifetime = 4
  private speed = 1

  private rebuild(force = true): void {
    if (this.destroyed) return
    const w = this.canvasEl.clientWidth
    const h = this.canvasEl.clientHeight
    if (w < 2 || h < 2) { this.cssW = 0; this.cssH = 0; this.sim = null; return }
    if (force || !this.sim || w !== this.cssW || h !== this.cssH) {
      this.cssW = w; this.cssH = h
      const dpr = Math.max(1, Math.min(this.user.pixelRatio ?? (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), 2))
      let pxW = Math.round(w * dpr), pxH = Math.round(h * dpr)
      if (pxW * pxH > MAX_PX) { const k = Math.sqrt(MAX_PX / (pxW * pxH)); pxW = Math.round(pxW * k); pxH = Math.round(pxH * k) }
      let cell = this.user.resolution ?? (Math.min(w, h) < 140 ? 2 : 4)
      cell = Math.max(cell, Math.sqrt((w * h) / MAX_CELLS))
      const gw = Math.max(8, Math.ceil(w / cell))
      const gh = Math.max(8, Math.ceil(h / cell))
      this.cellX = w / gw; this.cellY = h / gh
      this.sim = new WaveField(gw, gh)
      this.sim.setEdges(this.user.edges ?? (Math.min(w, h) < 160 ? 'absorb' : 'reflect'))
      this.field = new Float32Array(gw * gh * 4)
      this.rend.resize(w, h, pxW, pxH, gw, gh)
    }
    this.phys = physics((this.cellX + this.cellY) / 2, this.speed, this.lifetime)
    this.dirty = true
    this.wake()
  }

  private async setupImage(): Promise<void> {
    const token = ++this.imgToken
    this.releaseSource()
    const spec = this.user.image
    const fitOpt = this.user.fit
    if (!spec) { this.rend.setImage(null, 'cover'); this.styleCanvas(); this.dirty = true; this.wake(); this.ready(); return }
    try {
      let src: ImageSrc
      let fit: FitMode = fitOpt ?? 'cover'
      if (spec === 'auto') {
        const el = this.hostEl
        const url = el ? backgroundUrl(el) : null
        if (!url) throw new Error("image: 'auto' needs an element with a CSS background-image url()")
        if (el && !fitOpt) { const bs = getComputedStyle(el).backgroundSize; fit = bs === 'contain' ? 'contain' : bs === '100% 100%' ? 'fill' : 'cover' }
        src = await loadImage(url)
      } else if (typeof spec === 'string') {
        src = await loadImage(spec)
      } else if (typeof HTMLImageElement !== 'undefined' && spec instanceof HTMLImageElement) {
        if (!fitOpt) fit = fitFromCss(getComputedStyle(spec).objectFit)
        if (!spec.complete) await new Promise<void>((res, rej) => { spec.addEventListener('load', () => res(), { once: true }); spec.addEventListener('error', () => rej(new Error('image failed to load')), { once: true }) })
        src = spec.crossOrigin ? spec : await loadImage(spec.currentSrc || spec.src)
        this.sourceEl = this.hostEl && this.hostEl.contains(spec) ? spec : this.sourceEl
      } else {
        src = spec as ImageSrc
      }
      if (token !== this.imgToken || this.destroyed) return
      const ok = this.rend.setImage(src, fit)
      if (!ok) throw new Error('the browser blocked this image for effects (add crossorigin="anonymous" and CORS headers). Falling back to plain water.')
      if (this.sourceEl) { this.savedOpacity = this.sourceEl.style.opacity; this.sourceEl.style.opacity = '0'; this.sourceHidden = true }
    } catch (e) {
      if (token !== this.imgToken) return
      this.rend.setImage(null, 'cover')
      warn(String((e as Error).message))
    }
    this.styleCanvas()
    this.dirty = true
    this.wake()
    this.ready()
  }

  private releaseSource(): void {
    if (this.sourceEl && this.sourceHidden) this.sourceEl.style.opacity = this.savedOpacity
    this.sourceHidden = false
  }

  private ready(): void {
    if (this.readySent) return
    this.readySent = true
    this.user.onReady?.(this)
  }

  // ---------- interaction ----------
  private addDrop(x: number, y: number, strength: number, radiusPx: number): void {
    const sim = this.sim
    if (!sim) return
    const r = Math.min(radiusPx, Math.max(5, 0.45 * Math.min(this.cssW, this.cssH)))
    const rc = r / ((this.cellX + this.cellY) / 2)
    sim.drop(x / this.cellX, y / this.cellY, rc, Math.min(strength, 1.8) * AMP_K * rc)
    this.dirty = true
    this.wake()
  }

  private local(e: PointerEvent): { x: number; y: number; inside: boolean } {
    const r = this.canvasEl.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    return { x, y, inside: x >= 0 && y >= 0 && x <= r.width && y <= r.height }
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.doHover || !this.sim) return
    const p = this.local(e)
    if (!p.inside) { this.lastPt = null; return }
    const prev = this.lastPt
    if (!prev) { this.lastPt = { x: p.x, y: p.y, t: e.timeStamp }; return }
    const dx = p.x - prev.x, dy = p.y - prev.y
    const dist = Math.hypot(dx, dy)
    const spacing = Math.max(8, this.radiusPx * 0.5)
    if (dist < spacing) return
    const speed = dist / Math.max(1, e.timeStamp - prev.t)
    const s = this.hoverStrength * (0.45 + Math.min(speed / 1.2, 1) * 0.9)
    const n = Math.min(6, Math.floor(dist / spacing))
    for (let i = 1; i <= n; i++) this.addDrop(prev.x + (dx * i) / n, prev.y + (dy * i) / n, s, this.radiusPx * 0.55)
    this.lastPt = { x: p.x, y: p.y, t: e.timeStamp }
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.doClick || !this.sim) return
    const p = this.local(e)
    if (!p.inside) return
    this.addDrop(p.x, p.y, this.clickStrength * 1.3, this.radiusPx * 1.2)
    this.lastPt = { x: p.x, y: p.y, t: e.timeStamp }
  }

  private onLeave = (): void => { this.lastPt = null }

  // ---------- loop ----------
  private stopRaf(): void { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0 } }

  private wake(): void {
    if (this.destroyed || this.paused || this.offscreen || this.raf || !this.sim) return
    this.idle = 0
    this.last = 0
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (t: number): void => {
    this.raf = 0
    const sim = this.sim
    if (this.destroyed || !sim) return
    const dt = this.last ? Math.min((t - this.last) / 1000, 0.1) : STEP
    this.last = t
    this.acc += dt
    if (this.autoRate > 0) {
      this.autoAcc += this.autoRate * dt
      while (this.autoAcc >= 1) { this.autoAcc -= 1; this.autoDrop() }
    }
    let steps = 0
    const { substeps, k, damping } = this.phys
    while (this.acc >= STEP && steps < 3) {
      for (let s = 0; s < substeps; s++) sim.step(k, damping)
      this.acc -= STEP
      steps++
      this.dirty = true
    }
    if (steps === 3) this.acc = 0
    if (this.dirty) {
      sim.fillField(this.field)
      this.rend.render(this.field, this.params)
      this.dirty = false
    }
    if (sim.maxVel > IDLE_V || this.autoRate > 0) this.idle = 0
    else if (++this.idle > 30) return
    this.raf = requestAnimationFrame(this.frame)
  }

  private autoDrop(): void {
    const d = this.autoDef
    const radius = rand(d.radius[0], d.radius[1]) * (this.radiusPx / (PRESETS[this.user.preset ?? 'pond'] ?? PRESETS.pond).radius)
    const strength = rand(d.strength[0], d.strength[1])
    let x = rand(0.05, 0.95) * this.cssW
    let y = rand(0.05, 0.95) * this.cssH
    if (d.edge) {
      const side = (Math.random() * 4) | 0
      if (side === 0) y = 0; else if (side === 1) y = this.cssH; else if (side === 2) x = 0; else x = this.cssW
    }
    this.addDrop(x, y, strength * (this.clickStrength / Math.max(0.01, PRESETS[this.user.preset ?? 'pond'].strength)), radius)
  }
}

export class RippleGroup implements RippleController {
  constructor(private items: RippleInstance[]) {}
  get element(): HTMLElement | null { return this.items[0]?.element ?? null }
  get canvas(): HTMLCanvasElement | null { return this.items[0]?.canvas ?? null }
  get renderer(): 'webgl' | 'canvas' | 'none' { return this.items[0]?.renderer ?? 'none' }
  drop(a?: PointerLike | number, b?: number, c?: number, d?: number): void { for (const i of this.items) (i.drop as (...x: unknown[]) => void)(a, b, c, d) }
  pause(): void { this.items.forEach((i) => i.pause()) }
  resume(): void { this.items.forEach((i) => i.resume()) }
  clear(): void { this.items.forEach((i) => i.clear()) }
  setPreset(name: PresetName): void { this.items.forEach((i) => i.setPreset(name)) }
  update(o: RippleOptions): void { this.items.forEach((i) => i.update(o)) }
  destroy(): void { this.items.forEach((i) => i.destroy()) }
}
