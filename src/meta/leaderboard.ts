import type { RunStats } from '../game/stats'

/**
 * Leaderboards.
 *
 * Same approach as the monetisation layer: the game talks to an interface, so a
 * real backend can be plugged in later without touching gameplay. Today only
 * `LocalLeaderboard` exists — it stores the Daily Run results of this device and
 * of every friend whose challenge link has been opened.
 *
 * That is deliberately *not* a fake online ranking: it never shows a score the
 * player's own device has not actually seen.
 *
 * To go online, implement this interface against any tiny backend (Supabase,
 * Cloudflare Workers + D1, a 40-line Express app) and swap it in `app.ts`.
 * Two things matter more than the choice of host:
 *   1. The seed is public, so a client can claim any score. Either accept it
 *      (fine among friends) or have the server replay the run from its inputs.
 *   2. Names are user content shown to other users: sanitise on the way in.
 */

export interface LeaderboardEntry {
  name: string
  score: number
  wave: number
  chain: number
  /** True for the local player, so the UI can highlight the row. */
  you: boolean
}

export interface LeaderboardProvider {
  readonly name: string
  readonly online: boolean
  /** Submit a finished run. Returns the board it belongs to. */
  submit(dayKey: string, stats: RunStats, playerName: string): Promise<LeaderboardEntry[]>
  fetch(dayKey: string): Promise<LeaderboardEntry[]>
}

interface StoredBoard {
  [dayKey: string]: LeaderboardEntry[]
}

const KEY = 'pixel-collector:boards'

const read = (): StoredBoard => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as StoredBoard
  } catch {
    return {}
  }
}

const write = (b: StoredBoard): void => {
  try {
    // Keep only the last two weeks: a leaderboard nobody will scroll to is just
    // storage pressure.
    const days = Object.keys(b).sort().slice(-14)
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(days.map((d) => [d, b[d]]))))
  } catch {
    /* storage full or blocked — never break the run */
  }
}

export class LocalLeaderboard implements LeaderboardProvider {
  readonly name = 'local'
  readonly online = false

  async submit(dayKey: string, stats: RunStats, playerName: string): Promise<LeaderboardEntry[]> {
    this.record(dayKey, { name: playerName, score: stats.score, wave: stats.wave, chain: stats.bestChain, you: true })
    return this.fetch(dayKey)
  }

  /** Adds a friend's result, learned from a challenge link. */
  record(dayKey: string, entry: LeaderboardEntry): void {
    const boards = read()
    const board = boards[dayKey] ?? []
    const existing = board.find((e) => e.name === entry.name && e.you === entry.you)
    if (existing) {
      if (entry.score <= existing.score) return
      Object.assign(existing, entry)
    } else {
      board.push(entry)
    }
    board.sort((a, b) => b.score - a.score)
    boards[dayKey] = board.slice(0, 50)
    write(boards)
  }

  async fetch(dayKey: string): Promise<LeaderboardEntry[]> {
    return read()[dayKey] ?? []
  }
}
