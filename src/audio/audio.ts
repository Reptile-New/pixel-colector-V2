import { clamp } from '../core/math'

/**
 * 100% procedural WebAudio. No asset, no loading screen, ~6 KB of code for a full
 * soundtrack + SFX set.
 *
 * The single most important line in this file is in `collect()`: the blip is
 * transposed *upward with the chain*. An ascending reward tone is the oldest
 * dopamine trick in arcade design and it does more for retention than any visual.
 */
export class AudioBus {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private sfxBus!: GainNode
  private musicBus!: GainNode
  private droneGain!: GainNode
  private droneOsc!: OscillatorNode
  private noiseBuffer!: AudioBuffer

  muted = false
  musicEnabled = true

  // Sequencer state
  private nextNoteTime = 0
  private step = 0
  private timer: number | null = null
  private intensity = 0
  private bpm = 124

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    this.ctx = ctx

    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 9
    comp.attack.value = 0.003
    comp.release.value = 0.22

    this.master = ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(comp)
    comp.connect(ctx.destination)

    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = 0.85
    this.sfxBus.connect(this.master)

    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = 0.4
    this.musicBus.connect(this.master)

    // Pre-rendered white noise, reused for every percussive/impact sound.
    const len = Math.floor(ctx.sampleRate * 1.2)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = buf

