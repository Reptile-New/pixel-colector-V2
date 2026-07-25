import { audio } from '../audio/audio'
import type { Input } from '../core/input'
import { TAU, clamp, damp, dist2 } from '../core/math'
import { Rng } from '../core/rng'
import type { Particles } from '../render/particles'
import { COLORS, HUES } from '../render/palette'
import type { Renderer } from '../render/renderer'
import { type RunStats, emptyRunStats } from './stats'
import type { RunMods } from './upgrades'
import { WAVE_DURATION, type WaveSpec, buildWave } from './waves'

export const CELL = 38

export interface Pixel {
  alive: boolean
  x: number
  y: number
  hue: number
  golden: boolean
  born: number
  bob: number
  /** Set while the magnet is dragging it, for the trail effect. */
  pulled: number
}

export interface Hunter {
  alive: boolean
  x: number
  y: number
  vx: number
  vy: number
  spawn: number
  near: number
  wobble: number
}

export type RunEvent =
  | { type: 'collect'; x: number; y: number; hue: number; value: number; golden: boolean }
  | { type: 'bank'; x: number; y: number; amount: number; mult: number }
  | { type: 'hit'; x: number; y: number }
  | { type: 'wave'; spec: WaveSpec }
  | { type: 'overclock' }
  | { type: 'death' }

/**
 * One playthrough. Owns the entire simulation and nothing else — no DOM, no
 * persistence, no audio policy. That keeps it testable and lets the shell
 * (menus, ads, saves) evolve independently.
 */
export class Run {
  readonly stats: RunStats
  readonly rng: Rng
  readonly seed: number
  readonly mods: RunMods

  // Arena (CSS pixels)
  x0 = 0
  y0 = 0
  x1 = 0
  y1 = 0
  cols = 0
  rows = 0
  corrupt!: Float32Array

  // Player
  px = 0
  py = 0
  pvx = 0
  pvy = 0
  readonly pr = 9
  shards = 3
  maxShards = 3
  invuln = 0
  magnet = 46
  aura = 0

  // Economy
  buffer = 0
  mult = 1
  chain = 0
  chainTimer = 0
  chainMax = 2.5
  lastHue = -1

  // Overclock
  charge = 0
  overclock = 0
  readonly overclockDuration = 5

  // Vault
  vx = 0
  vy = 0
  vaultPulse = 0
  readonly vaultR = 21

  // World
  pixels: Pixel[] = []
  hunters: Hunter[] = []
  wave!: WaveSpec
  waveIndex = 1
  waveTimer = WAVE_DURATION
  elapsed = 0
  dead = false
  /** Set while a revive is pending so the sim stays frozen. */
  paused = false

  timeScale = 1
  private hitstop = 0
  private spreadAcc = 0
  private spawnAcc = 0
  private damageCooldown = 0
  private events: RunEvent[] = []

  constructor(
    seed: number,
    mods: RunMods,
    readonly renderer: Renderer,
    readonly particles: Particles,
    daily: boolean,
  ) {
    this.seed = seed
    this.rng = new Rng(seed)
    this.mods = mods
    this.stats = emptyRunStats()
    this.stats.daily = daily

    this.maxShards = 3 + mods.extraShards
    this.shards = this.maxShards
    this.magnet = 46 + mods.magnetBonus
    this.chainMax = 2.5 + mods.chainTimeBonus

    this.layout()
    this.px = (this.x0 + this.x1) / 2
    this.py = (this.y0 + this.y1) / 2
    this.startWave(1)
    this.placeVault(true)
    for (let i = 0; i < 8; i++) this.spawnPixel()
  }

  // ───────────────────────── layout ─────────────────────────

