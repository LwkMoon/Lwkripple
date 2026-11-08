/** Shared look. The GLSL in renderers/webgl.ts mirrors shade() exactly. */
export type RGB = [number, number, number]

export const LIGHT_X = 0.591
export const LIGHT_Y = 0.806
export const GAIN = 14
export const CAUSTIC_GAIN = 40
export const REFRACT_PX = 90
/** Drop amplitude per cell of radius. Keeps peak slope about 0.22 * strength at any size. */
export const AMP_K = 0.2

/**
 * Turn the water surface into light. Writes premultiplied RGBA into out.
 * gain already includes intensity; causticK already includes caustic amount.
 */
export function shade(
  sx: number, sy: number, lap: number,
  gain: number, causticK: number,
  hi: RGB, sh: RGB, out: Float32Array | number[],
): void {
  const l = (sx * LIGHT_X + sy * LIGHT_Y) * gain
  const lit = l < 0 ? 0 : l > 1 ? 1 : l
  const dk = -l < 0 ? 0 : -l > 1 ? 1 : -l
  const aHi = 0.3 * lit + 0.55 * lit * lit * lit
  const aDk = 0.42 * dk
  let c = -lap * causticK
  c = c < 0 ? 0 : c > 1 ? 1 : c
  const ca = Math.pow(c, 1.5) * 0.5
  let a = aHi + ca + aDk
  if (a > 1) a = 1
  const hiA = aHi + ca
  out[0] = Math.min(hi[0] * hiA + sh[0] * aDk, a)
  out[1] = Math.min(hi[1] * hiA + sh[1] * aDk, a)
  out[2] = Math.min(hi[2] * hiA + sh[2] * aDk, a)
  out[3] = a
}

export interface Physics { substeps: number; k: number; damping: number }

/**
 * Convert friendly units (px/s, seconds) into stable simulation constants.
 * Wave speed in px/s stays the same no matter how coarse the grid is.
 */
export function physics(cellPx: number, speed: number, lifetime: number): Physics {
  const cellsPerFrame = (300 * speed) / (60 * cellPx)
  const substeps = Math.max(1, Math.min(8, Math.ceil(cellsPerFrame / 0.6)))
  const c = cellsPerFrame / substeps
  const k = Math.min(c * c, 0.49)
  const damping = Math.exp(Math.log(0.05) / (Math.max(0.2, lifetime) * 60 * substeps))
  return { substeps, k, damping }
}
