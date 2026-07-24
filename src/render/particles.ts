import { TAU, easeOutCubic } from '../core/math'
import { rgba } from './palette'

type Kind = 0 | 1 | 2 // 0 = square shard, 1 = ring, 2 = streak

interface Particle {
  alive: boolean
  kind: Kind
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  spin: number
  rot: number
  drag: number
  color: string
}

interface Popup {
  alive: boolean
  x: number
  y: number
  vy: number
  life: number
  maxLife: number
  text: string
  color: string
  size: number
}

/** Fixed-size pools: zero allocation during a run, which keeps the GC out of the frame. */
export class Particles {
  private pool: Particle[] = []
  private popups: Popup[] = []
  private cursor = 0
  private popCursor = 0

  constructor(capacity = 900, popCapacity = 60) {
    for (let i = 0; i < capacity; i++)
      this.pool.push({
        alive: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 1, spin: 0, rot: 0, drag: 0.9, color: '#fff',
      })
    for (let i = 0; i < popCapacity; i++)
      this.popups.push({ alive: false, x: 0, y: 0, vy: 0, life: 0, maxLife: 1, text: '', color: '#fff', size: 16 })
  }

  private acquire(): Particle {
    // Ring-buffer overwrite: newest effect always wins over the oldest.
    const p = this.pool[this.cursor]
    this.cursor = (this.cursor + 1) % this.pool.length
    return p
  }

  burst(x: number, y: number, color: string, count: number, speed = 220, size = 4): void {
    for (let i = 0; i < count; i++) {
      const p = this.acquire()
      const a = Math.random() * TAU
      const s = speed * (0.35 + Math.random() * 0.9)
      p.alive = true
      p.kind = 0
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s
      p.maxLife = p.life = 0.28 + Math.random() * 0.42
      p.size = size * (0.6 + Math.random() * 0.8)
      p.rot = Math.random() * TAU
      p.spin = (Math.random() * 2 - 1) * 9
      p.drag = 0.08
      p.color = color
    }
  }

  ring(x: number, y: number, color: string, radius = 40, life = 0.4): void {
    const p = this.acquire()
    p.alive = true
    p.kind = 1
    p.x = x
    p.y = y
    p.vx = radius // repurposed: target radius
    p.vy = 0
    p.maxLife = p.life = life
    p.size = 3
    p.color = color
    p.drag = 0
  }

  streak(x: number, y: number, vx: number, vy: number, color: string, life = 0.3, size = 3): void {
    const p = this.acquire()
    p.alive = true
    p.kind = 2
    p.x = x
    p.y = y
    p.vx = vx
    p.vy = vy
    p.maxLife = p.life = life
    p.size = size
    p.drag = 0.12
    p.color = color
  }

  popup(x: number, y: number, text: string, color: string, size = 17): void {
    const p = this.popups[this.popCursor]
    this.popCursor = (this.popCursor + 1) % this.popups.length
    p.alive = true
    p.x = x
    p.y = y
    p.vy = -62
    p.maxLife = p.life = 0.85
    p.text = text
    p.color = color
    p.size = size
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue
      p.life -= dt
      if (p.life <= 0) {
        p.alive = false
        continue
      }
      if (p.kind !== 1) {
        const d = Math.pow(p.drag, dt * 60) || 1
        p.vx *= d
        p.vy *= d
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.spin * dt
      }
    }
    for (const p of this.popups) {
      if (!p.alive) continue
      p.life -= dt
      if (p.life <= 0) {
        p.alive = false
        continue
      }
      p.y += p.vy * dt
      p.vy *= Math.pow(0.05, dt)
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = 'lighter'
    for (const p of this.pool) {
      if (!p.alive) continue
      const t = p.life / p.maxLife
      if (p.kind === 0) {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = rgba(p.color, t)
        const s = p.size * t
        ctx.fillRect(-s / 2, -s / 2, s, s)
        ctx.restore()
      } else if (p.kind === 1) {
        const r = p.vx * easeOutCubic(1 - t)
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, TAU)
        ctx.strokeStyle = rgba(p.color, t * 0.85)
        ctx.lineWidth = p.size * t
        ctx.stroke()
      } else {
        ctx.strokeStyle = rgba(p.color, t * 0.8)
        ctx.lineWidth = p.size * t
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035)
        ctx.stroke()
      }
    }
    ctx.globalCompositeOperation = 'source-over'

    for (const p of this.popups) {
      if (!p.alive) continue
      const t = p.life / p.maxLife
      ctx.font = `700 ${p.size}px "DM Mono", ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.lineWidth = 4
      ctx.strokeStyle = `rgba(4,4,10,${t * 0.9})`
      ctx.strokeText(p.text, p.x, p.y)
      ctx.fillStyle = rgba(p.color, t)
      ctx.fillText(p.text, p.x, p.y)
    }
    ctx.textAlign = 'start'
  }

  clear(): void {
    for (const p of this.pool) p.alive = false
    for (const p of this.popups) p.alive = false
  }
}
