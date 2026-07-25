# Pixel Collector

Jeu d'arcade « press-your-luck » en TypeScript + Canvas 2D, sans dépendance à
l'exécution et sans aucun asset : les graphismes sont dessinés, la bande-son est
synthétisée en WebAudio au moment où elle joue.

## Point d'entrée pour comprendre le projet

| Fichier | Contenu |
|---|---|
| `README.md` | Vue d'ensemble, comment lancer, comment partager |
| `docs/GAME_DESIGN.md` | Pourquoi la boucle fonctionne, ce qui a été écarté, le tutoriel |
| `docs/MONETIZATION.md` | Publicité, achats, ordres de grandeur réalistes, position sur les NFT |
| `docs/PROMPT_INITIAL.md` | **La demande d'origine, mot pour mot**, et la suite des échanges |

## Règles du dépôt

- **Développement sur une branche dédiée**, mise en ligne à la fusion dans `main` :
  l'environnement GitHub Pages n'autorise que la branche par défaut.
- `npm run build` fait le typecheck avant le bundle. Un déploiement ne part jamais
  avec du TypeScript cassé.
- **Tout est seedé** (`src/core/rng.ts`). La Run du jour, les duels entre amis et
  les spécimens de l'album en dépendent : ne jamais introduire de `Math.random()`
  dans la simulation, sinon deux joueurs sur la même graine divergent.
- `Run` (`src/game/run.ts`) ne connaît ni le DOM, ni la sauvegarde, ni la
  monétisation. Garder cette frontière : c'est ce qui rend le jeu testable.
- Publicité et achats passent par des interfaces (`src/monetize/`). Le jeu
  n'importe jamais un SDK directement.

## Vérifier une modification

Il n'y a pas de tests unitaires : le jeu est vérifié **en le jouant dans un vrai
navigateur**, via Playwright. Chromium est préinstallé
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Servir `dist/` depuis un
sous-dossier reproduit les conditions de GitHub Pages, là où les chemins absolus
cassent.

```bash
npm run build
(cd dist && python3 -m http.server 4180)   # dans un sous-dossier nommé comme le dépôt
npm run check:layout
```

`scripts/check-layout.mjs` passe les sept écrans sur six formats et vérifie quatre
invariants : les couches informatives (toasts, panneau du tutoriel) n'ont jamais de
fond ni ne capturent les gestes, l'écran couvre exactement la fenêtre, rien ne
déborde horizontalement, aucun bouton ne sort de l'écran.

Ce contrôle existe à cause d'un bug précis : une liste de sélecteurs CSS restée
ouverte a fait hériter au conteneur des toasts **tout le style de l'écran de menu**
— une couche opaque plein écran, en z-index 30, par-dessus le jeu. Le CSS restait
valide, le typecheck passait, la build passait, et la moitié de l'écran était noire
sur le téléphone d'un joueur.

Les bugs trouvés jusqu'ici l'ont tous été en jouant, jamais par lecture du code :
textes qui se chevauchent, menu inatteignable en paysage, vault posé dans une zone
inaccessible, récompense créditée mais invisible, économie dont la stratégie
optimale était de tricher, et cette couche noire.
