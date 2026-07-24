import { Rng, hashSeed } from '../core/rng'
import type { RunStats } from '../game/stats'

export type MissionKind =
  | 'score'
  | 'collect'
  | 'wave'
  | 'chain'
  | 'banks'
  | 'bigBank'
  | 'overclocks'
  | 'runs'

export interface MissionState {
  kind: MissionKind
  target: number
  progress: number
  reward: number
  claimed: boolean
}

interface MissionTemplate {
  kind: MissionKind
  label: (t: number) => string
  /** Tiers, easy -> hard. */
  targets: readonly number[]
  reward: readonly number[]
  /** Progress contributed by one run. `cumulative` missions add up across runs. */
  value: (r: RunStats) => number
  cumulative: boolean
}

const TEMPLATES: readonly MissionTemplate[] = [
  {
    kind: 'score', label: (t) => `Cumuler ${t.toLocaleString('fr-FR')} points`,
    targets: [8000, 20000, 45000], reward: [150, 320, 700],
    value: (r) => r.score, cumulative: true,
  },
  {
    kind: 'collect', label: (t) => `Récolter ${t} pixels`,
    targets: [180, 400, 800], reward: [140, 300, 640],
    value: (r) => r.collected, cumulative: true,
  },
  {
    kind: 'wave', label: (t) => `Atteindre la vague ${t}`,
    targets: [5, 8, 11], reward: [160, 360, 780],
    value: (r) => r.wave, cumulative: false,
  },
  {
    kind: 'chain', label: (t) => `Atteindre une chaîne de ${t}`,
    targets: [12, 20, 30], reward: [170, 350, 760],
    value: (r) => r.bestChain, cumulative: false,
  },
  {
    kind: 'banks', label: (t) => `Banquer ${t} fois`,
    targets: [25, 50, 90], reward: [140, 300, 620],
    value: (r) => r.banks, cumulative: true,
  },
  {
    kind: 'bigBank', label: (t) => `Banquer ${t.toLocaleString('fr-FR')} en une fois`,
    targets: [2500, 6000, 12000], reward: [180, 400, 850],
    value: (r) => r.bestBank, cumulative: false,
  },
  {
    kind: 'overclocks', label: (t) => `Déclencher ${t} overclocks`,
    targets: [8, 18, 32], reward: [130, 280, 600],
    value: (r) => r.overclocks, cumulative: true,
  },
  {
    kind: 'runs', label: (t) => `Terminer ${t} runs`,
    targets: [3, 6, 12], reward: [120, 260, 560],
    value: () => 1, cumulative: true,
  },
]

const templateOf = (kind: MissionKind) => TEMPLATES.find((t) => t.kind === kind)!

export const missionLabel = (m: MissionState): string => templateOf(m.kind).label(m.target)

/** Three missions per day, deterministic from the date so they can be shared/compared. */
export const rollMissions = (dayKey: string): MissionState[] => {
  const rng = new Rng(hashSeed(`missions:${dayKey}`))
  const pool = [...TEMPLATES]
  const out: MissionState[] = []
  for (let i = 0; i < 3 && pool.length; i++) {
    const t = pool.splice(rng.int(0, pool.length), 1)[0]
    const tier = i // one easy, one medium, one hard
    out.push({ kind: t.kind, target: t.targets[tier], progress: 0, reward: t.reward[tier], claimed: false })
  }
  return out
}

/** Applies a finished run to the mission set. Returns newly-completed missions. */
export const applyRunToMissions = (missions: MissionState[], run: RunStats): MissionState[] => {
  const completed: MissionState[] = []
  for (const m of missions) {
    if (m.claimed || m.progress >= m.target) continue
    const t = templateOf(m.kind)
    const v = t.value(run)
    const before = m.progress
    m.progress = t.cumulative ? m.progress + v : Math.max(m.progress, v)
    if (before < m.target && m.progress >= m.target) completed.push(m)
  }
  return completed
}
