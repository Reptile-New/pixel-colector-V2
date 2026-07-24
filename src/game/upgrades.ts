export interface UpgradeDef {
  readonly id: string
  readonly name: string
  readonly desc: string
  readonly icon: string
  readonly maxLevel: number
  readonly baseCost: number
  readonly costMul: number
  /** Value granted per level (level 0 = 0). */
  readonly perLevel: number
  readonly format: (total: number) => string
}

/**
 * Permanent, account-wide upgrades bought with BITS.
 *
 * Design rule: every upgrade makes the player *better*, never the game *easier*
 * in a way that removes the greed decision. Nothing here can be bought with money
 * (see docs/MONETIZATION.md) — that is the whole point.
 */
export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'magnet', name: 'AIMANT', icon: '◎',
    desc: 'Rayon d\'attraction des pixels.',
    maxLevel: 8, baseCost: 120, costMul: 1.55, perLevel: 9,
    format: (v) => `+${v} px`,
  },
  {
    id: 'chainTime', name: 'RÉMANENCE', icon: '⧗',
    desc: 'Durée avant que la chaîne ne retombe.',
    maxLevel: 6, baseCost: 180, costMul: 1.65, perLevel: 0.22,
    format: (v) => `+${v.toFixed(2)} s`,
  },
  {
    id: 'shards', name: 'ÉCLATS', icon: '❖',
    desc: 'Points de vie supplémentaires.',
    maxLevel: 2, baseCost: 900, costMul: 2.6, perLevel: 1,
    format: (v) => `+${v}`,
  },
  {
    id: 'overclock', name: 'SURCHARGE', icon: '⚡',
    desc: 'Vitesse de charge de l\'overclock.',
    maxLevel: 6, baseCost: 240, costMul: 1.6, perLevel: 0.12,
    format: (v) => `+${Math.round(v * 100)} %`,
  },
  {
    id: 'vault', name: 'COFFRE', icon: '▣',
    desc: 'Bonus appliqué à chaque dépôt au vault.',
    maxLevel: 8, baseCost: 200, costMul: 1.6, perLevel: 0.07,
    format: (v) => `+${Math.round(v * 100)} %`,
  },
  {
    id: 'bits', name: 'RENDEMENT', icon: '⬡',
    desc: 'Bits gagnés en fin de run.',
    maxLevel: 8, baseCost: 260, costMul: 1.62, perLevel: 0.1,
    format: (v) => `+${Math.round(v * 100)} %`,
  },
  {
    id: 'agility', name: 'AGILITÉ', icon: '➤',
    desc: 'Vitesse de pointe du curseur.',
    maxLevel: 6, baseCost: 220, costMul: 1.58, perLevel: 0.05,
    format: (v) => `+${Math.round(v * 100)} %`,
  },
  {
    id: 'grace', name: 'SURSIS', icon: '◌',
    desc: 'Durée d\'invulnérabilité après un dégât.',
    maxLevel: 5, baseCost: 300, costMul: 1.6, perLevel: 0.2,
    format: (v) => `+${v.toFixed(1)} s`,
  },
  {
    id: 'salvage', name: 'SAUVEGARDE', icon: '⟲',
    desc: 'Part du buffer conservée quand tu es touché.',
    maxLevel: 4, baseCost: 700, costMul: 1.9, perLevel: 0.1,
    format: (v) => `${Math.round(v * 100)} % conservé`,
  },
  {
    id: 'rare', name: 'PROSPECTION', icon: '✦',
    desc: 'Chance d\'apparition des pixels dorés (valeur ×5).',
    maxLevel: 5, baseCost: 380, costMul: 1.7, perLevel: 0.012,
    format: (v) => `+${(v * 100).toFixed(1)} %`,
  },
]

export type UpgradeLevels = Record<string, number>

export const upgradeCost = (def: UpgradeDef, level: number): number =>
  Math.round(def.baseCost * Math.pow(def.costMul, level))

export const upgradeValue = (levels: UpgradeLevels, id: string): number => {
  const def = UPGRADES.find((u) => u.id === id)
  if (!def) return 0
  return (levels[id] ?? 0) * def.perLevel
}

/** Resolved modifier bag handed to the run at start. */
export interface RunMods {
  magnetBonus: number
  chainTimeBonus: number
  extraShards: number
  overclockRate: number
  vaultBonus: number
  bitBonus: number
  speedBonus: number
  graceBonus: number
  salvage: number
  rareChance: number
}

export const resolveMods = (levels: UpgradeLevels): RunMods => ({
  magnetBonus: upgradeValue(levels, 'magnet'),
  chainTimeBonus: upgradeValue(levels, 'chainTime'),
  extraShards: upgradeValue(levels, 'shards'),
  overclockRate: upgradeValue(levels, 'overclock'),
  vaultBonus: upgradeValue(levels, 'vault'),
  bitBonus: upgradeValue(levels, 'bits'),
  speedBonus: upgradeValue(levels, 'agility'),
  graceBonus: upgradeValue(levels, 'grace'),
  salvage: upgradeValue(levels, 'salvage'),
  rareChance: upgradeValue(levels, 'rare'),
})
