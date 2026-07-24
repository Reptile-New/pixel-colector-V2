import { clamp } from './math'

/**
 * Unified input. Three schemes feed the same normalised aim vector so the game
 * never has to know how it is being played:
 *  - Pointer / touch: the cursor chases the finger (works one-thumb on mobile)
 *  - Keyboard: WASD / arrows
 *  - Gamepad: left stick
 */
export class Input {
  /** Pointer position in CSS pixels relative to the canvas. */
  pointerX = 0
  pointerY = 0
  pointerActive = false
  /** Keyboard/gamepad direction, magnitude <= 1. */
  axisX = 0
  axisY = 0

  private keys = new Set<string>()
  private pressedThisFrame = new Set<string>()
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas

    const setPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      this.pointerX = e.clientX - r.left
      this.pointerY = e.clientY - r.top
      this.pointerActive = true
    }

    canvas.addEventListener('pointermove', setPointer, { passive: true })
    canvas.addEventListener('pointerdown', (e) => {
      setPointer(e)
      canvas.setPointerCapture?.(e.pointerId)
      this.pressedThisFrame.add('Pointer')
    })
    canvas.addEventListener('pointerup', () => {
      /* keep last position: on touch the cursor holds its heading */
    })
    // Stop iOS from scrolling / rubber-banding under the canvas.
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.keys.add(e.code)
      this.pressedThisFrame.add(e.code)
      if (MOVEMENT_KEYS.has(e.code) || e.code === 'Space') e.preventDefault()
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
  }

  /** Call once per frame, before update. */
  poll(): void {
    let x = 0
    let y = 0
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1

    const pads = navigator.getGamepads?.() ?? []
    for (const pad of pads) {
      if (!pad) continue
      const [gx = 0, gy = 0] = pad.axes
      if (Math.abs(gx) > 0.18 || Math.abs(gy) > 0.18) {
        x += gx
        y += gy
      }
      if (pad.buttons[0]?.pressed) this.pressedThisFrame.add('Space')
    }

    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    this.axisX = clamp(x, -1, 1)
    this.axisY = clamp(y, -1, 1)
    // Digital input takes priority: it means the player put the mouse down.
    if (len > 0) this.pointerActive = false
  }

  /** Consume-once edge detection. */
  pressed(code: string): boolean {
    if (this.pressedThisFrame.has(code)) {
      this.pressedThisFrame.delete(code)
      return true
    }
    return false
  }

  endFrame(): void {
    this.pressedThisFrame.clear()
  }

  get element(): HTMLCanvasElement {
    return this.canvas
  }
}

const MOVEMENT_KEYS = new Set([
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
])
