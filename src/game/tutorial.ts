import type { Run } from './run'

/**
 * Guided first run.
 *
 * Design rules, learned the hard way from players bouncing off the game:
 *  - One idea per step. Never two.
 *  - The player *does* the thing before the next idea arrives; a step that can be
 *    completed by acting never advances on a timer.
 *  - Threats arrive one at a time, and only after the core loop is understood.
 *    Wave 1 of a tutorial run has no hunters and no corruption at all.
 *  - Every step is skippable, and the whole thing is replayable from the menu.
 */

export type FocusTarget =
  | 'player'
  | 'vault'
  | 'pixels'
  | 'score'
  | 'buffer'
  | 'mult'
  | 'shards'
  | 'overclock'
  | null

export interface TutorialStep {
  readonly id: string
  /** Short instruction. `<b>` allowed, nothing else. */
  readonly text: string
  readonly focus: FocusTarget
  /** Freeze the simulation while this step is on screen. */
  readonly freeze: boolean
  /** Applied once, when the step opens. */
  readonly enter?: (run: Run) => void
  /** When present, the step advances by itself as soon as it returns true. */
  readonly done?: (run: Run, elapsed: number, ctx: TutorialContext) => boolean
  /** Label of the manual button when there is no `done`. */
  readonly button?: string
}

export interface TutorialContext {
  /** Total distance the cursor has travelled during this step. */
  moved: number
  banksAtStepStart: number
  collectedAtStepStart: number
  overclocksAtStepStart: number
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'move',
    text: 'Le losange blanc, c\'est <b>toi</b>.<br>Glisse ton doigt sur l\'écran pour le déplacer.',
    focus: 'player',
    freeze: false,
    done: (_run, _t, ctx) => ctx.moved > 260,
  },
  {
    id: 'collect',
    text: 'Ces carrés de couleur sont les <b>pixels</b>.<br>Va en ramasser quelques-uns.',
    focus: 'pixels',
    freeze: false,
    done: (run, _t, ctx) => run.stats.collected - ctx.collectedAtStepStart >= 4,
  },
  {
    id: 'buffer',
    text: 'En haut à droite : les points que tu viens de ramasser.<br>Ils sont <b>EN RISQUE</b> — pas encore à toi.',
    focus: 'buffer',
    freeze: true,
    button: 'ET ALORS ?',
  },
  {
    id: 'vault',
    text: 'Pour les garder, dépose-les dans le <b>VAULT</b> : le losange doré.<br>Va le toucher.',
    focus: 'vault',
    freeze: false,
    done: (run, _t, ctx) => run.stats.banks > ctx.banksAtStepStart,
  },
  {
    id: 'score',
    text: 'En haut à gauche : <b>SÉCURISÉ</b>.<br>Ce score-là, plus rien ne peut te le prendre.',
    focus: 'score',
    freeze: true,
    button: 'COMPRIS',
  },
  {
    id: 'chain',
    text: 'Maintenant ramasse <b>3 pixels de la même couleur</b> à la suite.',
    focus: 'pixels',
    freeze: false,
    done: (run) => run.chain >= 3,
  },
  {
    id: 'mult',
    text: 'Voilà ton <b>multiplicateur</b>. Même couleur = il monte.<br>Couleur différente ou trop d\'attente = il retombe à ×1.',
    focus: 'mult',
    freeze: true,
    button: 'ET ÇA SERT À QUOI ?',
  },
  {
    id: 'multBank',
    text: 'Il multiplie ce que tu déposes.<br>Fais une chaîne, puis <b>banque avec ×2 ou plus</b>.',
    focus: 'vault',
    freeze: false,
    done: (run, _t, ctx) => run.stats.banks > ctx.banksAtStepStart && run.stats.bestMult >= 2,
  },
  {
    id: 'greed',
    text: 'C\'est tout le jeu : <b>attendre pour multiplier</b>, ou <b>banquer pour sécuriser</b>.<br>À toi de choisir, à chaque seconde.',
    focus: null,
    freeze: true,
    button: 'ET LE DANGER ?',
  },
  {
    id: 'hunter',
    text: 'Voici un <b>traqueur</b>. Il te chasse — et il accélère quand tu as beaucoup de points en risque.<br>Esquive-le.',
    focus: 'player',
    freeze: false,
    enter: (run) => {
      run.allowHunters = true
      run.spawnOneHunter()
    },
    done: (_run, elapsed) => elapsed > 9,
  },
  {
    id: 'shards',
    text: 'Ces losanges en haut à gauche sont tes <b>vies</b>.<br>Être touché en coûte une <b>et vide tout ton buffer</b>.',
    focus: 'shards',
    freeze: true,
    button: 'COMPRIS',
  },
  {
    id: 'corruption',
    text: 'Les <b>zones rouges</b> rongent l\'arène et te blessent si tu t\'y arrêtes.<br>Bonne nouvelle : banquer en nettoie autour du vault.',
    focus: null,
    freeze: true,
    enter: (run) => {
      run.allowCorruption = true
      for (let i = 0; i < 14; i++) run.seedOneCorruption()
    },
    button: 'COMPRIS',
  },
  {
    id: 'overclock',
    text: 'Ta barre du bas est pleine.<br>Appuie sur <b>ESPACE</b> ou <b>touche la barre</b> : ralenti, aimant, points doublés.',
    focus: 'overclock',
    freeze: false,
    enter: (run) => run.fillOverclock(),
    done: (run, _t, ctx) => run.stats.overclocks > ctx.overclocksAtStepStart,
  },
  {
    id: 'end',
    text: 'Tu sais tout.<br>Ramasse, multiplie, <b>banque avant de te faire toucher</b>.',
    focus: null,
    freeze: true,
    button: 'JOUER POUR DE VRAI',
  },
]

