# PIXEL COLLECTOR

> Un jeu d'arcade « press-your-luck » où le score que tu viens de gagner ne
> t'appartient pas encore.

Tu es un pixel vivant dans un écran qui meurt. Tu récoltes de la couleur, tu
construis un multiplicateur — et tant que tu n'as pas déposé ta récolte au
**vault**, un seul contact avec la corruption te la reprend intégralement.

Le jeu ne te tue jamais. C'est ton avidité qui le fait. C'est ça qui produit le
« allez, encore une ».

## Lancer le jeu

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # typecheck + bundle dans dist/  (~25 ko gzip, zéro asset)
npm run preview
```

Aucune dépendance à l'exécution, aucun asset : les graphismes sont dessinés en
Canvas 2D et **toute la bande-son est synthétisée en WebAudio** au moment où elle
joue.

## Comment on joue

| Action | Clavier / Souris | Tactile |
|---|---|---|
| Se déplacer | Souris, ou WASD / flèches | Glisser le doigt |
| Overclock | `Espace` (ou clic droit) | Toucher la barre en bas |
| Pause | `Échap` | Bouton PAUSE |

Manette supportée (stick gauche + bouton A).

**Les trois règles qu'il faut comprendre :**
1. Ramasser des pixels remplit le **buffer** — un score *en risque*.
2. Toucher le **vault ▣** le convertit en score définitif (et nettoie la corruption autour).
3. Ramasser la **même couleur** d'affilée fait monter le **multiplicateur**, qui
   s'applique au dépôt. Être touché fait tout perdre.

## Architecture

```
src/
├── core/        maths, PRNG déterministe (seedé), input unifié
├── render/      renderer Canvas + caméra + post-traitement CRT, particules, palette
├── audio/       synthé procédural : SFX + musique générative réactive
├── game/        simulation pure (run.ts), contenu (spécimens, améliorations, vagues), orchestrateur
├── meta/        sauvegarde, série quotidienne, missions
├── ui/          écrans DOM (menu, album, améliorations, boutique)
└── monetize/    interfaces pub/achat + providers mock
```

Deux choix structurants :

- **`Run` ne connaît ni le DOM, ni la sauvegarde, ni la monétisation.** Elle prend
  une graine, des modificateurs, et produit des statistiques et des événements.
  On peut la tester en isolation, la rejouer, la simuler.
- **Tout est seedé** (`core/rng.ts`). Ça donne gratuitement la Run du jour
  (même graine pour tout le monde), des bugs reproductibles, et des spécimens
  vérifiables.

## Contenu

- **48 spécimens** à collectionner, chacun avec un sprite pixel-art généré depuis
  un génome déterministe, une rareté, et une condition de déblocage.
- **10 améliorations permanentes**, payables uniquement en bits gagnés en jouant.
- **7 modificateurs de vague** (verrou chromatique, coupure, vault fuyant…).
- **6 skins**, missions quotidiennes, série de connexion, run du jour.

## Documentation

- [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) — pourquoi la boucle fonctionne, ce qui a été
  volontairement écarté, et le détail du game feel.
- [`docs/MONETIZATION.md`](docs/MONETIZATION.md) — stratégie pub/achats, ordres de grandeur
  réalistes, et une réponse franche sur les NFT.

## État

Jouable et complet de bout en bout. Ce qui reste à faire avant une vraie
publication est listé en fin de `docs/MONETIZATION.md` — l'essentiel étant
l'instrumentation de la rétention, puis le branchement d'un SDK publicitaire réel
à la place des providers mock.
