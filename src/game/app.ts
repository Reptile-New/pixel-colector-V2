import { audio } from '../audio/audio'
import { Input } from '../core/input'
import { clamp } from '../core/math'
import { hashSeed, randomSeed } from '../core/rng'
import { type Challenge, recordDuel, readChallengeFromUrl, sanitizeName } from '../meta/challenge'
import { InstallPrompt } from '../meta/install'
import { LocalLeaderboard } from '../meta/leaderboard'
import { applyRunToMissions, rollMissions } from '../meta/missions'
import {
  type Profile,
  clearAllStorage,
  loadProfile,
  saveProfile,
  saveProfileNow,
  streakMultiplier,
  todayKey,
  touchStreak,
} from '../meta/save'
import {
  MockAdProvider,
  MockIapProvider,
  Monetization,
  type RewardPlacement,
  type Sku,
} from '../monetize/monetization'
import { dayNumber, shareChallenge } from '../meta/share'
import { drawRun } from '../render/drawRun'
import { Particles } from '../render/particles'
import { SKINS, skinById } from '../render/palette'
import { Renderer } from '../render/renderer'
import { type AppApi, type DuelOutcome, type RunResult, Ui } from '../ui/screens'
import { Run } from './run'
import { RARITY_BITS, SPECIMENS } from './specimens'
import { conditionMet, emptyRunStats } from './stats'
import { UPGRADES, resolveMods, upgradeCost } from './upgrades'
import { modifierById } from './waves'

type State = 'menu' | 'running' | 'paused' | 'over'

const fmtBits = (n: number) => Math.round(n).toLocaleString('fr-FR')

export class App implements AppApi {
  profile: Profile
  lastResult: RunResult | null = null
  canRevive = false

  private renderer: Renderer
  private input: Input
  private particles: Particles
  private ui: Ui
  private money: Monetization
  private installer = new InstallPrompt()
  private board = new LocalLeaderboard()

  /** A challenge opened from a link, waiting to be accepted. */
  pendingChallenge: Challenge | null = null
  /** The challenge the current/last run is answering. */
  private activeChallenge: Challenge | null = null

  private run: Run | null = null
  private state: State = 'menu'
  private lastTime = 0
  private clock = 0
  private specimenTimer = 0
  private usedRevive = false
  private hintStage = 0
  private pendingInterstitial = false
  /** Progression déjà créditée pour la run en cours (voir `finalise`). */
  private credited = { score: 0, collected: 0, banks: 0, overclocks: 0, counted: false }
  /** Le doublement de bits n'est offert qu'une fois par run. */
  private bitsDoubled = false

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.profile = loadProfile()
    this.renderer = new Renderer(canvas)
    this.input = new Input(canvas)
    this.particles = new Particles()
    this.money = new Monetization(new MockAdProvider(), new MockIapProvider())
    this.ui = new Ui(uiRoot, this)

    this.rollDailyContent()
    this.applySettings()

    // The install CTA can become available at any moment: re-render the menu
    // when it does, rather than making the player go back and forth.
    this.installer.subscribe(() => {
      if (this.state === 'menu') this.ui.show('menu')
    })

