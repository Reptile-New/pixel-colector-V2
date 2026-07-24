import { Rng } from '../core/rng'

export type Rarity = 'commun' | 'rare' | 'epique' | 'legendaire'

export const RARITY_COLOR: Record<Rarity, string> = {
  commun: '#8ea0c8',
  rare: '#4da8ff',
  epique: '#c06bff',
  legendaire: '#ffb020',
}

export const RARITY_BITS: Record<Rarity, number> = {
  commun: 40,
  rare: 120,
  epique: 320,
  legendaire: 900,
}

/** Unlock conditions. Evaluated against a merged run + profile stat bag. */
export type Condition =
  | { kind: 'chain'; v: number }
  | { kind: 'bankOne'; v: number }
  | { kind: 'wave'; v: number }
  | { kind: 'score'; v: number }
  | { kind: 'mult'; v: number }
  | { kind: 'runCollected'; v: number }
  | { kind: 'overclocks'; v: number }
  | { kind: 'noHitWave'; v: number }
  | { kind: 'hueRun'; hue: number; v: number }
  | { kind: 'lifetimeCollected'; v: number }
  | { kind: 'runs'; v: number }
  | { kind: 'streak'; v: number }
  | { kind: 'dailyRuns'; v: number }
  | { kind: 'banks'; v: number }
  | { kind: 'closeCall'; v: number }

export interface Specimen {
  readonly id: number
  readonly name: string
  readonly rarity: Rarity
  readonly lore: string
  readonly cond: Condition
}

/** 48 specimens. The condition set is deliberately spread across *skills*
 *  (chain, greed, survival), *habits* (streak, daily) and *volume* (lifetime),
 *  so there is always a specimen within reach whatever the player is good at. */
