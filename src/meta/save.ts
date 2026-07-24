import type { UpgradeLevels } from '../game/upgrades'
import type { MissionState } from './missions'

const KEY = 'pixel-collector:v1'

export interface Settings {
  muted: boolean
  music: boolean
  reducedFx: boolean
  screenShake: boolean
}

export interface Entitlements {
  /** Bought "remove ads". Cosmetic + convenience only, never gameplay power. */
  noAds: boolean
  /** Seasonal Collector's Pass. */
  pass: boolean
}

export interface Profile {
  version: number
  bits: number
  upgrades: UpgradeLevels
  specimens: number[]
  skin: string
  ownedSkins: string[]

  totalRuns: number
  dailyRuns: number
  bestScore: number
  bestWave: number
  bestChain: number
  lifetimeCollected: number
  lifetimeScore: number

  streak: number
  lastPlayDay: string
  dailyDay: string
  dailyPlayed: boolean
  dailyBest: number

  missions: MissionState[]
  missionDay: string

  settings: Settings
  entitlements: Entitlements
  runsSinceAd: number
  seenIntro: boolean
}

export const todayKey = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const emptyProfile = (): Profile => ({
  version: 1,
  bits: 0,
  upgrades: {},
  specimens: [],
  skin: 'default',
  ownedSkins: ['default'],
  totalRuns: 0,
  dailyRuns: 0,
  bestScore: 0,
  bestWave: 0,
  bestChain: 0,
  lifetimeCollected: 0,
  lifetimeScore: 0,
  streak: 0,
  lastPlayDay: '',
  dailyDay: '',
  dailyPlayed: false,
  dailyBest: 0,
  missions: [],
  missionDay: '',
  settings: { muted: false, music: true, reducedFx: false, screenShake: true },
  entitlements: { noAds: false, pass: false },
  runsSinceAd: 0,
  seenIntro: false,
})

export const loadProfile = (): Profile => {
  const base = emptyProfile()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Profile>
    // Shallow-merge with defaults so adding a field in a later version never
    // breaks an existing save.
    return {
      ...base,
      ...parsed,
      upgrades: { ...base.upgrades, ...(parsed.upgrades ?? {}) },
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      entitlements: { ...base.entitlements, ...(parsed.entitlements ?? {}) },
      specimens: Array.isArray(parsed.specimens) ? parsed.specimens : [],
      ownedSkins: Array.isArray(parsed.ownedSkins) ? parsed.ownedSkins : ['default'],
      missions: Array.isArray(parsed.missions) ? parsed.missions : [],
    }
  } catch {
    // Corrupted save (quota, private mode, manual edit): start clean rather than crash.
    return base
  }
}

let writeTimer: number | null = null

export const saveProfile = (p: Profile): void => {
  // Debounced: a run can touch the profile dozens of times per second.
  if (writeTimer !== null) clearTimeout(writeTimer)
  writeTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(p))
    } catch {
      /* storage full or blocked — the game must keep running regardless */
    }
    writeTimer = null
  }, 250)
}

export const saveProfileNow = (p: Profile): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

/** Updates the daily streak. Returns true if this is the first play of a new day. */
export const touchStreak = (p: Profile): boolean => {
  const today = todayKey()
  if (p.lastPlayDay === today) return false
  const yesterday = todayKey(new Date(Date.now() - 86_400_000))
  p.streak = p.lastPlayDay === yesterday ? p.streak + 1 : 1
  p.lastPlayDay = today
  return true
}

/** Bits multiplier from the current streak, capped so it stays a nudge, not a wall. */
export const streakMultiplier = (p: Profile): number => Math.min(1 + p.streak * 0.05, 1.5)
