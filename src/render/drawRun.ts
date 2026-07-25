import { TAU, clamp } from '../core/math'
import { CELL, type Run } from '../game/run'
import { modifierById } from '../game/waves'
import { COLORS, HUES, type Skin, rgba } from './palette'
import type { Renderer } from './renderer'

const MONO = 'ui-monospace, "DM Mono", "SF Mono", Menlo, monospace'
const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')

/**
 * Screen-space rectangles of every HUD element, so the tutorial can point at the
 * exact thing it is talking about. Kept next to the drawing code that owns those
 * coordinates — anywhere else and the two would drift apart.
 */
export const hudZones = (r: Renderer): Record<string, { x: number; y: number; w: number; h: number }> => {
  const PAD = 16
  const column = r.w * 0.46 - PAD
  const meter = Math.min(320, r.w - 60)
  const T = r.safeTop
  const B = r.safeBottom
  return {
    score: { x: PAD - 6, y: T + 20, w: column + 12, h: 50 },
    buffer: { x: r.w - PAD - column - 6, y: T + 18, w: column + 12, h: 50 },
    mult: { x: r.w - PAD - 118, y: T + 48, w: 124, h: 26 },
    shards: { x: PAD - 6, y: T + 70, w: 92, h: 28 },
    wave: { x: r.w - PAD - column - 6, y: T + 74, w: column + 12, h: 34 },
    overclock: { x: (r.w - meter) / 2 - 10, y: r.h - B - 66, w: meter + 20, h: 32 },
  }
}

export type Highlight =
  | { kind: 'world'; x: number; y: number; radius: number }
  | { kind: 'hud'; zone: string }
  | null

export const drawRun = (
  ctx: CanvasRenderingContext2D,
  run: Run,
  r: Renderer,
  skin: Skin,
  t: number,
  highlight: Highlight = null,
): void => {
  drawArena(ctx, run, t)
  drawCorruption(ctx, run, t)
  drawVaultLink(ctx, run)
  drawVault(ctx, run, t)
  drawPixels(ctx, run, t)
  drawHunters(ctx, run, t)
  drawPlayer(ctx, run, skin, t)
  run.particles.draw(ctx)
  if (run.wave.modifier === 'blackout') drawBlackout(ctx, run, r)
  drawHud(ctx, run, r, t)
  if (highlight) drawHighlight(ctx, r, highlight, t)
}

/** Pulsing marker used by the tutorial. Drawn last so nothing hides it. */
const drawHighlight = (ctx: CanvasRenderingContext2D, r: Renderer, h: Highlight, t: number): void => {
  if (!h) return
  const pulse = 0.5 + 0.5 * Math.sin(t * 4.5)
  ctx.save()
  ctx.strokeStyle = rgba(HUES[0].core, 0.55 + pulse * 0.45)
  ctx.lineWidth = 2.5
  ctx.setLineDash([7, 6])
  ctx.lineDashOffset = -t * 40

  if (h.kind === 'world') {
    const radius = h.radius + pulse * 7
    ctx.beginPath()
    ctx.arc(h.x, h.y, radius, 0, TAU)
    ctx.stroke()
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createRadialGradient(h.x, h.y, radius * 0.7, h.x, h.y, radius * 1.5)
    g.addColorStop(0, rgba(HUES[0].glow, 0.16))
    g.addColorStop(1, rgba(HUES[0].glow, 0))
    ctx.fillStyle = g
    ctx.fillRect(h.x - radius * 1.5, h.y - radius * 1.5, radius * 3, radius * 3)
  } else {
    const z = hudZones(r)[h.zone]
    if (z) {
      const grow = pulse * 3
      ctx.strokeRect(z.x - grow, z.y - grow, z.w + grow * 2, z.h + grow * 2)
      ctx.fillStyle = rgba(HUES[0].glow, 0.07 + pulse * 0.06)
      ctx.fillRect(z.x, z.y, z.w, z.h)
    }
  }
  ctx.restore()
}

// ───────────────────────── world ─────────────────────────

