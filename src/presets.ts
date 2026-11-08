import type { PresetName } from './types'

export interface PresetDef {
  radius: number
  strength: number
  hoverStrength: number
  lifetime: number
  speed: number
  intensity: number
  caustics: number
  auto: { rate: number; radius: [number, number]; strength: [number, number]; edge?: boolean }
}

export const PRESETS: Record<PresetName, PresetDef> = {
  pond:  { radius: 20, strength: 1,   hoverStrength: 0.35, lifetime: 4,   speed: 1,   intensity: 1,   caustics: 0.2,  auto: { rate: 0,   radius: [10, 20],  strength: [0.6, 1] } },
  rain:  { radius: 16, strength: 0.9, hoverStrength: 0.3,  lifetime: 2.5, speed: 1,   intensity: 1.1, caustics: 0.1,  auto: { rate: 8,   radius: [7, 13],   strength: [0.55, 1] } },
  storm: { radius: 22, strength: 1.2, hoverStrength: 0.4,  lifetime: 2.8, speed: 1.1, intensity: 1.2, caustics: 0.4,  auto: { rate: 12,  radius: [10, 26],  strength: [0.5, 0.9] } },
  glass: { radius: 14, strength: 0.6, hoverStrength: 0.22, lifetime: 1.8, speed: 1,   intensity: 0.7, caustics: 0,    auto: { rate: 0,   radius: [8, 14],   strength: [0.4, 0.7] } },
  ocean: { radius: 40, strength: 1,   hoverStrength: 0.3,  lifetime: 5.5, speed: 0.8, intensity: 0.75, caustics: 0.6,  auto: { rate: 0.7, radius: [60, 110], strength: [0.4, 0.75], edge: true } },
}

export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[]
