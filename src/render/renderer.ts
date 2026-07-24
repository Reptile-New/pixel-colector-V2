import { clamp, damp } from '../core/math'
import { COLORS, rgba } from './palette'

/**
 * Canvas 2D renderer with a camera (shake / zoom / drift) and a CRT post pass.
 * The scene is drawn into an offscreen buffer so post-processing is a single
 * composite instead of a per-object cost.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  /** Logical size in CSS pixels. All gameplay maths uses these units. */
  w = 0
  h = 0
  dpr = 1

  // Camera state
  shake = 0
  /** 0 disables screen shake entirely (accessibility setting). */
  shakeScale = 1
  private shakeX = 0
  private shakeY = 0
  zoom = 1
  private zoomTarget = 1

  // Post-processing intensities (0..1)
  aberration = 0
  flash = 0
  flashColor = '#ffffff'
  vignette = 0.45
  /** Disabled automatically on weak devices to protect the frame budget. */
  postEnabled = true

  private scene: HTMLCanvasElement
  private sctx: CanvasRenderingContext2D
  private scanlines: HTMLCanvasElement | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D indisponible')
    this.ctx = ctx

    this.scene = document.createElement('canvas')
    const sctx = this.scene.getContext('2d', { alpha: false })
    if (!sctx) throw new Error('Canvas 2D indisponible')
    this.sctx = sctx

    // Mid-range phones choke on the post pass; keep 60fps over eye candy.
    this.postEnabled = (navigator.hardwareConcurrency ?? 4) > 3

    this.resize()
    window.addEventListener('resize', () => this.resize())
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120))
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    // Cap DPR: a 3x retina phone gains nothing visually here and loses half its framerate.
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2)
    this.w = Math.max(320, Math.round(rect.width || window.innerWidth))
    this.h = Math.max(400, Math.round(rect.height || window.innerHeight))

    for (const c of [this.canvas, this.scene]) {
      c.width = Math.round(this.w * this.dpr)
      c.height = Math.round(this.h * this.dpr)
    }
    this.scanlines = null
  }

  /** Camera impulses. Magnitudes are in CSS pixels. */
  addShake(amount: number): void {
    this.shake = Math.min(this.shake + amount * this.shakeScale, 34)
  }

  punchZoom(amount: number): void {
    this.zoom += amount
  }

  setFlash(color: string, amount: number): void {
    this.flashColor = color
    this.flash = Math.max(this.flash, amount)
  }

  update(dt: number): void {
    this.shake = damp(this.shake, 0, 0.0004, dt)
    const a = this.shake
    this.shakeX = (Math.random() * 2 - 1) * a
    this.shakeY = (Math.random() * 2 - 1) * a
    this.zoom = damp(this.zoom, this.zoomTarget, 0.0015, dt)
    this.aberration = damp(this.aberration, 0, 0.0009, dt)
    this.flash = damp(this.flash, 0, 0.0001, dt)
  }

  /** Begin the world pass: returns the context already under the camera transform. */
  begin(): CanvasRenderingContext2D {
    const c = this.sctx
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    c.fillStyle = COLORS.bgDeep
    c.fillRect(0, 0, this.w, this.h)
    c.save()
    const cx = this.w / 2
    const cy = this.h / 2
    c.translate(cx + this.shakeX, cy + this.shakeY)
    c.scale(this.zoom, this.zoom)
    c.translate(-cx, -cy)
    return c
  }

  /** End the world pass and composite to the visible canvas. */
  end(): void {
    this.sctx.restore()
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(this.scene, 0, 0)

    if (this.postEnabled && this.aberration > 0.01) this.drawAberration()
    if (this.postEnabled) this.drawScanlines()
    this.drawVignette()

    if (this.flash > 0.01) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = rgba(this.flashColor, Math.min(this.flash, 0.85))
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  private drawAberration(): void {
    const ctx = this.ctx
    const k = this.aberration * 9 * this.dpr
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.42
    ctx.filter = 'sepia(1) saturate(6) hue-rotate(-38deg)'
    ctx.drawImage(this.scene, -k, 0)
    ctx.filter = 'sepia(1) saturate(6) hue-rotate(150deg)'
    ctx.drawImage(this.scene, k, 0)
    ctx.filter = 'none'
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  private drawScanlines(): void {
    if (!this.scanlines) {
      // Cached 1x4 tile: repeating it costs one fillRect instead of h/2 strokes.
      const tile = document.createElement('canvas')
      tile.width = 1
      tile.height = 4
      const t = tile.getContext('2d')!
      t.fillStyle = 'rgba(0,0,0,0.22)'
      t.fillRect(0, 0, 1, 2)
      this.scanlines = tile
    }
    const ctx = this.ctx
    ctx.globalAlpha = 0.5
    const pat = ctx.createPattern(this.scanlines, 'repeat')!
    ctx.fillStyle = pat
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.globalAlpha = 1
  }

  private drawVignette(): void {
    const ctx = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${clamp(this.vignette, 0, 0.95)})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
}