const drawArena = (ctx: CanvasRenderingContext2D, run: Run, t: number): void => {
  const { x0, y0, x1, y1 } = run

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0)

  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = x0; x <= x1 + 1; x += CELL) {
    ctx.moveTo(Math.round(x) + 0.5, y0)
    ctx.lineTo(Math.round(x) + 0.5, y1)
  }
  for (let y = y0; y <= y1 + 1; y += CELL) {
    ctx.moveTo(x0, Math.round(y) + 0.5)
    ctx.lineTo(x1, Math.round(y) + 0.5)
  }
  ctx.stroke()

  // Border: breathes with the wave timer so time pressure is felt, not read.
  const urgency = 1 - clamp(run.waveTimer / 4, 0, 1)
  ctx.strokeStyle = rgba(COLORS.gridHot, 0.55 + urgency * 0.45 * (0.5 + 0.5 * Math.sin(t * 9)))
  ctx.lineWidth = 2
  ctx.strokeRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2)
}

const drawCorruption = (ctx: CanvasRenderingContext2D, run: Run, t: number): void => {
  // The cell grid overhangs the arena by up to one cell; clip so corruption
  // never bleeds outside the play area.
  ctx.save()
  ctx.beginPath()
  ctx.rect(run.x0, run.y0, run.x1 - run.x0, run.y1 - run.y0)
  ctx.clip()
  for (let i = 0; i < run.corrupt.length; i++) {
    const v = run.corrupt[i]
    if (v <= 0) continue
    const cx = (i % run.cols) * CELL + run.x0
    const cy = Math.floor(i / run.cols) * CELL + run.y0
    const grown = Math.min(v * 1.4, 1)
    const pad = (1 - grown) * CELL * 0.5

    ctx.fillStyle = rgba(COLORS.corruptDeep, 0.55 + v * 0.4)
    ctx.fillRect(cx + pad, cy + pad, CELL - pad * 2, CELL - pad * 2)

    if (v > 0.5) {
      // Only mature cells glow — that glow *is* the "this hurts" signal.
      const flicker = 0.35 + 0.25 * Math.sin(t * 7 + i * 0.7)
      ctx.strokeStyle = rgba(COLORS.corrupt, (v - 0.5) * 2 * flicker)
      ctx.lineWidth = 1.5
      ctx.strokeRect(cx + 2.5, cy + 2.5, CELL - 5, CELL - 5)
      ctx.fillStyle = rgba(COLORS.corrupt, (v - 0.5) * 0.16)
      ctx.fillRect(cx, cy, CELL, CELL)
    }
  }
  ctx.restore()
}

const drawVaultLink = (ctx: CanvasRenderingContext2D, run: Run): void => {
  if (run.buffer < 60) return
  // The higher the stakes, the louder the "go bank it" line.
  const a = clamp(run.buffer / 3000, 0.08, 0.5)
  ctx.save()
  ctx.setLineDash([5, 11])
  ctx.lineDashOffset = -performance.now() * 0.045
  ctx.strokeStyle = rgba(COLORS.vaultGlow, a)
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(run.px, run.py)
  ctx.lineTo(run.vx, run.vy)
  ctx.stroke()
  ctx.restore()
}

const drawVault = (ctx: CanvasRenderingContext2D, run: Run, t: number): void => {
  const { vx, vy, vaultR } = run
  const pulse = 1 + run.vaultPulse * 0.5 + Math.sin(t * 3.4) * 0.06
  const ready = run.buffer > 0

  ctx.save()
  ctx.translate(vx, vy)
  ctx.globalCompositeOperation = 'lighter'
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, vaultR * 3.4 * pulse)
  g.addColorStop(0, rgba(COLORS.vaultGlow, ready ? 0.5 : 0.22))
  g.addColorStop(1, rgba(COLORS.vaultGlow, 0))
  ctx.fillStyle = g
  ctx.fillRect(-vaultR * 3.4, -vaultR * 3.4, vaultR * 6.8, vaultR * 6.8)
  ctx.globalCompositeOperation = 'source-over'

  ctx.rotate(t * 0.55)
  ctx.strokeStyle = rgba(COLORS.vault, ready ? 0.95 : 0.5)
  ctx.lineWidth = 2.5
  const s = vaultR * pulse
  ctx.strokeRect(-s, -s, s * 2, s * 2)

  ctx.rotate(-t * 1.25)
  ctx.strokeStyle = rgba(COLORS.vaultGlow, 0.75)
  ctx.lineWidth = 1.5
  const s2 = vaultR * 0.62 * pulse
  ctx.strokeRect(-s2, -s2, s2 * 2, s2 * 2)

  ctx.rotate(t * 0.7)
  ctx.fillStyle = COLORS.vault
  const s3 = vaultR * 0.3 * (1 + Math.sin(t * 6) * 0.12)
  ctx.fillRect(-s3, -s3, s3 * 2, s3 * 2)
  ctx.restore()
}

