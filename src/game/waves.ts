import type { Rng } from '../core/rng'

export type ModifierId =
  | 'none'
  | 'colourLock'
  | 'pixelRain'
  | 'blackout'
  | 'hungryVault'
  | 'fragile'
  | 'swarm'
  | 'drought'

export interface Modifier {
  readonly id: ModifierId
  readonly name: string
  readonly desc: string
  readonly color: string
}

export const MODIFIERS: readonly Modifier[] = [
  { id: 'colourLock', name: 'VERROU CHROMATIQUE', desc: 'Une seule couleur rapporte. Les autres coûtent la chaîne.', color: '#ff5c9d' },
  { id: 'pixelRain', name: 'PLUIE DE PIXELS', desc: 'Spawn massif. Les grosses chaînes sont possibles.', color: '#4df9d6' },
  { id: 'blackout', name: 'COUPURE', desc: 'Ta vision se réduit à ton halo.', color: '#a684ff' },
  { id: 'hungryVault', name: 'VAULT FUYANT', desc: 'Le vault s\'éloigne quand tu approches.', color: '#ffc247' },
  { id: 'fragile', name: 'FRAGILE', desc: 'Dégâts doublés. Valeur des pixels doublée.', color: '#ff2e55' },
  { id: 'swarm', name: 'ESSAIM', desc: 'Traqueurs supplémentaires, plus lents.', color: '#ff3b6b' },
  { id: 'drought', name: 'DISETTE', desc: 'Peu de pixels, mais chacun vaut le triple.', color: '#c4ff4d' },
]

export interface WaveSpec {
  readonly index: number
  /** Simultaneous pixels on screen. */
  readonly pixelTarget: number
  readonly hunters: number
  readonly hunterSpeed: number
  /** Fraction of the arena the corruption is allowed to eat. */
  readonly corruptionTarget: number
  readonly modifier: ModifierId
  readonly lockedHue: number
}

export const WAVE_DURATION = 20

/**
 * Difficulty curve. Tuned so that:
 *  - waves 1-2 are a safe, wordless tutorial
 *  - the first modifier lands at wave 3, once the core loop is understood
 *  - a good player dies around wave 9-12, i.e. a 3-4 minute run
 */
export const buildWave = (index: number, rng: Rng): WaveSpec => {
  const i = Math.max(1, index)
  const pixelTarget = Math.min(9 + Math.floor(i * 1.6), 30)
  const hunters = i < 2 ? 0 : Math.min(1 + Math.floor((i - 2) / 1.7), 9)
  const hunterSpeed = 78 + i * 9.5
  // Wave 1 is corruption-free: the first 20 seconds must be a safe, wordless tutorial.
  const corruptionTarget = i < 2 ? 0 : Math.min((i - 1) * 0.035, 0.44)

  let modifier: ModifierId = 'none'
  let lockedHue = 0
  // From wave 3, two waves out of three carry a modifier: enough to keep runs
  // distinct, sparse enough that a clean wave still feels like a breather.
  if (i >= 3 && rng.chance(0.66)) {
    const m = rng.pick(MODIFIERS)
    modifier = m.id
    if (m.id === 'colourLock') lockedHue = rng.int(0, 5)
  }

  return { index: i, pixelTarget, hunters, hunterSpeed, corruptionTarget, modifier, lockedHue }
}

export const modifierById = (id: ModifierId): Modifier | null =>
  MODIFIERS.find((m) => m.id === id) ?? null
