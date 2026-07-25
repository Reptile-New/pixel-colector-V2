import { RARITY_BITS, RARITY_COLOR, SPECIMENS, conditionLabel, drawGenome } from '../game/specimens'
import type { RunStats } from '../game/stats'
import { UPGRADES, upgradeCost } from '../game/upgrades'
import { missionLabel } from '../meta/missions'
import type { Profile } from '../meta/save'
import { streakMultiplier } from '../meta/save'
import { PRODUCTS, type RewardPlacement, type Sku } from '../monetize/monetization'
import { SKINS } from '../render/palette'

export type ScreenId =
  | 'none' | 'menu' | 'album' | 'upgrades' | 'shop' | 'settings' | 'gameover' | 'pause'
  | 'challenge' | 'rivals' | 'intro' | 'daily'

export interface DuelOutcome {
  name: string
  theirScore: number
  yourScore: number
  won: boolean
  /** Absolute point gap, so the UI never has to do the arithmetic. */
  delta: number
  record: { wins: number; losses: number }
}

export interface RunResult {
  stats: RunStats
  /** Bits earned by the run itself — the only part the ×2 reward doubles. */
  bits: number
  /** Credited on top of `bits`. Shown separately: a reward the player never
   *  sees is a reward they believe they never got. */
  missionBits: number
  specimenBits: number
  completedMissionLabels: string[]
  newSpecimens: number[]
  completedMissions: number
  isRecord: boolean
  daily: boolean
  duel: DuelOutcome | null
}

/** What the UI is allowed to ask the app to do. Keeps the DOM layer dumb. */
export interface AppApi {
  profile: Profile
  lastResult: RunResult | null
  canRevive: boolean
  rewardedReady: boolean
  start(daily: boolean): void
  resume(): void
  quitToMenu(): void
  retry(): void
  revive(): void
  doubleBits(): void
  buyUpgrade(id: string): void
  buySkin(id: string): void
  equipSkin(id: string): void
  purchase(sku: Sku): void
  watchRewarded(p: RewardPlacement): void
  setSetting(key: 'muted' | 'music' | 'reducedFx' | 'screenShake', value: boolean): void
  resetProgress(): void
  toast(msg: string, kind?: 'info' | 'gold' | 'danger'): void
  canInstall: boolean
  install(): void
  pendingChallenge: { name: string; score: number; wave: number; chain: number } | null
  acceptChallenge(): void
  declineChallenge(): void
  shareRun(): void
  playerName: string
  setName(name: string): void
  startTutorial(): void
  tutorialNext(): void
  tutorialSkip(): void
  inTutorial: boolean
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')

const el = (html: string): HTMLElement => {
  const t = document.createElement('div')
  t.innerHTML = html.trim()
  return t.firstElementChild as HTMLElement
}

export class Ui {
  private root: HTMLElement
  private toasts: HTMLElement
  private current: ScreenId = 'none'
  private albumSelection = 0
  private shopTab: 'skins' | 'store' = 'skins'
  /** Defilement memorise par ecran : acheter une amelioration reconstruit
   *  l'ecran, et sans ca la liste sautait en haut a chaque achat. */
  private scrollMemory = new Map<ScreenId, number>()

