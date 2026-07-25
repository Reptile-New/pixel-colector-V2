/**
 * Serverless friend duels.
 *
 * A run is fully determined by its seed, so a challenge does not need a backend
 * at all: the seed, the score and the sender's name are encoded into the URL
 * fragment. Whoever opens the link plays the *exact same arena* — same spawns,
 * same waves, same modifiers — and finds out immediately whether they beat it.
 *
 * No account, no server, no personal data leaving the device. The rivalry record
 * lives in each player's own save.
 */

export interface Challenge {
  /** Sender's display name, trimmed to something a chat bubble can hold. */
  name: string
  seed: number
  score: number
  wave: number
  chain: number
  /** Set when the challenge came from a Daily Run, so we can say which day. */
  day: string
}

const VERSION = '1'

const toB64Url = (s: string): string => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

const fromB64Url = (s: string): string => {
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/')
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Names go into a URL and into other people's UI: keep them short and inert. */
export const sanitizeName = (raw: string): string =>
  raw
    .replace(/[|<>&"'\\]/g, '')
    .trim()
    .slice(0, 14) || 'ANONYME'

export const encodeChallenge = (c: Challenge): string =>
  toB64Url(
    [
      VERSION,
      sanitizeName(c.name),
      c.seed.toString(36),
      Math.max(0, Math.round(c.score)).toString(36),
      c.wave.toString(36),
      c.chain.toString(36),
      c.day,
    ].join('|'),
  )

export const decodeChallenge = (token: string): Challenge | null => {
  try {
    const parts = fromB64Url(token).split('|')
    if (parts[0] !== VERSION || parts.length < 6) return null
    const seed = Number.parseInt(parts[2], 36)
    const score = Number.parseInt(parts[3], 36)
    const wave = Number.parseInt(parts[4], 36)
    const chain = Number.parseInt(parts[5], 36)
    if (!Number.isFinite(seed) || !Number.isFinite(score)) return null
    return {
      name: sanitizeName(parts[1]),
      seed: seed >>> 0,
      score: Math.max(0, score),
      wave: Math.max(1, wave || 1),
      chain: Math.max(0, chain || 0),
      day: parts[6] ?? '',
    }
  } catch {
    // A hand-mangled link must land on the menu, never on a crash.
    return null
  }
}

export const challengeUrl = (c: Challenge): string => {
  const base = `${location.origin}${location.pathname}`
  return `${base}#d=${encodeChallenge(c)}`
}

/** Reads a challenge out of the current URL and clears it from the address bar. */
export const readChallengeFromUrl = (): Challenge | null => {
  const m = /[#&]d=([A-Za-z0-9_-]+)/.exec(location.hash)
  if (!m) return null
  const c = decodeChallenge(m[1])
  // Strip the fragment so a refresh (or an install to the home screen) doesn't
  // replay the same challenge forever.
  history.replaceState(null, '', location.pathname + location.search)
  return c
}

// ───────────────────────── rivalry record ─────────────────────────

export interface Rival {
  name: string
  wins: number // times you beat them
  losses: number // times they beat you
  theirBest: number
  yourBest: number
  lastSeen: string
}

export const recordDuel = (
  rivals: Rival[],
  name: string,
  yourScore: number,
  theirScore: number,
  day: string,
): Rival => {
  let r = rivals.find((x) => x.name === name)
  if (!r) {
    r = { name, wins: 0, losses: 0, theirBest: 0, yourBest: 0, lastSeen: day }
    rivals.push(r)
  }
  if (yourScore > theirScore) r.wins += 1
  else if (theirScore > yourScore) r.losses += 1
  r.theirBest = Math.max(r.theirBest, theirScore)
  r.yourBest = Math.max(r.yourBest, yourScore)
  r.lastSeen = day
  return r
}
