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
  | 'challenge' | 'rivals'

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
  bits: number
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
      case 'daily': a.start(true); break
      case 'go': this.show(arg as ScreenId); break
      case 'menu': a.quitToMenu(); break
      case 'install': a.install(); break
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
    this.current = id
    this.root.querySelectorAll('.screen, .pause-btn, .hint').forEach((n) => n.remove())
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
    }
    this.root.appendChild(builders[id]())
  }

  /** In-run chrome: a discreet pause button plus contextual first-run hints. */
  showRunChrome(hint: string | null): void {
    this.root.querySelectorAll('.screen, .pause-btn, .hint').forEach((n) => n.remove())
    this.current = 'none'
    this.root.appendChild(el('<button class="pause-btn ghost" data-act="go" data-arg="pause">PAUSE</button>'))
    if (hint) this.root.appendChild(el(`<div class="hint">${hint}</div>`))
  }

  clearHint(): void {
    this.root.querySelector('.hint')?.remove()
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
          <div class="t"><span>${missionLabel(m)}</span><b>${done ? '✓ ' : ''}+${m.reward}</b></div>
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
        <button class="gold" data-act="daily" ${dailyDone ? 'disabled' : ''}>
          ${dailyDone ? `RUN DU JOUR TERMINÉE — ${fmt(p.dailyBest)}` : 'RUN DU JOUR'}
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

      ${p.missions.length ? `<div class="panel" style="margin-top:14px"><h2>MISSIONS DU JOUR</h2>${missions}</div>` : ''}
      <div class="footnote" style="text-align:center;max-width:420px">
        Souris / doigt pour te déplacer · ESPACE pour l'overclock<br>
        Le score en risque n'est à toi qu'une fois déposé au vault.
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
          <span>BITS GAGNÉS</span><span style="color:var(--gold)">⬡ ${fmt(r.bits)}</span>
        </div>
      </div>

      ${specs ? `<div class="panel"><h2>NOUVEAUX SPÉCIMENS</h2>${specs}</div>` : ''}
      ${r.completedMissions ? `<div class="panel"><h2>MISSIONS</h2><div class="kv"><span>TERMINÉES</span><span>${r.completedMissions}</span></div></div>` : ''}

      <div class="stack">
        <button class="primary" data-act="share">${d ? '↩ RENVOYER LE DÉFI' : '⚔ DÉFIER UN POTE'}</button>
        ${this.app.canRevive ? '<button class="gold" data-act="revive">▶ CONTINUER — REGARDER UNE PUB</button>' : ''}
        <button class="gold" data-act="double" ${this.app.rewardedReady ? '' : 'disabled'}>×2 BITS — REGARDER UNE PUB</button>
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

  private settings(): HTMLElement {
    const s = this.app.profile.settings
    const sw = (key: string, label: string, on: boolean) =>
      `<div class="up">
        <div class="info"><div class="n">${label}</div></div>
        <button class="${on ? 'gold' : ''}" data-act="setting" data-arg="${key}">${on ? 'ACTIVÉ' : 'COUPÉ'}</button>
      </div>`

    return el(`<div class="screen">
      <h1 class="title" style="font-size:26px">OPTIONS</h1>
      <div class="panel" style="margin-top:18px">
        ${sw('muted', 'SILENCE', s.muted)}
        ${sw('music', 'MUSIQUE', s.music)}
        ${sw('screenShake', 'SECOUSSE ÉCRAN', s.screenShake)}
        ${sw('reducedFx', 'EFFETS RÉDUITS', s.reducedFx)}
      </div>
      <div class="stack">
        <button data-act="menu">RETOUR</button>
        <button class="ghost small" data-act="reset" style="color:var(--danger)">EFFACER LA PROGRESSION</button>
      </div>
    </div>`)
  }
}
