import type { Condition } from './specimens'

/** Everything a single run produces. Feeds specimens, missions and the profile. */
export interface RunStats {
  score: number
  wave: number
  collected: number
  bestChain: number
  bestMult: number
  bestBank: number
  banks: number
  overclocks: number
  closeCalls: number
  /** Highest wave reached with zero damage taken so far. */
  noHitWave: number
  hueCounts: number[]
  durationSec: number
  daily: boolean
}

export const emptyRunStats = (daily = false): RunStats => ({
  score: 0,
  wave: 1,
  collected: 0,
  bestChain: 0,
  bestMult: 1,
  bestBank: 0,
  banks: 0,
  overclocks: 0,
  closeCalls: 0,
  noHitWave: 0,
  hueCounts: [0, 0, 0, 0, 0],
  durationSec: 0,
  daily,
})

/** Profile-level counters a condition may look at. */
export interface LifetimeStats {
  lifetimeCollected: number
  totalRuns: number
  streak: number
  dailyRuns: number
}

export const conditionProgress = (
  c: Condition,
  run: RunStats,
  life: LifetimeStats,
): { current: number; target: number } => {
  switch (c.kind) {
    case 'chain': return { current: run.bestChain, target: c.v }
    case 'bankOne': return { current: run.bestBank, target: c.v }
    case 'wave': return { current: run.wave, target: c.v }
    case 'score': return { current: run.score, target: c.v }
    case 'mult': return { current: run.bestMult, target: c.v }
    case 'runCollected': return { current: run.collected, target: c.v }
    case 'overclocks': return { current: run.overclocks, target: c.v }
    case 'noHitWave': return { current: run.noHitWave, target: c.v }
    case 'hueRun': return { current: run.hueCounts[c.hue] ?? 0, target: c.v }
    case 'closeCall': return { current: run.closeCalls, target: c.v }
    case 'banks': return { current: run.banks, target: c.v }
    case 'lifetimeCollected': return { current: life.lifetimeCollected, target: c.v }
    case 'runs': return { current: life.totalRuns, target: c.v }
    case 'streak': return { current: life.streak, target: c.v }
    case 'dailyRuns': return { current: life.dailyRuns, target: c.v }
  }
}

export const conditionMet = (c: Condition, run: RunStats, life: LifetimeStats): boolean => {
  const { current, target } = conditionProgress(c, run, life)
  return current >= target
}
