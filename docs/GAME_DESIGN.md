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
| **La Chaîne** | Ramasser la **même couleur** d'affilée fait monter la valeur de **chaque pixel suivant** : +10 tout seul, +50 au cinquième. Changer de couleur **divise la chaîne par deux** (pas de remise à zéro : un pixel effleuré par accident ne doit pas anéantir une minute de travail). Elle se dégrade aussi si tu ne ramasses rien assez vite. |
| **Le Vault** | Un nœud qui pulse ailleurs sur la grille. Le toucher **sécurise le buffer** dans le score définitif, puis il se téléporte. |
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

### Pourquoi le multiplicateur se gagne à la collecte, et pas au dépôt

La première version appliquait le multiplicateur **au moment du dépôt**, sur tout le
buffer. Le calcul montre que ça produisait une stratégie optimale absurde :

| Stratégie (60 pixels) | Score |
|---|---|
| Ramasser au hasard, déposer | 734 |
| Ramasser au hasard, puis « pêcher » 6 pixels d'une couleur juste avant le vault | **4 428** |
| Router proprement toute la partie | 3 288 |

Autrement dit : **jouer salement puis tricher 3 secondes battait jouer bien.** Et
aucun joueur ne pouvait déduire ça — un testeur a d'ailleurs signalé, à raison,
qu'il « doutait que chercher les couleurs soit rentable ».

Le multiplicateur s'applique donc maintenant **à chaque pixel, au moment où on le
ramasse**. Un pop-up affiche la valeur réelle (`+50 ×5`). Résultat mesuré en jeu :
router proprement rapporte **17× plus** que ramasser au hasard, la « pêche » finale
ne rapporte plus rien de spécial, et le joueur *voit* le lien de cause à effet à
chaque ramassage au lieu de devoir le déduire.

### L'aimant n'attire que ta couleur

Corollaire indispensable : tant que l'aimant aspirait tout, viser une couleur était
impossible — on ne pouvait pas passer à côté d'un pixel sans l'avaler, et la chaîne
semblait subie plutôt que choisie. L'aimant n'attire désormais **que la couleur de la
chaîne en cours**. Les autres exigent un contact réel. L'outil qui sabotait la
mécanique principale la sert maintenant.

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

## 3 bis. La couche sociale — pourquoi elle tient sans serveur

Le vrai levier de rétention d'un jeu de score n'est pas le score : c'est **quelqu'un
d'autre qui a fait mieux que toi**. Un classement mondial ne produit pas ça (tu ne
rattraperas jamais le premier). Un pote qui te met 400 points d'avance, si.

La propriété technique qui rend ça possible : **une run est entièrement déterminée
par sa graine**. Deux personnes avec la même graine jouent exactement la même arène
— mêmes spawns, mêmes traqueurs, mêmes vagues, mêmes modificateurs. Donc :

### Le duel tient dans un lien

Fin de partie → **DÉFIER UN POTE** → le pseudo, la graine et le score sont encodés
dans le fragment de l'URL. Le pote ouvre le lien, voit ton score, joue **ta** partie,
et découvre immédiatement s'il t'a battu — puis peut te renvoyer le défi.

Aucun serveur, aucun compte, aucune donnée personnelle qui quitte l'appareil, aucun
coût d'hébergement, rien à maintenir. C'est le mécanisme qui a fait Wordle.

### Deux décisions de conception qui comptent

1. **Les améliorations sont neutralisées dans un duel.** Même graine *et* mêmes
   statistiques, sinon un compte bien équipé gagne sans jouer et la comparaison ne
   veut plus rien dire. Les bits et les spécimens continuent d'être gagnés : le duel
   ne fait perdre aucune progression.
2. **Le classement local ne montre jamais un score que l'appareil n'a pas vu.**
   Pas de faux classement mondial peuplé de bots — la table des rivalités ne contient
   que des gens dont un lien est réellement passé par là.

### Le bilan face à chacun

Chaque duel alimente une fiche par adversaire : victoires, défaites, son record, le
tien. C'est ce qui transforme un lien isolé en rivalité qui dure — et c'est la
raison de revenir qui ne dépend d'aucune notification.

### Passer en ligne, plus tard

`src/meta/leaderboard.ts` définit l'interface `LeaderboardProvider`, avec aujourd'hui
une implémentation locale. Un classement en ligne (Supabase, Cloudflare Workers + D1,
40 lignes d'Express) se branche sans toucher au jeu. Deux points comptent plus que
le choix de l'hébergeur : la graine étant publique, un client peut annoncer n'importe
quel score — soit on l'accepte entre amis, soit le serveur rejoue la run ; et les
pseudos sont du contenu utilisateur affiché à d'autres utilisateurs, donc à assainir
à l'entrée.

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
- Pas de pub qui interrompt une partie (cf. `MONETIZATION.md`).

## 6. Le tutoriel — ce qui a changé d'avis

Le pari initial était « pas de tutoriel : la première run *est* le tutoriel, avec des
indices contextuels ». **C'était faux.** Un joueur réel lâche l'affaire : le buffer,
le vault, le multiplicateur et la corruption sont quatre idées nouvelles servies
simultanément, sans nommer ce qui est à l'écran.

Le tutoriel guidé (`src/game/tutorial.ts`) applique quatre règles :

1. **Une idée par étape. Jamais deux.**
2. **Le joueur fait la chose avant que l'idée suivante n'arrive.** Une étape
   réalisable par une action ne s'avance jamais sur une minuterie — le jeu attend.
3. **Les menaces arrivent une par une**, et seulement après que la boucle centrale
   est comprise. La vague 1 d'une partie guidée n'a ni traqueur ni corruption : les
   deux sont ouverts explicitement, à l'étape qui les explique.
4. **On montre l'élément dont on parle.** Chaque étape surligne sa cible — le vault,
   le compteur EN RISQUE, les vies — et le panneau se déplace s'il masque cette cible.

Mourir pendant le tutoriel ne renvoie pas à un écran de score : le joueur est
relevé et la vraie partie commence. Un débutant n'a pas à être puni pendant qu'il
apprend.

Le tout est passable à tout moment et rejouable depuis le menu (COMMENT JOUER).