  layout(): void {
    const r = this.renderer
    const pad = 14
    this.x0 = pad
    this.x1 = r.w - pad
    this.y0 = 104
    this.y1 = r.h - 88
    const cols = Math.max(4, Math.ceil((this.x1 - this.x0) / CELL))
    const rows = Math.max(4, Math.ceil((this.y1 - this.y0) / CELL))
    if (cols !== this.cols || rows !== this.rows) {
      const next = new Float32Array(cols * rows)
      // Preserve corruption across a resize instead of wiping the arena state.
      if (this.corrupt) {
        for (let y = 0; y < Math.min(rows, this.rows); y++)
          for (let x = 0; x < Math.min(cols, this.cols); x++)
            next[y * cols + x] = this.corrupt[y * this.cols + x]
      }
      this.corrupt = next
      this.cols = cols
      this.rows = rows
    }
    this.px = clamp(this.px, this.x0 + this.pr, this.x1 - this.pr)
    this.py = clamp(this.py, this.y0 + this.pr, this.y1 - this.pr)

    // A rotation or a resize shrinks the arena. Anything left outside would be
    // unreachable — an out-of-bounds vault means the player can never bank
    // again, and stranded pixels count toward the live total so nothing new
    // spawns. Pull everything back in.
    this.vx = clamp(this.vx, this.x0 + this.vaultR, this.x1 - this.vaultR)
    this.vy = clamp(this.vy, this.y0 + this.vaultR, this.y1 - this.vaultR)
    for (const p of this.pixels) {
      if (!p.alive) continue
      p.x = clamp(p.x, this.x0 + 10, this.x1 - 10)
      p.y = clamp(p.y, this.y0 + 10, this.y1 - 10)
    }
  }

  private cellOf(x: number, y: number): number {
    const cx = clamp(Math.floor((x - this.x0) / CELL), 0, this.cols - 1)
    const cy = clamp(Math.floor((y - this.y0) / CELL), 0, this.rows - 1)
    return cy * this.cols + cx
  }

  cellCenter(i: number): { x: number; y: number } {
    const cx = i % this.cols
    const cy = Math.floor(i / this.cols)
    return { x: this.x0 + cx * CELL + CELL / 2, y: this.y0 + cy * CELL + CELL / 2 }
  }

  // ───────────────────────── waves ─────────────────────────

  private startWave(index: number): void {
    this.waveIndex = index
    this.wave = buildWave(index, this.rng)
    this.waveTimer = WAVE_DURATION
    this.stats.wave = index
    this.events.push({ type: 'wave', spec: this.wave })

    const target = this.wave.hunters + (this.wave.modifier === 'swarm' ? 3 : 0)
    while (this.hunters.filter((h) => h.alive).length < target) this.spawnHunter()
  }

  private get pixelTarget(): number {
    const m = this.wave.modifier
    const base = this.wave.pixelTarget
    if (m === 'pixelRain') return Math.round(base * 1.9)
    if (m === 'drought') return Math.max(4, Math.round(base * 0.4))
    return base
  }

  // ───────────────────────── spawning ─────────────────────────