export const SPECIMENS: readonly Specimen[] = [
  { id: 0, name: 'AMORCE', rarity: 'commun', lore: 'Le premier pixel qui a compris qu\'il pouvait fuir.', cond: { kind: 'runs', v: 1 } },
  { id: 1, name: 'GRAINE', rarity: 'commun', lore: 'Contient l\'écran entier, replié 4096 fois.', cond: { kind: 'score', v: 1000 } },
  { id: 2, name: 'ÉTINCELLE', rarity: 'commun', lore: 'Brûle une seule fois, mais correctement.', cond: { kind: 'chain', v: 5 } },
  { id: 3, name: 'COFFRE', rarity: 'commun', lore: 'Ne fait confiance à personne, surtout pas à toi.', cond: { kind: 'banks', v: 5 } },
  { id: 4, name: 'GLANEUR', rarity: 'commun', lore: 'Ramasse ce que les autres laissent tomber.', cond: { kind: 'runCollected', v: 60 } },
  { id: 5, name: 'SURVIVANT', rarity: 'commun', lore: 'A vu trois écrans mourir. N\'en parle jamais.', cond: { kind: 'wave', v: 3 } },
  { id: 6, name: 'CYAN-01', rarity: 'commun', lore: 'La première couleur qui a refusé de s\'éteindre.', cond: { kind: 'hueRun', hue: 0, v: 40 } },
  { id: 7, name: 'ROSE-02', rarity: 'commun', lore: 'Vibre à 587 Hz quand personne ne regarde.', cond: { kind: 'hueRun', hue: 1, v: 40 } },
  { id: 8, name: 'AMBRE-03', rarity: 'commun', lore: 'Se souvient de la chaleur des tubes cathodiques.', cond: { kind: 'hueRun', hue: 2, v: 40 } },
  { id: 9, name: 'VIOLET-04', rarity: 'commun', lore: 'Existe surtout la nuit.', cond: { kind: 'hueRun', hue: 3, v: 40 } },
  { id: 10, name: 'LIME-05', rarity: 'commun', lore: 'Trop vif pour être honnête.', cond: { kind: 'hueRun', hue: 4, v: 40 } },
  { id: 11, name: 'ROUTINE', rarity: 'commun', lore: 'Revient. Toujours. Même quand ça ne sert à rien.', cond: { kind: 'runs', v: 5 } },
  { id: 12, name: 'FOURMI', rarity: 'commun', lore: 'A porté mille fois son propre poids en couleur.', cond: { kind: 'lifetimeCollected', v: 500 } },
  { id: 13, name: 'ÉCHO', rarity: 'commun', lore: 'Répète le dernier son qu\'il a entendu, indéfiniment.', cond: { kind: 'mult', v: 4 } },
  { id: 14, name: 'BALISE', rarity: 'commun', lore: 'Clignote pour un vaisseau qui ne viendra pas.', cond: { kind: 'score', v: 5000 } },
  { id: 15, name: 'FRAGMENT', rarity: 'commun', lore: 'Morceau d\'une image que personne n\'a fini de charger.', cond: { kind: 'bankOne', v: 800 } },
  { id: 16, name: 'CHASSEUR', rarity: 'commun', lore: 'A échappé à trois traqueurs dans la même seconde.', cond: { kind: 'closeCall', v: 3 } },
  { id: 17, name: 'ORAGE', rarity: 'commun', lore: 'Charge d\'abord, décide ensuite.', cond: { kind: 'overclocks', v: 3 } },
  { id: 18, name: 'CHAÎNE', rarity: 'commun', lore: 'Chaque maillon connaît la couleur du suivant.', cond: { kind: 'chain', v: 10 } },
  { id: 19, name: 'PERSISTANT', rarity: 'commun', lore: 'Rémanence sur le phosphore. Refuse de partir.', cond: { kind: 'runs', v: 15 } },

  { id: 20, name: 'AVARE', rarity: 'rare', lore: 'A gardé 3 000 points en poche. Les a tous perdus.', cond: { kind: 'bankOne', v: 3000 } },
  { id: 21, name: 'MÉTRONOME', rarity: 'rare', lore: 'Ne rate jamais un temps. Ne s\'amuse jamais non plus.', cond: { kind: 'banks', v: 20 } },
  { id: 22, name: 'INTOUCHÉ', rarity: 'rare', lore: 'La corruption a essayé. La corruption a échoué.', cond: { kind: 'noHitWave', v: 4 } },
  { id: 23, name: 'PROFONDEUR', rarity: 'rare', lore: 'Vague 6. L\'écran commence à mentir.', cond: { kind: 'wave', v: 6 } },
  { id: 24, name: 'PRISME', rarity: 'rare', lore: 'Contient les cinq couleurs et n\'en choisit aucune.', cond: { kind: 'runCollected', v: 200 } },
  { id: 25, name: 'SURCHARGE', rarity: 'rare', lore: 'Le ralenti n\'est pas une pause. C\'est une décision.', cond: { kind: 'overclocks', v: 8 } },
  { id: 26, name: 'MULTIPLICATEUR', rarity: 'rare', lore: '×8. Le chiffre où les mains commencent à trembler.', cond: { kind: 'mult', v: 8 } },
  { id: 27, name: 'ARCHIVE', rarity: 'rare', lore: 'Se souvient de chaque partie que tu as ratée.', cond: { kind: 'lifetimeCollected', v: 3000 } },
  { id: 28, name: 'RITUEL', rarity: 'rare', lore: 'Trois jours d\'affilée. Ça s\'appelle une habitude.', cond: { kind: 'streak', v: 3 } },
  { id: 29, name: 'QUOTIDIEN', rarity: 'rare', lore: 'La même graine pour tout le monde. Aucune excuse.', cond: { kind: 'dailyRuns', v: 3 } },
  { id: 30, name: 'TÉMÉRAIRE', rarity: 'rare', lore: 'Sept frôlements. Compte-les, si tu peux.', cond: { kind: 'closeCall', v: 10 } },
  { id: 31, name: 'CASCADE', rarity: 'rare', lore: 'Une chaîne de 18 ne se produit pas par accident.', cond: { kind: 'chain', v: 18 } },
  { id: 32, name: 'MONOLITHE', rarity: 'rare', lore: '25 000 points, gravés dans le buffer permanent.', cond: { kind: 'score', v: 25000 } },
  { id: 33, name: 'VÉTÉRAN', rarity: 'rare', lore: 'Quarante écrans morts. Il ne les compte plus.', cond: { kind: 'runs', v: 40 } },

  { id: 34, name: 'USURIER', rarity: 'epique', lore: 'A banqué 10 000 d\'un seul coup. L\'écran a hurlé.', cond: { kind: 'bankOne', v: 10000 } },
  { id: 35, name: 'IMMACULÉ', rarity: 'epique', lore: 'Vague 7 sans une égratignure. Ça ne devrait pas être possible.', cond: { kind: 'noHitWave', v: 7 } },
  { id: 36, name: 'ABYSSE', rarity: 'epique', lore: 'Vague 10. Il n\'y a plus d\'arène, seulement toi.', cond: { kind: 'wave', v: 10 } },
  { id: 37, name: 'HYPNOSE', rarity: 'epique', lore: 'Chaîne 30. Tu as arrêté de réfléchir, tu joues enfin.', cond: { kind: 'chain', v: 30 } },
  { id: 38, name: 'SEPT-JOURS', rarity: 'epique', lore: 'Une semaine. Le jeu te connaît mieux que tes amis.', cond: { kind: 'streak', v: 7 } },
  { id: 39, name: 'ORACLE', rarity: 'epique', lore: '×14. Tu vois les spawns avant qu\'ils n\'existent.', cond: { kind: 'mult', v: 14 } },
  { id: 40, name: 'DÉLUGE', rarity: 'epique', lore: '400 pixels dans une seule vie. L\'écran est vide.', cond: { kind: 'runCollected', v: 400 } },
  { id: 41, name: 'CENT-MILLE', rarity: 'epique', lore: 'Six chiffres. Peu de gens verront cette carte.', cond: { kind: 'score', v: 100000 } },
  { id: 42, name: 'MÉMOIRE-MORTE', rarity: 'epique', lore: '15 000 pixels récoltés. Tu es devenu l\'écran.', cond: { kind: 'lifetimeCollected', v: 15000 } },

  { id: 43, name: 'LE COLLECTEUR', rarity: 'legendaire', lore: 'Le pixel originel. Il collectionnait déjà avant l\'affichage.', cond: { kind: 'score', v: 250000 } },
  { id: 44, name: 'POINT MORT', rarity: 'legendaire', lore: 'Vague 14 sans dégât. La corruption a demandé un armistice.', cond: { kind: 'noHitWave', v: 14 } },
  { id: 45, name: 'SINGULARITÉ', rarity: 'legendaire', lore: 'Chaîne 45. Une seule couleur, quarante-cinq fois.', cond: { kind: 'chain', v: 45 } },
  { id: 46, name: 'TRENTE', rarity: 'legendaire', lore: 'Trente jours consécutifs. Ce n\'est plus un jeu, c\'est un lieu.', cond: { kind: 'streak', v: 30 } },
  { id: 47, name: 'DERNIER PIXEL', rarity: 'legendaire', lore: 'Quand l\'écran s\'éteindra, il restera allumé une seconde de plus.', cond: { kind: 'wave', v: 18 } },
]

