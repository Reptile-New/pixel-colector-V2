export interface PixelHue {
  readonly id: number
  readonly name: string
  readonly core: string
  readonly glow: string
  /** Base frequency of the collect blip; the chain transposes upward from here. */
  readonly note: number
}

/** The five collectable hues. Deliberately distinguishable for colour-blind players
 *  by *brightness and position on the wheel*, not hue alone. */
export const HUES: readonly PixelHue[] = [
  { id: 0, name: 'CYAN', core: '#4df9d6', glow: '#0ff0c0', note: 523.25 },
  { id: 1, name: 'ROSE', core: '#ff5c9d', glow: '#ff2e86', note: 587.33 },
  { id: 2, name: 'AMBRE', core: '#ffc247', glow: '#ffa60a', note: 659.25 },
  { id: 3, name: 'VIOLET', core: '#a684ff', glow: '#7d4dff', note: 698.46 },
  { id: 4, name: 'LIME', core: '#c4ff4d', glow: '#9ae60a', note: 783.99 },
]

export const COLORS = {
  bg: '#07070c',
  bgDeep: '#04040a',
  grid: '#141423',
  gridHot: '#1e1e36',
  player: '#f4f7ff',
  playerGlow: '#7ff0ff',
  vault: '#ffe8a3',
  vaultGlow: '#ffb020',
  corrupt: '#ff2e55',
  corruptDeep: '#5c0a1c',
  hunter: '#ff3b6b',
  text: '#e8ecff',
  dim: '#6b7192',
} as const

/** Cosmetic-only skins. Monetisation touches this file and nothing else. */
export interface Skin {
  readonly id: string
  readonly name: string
  readonly core: string
  readonly glow: string
  readonly trail: string
  /** How it is obtained. Never sold as a gameplay advantage. */
  readonly unlock: { kind: 'default' } | { kind: 'bits'; cost: number } | { kind: 'album'; count: number } | { kind: 'premium' }
}

export const SKINS: readonly Skin[] = [
  { id: 'default', name: 'STANDARD', core: '#f4f7ff', glow: '#7ff0ff', trail: '#7ff0ff', unlock: { kind: 'default' } },
  { id: 'ember', name: 'BRAISE', core: '#fff0d6', glow: '#ff8a2b', trail: '#ff5a1f', unlock: { kind: 'bits', cost: 900 } },
  { id: 'toxic', name: 'TOXIQUE', core: '#eaffd0', glow: '#9ae60a', trail: '#5ecb00', unlock: { kind: 'bits', cost: 2200 } },
  { id: 'void', name: 'VOID', core: '#d9c4ff', glow: '#7d4dff', trail: '#4a1fb8', unlock: { kind: 'album', count: 12 } },
  { id: 'ghost', name: 'SPECTRE', core: '#ffffff', glow: '#ffffff', trail: '#8892b8', unlock: { kind: 'album', count: 28 } },
  { id: 'gold', name: 'COLLECTOR', core: '#fff3c4', glow: '#ffc22b', trail: '#ff9500', unlock: { kind: 'premium' } },
]

export const skinById = (id: string): Skin => SKINS.find((s) => s.id === id) ?? SKINS[0]

/** '#rrggbb' + alpha -> 'rgba(...)'. Cheaper than building strings ad-hoc everywhere. */
export const rgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