export class Tutorial {
  index = 0
  private stepTime = 0
  private ctx: TutorialContext = { moved: 0, banksAtStepStart: 0, collectedAtStepStart: 0, overclocksAtStepStart: 0 }
  private lastX = 0
  private lastY = 0
  finished = false

  get step(): TutorialStep {
    return TUTORIAL_STEPS[Math.min(this.index, TUTORIAL_STEPS.length - 1)]
  }

  /** True when the current step waits on a button rather than on an action. */
  get manual(): boolean {
    return !this.step.done
  }

  begin(run: Run): void {
    run.allowHunters = false
    run.allowCorruption = false
    run.freezeWaves = true
    // Wave 1 normally holds 6 pixels — not enough to make "three of the same
    // colour in a row" a fair ask of someone who has never played. A denser
    // board lets the player *see* the route instead of waiting for spawns.
    run.wave = { ...run.wave, pixelTarget: 15, hunters: 0, corruptionTarget: 0, modifier: 'none', lockedHue: 0 }
    this.index = 0
    this.finished = false
    this.openStep(run)
  }

  private openStep(run: Run): void {
    this.stepTime = 0
    this.ctx = {
      moved: 0,
      banksAtStepStart: run.stats.banks,
      collectedAtStepStart: run.stats.collected,
      overclocksAtStepStart: run.stats.overclocks,
    }
    this.lastX = run.px
    this.lastY = run.py
    this.step.enter?.(run)
    run.paused = this.step.freeze
  }

  /** Returns true when the displayed step changed, so the shell can re-render. */
  update(dt: number, run: Run): boolean {
    if (this.finished) return false
    this.stepTime += dt
    this.ctx.moved += Math.hypot(run.px - this.lastX, run.py - this.lastY)
    this.lastX = run.px
    this.lastY = run.py

    const step = this.step
    // A frozen step never auto-advances: the player reads, then taps.
    if (!step.done) return false
    // Small floor so a step cannot be satisfied by the state it opened with.
    if (this.stepTime < 0.4) return false
    if (!step.done(run, this.stepTime, this.ctx)) return false
    return this.advance(run)
  }

  /** Manual advance from the panel button. Returns true if the step changed. */
  advance(run: Run): boolean {
    if (this.finished) return false
    this.index += 1
    if (this.index >= TUTORIAL_STEPS.length) {
      this.finished = true
      run.paused = false
      run.allowHunters = true
      run.allowCorruption = true
      run.freezeWaves = false
      return true
    }
    this.openStep(run)
    return true
  }

  skip(run: Run): void {
    this.finished = true
    this.index = TUTORIAL_STEPS.length
    run.paused = false
    run.allowHunters = true
    run.allowCorruption = true
    run.freezeWaves = false
  }

  get progress(): { current: number; total: number } {
    return { current: Math.min(this.index + 1, TUTORIAL_STEPS.length), total: TUTORIAL_STEPS.length }
  }
}