export const conditionLabel = (c: Condition): string => {
  switch (c.kind) {
    case 'chain': return `Atteindre une chaîne de ${c.v}`
    case 'bankOne': return `Banquer ${c.v.toLocaleString('fr-FR')} en une fois`
    case 'wave': return `Atteindre la vague ${c.v}`
    case 'score': return `Score de ${c.v.toLocaleString('fr-FR')} en une run`
    case 'mult': return `Atteindre un multiplicateur ×${c.v}`
    case 'runCollected': return `Récolter ${c.v} pixels en une run`
    case 'overclocks': return `Utiliser ${c.v} overclocks en une run`
    case 'noHitWave': return `Atteindre la vague ${c.v} sans dégât`
    case 'hueRun': return `Récolter ${c.v} pixels ${['CYAN', 'ROSE', 'AMBRE', 'VIOLET', 'LIME'][c.hue]} en une run`
    case 'lifetimeCollected': return `Récolter ${c.v.toLocaleString('fr-FR')} pixels au total`
    case 'runs': return `Jouer ${c.v} run${c.v > 1 ? 's' : ''}`
    case 'streak': return `Série de ${c.v} jours`
    case 'dailyRuns': return `Jouer ${c.v} runs du jour`
    case 'banks': return `Banquer ${c.v} fois en une run`
    case 'closeCall': return `${c.v} frôlements en une run`
  }
}

/**
 * Deterministic 9×9 pixel-art genome. Same id -> same creature, on every device,
 * forever. This is what makes a specimen *verifiable* — and what a token layer
 * would reference if one is ever added (see docs/MONETIZATION.md).
 */
export interface Genome {
  readonly grid: Uint8Array // 81 cells, 0 = empty, 1 = core, 2 = accent, 3 = highlight
  readonly hue: number
  readonly accent: number
}

const genomeCache = new Map<number, Genome>()

export const genomeOf = (id: number): Genome => {
  const cached = genomeCache.get(id)
  if (cached) return cached
  const rng = new Rng(0x9e3779b9 ^ (id * 2654435761))
  const S = 9
  const half = Math.ceil(S / 2)
  const grid = new Uint8Array(S * S)
  const density = 0.42 + rng.next() * 0.24
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < half; x++) {
      // Bias toward the centre so creatures read as bodies, not noise.
      const edge = Math.abs(y - (S - 1) / 2) / (S / 2) + (half - 1 - x) / half * 0.55
      const on = rng.next() < density - edge * 0.42
      if (!on) continue
      const v = rng.next() < 0.18 ? 3 : rng.next() < 0.34 ? 2 : 1
      grid[y * S + x] = v
      grid[y * S + (S - 1 - x)] = v // mirror: bilateral symmetry reads as "alive"
    }
  }
  const g: Genome = { grid, hue: rng.int(0, 360), accent: rng.int(0, 360) }
  genomeCache.set(id, g)
  return g
}

/** Draws a specimen sprite into any 2D context. Used by the album and by pickups. */
export const drawGenome = (
  ctx: CanvasRenderingContext2D,
  id: number,
  x: number,
  y: number,
  cell: number,
  alpha = 1,
  silhouette = false,
): void => {
  const g = genomeOf(id)
  const S = 9
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      const v = g.grid[iy * S + ix]
      if (!v) continue
      if (silhouette) ctx.fillStyle = `rgba(28,30,48,${alpha})`
      else if (v === 1) ctx.fillStyle = `hsla(${g.hue},72%,58%,${alpha})`
      else if (v === 2) ctx.fillStyle = `hsla(${g.accent},80%,64%,${alpha})`
      else ctx.fillStyle = `hsla(${g.hue},90%,86%,${alpha})`
      ctx.fillRect(x + ix * cell, y + iy * cell, cell, cell)
    }
  }
}