const drawPixels = (ctx: CanvasRenderingContext2D, run: Run, t: number): void => {
  for (const p of run.pixels) {
    if (!p.alive) continue
    const hue = HUES[p.hue]
    const locked = run.wave.modifier === 'colourLock' && p.hue !== run.wave.lockedHue
    const age = clamp((run.elapsed - p.born) / 0.28, 0, 1)
    const bob = Math.sin(p.bob) * 1.6
    const size = (p.golden ? 11 : 8) * (0.4 + age * 0.6) * (1 + p.pulled * 0.25)
    const alpha = locked ? 0.28 : 1

    ctx.save()
    ctx.translate(p.x, p.y + bob)
    ctx.rotate(p.golden ? t * 1.6 : p.bob * 0.12)

    ctx.globalCompositeOperation = 'lighter'
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 3.2)
    glow.addColorStop(0, rgba(p.golden ? COLORS.vaultGlow : hue.glow, 0.42 * alpha))
    glow.addColorStop(1, rgba(p.golden ? COLORS.vaultGlow : hue.glow, 0))
    ctx.fillStyle = glow
    ctx.fillRect(-size * 3.2, -size * 3.2, size * 6.4, size * 6.4)
    ctx.globalCompositeOperation = 'source-over'

    ctx.fillStyle = rgba(p.golden ? '#ffffff' : hue.core, alpha)
    ctx.fillRect(-size / 2, -size / 2, size, size)
    if (p.golden) {
      ctx.strokeStyle = rgba('#ffffff', 0.8)
      ctx.lineWidth = 1.5
      ctx.strokeRect(-size / 2 - 3, -size / 2 - 3, size + 6, size + 6)
    }
    ctx.restore()
  }
}

const drawHunters = (ctx: CanvasRenderingContext2D, run: Run, t: number): void => {
  for (const h of run.hunters) {
    if (!h.alive) continue
    ctx.save()
    ctx.translate(h.x, h.y)

    if (h.spawn > 0) {
      // Telegraph: a warning diamond before it can hurt you.
      const k = 1 - h.spawn / 1.1
      ctx.globalAlpha = 0.35 + k * 0.5
      ctx.strokeStyle = COLORS.hunter
      ctx.lineWidth = 2
      ctx.rotate(Math.PI / 4)
      const s = 16 * (1.8 - k * 0.8)
      ctx.strokeRect(-s / 2, -s / 2, s, s)
      ctx.restore()
      continue
    }

    ctx.rotate(Math.atan2(h.vy, h.vx) + Math.PI / 4)
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30)
    g.addColorStop(0, rgba(COLORS.hunter, 0.4))
    g.addColorStop(1, rgba(COLORS.hunter, 0))
    ctx.fillStyle = g
    ctx.fillRect(-30, -30, 60, 60)
    ctx.globalCompositeOperation = 'source-over'

    const s = 11 + Math.sin(t * 12 + h.wobble) * 1.2
    ctx.fillStyle = COLORS.hunter
    ctx.fillRect(-s / 2, -s / 2, s, s)
    ctx.fillStyle = '#ffd6e0'
    ctx.fillRect(-s / 6, -s / 6, s / 3, s / 3)
    ctx.restore()
  }
}

