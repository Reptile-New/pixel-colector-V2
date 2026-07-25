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

## Le partager à des gens (sans qu'ils installent quoi que ce soit)

Le jeu est une **application web** : elle tourne dans le navigateur d'un iPhone,
d'un Android, d'un PC ou d'un Mac. Rien à installer pour jouer — un lien suffit.

### Mettre le lien en ligne, une fois pour toutes

Le jeu est publié automatiquement à chaque `push` sur `main`
(`.github/workflows/deploy.yml`) :

```
https://reptile-new.github.io/pixel-colector-V2/
```

Le déploiement ne se déclenche que depuis `main`, parce que l'environnement
`github-pages` n'autorise que la branche par défaut : le lancer depuis une branche
de travail échouerait à tous les coups. Le travail en cours vit donc sur une branche
dédiée et part en ligne à la fusion dans `main`.

Prérequis, déjà en place ici : dépôt **public**, et *Settings → Pages → Source :
GitHub Actions*.

### Installable comme une vraie app

Le jeu est une PWA : icône, plein écran, et **jouable hors ligne** après la
première visite (service worker). Depuis le lien :

- **Android / Chrome** — un bouton « Ajouter à l'écran d'accueil » apparaît dans le menu du jeu.
- **iPhone / Safari** — bouton ⬆︎ Partager → « Sur l'écran d'accueil ». (iOS n'expose
  aucune API d'installation : le jeu affiche donc la marche à suivre au lieu de promettre un bouton.)

Une fois posé sur l'écran d'accueil, c'est indiscernable d'une application native :
icône, plein écran, pas de barre d'adresse.

### Sans rien mettre en ligne

`npm run build:single` produit `dist-single/pixel-collector.html` : **un seul
fichier de 80 ko**, à ouvrir d'un double-clic, sans serveur ni connexion.
Pratique pour tester ou pour l'envoyer à quelqu'un sur ordinateur — beaucoup moins
sur mobile, où ouvrir une pièce jointe HTML n'est pas évident.

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

## Jouer entre potes — sans serveur

Une run étant entièrement déterminée par sa graine, deux personnes avec la même
graine jouent **exactement la même arène**. Le duel tient donc dans un lien :

1. Fin de partie → **DÉFIER UN POTE** (partage natif sur mobile, presse-papier ailleurs)
2. Le pote ouvre le lien → il voit ton score et joue ta partie, à l'identique
3. Verdict immédiat, puis **RENVOYER LE DÉFI**

Aucun compte, aucun serveur, aucune donnée qui quitte l'appareil. L'écran
**RIVALITÉS** tient le bilan victoires/défaites face à chaque adversaire.

Les améliorations permanentes sont **neutralisées pendant un duel** : même graine
*et* mêmes statistiques, sinon la comparaison ne veut rien dire. Les bits et les
spécimens sont gagnés normalement.

Pour un vrai classement en ligne plus tard, `src/meta/leaderboard.ts` définit déjà
l'interface à implémenter.

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