    // Audio must be created inside a user gesture; the first tap anywhere does it.
    const unlock = () => {
      audio.unlock()
      audio.setMuted(this.profile.settings.muted)
      if (this.profile.settings.music) audio.startMusic()
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    // Overclock: space bar, right-click, or a tap on the meter strip (mobile).
    canvas.addEventListener('pointerdown', (e) => {
      if (this.state !== 'running' || !this.run) return
      const r = canvas.getBoundingClientRect()
      const y = e.clientY - r.top
      if (e.button === 2 || y > this.renderer.h - 74) {
        if (this.run.triggerOverclock()) e.preventDefault()
      }
    })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === 'running') this.ui.show('pause'), (this.state = 'paused')
        else if (this.state === 'paused') this.resume()
      }
    })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'running') {
        this.state = 'paused'
        this.ui.show('pause')
      }
      if (document.hidden) saveProfileNow(this.profile)
    })
    window.addEventListener('resize', () => this.run?.layout())

    this.pendingChallenge = readChallengeFromUrl()
    this.ui.show(this.pendingChallenge ? 'challenge' : 'menu')
    requestAnimationFrame(this.frame)
  }

  // ───────────────────────── daily content ─────────────────────────

  private rollDailyContent(): void {
    const today = todayKey()
    if (this.profile.missionDay !== today) {
      this.profile.missionDay = today
      this.profile.missions = rollMissions(today)
    }
    if (this.profile.dailyDay !== today) {
      this.profile.dailyDay = today
      this.profile.dailyPlayed = false
      this.profile.dailyBest = 0
    }
    saveProfile(this.profile)
  }

  private applySettings(): void {
    const s = this.profile.settings
    audio.setMuted(s.muted)
    audio.musicEnabled = s.music
    this.renderer.postEnabled = !s.reducedFx && (navigator.hardwareConcurrency ?? 4) > 3
    this.renderer.shakeScale = s.screenShake ? 1 : 0
  }

  // ───────────────────────── loop ─────────────────────────

  private frame = (now: number): void => {
    const dt = clamp((now - this.lastTime) / 1000, 0, 1 / 20)
    this.lastTime = now
    this.clock += dt

    this.input.poll()

    if (this.state === 'running' && this.run) {
      this.run.update(dt, this.input)
      this.consumeEvents()
      this.checkSpecimens(dt)
      this.updateHints()
      if (this.run.dead) this.endRun()
    }

    this.particles.update(this.state === 'running' ? dt * (this.run?.timeScale ?? 1) : dt)
    this.renderer.update(dt)

    const ctx = this.renderer.begin()
    if (this.run) {
      drawRun(ctx, this.run, this.renderer, skinById(this.profile.skin), this.clock)
    } else {
      this.drawIdleBackdrop(ctx)
    }
    this.renderer.end()

    this.input.endFrame()
    requestAnimationFrame(this.frame)
  }

  /** Surfaces simulation events the shell cares about (banners, telemetry hooks). */
  private consumeEvents(): void {
    if (!this.run) return
    for (const e of this.run.drain()) {
      if (e.type !== 'wave' || e.spec.index === 1) continue
      const mod = modifierById(e.spec.modifier)
      this.ui.toast(mod ? `VAGUE ${e.spec.index} · ${mod.name}` : `VAGUE ${e.spec.index}`, mod ? 'danger' : 'info')
    }
  }

  /** Menu backdrop: a slow drift of ambient pixels so the app is never static. */
  private drawIdleBackdrop(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.renderer
    ctx.fillStyle = '#07070c'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(255,255,255,0.028)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x < w; x += 38) {
      ctx.moveTo(x + 0.5, 0)
      ctx.lineTo(x + 0.5, h)
    }
    for (let y = 0; y < h; y += 38) {
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(w, y + 0.5)
    }
    ctx.stroke()

    if (Math.random() < 0.28) {
      const s = SKINS[0]
      this.particles.streak(Math.random() * w, Math.random() * h, 0, 26, s.glow, 1.6, 2)
    }
    this.particles.draw(ctx)
  }

  // ───────────────────────── run lifecycle ─────────────────────────

  start(daily: boolean): void {
    if (daily && this.profile.dailyPlayed) return
    this.activeChallenge = null
    this.launch(daily ? hashSeed(`daily:${todayKey()}`) : randomSeed(), daily, resolveMods(this.profile.upgrades))
  }

  /** Accepts the challenge currently on screen. */
  acceptChallenge(): void {
    const c = this.pendingChallenge
    if (!c) return
    this.activeChallenge = c
    this.pendingChallenge = null
    // Upgrades are neutralised in a duel. Same seed *and* same stats is the only
    // way the comparison means anything — a maxed account versus a newcomer is
    // not a contest. Bits and specimens are still earned, so nothing is wasted.
    this.launch(c.seed, false, resolveMods({}))
  }

  /** Replays the same arena as the last challenge, to try to beat it again. */
  replayChallenge(): void {
    const c = this.activeChallenge
    if (!c) return
    this.launch(c.seed, false, resolveMods({}))
  }

  private launch(seed: number, daily: boolean, mods: ReturnType<typeof resolveMods>): void {
    audio.unlock()
    if (this.profile.settings.music) audio.startMusic()

    this.particles.clear()
    this.credited = { score: 0, collected: 0, banks: 0, overclocks: 0, counted: false }
    this.bitsDoubled = false
    this.run = new Run(seed, mods, this.renderer, this.particles, daily)
    this.state = 'running'
    this.usedRevive = false
    this.canRevive = false
    this.specimenTimer = 0
    this.hintStage = this.profile.totalRuns < 2 ? 1 : 0
    this.ui.showRunChrome(this.hintStage ? 'RÉCOLTE LES PIXELS' : null)
  }

  resume(): void {
    if (!this.run || this.run.dead) return
    this.state = 'running'
    this.ui.showRunChrome(null)
  }

  quitToMenu(): void {
    if (this.state === 'paused' && this.run && !this.run.dead) {
      // Abandoning mid-run still counts: the player keeps what they banked.
      this.run.syncStats()
      this.finalise(this.run)
    }
    this.run = null
    this.activeChallenge = null
    this.state = 'menu'
    audio.setDanger(0)
    this.rollDailyContent()
    this.maybeInterstitial(() => this.ui.show('menu'))
  }

  retry(): void {
    this.maybeInterstitial(() => {
      if (this.activeChallenge) this.replayChallenge()
      else this.start(this.lastResult?.daily === true && !this.profile.dailyPlayed)
    })
  }

  private endRun(): void {
    if (!this.run) return
    this.state = 'over'
    this.run.syncStats()
    this.canRevive = !this.usedRevive && !this.run.stats.daily && this.money.ads.isRewardedReady()
    this.lastResult = this.finalise(this.run)
    this.ui.show('gameover')
  }

  /**
   * Turns a finished run into profile progression.
   *
   * Runs on every death — and a run can die twice, because a rewarded-ad revive
   * puts the player back in the same run. So everything cumulative is credited
   * as a *delta* against what this run already gave, and the run itself is only
   * counted once. Without this, reviving granted a second full payout of bits,
   * a second +1 run, and double mission progress.
   */
  private finalise(run: Run): RunResult {
    const p = this.profile
    const s = run.stats
    const credited = this.credited

    const gained = {
      score: Math.max(0, s.score - credited.score),
      collected: Math.max(0, s.collected - credited.collected),
      banks: Math.max(0, s.banks - credited.banks),
      overclocks: Math.max(0, s.overclocks - credited.overclocks),
    }

    const previousBest = p.bestScore
    if (!credited.counted) {
      touchStreak(p)
      p.totalRuns += 1
      p.runsSinceAd += 1
      if (s.daily) p.dailyRuns += 1
      credited.counted = true
    }
    p.lifetimeCollected += gained.collected
    p.lifetimeScore += gained.score
    p.bestScore = Math.max(p.bestScore, s.score)
    p.bestWave = Math.max(p.bestWave, s.wave)
    p.bestChain = Math.max(p.bestChain, s.bestChain)
    if (s.daily) {
      p.dailyPlayed = true
      p.dailyBest = Math.max(p.dailyBest, s.score)
    }

    const mods = resolveMods(p.upgrades)
    const base = gained.score / 40 + (credited.counted && credited.score > 0 ? 0 : s.wave * 6) + gained.collected * 0.35
    const bits = Math.max(
      5,
      Math.round(base * (1 + mods.bitBonus) * streakMultiplier(p) * (p.entitlements.pass ? 1.25 : 1)),
    )
    p.bits += bits

    // Specimens: re-check after the profile counters have moved, so lifetime
    // conditions ("play 5 runs") can complete on the run that satisfies them.
    const newSpecimens = this.checkSpecimens(0, true)

    // Missions see the delta for cumulative goals and the real value for
    // "best of" goals, so a revive neither double-counts nor loses progress.
    const completed = applyRunToMissions(p.missions, {
      ...s,
      score: gained.score,
      collected: gained.collected,
      banks: gained.banks,
      overclocks: gained.overclocks,
    })
    for (const m of completed) {
      p.bits += m.reward
      m.claimed = true
      this.ui.toast(`MISSION TERMINÉE · +${m.reward} ⬡`, 'gold')
    }

    // Duel resolution: the rivalry record is what turns a one-off link into an
    // ongoing thing between two people.
    let duel: DuelOutcome | null = null
    const c = this.activeChallenge
    if (c) {
      const r = recordDuel(p.rivals, c.name, s.score, credited.score, todayKey())
      duel = {
        name: c.name,
        theirScore: credited.score,
        yourScore: s.score,
        won: s.score > credited.score,
        delta: Math.abs(s.score - credited.score),
        record: { wins: r.wins, losses: r.losses },
      }
      if (c.day) {
        this.board.record(c.day, { name: c.name, score: credited.score, wave: c.wave, chain: c.chain, you: false })
      }
    }

    if (s.daily && p.name) void this.board.submit(todayKey(), s, p.name)

    credited.score = s.score
    credited.collected = s.collected
    credited.banks = s.banks
    credited.overclocks = s.overclocks

    const isRecord = s.score > 0 && s.score > previousBest
    saveProfileNow(p)

    return {
      stats: { ...s }, bits, newSpecimens, completedMissions: completed.length,
      isRecord, daily: s.daily, duel,
    }
  }

  // ───────────────────────── specimens ─────────────────────────

  /** Live unlock checks. Returns ids unlocked by this call. */
  private checkSpecimens(dt: number, force = false): number[] {
    const silent = force
    this.specimenTimer -= dt
    if (!force && this.specimenTimer > 0) return []
    this.specimenTimer = 0.4

    const p = this.profile
    const stats = this.run?.stats ?? emptyRunStats()
    if (this.run) this.run.syncStats()
    const life = {
      lifetimeCollected: p.lifetimeCollected + (force ? 0 : stats.collected),
      totalRuns: p.totalRuns,
      streak: p.streak,
      dailyRuns: p.dailyRuns,
    }

    const owned = new Set(p.specimens)
    const found: number[] = []
    for (const sp of SPECIMENS) {
      if (owned.has(sp.id)) continue
      if (!conditionMet(sp.cond, stats, life)) continue
      p.specimens.push(sp.id)
      p.bits += RARITY_BITS[sp.rarity]
      found.push(sp.id)
      if (!silent) {
        audio.specimen()
        this.ui.toast(`SPÉCIMEN · ${sp.name} · +${RARITY_BITS[sp.rarity]} ⬡`, 'gold')
        this.renderer.setFlash('#ffc247', 0.14)
      }
    }
    if (found.length) saveProfile(p)
    return found
  }

  // ───────────────────────── hints ─────────────────────────

  private updateHints(): void {
    if (!this.hintStage || !this.run) return
    if (this.hintStage === 1 && this.run.buffer > 120) {
      this.hintStage = 2
      this.ui.showRunChrome('DÉPOSE AU VAULT ▣ POUR SÉCURISER TON SCORE')
    } else if (this.hintStage === 2 && this.run.stats.banks > 0) {
      this.hintStage = 3
      this.ui.showRunChrome('MÊME COULEUR D\'AFFILÉE = MULTIPLICATEUR')
      setTimeout(() => this.ui.clearHint(), 3600)
    }
  }

  // ───────────────────────── monetisation ─────────────────────────

  private maybeInterstitial(after: () => void): void {
    const p = this.profile
    if (this.pendingInterstitial) return
    if (!this.money.shouldShowInterstitial(p.runsSinceAd, p.totalRuns, p.entitlements.noAds)) {
      after()
      return
    }
    this.pendingInterstitial = true
    p.runsSinceAd = 0
    saveProfile(p)
    void this.money.ads.showInterstitial().then(() => {
      this.pendingInterstitial = false
      after()
    })
  }

  revive(): void {
    if (!this.canRevive || !this.run) return
    void this.money.ads.showRewarded('continue').then((ok) => {
      if (!ok || !this.run) return
      this.usedRevive = true
      this.canRevive = false
      this.run.revive()
      this.state = 'running'
      this.ui.showRunChrome(null)
      this.ui.toast('CONTINUE — 1 ÉCLAT RESTAURÉ')
    })
  }

  doubleBits(): void {
    // One doubling per run, full stop. Without this guard each click added the
    // already-doubled amount again, so the reward compounded without limit.
    if (this.bitsDoubled) return
    const r = this.lastResult
    if (!r || !this.money.ads.isRewardedReady()) return
    this.bitsDoubled = true
    void this.money.ads.showRewarded('doubleBits').then((ok) => {
      if (!ok || !this.lastResult) {
        this.bitsDoubled = false // ad dismissed: the offer stays available
        this.ui.show('gameover')
        return
      }
      const bonus = this.lastResult.bits
      this.profile.bits += bonus
      this.lastResult = { ...this.lastResult, bits: this.lastResult.bits * 2 }
      saveProfileNow(this.profile)
      this.ui.toast(`+${fmtBits(bonus)} ⬡ BONUS`, 'gold')
      this.ui.show('gameover')
    })
  }

  get rewardedReady(): boolean {
    return this.money.ads.isRewardedReady() && this.lastResult !== null && !this.bitsDoubled
  }

  purchase(sku: Sku): void {
    void this.money.iap.purchase(sku).then((ok) => {
      if (!ok) return
      const p = this.profile
      if (sku === 'no_ads') {
        p.entitlements.noAds = true
        if (!p.ownedSkins.includes('gold')) p.ownedSkins.push('gold')
        this.ui.toast('PUBLICITÉS SUPPRIMÉES · SKIN COLLECTOR DÉBLOQUÉ', 'gold')
      } else if (sku === 'collector_pass') {
        p.entitlements.pass = true
        this.ui.toast('PASS COLLECTOR ACTIF · +25 % DE BITS', 'gold')
      } else if (sku === 'skin_gold') {
        if (!p.ownedSkins.includes('gold')) p.ownedSkins.push('gold')
        this.ui.toast('SKIN COLLECTOR DÉBLOQUÉ', 'gold')
      }
      saveProfileNow(p)
      this.ui.show('shop')
    })
  }

  watchRewarded(placement: RewardPlacement): void {
    void this.money.ads.showRewarded(placement)
  }

  // ───────────────────────── meta actions ─────────────────────────

  buyUpgrade(id: string): void {
    const p = this.profile
    const def = UPGRADES.find((u) => u.id === id)
    if (!def) return
    const lv = p.upgrades[id] ?? 0
    if (lv >= def.maxLevel) return
    const cost = upgradeCost(def, lv)
    if (p.bits < cost) {
      audio.ui('deny')
      return
    }
    p.bits -= cost
    p.upgrades[id] = lv + 1
    audio.ui('confirm')
    this.ui.toast(`${def.name} NIVEAU ${lv + 1}`)
    saveProfileNow(p)
  }

  buySkin(id: string): void {
    const p = this.profile
    const skin = SKINS.find((s) => s.id === id)
    if (!skin || skin.unlock.kind !== 'bits') return
    if (p.ownedSkins.includes(id) || p.bits < skin.unlock.cost) {
      audio.ui('deny')
      return
    }
    p.bits -= skin.unlock.cost
    p.ownedSkins.push(id)
    p.skin = id
    audio.ui('confirm')
    saveProfileNow(p)
  }

  equipSkin(id: string): void {
    const p = this.profile
    const skin = SKINS.find((s) => s.id === id)
    if (!skin) return
    const unlocked =
      skin.unlock.kind === 'default' ||
      p.ownedSkins.includes(id) ||
      (skin.unlock.kind === 'album' && p.specimens.length >= skin.unlock.count)
    if (!unlocked) {
      audio.ui('deny')
      return
    }
    p.skin = id
    audio.ui('tick')
    saveProfileNow(p)
  }

  setSetting(key: 'muted' | 'music' | 'reducedFx' | 'screenShake', value: boolean): void {
    this.profile.settings[key] = value
    this.applySettings()
    if (key === 'music') value ? audio.startMusic() : audio.stopMusic()
    saveProfileNow(this.profile)
  }

  resetProgress(): void {
    // Must clear the leaderboard too: it lives under its own key, so removing
    // only the profile left duel history behind after a "full" reset.
    clearAllStorage()
    this.profile = loadProfile()
    this.rollDailyContent()
    this.applySettings()

    // The install CTA can become available at any moment: re-render the menu
    // when it does, rather than making the player go back and forth.
    this.installer.subscribe(() => {
      if (this.state === 'menu') this.ui.show('menu')
    })
  }

  toast(msg: string, kind: 'info' | 'gold' | 'danger' = 'info'): void {
    this.ui.toast(msg, kind)
  }

  // ───────────────────────── social ─────────────────────────

  declineChallenge(): void {
    this.pendingChallenge = null
    this.ui.show('menu')
  }

  get playerName(): string {
    return this.profile.name
  }

  setName(name: string): void {
    this.profile.name = sanitizeName(name)
    saveProfileNow(this.profile)
  }

  /** Share the last run as a challenge on the very same seed. */
  shareRun(): void {
    const r = this.lastResult
    if (!r || !this.run) return
    if (!this.profile.name) {
      const entered = prompt('Ton pseudo (visible par tes potes) :', '')
      if (!entered) return
      this.setName(entered)
    }
    const challenge = {
      name: this.profile.name,
      seed: this.run.seed,
      score: r.stats.score,
      wave: r.stats.wave,
      chain: r.stats.bestChain,
      day: r.daily ? todayKey() : '',
    }
    void shareChallenge(challenge, r.stats, r.daily ? dayNumber(todayKey()) : null).then((outcome) => {
      if (outcome === 'copied') this.ui.toast('LIEN COPIÉ — COLLE-LE DANS TA CONVERSATION', 'gold')
      else if (outcome === 'failed') this.ui.toast('PARTAGE IMPOSSIBLE SUR CE NAVIGATEUR', 'danger')
    })
  }

  get canInstall(): boolean {
    return this.installer.canOffer
  }

  install(): void {
    void this.installer.run().then((message) => {
      if (message) this.ui.toast(message, 'gold')
    })
  }

}