const drawPlayer = (ctx: CanvasRenderingContext2D, run: Run, skin: Skin, t: number): void => {
  const blink = run.invuln > 0 && Math.floor(t * 22) % 2 === 0
  ctx.save()
  ctx.translate(run.px, run.py)

  // Risk aura: grows and pulses with the unbanked buffer.
  if (run.aura > 0.02) {
    ctx.globalCompositeOperation = 'lighter'
    const R = 26 + run.aura * 44 + Math.sin(t * 5) * 3
    const g = ctx.createRadialGradient(0, 0, R * 0.35, 0, 0, R)
    g.addColorStop(0, rgba(COLORS.vaultGlow, 0.16 * run.aura))
    g.addColorStop(1, rgba(COLORS.vaultGlow, 0))
    ctx.fillStyle = g
    ctx.fillRect(-R, -R, R * 2, R * 2)
    ctx.strokeStyle = rgba(COLORS.vaultGlow, 0.16 + run.aura * 0.22)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, R * 0.8, 0, TAU)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }

  if (run.overclock > 0) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = rgba(skin.glow, 0.55)
    ctx.lineWidth = 2
    for (let i = 0; i < 3; i++) {
      const rr = 30 + i * 16 + Math.sin(t * 8 - i) * 5
      ctx.beginPath()
      ctx.arc(0, 0, rr, t * 2 + i, t * 2 + i + 2.1)
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  if (!blink) {
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 34)
    g.addColorStop(0, rgba(skin.glow, 0.5))
    g.addColorStop(1, rgba(skin.glow, 0))
    ctx.fillStyle = g
    ctx.fillRect(-34, -34, 68, 68)
    ctx.globalCompositeOperation = 'source-over'

    ctx.rotate(Math.PI / 4 + t * 0.6)
    const s = run.pr * 1.7 * (1 + Math.sin(t * 7) * 0.04)
    ctx.fillStyle = skin.core
    ctx.fillRect(-s / 2, -s / 2, s, s)
    ctx.strokeStyle = rgba(skin.glow, 0.9)
    ctx.lineWidth = 1.5
    ctx.strokeRect(-s / 2 - 3.5, -s / 2 - 3.5, s + 7, s + 7)
  }
  ctx.restore()
}

