# PIXEL COLLECTOR — Game Design Document

> *Tu es le dernier pixel vivant d'un écran qui meurt. Récolte la couleur avant que la corruption ne l'avale.*

## 0. Le pari de design

Un jeu de collection est addictif quand **collecter est risqué**. Ramasser des pixels
gratuitement est ennuyeux au bout de 40 secondes. Toute l'architecture du jeu repose donc
sur une seule tension : **le score que tu viens de gagner ne t'appartient pas encore.**

C'est le moteur « press-your-luck » (Slay the Spire, Balatro, Vampire Survivors, Risk of Rain) :
le joueur ne meurt jamais à cause du jeu, il meurt à cause de sa propre avidité. C'est ça
qui produit le « allez, encore une partie ».

## 1. Boucle centrale (2 à 8 secondes)

| Élément | Rôle |
|---|---|
| **Le Curseur** | Le joueur. Déplacement analogique continu (souris / doigt / WASD), inertie + friction : il y a une vraie courbe de maîtrise. |
| **Les Pixels** | 5 couleurs. Ramassés → entrent dans le **BUFFER** (score *non sécurisé*). |
| **La Chaîne** | Ramasser 2 pixels de la **même couleur** d'affilée fait monter le multiplicateur (×1 → ×2 → ×3…). Changer de couleur remet la chaîne à 1. La chaîne se dégrade si tu ne ramasses rien pendant ~2,5 s. |
| **Le Vault** | Un nœud qui pulse ailleurs sur la grille. Le toucher **banque** `buffer × multiplicateur` dans le score définitif, puis il se téléporte. |
| **Les Hunters** | Pixels corrompus qui te traquent. **Leur vitesse augmente avec la taille de ton buffer.** Plus tu es riche, plus tu es chassé. |
| **La Corruption** | Des cellules deviennent hostiles et se propagent depuis les bords : l'arène rétrécit. Force le mouvement, empêche le camping. |
| **Les Éclats** | 3 points de vie. Être touché = −1 éclat **et perte totale du buffer**. Le score banqué, lui, est intouchable. |

**La décision que le joueur reprend toutes les 3 secondes :**
> « J'ai 4 200 points en buffer et ×7. Le vault est à l'autre bout. Je banque maintenant,
> ou je prends les deux pixels rouges sur le chemin pour monter à ×9 ? »

C'est une décision *volontaire*, *fréquente*, *à conséquence immédiate*, et *dont le joueur
se sent responsable*. C'est la définition d'une bonne boucle de jeu.

### Feedback de risque lisible
Le buffer n'est pas qu'un nombre : plus il grossit, plus **l'écran réagit** — le drone sonore
monte, une aura pulse autour du curseur, les hunters accélèrent, la vignette se resserre.
Le joueur *sent* qu'il joue avec le feu sans lire un seul chiffre.

### L'Overclock (expression de skill)
Une jauge se remplit en chaînant. Activation → ralenti, aimantation totale des pixels,
valeur doublée, les hunters fuient. Le joueur choisit son moment : sauver sa peau, ou
transformer un ×9 en run record. Une ressource, deux usages opposés = décision intéressante.

## 2. Boucle de session (90 à 240 s)

Vagues toutes les 20 s : plus de spawns, hunters plus rapides, corruption plus agressive,
et à partir de la vague 3 un **modificateur** tiré au sort :

- `COLOUR LOCK` — une seule couleur rapporte, les autres ralentissent
- `PIXEL RAIN` — spawn massif, chaînes énormes possibles
- `BLACKOUT` — vision réduite à un halo
- `HUNGRY VAULT` — le vault fuit le joueur
- `FRAGILE` — dégâts doublés, gains doublés

Une run se termine en 2 à 4 minutes. Format mobile, format « encore une ».

## 3. Boucle méta (jours / semaines) — la rétention

1. **BITS** — monnaie gagnée par run → **grille d'améliorations permanentes** (aimant, temps de
   chaîne, éclat supplémentaire, charge d'overclock, valeur du vault, gain de bits, revive).
   Chaque run rend la suivante meilleure : jamais de session « perdue ».
2. **L'ALBUM** — 48 spécimens à collectionner. Chaque spécimen a un **génome déterministe**
   (sprite pixel-art généré depuis une graine), une rareté et une condition d'apparition
   (« banquer 5 000 d'un coup », « chaîne de 25 », « survivre à la vague 8 »).
   C'est le cœur « Collector » du titre — et le support naturel d'une couche NFT/cosmétique.
3. **RUN DU JOUR** — graine déterministe basée sur la date : tout le monde joue la même partie.
   Un essai. Classement. C'est le rendez-vous quotidien.
4. **SÉRIE (streak)** — jours consécutifs joués → multiplicateur de bits. Le coût de rupture
   crée l'habitude.
5. **MISSIONS** — 3 objectifs tournants → coffre.
6. **SKINS / PALETTES** — cosmétiques débloqués par l'album. Monétisation non pay-to-win.

## 4. Game feel — la partie non négociable

Un jeu d'arcade est bon ou mauvais dans les 50 premières millisecondes de réponse.

- Mouvement à accélération + drag, pas de téléportation
- **Hitstop** 60 ms sur dégât, 40 ms sur gros bank
- Screen shake proportionnel, jamais gratuit
- Micro-zoom caméra sur le bank
- Particules : burst de collecte, dissolution, ruban de traînée
- **Son procédural (WebAudio, zéro asset)** : le blip de collecte **monte en hauteur avec la
  chaîne**. À lui seul, ce détail fait 30 % de la sensation d'addiction — c'est la
  récompense sonore ascendante des machines à sous.
- Post-traitement CRT : scanlines, aberration chromatique, bloom, vignette

## 5. Ce qui est volontairement absent

- Pas d'énergie / de vies limitées : ça tue la rétention pour un jeu de skill.
- Pas de pay-to-win : la monétisation ne touche jamais l'équilibre (cf. `MONETIZATION.md`).
- Pas de tutoriel bloquant : la première run *est* le tutoriel (indices contextuels).
