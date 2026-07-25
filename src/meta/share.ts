import type { RunStats } from '../game/stats'
import { type Challenge, challengeUrl } from './challenge'

/**
 * Sharing. On mobile this opens the native share sheet, which lands straight in
 * WhatsApp — the single most important path for "send it to your mates".
 * Everywhere else it falls back to the clipboard.
 */

export type ShareOutcome = 'shared' | 'copied' | 'failed'

/** A compact, chat-friendly card. Deliberately short: it has to survive a group chat. */
export const resultCard = (
  stats: RunStats,
  name: string,
  url: string,
  dayNumber: number | null,
): string => {
  const bar = (value: number, max: number, width = 10) => {
    const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)))
    return '▰'.repeat(filled) + '▱'.repeat(width - filled)
  }
  const header = dayNumber !== null ? `PIXEL COLLECTOR — Run du jour #${dayNumber}` : 'PIXEL COLLECTOR'
  return [
    header,
    `${name} · ${Math.round(stats.score).toLocaleString('fr-FR')} pts`,
    `Vague ${stats.wave}  ${bar(stats.wave, 14)}`,
    `Chaîne ×${stats.bestChain} · ${stats.collected} pixels`,
    '',
    'Même arène, même graine. À toi :',
    url,
  ].join('\n')
}

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API needs a secure context and a live gesture; fall back to the
    // old execCommand path so http:// and older browsers still work.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export const shareText = async (title: string, text: string): Promise<ShareOutcome> => {
  if (navigator.share) {
    try {
      // `text` carries the URL rather than the `url` field: several share targets
      // drop one or the other, and losing the link defeats the whole feature.
      await navigator.share({ title, text })
      return 'shared'
    } catch (err) {
      // The user closing the sheet is not an error worth reporting.
      if (err instanceof DOMException && err.name === 'AbortError') return 'failed'
    }
  }
  return (await copyToClipboard(text)) ? 'copied' : 'failed'
}

export const shareChallenge = (
  challenge: Challenge,
  stats: RunStats,
  dayNumber: number | null,
): Promise<ShareOutcome> =>
  shareText('PIXEL COLLECTOR', resultCard(stats, challenge.name, challengeUrl(challenge), dayNumber))

/** Day index since launch, so the daily card reads like "#251" rather than a date. */
export const dayNumber = (dayKey: string): number | null => {
  if (!dayKey) return null
  const EPOCH = Date.UTC(2026, 0, 1)
  const [y, m, d] = dayKey.split('-').map(Number)
  if (!y || !m || !d) return null
  return Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / 86_400_000) + 1
}