const drawBlackout = (ctx: CanvasRenderingContext2D, run: Run, r: Renderer): void => {
  const g = ctx.createRadialGradient(run.px, run.py, 40, run.px, run.py, 210)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(0.62, 'rgba(3,3,8,0.72)')
  g.addColorStop(1, 'rgba(3,3,8,0.97)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, r.w, r.h)
}

// ───────────────────────── HUD ─────────────────────────

/**
 * Two columns, no centre column, hard width budgets.
 *
 * The previous layout anchored the score left, the buffer right and the
 * multiplier dead centre — on a 360 px phone those three numbers grew into each
 * other and overlapped. Now each column owns 46% of the width and every string
 * is measured and shrunk to fit inside it, so nothing can ever collide.
 *
 * The multiplier moved next to the buffer because that is what it multiplies,
 * and the chain timer sits right underneath it: the bar is literally how long
 * that multiplier has left to live.
 */
const drawHud = (ctx: CanvasRenderingContext2D, run: Run, r: Renderer, t: number): void => {
  ctx.save()
  ctx.textBaseline = 'alphabetic'

  const PAD = 16
  const column = r.w * 0.46 - PAD
  // Everything the HUD draws is pushed below the notch / status bar.
  const T = r.safeTop

  /** Sets the font at the largest size whose text still fits `max`. */
  const fitFont = (text: string, ideal: number, min: number, max: number): number => {
    let size = ideal
    ctx.font = `700 ${size}px ${MONO}`
    const w = ctx.measureText(text).width
    if (w > max) {
      size = Math.max(min, Math.floor((size * max) / w))
      ctx.font = `700 ${size}px ${MONO}`
    }
    return size
  }

  // ── Left column: what is already yours ──
  const scoreText = fmt(run.stats.score)
  fitFont(scoreText, 32, 15, column)
  ctx.fillStyle = COLORS.text
  ctx.textAlign = 'left'
  ctx.fillText(scoreText, PAD, T + 48)

  ctx.font = `500 10px ${MONO}`
  ctx.fillStyle = COLORS.dim
  ctx.fillText('SÉCURISÉ', PAD, T + 62)

  for (let i = 0; i < run.maxShards; i++) {
    ctx.fillStyle = i < run.shards ? COLORS.player : 'rgba(255,255,255,0.13)'
    ctx.save()
    ctx.translate(PAD + 5 + i * 15, T + 83)
    ctx.rotate(Math.PI / 4)
    ctx.fillRect(-5, -5, 10, 10)
    ctx.restore()
  }

  // ── Right column: what you could still lose ──
  ctx.textAlign = 'right'
  const right = r.w - PAD

  if (run.buffer > 0) {
    const heat = clamp(run.buffer / 5000, 0, 1)
    const wob = Math.sin(t * (7 + heat * 12)) * heat * 1.6
    const bufText = fmt(run.buffer)
    fitFont(bufText, 26 + heat * 10, 15, column)
    ctx.fillStyle = rgba(COLORS.vault, 0.85 + heat * 0.15)
    ctx.fillText(bufText, right + wob, T + 46)

    // "EN RISQUE ×27" on one baseline, the multiplier in its own colour: measure
    // the multiplier first so the label can be shifted left by exactly its width.
    ctx.font = `700 12px ${MONO}`
    const multText = run.mult > 1 ? `×${run.mult}` : ''
    const multWidth = multText ? ctx.measureText(` ${multText}`).width : 0
    if (multText) {
      ctx.fillStyle = HUES[Math.max(run.lastHue, 0)].core
      ctx.fillText(multText, right, T + 60)
    }
    ctx.font = `700 10px ${MONO}`
    ctx.fillStyle = rgba(COLORS.vaultGlow, 0.55 + heat * 0.45)
    ctx.fillText('EN RISQUE', right - multWidth, T + 60)
  }

  // Chain timer: how long the multiplier has left, drawn under what it multiplies.
  if (run.chain > 0) {
    const w = Math.min(126, column)
    const x = right - w
    const p = clamp(run.chainTimer / run.chainWindow, 0, 1)
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.fillRect(x, T + 66, w, 3)
    ctx.fillStyle = p < 0.3 ? COLORS.corrupt : HUES[Math.max(run.lastHue, 0)].core
    ctx.fillRect(x + w * (1 - p), T + 66, w * p, 3)
  }

  ctx.font = `700 14px ${MONO}`
  ctx.fillStyle = COLORS.text
  ctx.fillText(`VAGUE ${run.waveIndex}`, right, T + 86)

  const mod = modifierById(run.wave.modifier)
  if (mod) {
    // The longest modifier name must not spill into the left column.
    let size = 10
    ctx.font = `700 ${size}px ${MONO}`
    const w = ctx.measureText(mod.name).width
    if (w > r.w - PAD * 2) {
      size = Math.max(7, Math.floor((size * (r.w - PAD * 2)) / w))
      ctx.font = `700 ${size}px ${MONO}`
    }
    ctx.fillStyle = mod.color
    ctx.fillText(mod.name, right, T + 99)
  }

  ctx.textAlign = 'left'
  drawOverclockMeter(ctx, run, r, t)
  ctx.restore()
}

const drawOverclockMeter = (ctx: CanvasRenderingContext2D, run: Run, r: Renderer, t: number): void => {
  const w = Math.min(320, r.w - 60)
  const x = (r.w - w) / 2
  const y = r.h - 46 - r.safeBottom
  const ready = run.charge >= 1
  const active = run.overclock > 0

  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.fillRect(x, y, w, 8)

  if (active) {
    const p = run.overclock / run.overclockDuration
    ctx.fillStyle = rgba(COLORS.playerGlow, 0.95)
    ctx.fillRect(x, y, w * p, 8)
    ctx.font = `700 11px ${MONO}`
    ctx.textAlign = 'center'
    ctx.fillStyle = COLORS.playerGlow
    ctx.fillText('OVERCLOCK ACTIF', r.w / 2, y - 8)
    ctx.textAlign = 'left'
  } else {
    ctx.fillStyle = ready
      ? rgba(COLORS.playerGlow, 0.65 + 0.35 * Math.sin(t * 9))
      : 'rgba(232,236,255,0.42)'
    ctx.fillRect(x, y, w * run.charge, 8)
    ctx.font = `700 11px ${MONO}`
    ctx.textAlign = 'center'
    ctx.fillStyle = ready ? COLORS.playerGlow : COLORS.dim
    ctx.fillText(ready ? 'ESPACE / TAP LA BARRE — OVERCLOCK' : 'CHARGE OVERCLOCK', r.w / 2, y - 8)
    ctx.textAlign = 'left'
  }
}