  constructor(root: HTMLElement, private app: AppApi) {
    this.root = root
    this.toasts = el('<div id="toasts"></div>')
    root.appendChild(this.toasts)

    // One delegated listener for every screen: no per-render binding leaks.
    root.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null
      if (!target) return
      const act = target.dataset.act!
      const arg = target.dataset.arg ?? ''
      this.dispatch(act, arg)
    })
  }

  get screen(): ScreenId {
    return this.current
  }

  private dispatch(act: string, arg: string): void {
    const a = this.app
    switch (act) {
      case 'start': a.start(false); break
      case 'daily': this.show('daily'); break
      case 'dailyGo': a.start(true); break
      case 'go':
        // Entering a screen on purpose starts at the top; only in-place
        // refreshes (a purchase, a toggle) keep the scroll position.
        this.scrollMemory.delete(arg as ScreenId)
        this.show(arg as ScreenId)
        break
      case 'menu': a.quitToMenu(); break
      case 'install': a.install(); break
      case 'tuto': a.startTutorial(); break
      case 'tutoNext': a.tutorialNext(); break
      case 'tutoSkip': a.tutorialSkip(); break
      case 'accept': a.acceptChallenge(); break
      case 'decline': a.declineChallenge(); break
      case 'share': a.shareRun(); break
      case 'name': {
        const entered = prompt('Ton pseudo (visible par tes potes) :', a.playerName)
        if (entered !== null) a.setName(entered)
        this.show(this.current)
        break
      }
      case 'resume': a.resume(); break
      case 'retry': a.retry(); break
      case 'revive': a.revive(); break
      case 'double': a.doubleBits(); break
      case 'buyUp': a.buyUpgrade(arg); this.show('upgrades'); break
      case 'buySkin': a.buySkin(arg); this.show('shop'); break
      case 'equip': a.equipSkin(arg); this.show('shop'); break
      case 'purchase': a.purchase(arg as Sku); break
      case 'spec': this.albumSelection = Number(arg); this.show('album'); break
      case 'tab': this.shopTab = arg as 'skins' | 'store'; this.show('shop'); break
      case 'setting': {
        const key = arg as 'muted' | 'music' | 'reducedFx' | 'screenShake'
        a.setSetting(key, !a.profile.settings[key])
        this.show('settings')
        break
      }
      case 'reset':
        if (confirm('Effacer toute la progression (bits, album, améliorations) ?')) {
          a.resetProgress()
          this.show('menu')
        }
        break
    }
  }

  toast(msg: string, kind: 'info' | 'gold' | 'danger' = 'info'): void {
    const t = el(`<div class="toast ${kind === 'info' ? '' : kind}">${msg}</div>`)
    this.toasts.appendChild(t)
    setTimeout(() => {
      t.style.transition = 'opacity .3s, transform .3s'
      t.style.opacity = '0'
      t.style.transform = 'translateY(-8px)'
      setTimeout(() => t.remove(), 320)
    }, 2400)
  }

  show(id: ScreenId): void {
    // Capture where the player was before tearing the screen down.
    const previous = this.root.querySelector('.screen')
    if (previous && this.current === id) {
      const scroller = previous.querySelector('.scroll') ?? previous
      this.scrollMemory.set(id, scroller.scrollTop)
    }

    this.current = id
    this.root.querySelectorAll('.screen, .pause-btn, .hint, .tuto, .tuto-skip-float').forEach((n) => n.remove())
    if (id === 'none') return

    const builders: Record<Exclude<ScreenId, 'none'>, () => HTMLElement> = {
      menu: () => this.menu(),
      album: () => this.album(),
      upgrades: () => this.upgrades(),
      shop: () => this.shop(),
      settings: () => this.settings(),
      gameover: () => this.gameOver(),
      pause: () => this.pause(),
      challenge: () => this.challenge(),
      rivals: () => this.rivals(),
      intro: () => this.intro(),
      daily: () => this.daily(),
    }
    const screen = builders[id]()
    this.root.appendChild(screen)

    const restore = this.scrollMemory.get(id)
    if (restore) {
      const scroller = screen.querySelector('.scroll') ?? screen
      // The element is in the DOM but not yet laid out; wait one frame so
      // scrollHeight is real, otherwise the assignment is clamped to 0.
      requestAnimationFrame(() => {
        scroller.scrollTop = restore
      })
    }
  }

  /**
   * In-run chrome. The old floating hint line lived here too; the guided tutorial
   * replaced it, and it was overlapping the overclock label at the bottom.
   */
  showRunChrome(_hint: string | null = null): void {
    this.root.querySelectorAll('.screen, .pause-btn, .hint, .tuto, .tuto-skip-float').forEach((n) => n.remove())
    this.current = 'none'
    this.root.appendChild(el('<button class="pause-btn ghost" data-act="go" data-arg="pause">PAUSE</button>'))
  }

  /**
   * Tutorial panel. `pointer-events: none` on the box and `auto` on the button:
   * the player has to be able to drag *through* the panel to move, otherwise the
   * very first instruction would be impossible to follow.
   */
  /** Chrome minimal pendant une étape d'action : rien qui masque le terrain. */
  showTutorialSkip(): void {
    this.root.querySelectorAll('.screen, .hint, .tuto').forEach((n) => n.remove())
    this.current = 'none'
    if (!this.root.querySelector('.pause-btn')) {
      this.root.appendChild(el('<button class="pause-btn ghost" data-act="go" data-arg="pause">PAUSE</button>'))
    }
    if (!this.root.querySelector('.tuto-skip-float')) {
      this.root.appendChild(el('<button class="tuto-skip-float" data-act="tutoSkip">PASSER LE TUTO</button>'))
    }
  }

  showTutorial(
    text: string,
    button: string | null,
    progress: { current: number; total: number },
    low = false,
  ): void {
    this.root.querySelectorAll('.screen, .hint, .tuto, .tuto-skip-float').forEach((n) => n.remove())
    this.current = 'none'
    if (!this.root.querySelector('.pause-btn')) {
      this.root.appendChild(el('<button class="pause-btn ghost" data-act="go" data-arg="pause">PAUSE</button>'))
    }
    const dots = Array.from(
      { length: progress.total },
      (_, i) => `<i class="${i < progress.current ? 'on' : ''}"></i>`,
    ).join('')
    this.root.appendChild(
      el(`<div class="tuto${low ? ' low' : ''}">
        <div class="tuto-box">
          <div class="tuto-dots">${dots}</div>
          <div class="tuto-text">${text}</div>
          ${button ? `<button class="primary tuto-next" data-act="tutoNext">${button}</button>` : '<div class="tuto-wait">À TOI DE JOUER…</div>'}
          <button class="tuto-skip" data-act="tutoSkip">PASSER LE TUTO</button>
        </div>
      </div>`),
    )
  }

  // ───────────────────────── screens ─────────────────────────

  private topbar(): string {
    const p = this.app.profile
    return `<div class="topbar">
      <span class="bits">⬡ ${fmt(p.bits)}</span>
      <span style="color:var(--dim)">SÉRIE ${p.streak}J ×${streakMultiplier(p).toFixed(2)}</span>
      <span class="spacer"></span>
      <span style="color:var(--dim)">${p.specimens.length}/${SPECIMENS.length} SPÉCIMENS</span>
    </div>`
  }

  private menu(): HTMLElement {
    const p = this.app.profile
    const missions = p.missions
      .map((m) => {
        const pct = Math.min(100, (m.progress / m.target) * 100)
        const done = m.progress >= m.target
        return `<div class="mission ${done ? 'done' : ''}">
          <div class="t">
            <span style="${done ? 'color:var(--dim);text-decoration:line-through' : ''}">${missionLabel(m)}</span>
            <b>${done ? `✓ +${m.reward} REÇUS` : `+${m.reward}`}</b>
          </div>
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>`
      })
      .join('')

    const dailyDone = p.dailyPlayed
    return el(`<div class="screen">
      ${this.topbar()}
      <h1 class="title">PIXEL<span>COLLECTOR</span></h1>
      <div class="tagline">RÉCOLTE · RISQUE · BANQUE</div>

      <div class="stack">
        <button class="primary" data-act="start">JOUER</button>
        <button class="gold" data-act="daily">
          ${dailyDone ? `RUN DU JOUR TERMINÉE — ${fmt(p.dailyBest)}` : 'RUN DU JOUR · 1 ESSAI'}
        </button>
        <div class="row">
          <button data-act="go" data-arg="album">ALBUM</button>
          <button data-act="go" data-arg="upgrades">AMÉLIORER</button>
        </div>
        <div class="row">
          <button data-act="go" data-arg="rivals">RIVALITÉS${p.rivals.length ? ` (${p.rivals.length})` : ''}</button>
          <button data-act="go" data-arg="shop">BOUTIQUE</button>
        </div>
        <div class="row">
          <button data-act="tuto">COMMENT JOUER</button>
          <button data-act="go" data-arg="settings">OPTIONS</button>
        </div>
      </div>

      <div class="chips">
        <div class="chip">RECORD <b>${fmt(p.bestScore)}</b></div>
        <div class="chip">VAGUE MAX <b>${p.bestWave}</b></div>
        <div class="chip">CHAÎNE MAX <b>${p.bestChain}</b></div>
        <div class="chip">RUNS <b>${p.totalRuns}</b></div>
      </div>

      ${this.app.canInstall ? '<div class="stack" style="margin-top:12px"><button data-act="install">⬇ AJOUTER À L\'ÉCRAN D\'ACCUEIL</button></div>' : ''}

      ${
        p.missions.length
          ? `<div class="panel" style="margin-top:14px"><h2>MISSIONS DU JOUR</h2>${missions}
             <div class="footnote" style="margin-top:10px">Les bits sont versés automatiquement en fin de partie. Rien à réclamer.</div></div>`
          : ''
      }
      <div class="footnote" style="text-align:center;max-width:420px">
        Souris / doigt pour te déplacer · ESPACE pour l'overclock<br>
        Le score en risque n'est à toi qu'une fois déposé au vault.
      </div>
    </div>`)
  }

  /** First-ever launch. One decision, phrased so the answer is obvious. */
  private intro(): HTMLElement {
    return el(`<div class="screen">
      <h1 class="title">PIXEL<span>COLLECTOR</span></h1>
      <div class="tagline">RÉCOLTE · RISQUE · BANQUE</div>

      <div class="panel">
        <div class="footnote" style="font-size:12px;line-height:1.8">
          Tu ramasses des pixels. Ils s'accumulent dans un <b style="color:var(--gold)">buffer</b>
          qui n'est <b>pas encore à toi</b>.<br><br>
          Pour le garder, tu dois le déposer au <b style="color:var(--gold)">vault</b>.
          Si tu te fais toucher avant, <b style="color:var(--danger)">tu perds tout</b>.<br><br>
          Ça s'apprend en une minute, manette en main.
        </div>
      </div>

      <div class="stack">
        <button class="primary" data-act="tuto">APPRENDRE À JOUER · 1 MIN</button>
        <button class="ghost small" data-act="start">NON MERCI, JE ME LANCE</button>
      </div>
    </div>`)
  }

  /** The Daily Run needs explaining: one shot, same arena for everyone, today only. */
  private daily(): HTMLElement {
    const p = this.app.profile
    const played = p.dailyPlayed
    return el(`<div class="screen">
      ${this.topbar()}
      <h1 class="title" style="font-size:clamp(24px,7vw,38px)">RUN DU JOUR</h1>
      <div class="tagline">MÊME PARTIE POUR TOUT LE MONDE</div>

      <div class="panel">
        <div class="footnote" style="font-size:12px;line-height:1.8">
          Chaque jour, le jeu génère <b>une arène identique pour tous les joueurs</b> :
          mêmes pixels, mêmes traqueurs, mêmes vagues.<br><br>
          Tu n'as droit qu'à <b>un seul essai</b>. Pas de seconde chance, pas de
          relance jusqu'à avoir de la chance — c'est ce qui rend la comparaison honnête.<br><br>
          À la fin, tu peux <b>envoyer ton score à tes potes</b> : ils joueront
          exactement la même partie que toi.
        </div>
      </div>

      ${
        played
          ? `<div class="panel"><div class="kv"><span>TON SCORE DU JOUR</span><span style="color:var(--gold)">${fmt(p.dailyBest)}</span></div>
             <div class="footnote" style="margin-top:8px">Reviens demain pour une nouvelle arène.</div></div>`
          : ''
      }

      <div class="stack">
        <button class="gold" data-act="dailyGo" ${played ? 'disabled' : ''}>
          ${played ? 'DÉJÀ JOUÉE AUJOURD\'HUI' : 'LANCER — UN SEUL ESSAI'}
        </button>
        <button data-act="menu">RETOUR</button>
      </div>
    </div>`)
  }

  private pause(): HTMLElement {
    return el(`<div class="screen">
      <h1 class="title" style="font-size:34px">PAUSE</h1>
      <div class="stack" style="margin-top:20px">
        <button class="primary" data-act="resume">REPRENDRE</button>
        <button data-act="go" data-arg="settings">OPTIONS</button>
        <button class="ghost" data-act="menu">ABANDONNER LA RUN</button>
      </div>
    </div>`)
  }

  private gameOver(): HTMLElement {
    const r = this.app.lastResult
    if (!r) return this.menu()
    const s = r.stats
    const specs = r.newSpecimens
      .map((id) => {
        const sp = SPECIMENS[id]
        return `<div class="kv"><span style="color:${RARITY_COLOR[sp.rarity]}">${sp.rarity.toUpperCase()}</span><span>${sp.name} <b style="color:var(--gold)">+${RARITY_BITS[sp.rarity]}</b></span></div>`
      })
      .join('')

    const d = r.duel
    const duelPanel = d
      ? `<div class="panel" style="border-color:${d.won ? 'rgba(77,249,214,.45)' : 'rgba(255,46,85,.45)'}">
          <h2>DUEL CONTRE ${d.name}</h2>
          <div class="big-score" style="font-size:clamp(22px,7vw,34px);color:${d.won ? 'var(--accent)' : 'var(--danger)'}">
            ${d.won ? `TU GAGNES DE ${fmt(d.delta)}` : `IL T'EN MANQUE ${fmt(d.delta)}`}
          </div>
          <div class="kv" style="margin-top:10px"><span>SON SCORE</span><span>${fmt(d.theirScore)}</span></div>
          <div class="kv"><span>LE TIEN</span><span>${fmt(d.yourScore)}</span></div>
          <div class="kv" style="border-top:1px solid var(--line);padding-top:10px;margin-top:6px">
            <span>BILAN FACE À LUI</span><span>${d.record.wins}V — ${d.record.losses}D</span>
          </div>
        </div>`
      : ''

    return el(`<div class="screen">
      ${this.topbar()}
      <div class="big-score">${fmt(s.score)}</div>
      <div class="big-label">${r.daily ? 'RUN DU JOUR' : d ? 'DUEL' : 'SCORE FINAL'}</div>
      ${r.isRecord ? '<div class="record">★ NOUVEAU RECORD ★</div>' : ''}
      ${duelPanel}

      <div class="panel" style="margin-top:18px">
        <div class="kv"><span>VAGUE ATTEINTE</span><span>${s.wave}</span></div>
        <div class="kv"><span>PIXELS RÉCOLTÉS</span><span>${s.collected}</span></div>
        <div class="kv"><span>MEILLEURE CHAÎNE</span><span>${s.bestChain}</span></div>
        <div class="kv"><span>MEILLEUR MULTIPLICATEUR</span><span>×${s.bestMult}</span></div>
        <div class="kv"><span>PLUS GROS DÉPÔT</span><span>${fmt(s.bestBank)}</span></div>
        <div class="kv"><span>DURÉE</span><span>${Math.floor(s.durationSec / 60)}:${String(Math.floor(s.durationSec % 60)).padStart(2, '0')}</span></div>
        <div class="kv" style="border-top:1px solid var(--line);margin-top:6px;padding-top:10px">
          <span>BITS DE LA RUN</span><span style="color:var(--gold)">⬡ ${fmt(r.bits)}</span>
        </div>
        ${r.missionBits ? `<div class="kv"><span>MISSIONS TERMINÉES</span><span style="color:var(--gold)">+ ${fmt(r.missionBits)}</span></div>` : ''}
        ${r.specimenBits ? `<div class="kv"><span>SPÉCIMENS CAPTURÉS</span><span style="color:var(--gold)">+ ${fmt(r.specimenBits)}</span></div>` : ''}
        ${
          r.missionBits || r.specimenBits
            ? `<div class="kv" style="border-top:1px solid var(--line);margin-top:6px;padding-top:10px">
                 <span style="color:var(--text)">TOTAL EMPOCHÉ</span>
                 <span style="color:var(--gold);font-size:16px">⬡ ${fmt(r.bits + r.missionBits + r.specimenBits)}</span>
               </div>`
            : ''
        }
      </div>

      ${specs ? `<div class="panel"><h2>NOUVEAUX SPÉCIMENS</h2>${specs}</div>` : ''}
      ${
        r.completedMissionLabels.length
          ? `<div class="panel"><h2>MISSIONS DU JOUR TERMINÉES</h2>${r.completedMissionLabels
              .map((label) => `<div class="kv"><span style="color:var(--accent)">✓ ${label}</span></div>`)
              .join('')}</div>`
          : ''
      }

      <div class="stack">
        <button class="primary" data-act="share">${d ? '↩ RENVOYER LE DÉFI' : '⚔ DÉFIER UN POTE'}</button>
        ${this.app.canRevive ? '<button class="gold" data-act="revive">▶ CONTINUER — REGARDER UNE PUB</button>' : ''}
        <button class="gold" data-act="double" ${this.app.rewardedReady ? '' : 'disabled'}>
          ${this.app.rewardedReady ? '×2 BITS — REGARDER UNE PUB' : 'BITS DÉJÀ DOUBLÉS'}
        </button>
        <button data-act="retry">REJOUER</button>
        <div class="row">
          <button data-act="go" data-arg="album">ALBUM</button>
          <button data-act="go" data-arg="upgrades">AMÉLIORER</button>
        </div>
        <button class="ghost small" data-act="menu">MENU</button>
      </div>
    </div>`)
  }

  /** Landing screen when the player opens a friend's link. */
  private challenge(): HTMLElement {
    const c = this.app.pendingChallenge
    if (!c) return this.menu()
    return el(`<div class="screen">
      <div class="tagline" style="margin-bottom:8px">UN DÉFI T'ATTEND</div>
      <h1 class="title" style="font-size:clamp(26px,7vw,44px)">${c.name}</h1>
      <div class="big-score" style="color:var(--gold);margin-top:10px">${fmt(c.score)}</div>
      <div class="big-label">SON SCORE</div>

      <div class="panel" style="margin-top:20px">
        <div class="kv"><span>VAGUE ATTEINTE</span><span>${c.wave}</span></div>
        <div class="kv"><span>MEILLEURE CHAÎNE</span><span>×${c.chain}</span></div>
      </div>

      <div class="panel">
        <h2>RÈGLES DU DUEL</h2>
        <div class="footnote">
          Tu vas jouer <b>exactement la même arène</b> : mêmes pixels, mêmes traqueurs,
          mêmes vagues. Rien n'est laissé au hasard.<br><br>
          Tes améliorations sont <b>neutralisées</b> des deux côtés — sinon un compte
          bien équipé gagnerait sans jouer. Tu gagnes quand même tes bits et tes spécimens.
        </div>
      </div>

      <div class="stack">
        <button class="primary" data-act="accept">RELEVER LE DÉFI</button>
        <button class="ghost small" data-act="decline">PLUS TARD — ALLER AU MENU</button>
      </div>
    </div>`)
  }

  /** Head-to-head record against everyone who has ever sent or received a link. */
  private rivals(): HTMLElement {
    const p = this.app.profile
    const sorted = [...p.rivals].sort((a, b) => b.wins + b.losses - (a.wins + a.losses))
    const rows = sorted
      .map((r) => {
        const total = r.wins + r.losses
        const pct = total ? (r.wins / total) * 100 : 0
        const lead = r.wins > r.losses ? 'var(--accent)' : r.losses > r.wins ? 'var(--danger)' : 'var(--dim)'
        return `<div class="mission">
          <div class="t">
            <span><b style="color:${lead}">${r.name}</b></span>
            <b style="color:${lead}">${r.wins}V — ${r.losses}D</b>
          </div>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <div class="footnote" style="margin-top:6px">
            Son record ${fmt(r.theirBest)} · le tien ${fmt(r.yourBest)}
          </div>
        </div>`
      })
      .join('')

    return el(`<div class="screen">
      ${this.topbar()}
      <h1 class="title" style="font-size:26px">RIVALITÉS</h1>
      <div class="tagline">${sorted.length ? `${sorted.length} adversaire${sorted.length > 1 ? 's' : ''}` : 'AUCUN DUEL POUR L\'INSTANT'}</div>

      ${
        sorted.length
          ? `<div class="scroll"><div class="panel">${rows}</div></div>`
          : `<div class="panel"><div class="footnote">
              Termine une partie, appuie sur <b>DÉFIER UN POTE</b>, et envoie le lien.
              Ton pote jouera la même arène que toi — et le score des deux côtés
              atterrira ici.
            </div></div>`
      }

      <div class="panel">
        <div class="up">
          <div class="info">
            <div class="n">TON PSEUDO</div>
            <div class="d">Visible par les gens que tu défies.</div>
          </div>
          <button data-act="name">${this.app.playerName || 'CHOISIR'}</button>
        </div>
      </div>

      <div class="stack"><button data-act="menu">RETOUR</button></div>
    </div>`)
  }

  private album(): HTMLElement {
    const p = this.app.profile
    const owned = new Set(p.specimens)
    const screen = el(`<div class="screen">
      ${this.topbar()}
      <h1 class="title" style="font-size:26px">ALBUM</h1>
      <div class="tagline">${owned.size} / ${SPECIMENS.length} SPÉCIMENS CAPTURÉS</div>
      <div class="panel" id="spec-detail"></div>
      <div class="scroll"><div class="panel"><div class="album-grid" id="grid"></div></div></div>
      <div class="stack" style="margin-top:12px"><button data-act="menu">RETOUR</button></div>
    </div>`)

    const grid = screen.querySelector('#grid') as HTMLElement
    for (const sp of SPECIMENS) {
      const has = owned.has(sp.id)
      const cellEl = el(
        `<div class="spec ${has ? '' : 'locked'}" data-act="spec" data-arg="${sp.id}" title="${has ? sp.name : '???'}">
           <span class="rar" style="background:${RARITY_COLOR[sp.rarity]}"></span>
         </div>`,
      )
      const c = document.createElement('canvas')
      c.width = 36
      c.height = 36
      const cx = c.getContext('2d')!
      drawGenome(cx, sp.id, 0, 0, 4, 1, !has)
      cellEl.insertBefore(c, cellEl.firstChild)
      grid.appendChild(cellEl)
    }

    const sp = SPECIMENS[this.albumSelection] ?? SPECIMENS[0]
    const has = owned.has(sp.id)
    const detail = screen.querySelector('#spec-detail') as HTMLElement
    detail.innerHTML = `<div class="detail">
      <canvas width="72" height="72"></canvas>
      <div>
        <div class="name" style="color:${has ? RARITY_COLOR[sp.rarity] : 'var(--dim)'}">${has ? sp.name : 'NON IDENTIFIÉ'}</div>
        <div class="lore">${has ? sp.lore : 'Spécimen jamais observé.'}</div>
        <div class="cond" style="color:${has ? 'var(--accent)' : 'var(--dim)'}">
          ${has ? '✓ CAPTURÉ' : conditionLabel(sp.cond)}
        </div>
      </div>
    </div>`
    const dc = detail.querySelector('canvas') as HTMLCanvasElement
    drawGenome(dc.getContext('2d')!, sp.id, 0, 0, 8, 1, !has)

    return screen
  }

  private upgrades(): HTMLElement {
    const p = this.app.profile
    const rows = UPGRADES.map((u) => {
      const lv = p.upgrades[u.id] ?? 0
      const maxed = lv >= u.maxLevel
      const cost = upgradeCost(u, lv)
      const afford = p.bits >= cost
      const pips = Array.from({ length: u.maxLevel }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')
      return `<div class="up">
        <div class="icon">${u.icon}</div>
        <div class="info">
          <div class="n">${u.name} <span style="color:var(--dim);font-weight:400">${lv > 0 ? u.format(lv * u.perLevel) : ''}</span></div>
          <div class="d">${u.desc}</div>
          <div class="lv">${pips}</div>
        </div>
        <button class="${afford && !maxed ? 'gold' : ''}" data-act="buyUp" data-arg="${u.id}" ${maxed || !afford ? 'disabled' : ''}>
          ${maxed ? 'MAX' : `⬡ ${fmt(cost)}`}
        </button>
      </div>`
    }).join('')

    return el(`<div class="screen">
      ${this.topbar()}
      <h1 class="title" style="font-size:26px">AMÉLIORATIONS</h1>
      <div class="tagline">PERMANENTES · PAYABLES UNIQUEMENT EN BITS</div>
      <div class="scroll"><div class="panel">${rows}</div></div>
      <div class="stack" style="margin-top:12px"><button data-act="menu">RETOUR</button></div>
    </div>`)
  }

  private shop(): HTMLElement {
    const p = this.app.profile
    const owned = new Set(p.ownedSkins)

    const skins = SKINS.map((s) => {
      // Album skins are never written into ownedSkins — they unlock by condition,
      // so the check has to look at the album too or they stay stuck at "x/y".
      const byAlbum = s.unlock.kind === 'album' && p.specimens.length >= s.unlock.count
      const isOwned = owned.has(s.id) || s.unlock.kind === 'default' || byAlbum
      const equipped = p.skin === s.id
      let action: string
      if (equipped) action = '<button disabled>ÉQUIPÉ</button>'
      else if (isOwned) action = `<button class="gold" data-act="equip" data-arg="${s.id}">ÉQUIPER</button>`
      else if (s.unlock.kind === 'bits')
        action = `<button data-act="buySkin" data-arg="${s.id}" ${p.bits >= s.unlock.cost ? '' : 'disabled'}>⬡ ${fmt(s.unlock.cost)}</button>`
      else if (s.unlock.kind === 'album')
        action = `<button disabled>${p.specimens.length}/${s.unlock.count} SPÉC.</button>`
      else action = '<button data-act="purchase" data-arg="skin_gold">1,99 €</button>'

      return `<div class="up">
        <div class="icon" style="color:${s.glow}">◆</div>
        <div class="info">
          <div class="n">${s.name}</div>
          <div class="d">${
            s.unlock.kind === 'album'
              ? `Débloqué à ${s.unlock.count} spécimens.`
              : s.unlock.kind === 'premium'
                ? 'Cosmétique premium.'
                : 'Cosmétique.'
          }</div>
        </div>
        ${action}
      </div>`
    }).join('')

    const store = PRODUCTS.map((prod) => {
      const ownedProd =
        (prod.sku === 'no_ads' && p.entitlements.noAds) ||
        (prod.sku === 'collector_pass' && p.entitlements.pass) ||
        (prod.sku === 'skin_gold' && owned.has('gold'))
      return `<div class="up">
        <div class="icon" style="color:var(--gold)">▣</div>
        <div class="info">
          <div class="n">${prod.name}</div>
          <div class="d">${prod.desc}</div>
        </div>
        <button class="${ownedProd ? '' : 'gold'}" data-act="purchase" data-arg="${prod.sku}" ${ownedProd ? 'disabled' : ''}>
          ${ownedProd ? 'ACQUIS' : prod.price}
        </button>
      </div>`
    }).join('')

    return el(`<div class="screen">
      ${this.topbar()}
      <h1 class="title" style="font-size:26px">BOUTIQUE</h1>
      <div class="tabs">
        <button class="${this.shopTab === 'skins' ? 'on' : ''}" data-act="tab" data-arg="skins">SKINS</button>
        <button class="${this.shopTab === 'store' ? 'on' : ''}" data-act="tab" data-arg="store">PREMIUM</button>
      </div>
      <div class="scroll"><div class="panel">${this.shopTab === 'skins' ? skins : store}</div></div>
      <div class="footnote" style="max-width:520px;text-align:center;margin-top:10px">
        Rien de ce qui est vendu ici n'affecte l'équilibre du jeu.<br>
        Cette build ne contient aucun SDK de paiement : les achats sont simulés.
      </div>
      <div class="stack" style="margin-top:12px"><button data-act="menu">RETOUR</button></div>
    </div>`)
  }

  /**
   * Facts instead of guesses. Layout bugs reported from a phone I cannot
   * reproduce on are unfixable without knowing what that phone's browser
   * actually supports — this panel is meant to be screenshotted and sent back.
   */
  private diagnostics(): string {
    const supports = (prop: string, value: string) => {
      try {
        return CSS.supports(prop, value) ? 'oui' : 'NON'
      } catch {
        return '?'
      }
    }
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px)'
    document.body.appendChild(probe)
    const safeTop = probe.offsetHeight
    probe.remove()

    const rows: [string, string][] = [
      ['ÉCRAN', `${window.innerWidth} × ${window.innerHeight} @${window.devicePixelRatio}x`],
      ['ENCOCHE', `${safeTop} px`],
      ['AFFICHAGE', window.matchMedia('(display-mode: standalone)').matches ? 'écran d\'accueil' : 'navigateur'],
      ['inset', supports('inset', '0px')],
      ['aspect-ratio', supports('aspect-ratio', '1')],
      ['gap (flex)', supports('gap', '10px')],
      ['backdrop-filter', supports('-webkit-backdrop-filter', 'blur(1px)')],
      ['NAVIGATEUR', navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 92)],
    ]
    return `<div class="panel"><h2>INFOS TECHNIQUES</h2>
      ${rows
        .map(
          ([k, v]) =>
            `<div class="kv" style="align-items:flex-start"><span>${k}</span><span style="font-weight:400;font-size:10px;text-align:right;max-width:62%;word-break:break-word">${v}</span></div>`,
        )
        .join('')}
      <div class="footnote" style="margin-top:8px">En cas de problème d'affichage, envoie une capture de ce panneau.</div>
    </div>`
  }

  private settings(): HTMLElement {
    const s = this.app.profile.settings
    const sw = (key: string, label: string, on: boolean) =>
      `<div class="up">
        <div class="info"><div class="n">${label}</div></div>
        <button class="${on ? 'gold' : ''}" data-act="setting" data-arg="${key}">${on ? 'ACTIVÉ' : 'COUPÉ'}</button>
      </div>`

    return el(`<div class="screen">
      <h1 class="title" style="font-size:26px">OPTIONS</h1>
      <div class="scroll">
      <div class="panel" style="margin-top:18px">
        ${sw('muted', 'SILENCE', s.muted)}
        ${sw('music', 'MUSIQUE', s.music)}
        ${sw('screenShake', 'SECOUSSE ÉCRAN', s.screenShake)}
        ${sw('reducedFx', 'EFFETS RÉDUITS', s.reducedFx)}
      </div>
      ${this.diagnostics()}
      </div>
      <div class="stack">
        <button data-act="menu">RETOUR</button>
        <button class="ghost small" data-act="reset" style="color:var(--danger)">EFFACER LA PROGRESSION</button>
      </div>
    </div>`)
  }
}