  private freeSpot(minDistFromPlayer: number): { x: number; y: number } | null {
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = this.rng.range(this.x0 + 20, this.x1 - 20)
      const y = this.rng.range(this.y0 + 20, this.y1 - 20)
      if (this.corrupt[this.cellOf(x, y)] > 0.25) continue
      if (dist2(x, y, this.px, this.py) < minDistFromPlayer * minDistFromPlayer) continue
      return { x, y }
    }
    return null
  }

  private spawnPixel(): void {
    const spot = this.freeSpot(52)
    if (!spot) return
    let p = this.pixels.find((q) => !q.alive)
    if (!p) {
      p = { alive: false, x: 0, y: 0, hue: 0, golden: false, born: 0, bob: 0, pulled: 0 }
      this.pixels.push(p)
    }
    p.alive = true
    p.x = spot.x
    p.y = spot.y
    p.hue = this.wave.modifier === 'colourLock' && this.rng.chance(0.5)
      ? this.wave.lockedHue
      : this.rng.int(0, HUES.length)
    p.golden = this.rng.chance(0.018 + this.mods.rareChance)
    p.born = this.elapsed
    p.bob = this.rng.next() * TAU
    p.pulled = 0
  }

  private spawnHunter(): void {
    // Hunters enter from outside the arena so they are never unfair.
    const side = this.rng.int(0, 4)
    const x = side === 0 ? this.x0 - 40 : side === 1 ? this.x1 + 40 : this.rng.range(this.x0, this.x1)
    const y = side === 2 ? this.y0 - 40 : side === 3 ? this.y1 + 40 : this.rng.range(this.y0, this.y1)
    let h = this.hunters.find((q) => !q.alive)
    if (!h) {
      h = { alive: false, x: 0, y: 0, vx: 0, vy: 0, spawn: 0, near: 0, wobble: 0 }
      this.hunters.push(h)
    }
    h.alive = true
    h.x = x
    h.y = y
    h.vx = 0
    h.vy = 0
    h.spawn = 1.1 // telegraph window before it becomes dangerous
    h.near = 0
    h.wobble = this.rng.angle()
  }

  private placeVault(initial = false): void {
    const spot = this.freeSpot(initial ? 120 : 210) ?? { x: (this.x0 + this.x1) / 2, y: (this.y0 + this.y1) / 2 }
    this.vx = spot.x
    this.vy = spot.y
    this.vaultPulse = 1
  }

  // ───────────────────────── update ─────────────────────────

  drain(): RunEvent[] {
    const e = this.events
    this.events = []
    return e
  }

  update(dtRaw: number, input: Input): void {
    if (this.dead || this.paused) return

    if (this.hitstop > 0) {
      this.hitstop -= dtRaw
      return
    }

    const slow = this.overclock > 0 ? 0.55 : 1
    this.timeScale = damp(this.timeScale, slow, 0.0001, dtRaw)
    const dt = dtRaw * this.timeScale

    this.elapsed += dt
    this.stats.durationSec = this.elapsed

    this.updatePlayer(dt, input)
    this.updateChain(dt)
    this.updatePixels(dt)
    this.updateHunters(dt)
    this.updateCorruption(dt)
    this.updateVault(dt)
    this.updateOverclock(dt, input)

    this.waveTimer -= dt
    if (this.waveTimer <= 0) this.startWave(this.waveIndex + 1)

    // Danger feedback: the drone tracks how much is at stake.
    audio.setDanger(clamp(this.buffer / 6000, 0, 1) * 0.9 + (this.shards === 1 ? 0.35 : 0))
    audio.setIntensity(clamp((this.waveIndex - 1) / 9, 0, 1))
    this.renderer.vignette = 0.4 + clamp(this.buffer / 9000, 0, 1) * 0.24
    this.aura = damp(this.aura, clamp(this.buffer / 5000, 0, 1), 0.02, dtRaw)

    if (this.damageCooldown > 0) this.damageCooldown -= dt
    if (this.invuln > 0) this.invuln -= dtRaw
  }

  private updatePlayer(dt: number, input: Input): void {
    const maxSpeed = 430 * (1 + this.mods.speedBonus) * (this.overclock > 0 ? 1.12 : 1)
    const accel = 3400

    let tx = 0
    let ty = 0
    if (input.pointerActive) {
      const dx = input.pointerX - this.px
      const dy = input.pointerY - this.py
      const d = Math.hypot(dx, dy)
      if (d > 3) {
        // Ease into full speed over the last 90px so the cursor settles instead
        // of jittering on top of the finger.
        const k = Math.min(d / 90, 1)
        tx = (dx / d) * k
        ty = (dy / d) * k
      }
    } else {
      tx = input.axisX
      ty = input.axisY
    }

    this.pvx += (tx * maxSpeed - this.pvx) * Math.min(1, (accel / maxSpeed) * dt)
    this.pvy += (ty * maxSpeed - this.pvy) * Math.min(1, (accel / maxSpeed) * dt)

    const sp = Math.hypot(this.pvx, this.pvy)
    if (sp > maxSpeed) {
      this.pvx = (this.pvx / sp) * maxSpeed
      this.pvy = (this.pvy / sp) * maxSpeed
    }

    this.px += this.pvx * dt
    this.py += this.pvy * dt

    // Walls bounce softly: hitting the edge should cost momentum, not the run.
    if (this.px < this.x0 + this.pr) { this.px = this.x0 + this.pr; this.pvx *= -0.35 }
    if (this.px > this.x1 - this.pr) { this.px = this.x1 - this.pr; this.pvx *= -0.35 }
    if (this.py < this.y0 + this.pr) { this.py = this.y0 + this.pr; this.pvy *= -0.35 }
    if (this.py > this.y1 - this.pr) { this.py = this.y1 - this.pr; this.pvy *= -0.35 }

    if (sp > 120 && this.rng.chance(clamp(sp / 900, 0, 0.7))) {
      this.particles.streak(this.px, this.py, -this.pvx * 0.25, -this.pvy * 0.25, COLORS.playerGlow, 0.22, 2.5)
    }
  }

  /** Time allowed between two collects. Tightens with the chain so a long chain
   *  is a sprint, not a formality — and so chain milestones stay meaningful. */
  get chainWindow(): number {
    return Math.max(1, this.chainMax - this.chain * 0.06)
  }

  private updateChain(dt: number): void {
    if (this.chain > 0) {
      this.chainTimer -= dt
      if (this.chainTimer <= 0) {
        this.chain = 0
        this.mult = 1
        this.lastHue = -1
      }
    }
  }

  private updatePixels(dt: number): void {
    const alive = this.pixels.reduce((n, p) => n + (p.alive ? 1 : 0), 0)
    this.spawnAcc += dt
    const spawnRate = this.overclock > 0 ? 0.1 : 0.34
    if (alive < this.pixelTarget && this.spawnAcc > spawnRate) {
      this.spawnAcc = 0
      this.spawnPixel()
    }

    const magnetR = this.magnet * (this.overclock > 0 ? 4.5 : 1)
    const magnetR2 = magnetR * magnetR
    const grab = (this.pr + 9) * (this.pr + 9)

    for (const p of this.pixels) {
      if (!p.alive) continue
      p.bob += dt * 3
      const d2 = dist2(p.x, p.y, this.px, this.py)

      if (d2 < magnetR2) {
        const d = Math.sqrt(d2) || 1
        // Pull strength ramps as it gets closer: a satisfying "snap" instead of a drift.
        const pull = (1 - d / magnetR) * (this.overclock > 0 ? 1500 : 780)
        p.x += ((this.px - p.x) / d) * pull * dt
        p.y += ((this.py - p.y) / d) * pull * dt
        p.pulled = 1
      } else {
        p.pulled = damp(p.pulled, 0, 0.001, dt)
      }

      if (d2 < grab) this.collect(p)
    }
  }

  private collect(p: Pixel): void {
    p.alive = false
    const hue = HUES[p.hue]
    const locked = this.wave.modifier === 'colourLock' && p.hue !== this.wave.lockedHue

    if (locked) {
      // Wrong colour under COLOUR LOCK: no points, chain broken. A real penalty
      // the player can see coming, not a hidden trap.
      this.chain = 0
      this.mult = 1
      this.lastHue = -1
      this.particles.burst(p.x, p.y, COLORS.dim, 7, 130, 3)
      this.particles.popup(p.x, p.y - 14, 'VERROUILLÉ', COLORS.dim, 13)
      audio.ui('deny')
      return
    }

    // The chain IS the multiplier: it only grows on a repeated colour, so it is
    // naturally self-limiting and rewards *routing*, not just hoovering.
    if (p.hue === this.lastHue) this.chain = Math.min(this.chain + 1, 40)
    else this.chain = 1
    this.mult = this.chain
    this.chainTimer = this.chainWindow
    this.lastHue = p.hue

    // Bounded flow bonus. The real scaling lives in the bank multiplier, so a
    // long run can never turn into runaway exponential scoring.
    let value = 12 * (1 + Math.min(this.chain, 30) * 0.02)
    if (p.golden) value *= 5
    if (this.overclock > 0) value *= 2
    if (this.wave.modifier === 'fragile') value *= 2
    if (this.wave.modifier === 'drought') value *= 3
    value = Math.round(value)

    this.buffer += value
    this.charge = Math.min(this.charge + (0.013 + this.chain * 0.002) * (1 + this.mods.overclockRate), 1)

    this.stats.collected += 1
    this.stats.hueCounts[p.hue] += 1
    this.stats.bestChain = Math.max(this.stats.bestChain, this.chain)
    this.stats.bestMult = Math.max(this.stats.bestMult, this.mult)

    audio.collect(hue.note, this.chain)
    this.particles.burst(p.x, p.y, p.golden ? COLORS.vault : hue.core, p.golden ? 14 : 7, p.golden ? 260 : 170, p.golden ? 5 : 3.5)
    if (this.mult >= 2) this.particles.popup(p.x, p.y - 16, `×${this.mult}`, hue.core, 13 + Math.min(this.mult, 12))
    if (p.golden) {
      this.particles.ring(p.x, p.y, COLORS.vault, 52, 0.45)
      this.renderer.punchZoom(0.008)
    }

    this.events.push({ type: 'collect', x: p.x, y: p.y, hue: p.hue, value, golden: p.golden })
  }

  private updateHunters(dt: number): void {
    // Greed literally attracts danger: the fuller the buffer, the faster they close in.
    const pressure = clamp(this.buffer / 5000, 0, 1)
    const speed = this.wave.hunterSpeed * (1 + pressure * 0.4) * (this.wave.modifier === 'swarm' ? 0.75 : 1)
    const fleeing = this.overclock > 0

    for (const h of this.hunters) {
      if (!h.alive) continue
      if (h.spawn > 0) {
        h.spawn -= dt
        continue
      }
      h.wobble += dt * 2.4
      const dx = this.px - h.x
      const dy = this.py - h.y
      const d = Math.hypot(dx, dy) || 1
      const sign = fleeing ? -1.35 : 1
      // Slight sinusoidal drift stops packs from stacking into one bullet.
      const nx = (dx / d) * sign + Math.cos(h.wobble) * 0.22
      const ny = (dy / d) * sign + Math.sin(h.wobble) * 0.22
      h.vx = damp(h.vx, nx * speed, 0.02, dt)
      h.vy = damp(h.vy, ny * speed, 0.02, dt)
      h.x += h.vx * dt
      h.y += h.vy * dt

      const margin = 90
      h.x = clamp(h.x, this.x0 - margin, this.x1 + margin)
      h.y = clamp(h.y, this.y0 - margin, this.y1 + margin)

      if (this.rng.chance(0.35)) this.particles.streak(h.x, h.y, -h.vx * 0.3, -h.vy * 0.3, COLORS.hunter, 0.18, 2)

      const near = d < 58
      if (near && h.near <= 0 && this.invuln <= 0) {
        h.near = 1.4
        this.stats.closeCalls += 1
        this.particles.popup(this.px, this.py - 26, 'FRÔLÉ', COLORS.hunter, 12)
      }
      if (h.near > 0) h.near -= dt

      if (d < this.pr + 11) this.damage(h.x, h.y)
    }
  }

  private updateCorruption(dt: number): void {
    const total = this.cols * this.rows
    let corrupted = 0
    for (let i = 0; i < total; i++) {
      const v = this.corrupt[i]
      if (v > 0) {
        if (v < 1) this.corrupt[i] = Math.min(1, v + dt / 1.3)
        if (this.corrupt[i] > 0.5) corrupted++
      }
    }

    this.spreadAcc += dt
    if (this.spreadAcc > 0.3) {
      this.spreadAcc = 0
      if (corrupted / total < this.wave.corruptionTarget) this.seedCorruption()
    }

    // Standing in fully corrupted ground hurts.
    if (this.damageCooldown <= 0 && this.corrupt[this.cellOf(this.px, this.py)] > 0.62) {
      this.damage(this.px, this.py)
    }
  }

  private seedCorruption(): void {
    // 70% grow from an existing patch (organic), 30% new edge bloom (unpredictable).
    if (this.rng.chance(0.7)) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const i = this.rng.int(0, this.cols * this.rows)
        if (this.corrupt[i] <= 0.4) continue
        const cx = i % this.cols
        const cy = Math.floor(i / this.cols)
        const dir = this.rng.int(0, 4)
        const nx = cx + (dir === 0 ? 1 : dir === 1 ? -1 : 0)
        const ny = cy + (dir === 2 ? 1 : dir === 3 ? -1 : 0)
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue
        const ni = ny * this.cols + nx
        if (this.corrupt[ni] > 0) continue
        this.corrupt[ni] = 0.02
        return
      }
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      const edge = this.rng.int(0, 4)
      const cx = edge === 0 ? 0 : edge === 1 ? this.cols - 1 : this.rng.int(0, this.cols)
      const cy = edge === 2 ? 0 : edge === 3 ? this.rows - 1 : this.rng.int(0, this.rows)
      const i = cy * this.cols + cx
      if (this.corrupt[i] > 0) continue
      // Never bloom on top of the player: deaths must be readable.
      const c = this.cellCenter(i)
      if (dist2(c.x, c.y, this.px, this.py) < 90 * 90) continue
      this.corrupt[i] = 0.02
      return
    }
  }

  private updateVault(dt: number): void {
    this.vaultPulse = damp(this.vaultPulse, 0, 0.02, dt)

    if (this.wave.modifier === 'hungryVault') {
      const dx = this.vx - this.px
      const dy = this.vy - this.py
      const d = Math.hypot(dx, dy) || 1
      if (d < 230) {
        const flee = (1 - d / 230) * 210
        this.vx = clamp(this.vx + (dx / d) * flee * dt, this.x0 + 30, this.x1 - 30)
        this.vy = clamp(this.vy + (dy / d) * flee * dt, this.y0 + 30, this.y1 - 30)
      }
    }

    if (dist2(this.px, this.py, this.vx, this.vy) < (this.pr + this.vaultR) * (this.pr + this.vaultR)) {
      this.bank()
    }
  }

  private bank(): void {
    if (this.buffer <= 0) {
      this.placeVault()
      return
    }
    const amount = Math.round(this.buffer * this.mult * (1 + this.mods.vaultBonus))
    this.stats.score += amount
    this.stats.banks += 1
    this.stats.bestBank = Math.max(this.stats.bestBank, amount)

    const magnitude = clamp(amount / 8000, 0, 1)
    audio.bank(magnitude)
    this.particles.ring(this.vx, this.vy, COLORS.vault, 90 + magnitude * 150, 0.55)
    this.particles.burst(this.vx, this.vy, COLORS.vault, 18 + Math.floor(magnitude * 26), 300, 5)
    this.particles.popup(this.vx, this.vy - 34, `+${amount.toLocaleString('fr-FR')}`, COLORS.vault, 20 + magnitude * 20)
    this.renderer.addShake(4 + magnitude * 12)
    this.renderer.punchZoom(0.02 + magnitude * 0.05)
    this.renderer.setFlash(COLORS.vaultGlow, 0.06 + magnitude * 0.16)
    this.hitstop = 0.04 + magnitude * 0.05

    // Banking also purges the arena around the vault. The player who takes the
    // risk gets breathing room back — risk and relief in the same gesture.
    this.purge(this.vx, this.vy, 118 + magnitude * 90)

    this.events.push({ type: 'bank', x: this.vx, y: this.vy, amount, mult: this.mult })

    this.buffer = 0
    this.mult = 1
    this.lastHue = -1
    this.placeVault()
  }

  private purge(x: number, y: number, radius: number): void {
    const r2 = radius * radius
    for (let i = 0; i < this.corrupt.length; i++) {
      if (this.corrupt[i] <= 0) continue
      const c = this.cellCenter(i)
      if (dist2(c.x, c.y, x, y) < r2) {
        this.corrupt[i] = 0
        if (this.rng.chance(0.35)) this.particles.burst(c.x, c.y, COLORS.corrupt, 3, 90, 3)
      }
    }
  }

  private updateOverclock(dt: number, input: Input): void {
    if (this.overclock > 0) {
      this.overclock -= dt / (this.timeScale || 1) // burns in real time, not slowed time
      if (this.overclock <= 0) {
        this.overclock = 0
        audio.overclockEnd()
        this.renderer.setFlash('#7ff0ff', 0.08)
      }
      return
    }
    if (this.charge >= 1 && input.pressed('Space')) {
      this.triggerOverclock()
    }
  }

  triggerOverclock(): boolean {
    if (this.charge < 1 || this.overclock > 0 || this.dead) return false
    this.charge = 0
    this.overclock = this.overclockDuration
    this.stats.overclocks += 1
    audio.overclock()
    this.renderer.addShake(9)
    this.renderer.setFlash('#7ff0ff', 0.24)
    this.renderer.aberration = 0.7
    this.particles.ring(this.px, this.py, COLORS.playerGlow, 260, 0.7)
    this.particles.popup(this.px, this.py - 40, 'OVERCLOCK', COLORS.playerGlow, 24)
    this.events.push({ type: 'overclock' })
    return true
  }

  // ───────────────────────── damage ─────────────────────────

  damage(sx: number, sy: number): void {
    if (this.invuln > 0 || this.dead) return
    const amount = this.wave.modifier === 'fragile' ? 2 : 1
    this.shards -= amount
    this.damageCooldown = 0.9
    this.invuln = 1.15 + this.mods.graceBonus

    const lost = Math.round(this.buffer * (1 - this.mods.salvage))
    this.buffer = Math.round(this.buffer * this.mods.salvage)
    this.chain = 0
    this.mult = 1
    this.lastHue = -1

    audio.hit()
    this.hitstop = 0.06
    this.renderer.addShake(16)
    this.renderer.aberration = 1
    this.renderer.setFlash(COLORS.corrupt, 0.3)
    this.particles.burst(this.px, this.py, COLORS.corrupt, 26, 340, 5)
    this.particles.ring(this.px, this.py, COLORS.corrupt, 120, 0.5)
    if (lost > 0) this.particles.popup(this.px, this.py - 30, `−${lost.toLocaleString('fr-FR')}`, COLORS.corrupt, 19)

    // Knockback away from the threat, so the player is not re-hit instantly.
    const dx = this.px - sx
    const dy = this.py - sy
    const d = Math.hypot(dx, dy) || 1
    this.pvx += (dx / d) * 320
    this.pvy += (dy / d) * 320

    this.events.push({ type: 'hit', x: this.px, y: this.py })

    if (this.shards <= 0) {
      this.shards = 0
      this.die()
    }
  }

  private die(): void {
    this.dead = true
    this.stats.wave = this.waveIndex
    audio.gameOver()
    audio.setDanger(0)
    this.renderer.addShake(26)
    this.renderer.aberration = 1
    this.particles.burst(this.px, this.py, COLORS.player, 60, 460, 6)
    this.events.push({ type: 'death' })
  }

  /** Rewarded-ad continue: restore one shard and clear the area. */
  revive(): void {
    if (!this.dead) return
    this.dead = false
    this.shards = Math.max(1, Math.min(2, this.maxShards))
    this.invuln = 3.2
    this.buffer = 0
    this.mult = 1
    this.chain = 0
    for (const h of this.hunters) h.alive = false
    this.purge(this.px, this.py, 220)
    this.particles.ring(this.px, this.py, COLORS.playerGlow, 300, 0.8)
    this.renderer.setFlash('#ffffff', 0.4)
    audio.specimen()
    // Re-populate to the current wave's hunter count after a short grace period.
    setTimeout(() => {
      if (this.dead) return
      const target = this.wave.hunters
      while (this.hunters.filter((h) => h.alive).length < target) this.spawnHunter()
    }, 2600)
  }

  /** Live progress snapshot used by the HUD and the specimen checker. */
  get noHitWave(): number {
    return this.shards === this.maxShards ? this.waveIndex : this.stats.noHitWave
  }

  syncStats(): void {
    if (this.shards === this.maxShards) this.stats.noHitWave = Math.max(this.stats.noHitWave, this.waveIndex)
    this.stats.wave = this.waveIndex
  }
}