    // Danger drone: always running, gain driven by how much unbanked score is at risk.
    this.droneOsc = ctx.createOscillator()
    this.droneOsc.type = 'sawtooth'
    this.droneOsc.frequency.value = 55
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 220
    this.droneGain = ctx.createGain()
    this.droneGain.gain.value = 0
    this.droneOsc.connect(lp)
    lp.connect(this.droneGain)
    this.droneGain.connect(this.master)
    this.droneOsc.start()
  }

  get ready(): boolean {
    return this.ctx !== null && !this.muted
  }

  setMuted(m: boolean): void {
    this.muted = m
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05)
  }

  // ─────────────────────────── SFX ───────────────────────────

  private env(
    type: OscillatorType,
    freq: number,
    dur: number,
    vol: number,
    bend = 1,
    dest?: AudioNode,
  ): void {
    const ctx = this.ctx
    if (!ctx || this.muted) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (bend !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * bend), t + dur)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g)
    g.connect(dest ?? this.sfxBus)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  private noise(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx
    if (!ctx || this.muted) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq, t)
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f)
    f.connect(g)
    g.connect(this.sfxBus)
    src.start(t)
    src.stop(t + dur)
  }

  /** The chain ladder. `chain` 1..n transposes the note up the pentatonic scale. */
  collect(baseNote: number, chain: number): void {
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36]
    const semi = steps[Math.min(chain - 1, steps.length - 1)]
    const f = baseNote * Math.pow(2, semi / 12)
    this.env('triangle', f, 0.13, 0.3)
    this.env('square', f * 2, 0.06, 0.055)
  }

  bank(magnitude: number): void {
    // Major-ish arpeggio, longer and brighter the bigger the bank.
    const root = 261.63
    const notes = [1, 1.25, 1.5, 2, 2.5, 3]
    const n = clamp(Math.floor(2 + magnitude * 4), 2, notes.length)
    const ctx = this.ctx
    if (!ctx) return
    for (let i = 0; i < n; i++) {
      setTimeout(() => this.env('triangle', root * notes[i] * 2, 0.3, 0.24, 1), i * 52)
    }
    this.noise(0.4, 0.12, 2600, 0.7, 'highpass')
  }

  hit(): void {
    this.env('sawtooth', 180, 0.35, 0.3, 0.18)
    this.noise(0.32, 0.32, 700, 0.6)
  }

  overclock(): void {
    this.env('sawtooth', 110, 0.7, 0.22, 7)
    this.noise(0.7, 0.14, 1400, 0.4, 'highpass')
  }

  overclockEnd(): void {
    this.env('sawtooth', 800, 0.4, 0.16, 0.14)
  }

  specimen(): void {
    const root = 523.25
    ;[1, 1.5, 2, 3].forEach((m, i) => setTimeout(() => this.env('sine', root * m, 0.55, 0.2), i * 90))
  }

  gameOver(): void {
    this.env('sawtooth', 220, 1.3, 0.24, 0.1)
    this.noise(1.1, 0.16, 400, 0.5, 'lowpass')
  }

  ui(kind: 'tick' | 'confirm' | 'deny' = 'tick'): void {
    if (kind === 'tick') this.env('square', 880, 0.04, 0.07)
    else if (kind === 'confirm') {
      this.env('triangle', 660, 0.1, 0.16)
      setTimeout(() => this.env('triangle', 990, 0.14, 0.14), 60)
    } else this.env('square', 160, 0.16, 0.14, 0.6)
  }

  /** 0..1 — how much unbanked score is at risk. Drives the tension drone. */
  setDanger(v: number): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.droneGain.gain.setTargetAtTime(this.muted ? 0 : clamp(v, 0, 1) * 0.1, t, 0.35)
    this.droneOsc.frequency.setTargetAtTime(55 + v * 24, t, 0.5)
  }

  // ─────────────────────────── Music ───────────────────────────

  startMusic(): void {
    if (!this.ctx || this.timer !== null) return
    this.nextNoteTime = this.ctx.currentTime + 0.1
    this.step = 0
    this.timer = window.setInterval(() => this.schedule(), 25)
  }

  stopMusic(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 0..1 — layers come in as the run escalates. */
  setIntensity(v: number): void {
    this.intensity = clamp(v, 0, 1)
  }

  private schedule(): void {
    const ctx = this.ctx
    if (!ctx) return
    const stepDur = 60 / this.bpm / 4
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextNoteTime)
      this.nextNoteTime += stepDur
      this.step = (this.step + 1) % 32
    }
  }

  private playStep(step: number, time: number): void {
    const ctx = this.ctx
    if (!ctx || this.muted || !this.musicEnabled) return
    const bus = this.musicBus
    const i = this.intensity

    // Kick — the spine, always there.
    if (step % 8 === 0) this.tone('sine', 120, 0.22, 0.5, time, bus, 0.25)
    // Bass — natural minor root movement.
    if (step % 4 === 0) {
      const roots = [55, 55, 65.41, 49]
      const r = roots[Math.floor(step / 8) % roots.length]
      this.tone('sawtooth', r, 0.22, 0.24, time, bus, 1)
    }
    // Hats from ~40% intensity.
    if (i > 0.35 && step % 2 === 1) this.hat(time, 0.05 + i * 0.05)
    // Arpeggio from ~55%.
    if (i > 0.55) {
      const scale = [0, 3, 5, 7, 10, 12, 15]
      const semi = scale[(step * 3) % scale.length]
      const f = 220 * Math.pow(2, semi / 12)
      this.tone('square', f, 0.09, 0.06 + i * 0.05, time, bus, 1)
    }
    // Lead stabs at high intensity.
    if (i > 0.8 && step % 16 === 12) this.tone('triangle', 440, 0.3, 0.1, time, bus, 1)
  }

  private tone(
    type: OscillatorType, freq: number, dur: number, vol: number,
    time: number, dest: AudioNode, bend: number,
  ): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, time)
    if (bend !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * bend), time + dur)
    g.gain.setValueAtTime(0, time)
    g.gain.linearRampToValueAtTime(vol, time + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur)
    osc.connect(g)
    g.connect(dest)
    osc.start(time)
    osc.stop(time + dur + 0.02)
  }

  private hat(time: number, vol: number): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7000
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, time)
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05)
    src.connect(f)
    f.connect(g)
    g.connect(this.musicBus)
    src.start(time)
    src.stop(time + 0.06)
  }
}

export const audio = new AudioBus()
