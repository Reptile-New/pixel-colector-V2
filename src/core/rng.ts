/**
 * Deterministic PRNG (mulberry32). Every run is seeded, which gives us for free:
 *  - the Daily Run (same seed for every player on a given date)
 *  - reproducible bug reports ("run seed 84213 crashed")
 *  - provable, verifiable specimen genomes for the collection album
 */
export class Rng {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0 || 1
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  int(min: number, maxExclusive: number): number {
    return Math.floor(this.range(min, maxExclusive))
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length)]
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  angle(): number {
    return this.next() * Math.PI * 2
  }
}

/** Stable string -> 32-bit seed (FNV-1a). Used for the daily seed. */
export const hashSeed = (str: string): number => {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const randomSeed = (): number => (Math.random() * 0xffffffff) >>> 0
