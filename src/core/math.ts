export const TAU = Math.PI * 2

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Frame-rate independent exponential smoothing. `t` is the fraction remaining after 1s. */
export const damp = (a: number, b: number, t: number, dt: number) => lerp(a, b, 1 - Math.pow(t, dt))

export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

export const smoothstep = (t: number) => t * t * (3 - 2 * t)
/** Overshoot ease, used for pops and punches. */
export const easeOutBack = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2)
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export interface Vec2 {
  x: number
  y: number
}

export const approach = (v: number, target: number, delta: number) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target)
