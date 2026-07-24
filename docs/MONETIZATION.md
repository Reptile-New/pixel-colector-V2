# Monétisation — stratégie et implémentation

## Le principe directeur

> Un jeu moyen ne se monétise pas. Un bon jeu se monétise presque tout seul.

Corollaire opérationnel : **aucune décision de monétisation ne doit dégrader la
boucle de jeu.** Dès qu'une pub interrompt une run, ou qu'un achat rend le jeu
plus facile, la rétention tombe — et la rétention est le seul multiplicateur qui
compte, parce que le revenu par joueur est mécaniquement :

```
ARPU  =  sessions/jour  ×  jours retenus  ×  (revenu pub/session + taux d'achat × panier)
```

Les deux premiers termes appartiennent au game design, pas au marketing. C'est
pour ça que 90 % du travail de ce dépôt est dans `src/game/` et pas dans
`src/monetize/`.

## Ce qui est implémenté

Tout passe par des interfaces (`src/monetize/monetization.ts`) : le jeu n'importe
jamais un SDK publicitaire. Brancher AdMob, Unity Ads, AppLovin ou AdSense H5 se
fait en remplaçant `MockAdProvider` dans `src/game/app.ts` — aucune ligne de
gameplay ne bouge.

### 1. Pubs à récompense (le pilier)

| Emplacement | Déclencheur | Pourquoi ça marche |
|---|---|---|
| `continue` | Après la mort, une fois par run | Le joueur vient de perdre un score en cours. C'est le moment de valeur perçue maximale. Taux d'opt-in typiques : 25-40 %. |
| `doubleBits` | Écran de fin | Zéro friction, zéro interruption, accélère la boucle méta. |
| `extraDaily` | Run du jour déjà jouée | Convertit une frustration en visionnage volontaire. |

Les pubs à récompense sont **toujours opt-in** et **jamais** placées pendant une run.

### 2. Interstitiels (le complément, dosé)

`Monetization.shouldShowInterstitial()` :
- jamais avant la 3ᵉ run d'un nouveau joueur (on le laisse d'abord accrocher) ;
- ensuite, une fois toutes les 3 runs terminées ;
- jamais au milieu d'une partie ;
- supprimés à vie par l'achat « Sans publicité ».

### 3. Achats intégrés

| Produit | Prix | Contenu |
|---|---|---|
| Sans publicité | 3,99 € | Supprime les interstitiels, garde les pubs à récompense disponibles, offre le skin COLLECTOR et un essai quotidien supplémentaire. |
| Pass Collector | 5,99 €/saison | Piste cosmétique saisonnière, +25 % de bits, 3 spécimens exclusifs. |
| Skin Collector | 1,99 € | Cosmétique seul. |

**Règle absolue : rien de vendu n'affecte l'équilibre.** Les améliorations
(`src/game/upgrades.ts`) ne s'achètent qu'en **bits**, gagnés en jouant. Il n'existe
aucun chemin permettant d'acheter des bits contre de l'argent dans le code actuel,
et c'est un choix, pas un oubli : la seconde où le classement devient achetable,
la course au score perd son sens et la rétention long terme s'effondre.

Le +25 % de bits du Pass est la seule zone grise assumée : il accélère la
progression méta sans toucher au skill ni au score.

## Ordre de grandeur réaliste

Pour un jeu hyper-casual/mid-core web + mobile, avec une bonne rétention (D1 ≈ 35 %,
D7 ≈ 12 %) :

- eCPM rewarded : 8-25 € selon géo · eCPM interstitiel : 3-9 €
- 2-4 pubs vues/jour/joueur actif → **0,03 à 0,10 € / DAU / jour**
- Taux d'achat « sans pub » : 1,5-3 % des joueurs actifs

Autrement dit : **10 000 DAU ≈ 400-1 100 € / mois**, dont ~65 % de pub et ~35 %
d'achats. Ce n'est pas un jeu qui rapporte sans audience — aucun ne l'est. Le
levier n'est pas le taux d'affichage, c'est le nombre de jours où le joueur revient.
D'où les systèmes de `docs/GAME_DESIGN.md` §3 : série quotidienne, run du jour,
missions, album.

## Sur les NFT

Tu l'as évoqué, donc voici une réponse franche plutôt qu'une intégration de façade.

**Ce que le jeu fait déjà et qui va dans ce sens :** chaque spécimen de l'album
possède un **génome déterministe** (`genomeOf()` dans `src/game/specimens.ts`) —
un sprite et une rareté reproductibles à partir d'un identifiant, vérifiables par
n'importe qui, sur n'importe quelle machine. Il en va de même pour les runs, qui
sont entièrement rejouables à partir de leur graine. C'est exactement la primitive
technique dont une couche de propriété aurait besoin, et elle est déjà là.

**Ce que je n'ai pas fait, et pourquoi :**

1. **Les stores l'interdisent ou le taxent.** Apple exige que tout contenu numérique
   déblocable passe par son achat intégré (commission 30 %) ; les places de marché
   NFT externes sont hors-règles. Google est plus souple mais impose des règles
   similaires. Un jeu NFT-first se coupe des deux canaux qui font 95 % du volume mobile.
2. **Ça repousse ton audience cible.** Le public des jeux d'arcade de score est
   très majoritairement hostile aux NFT ; plusieurs studios l'ont appris publiquement
   et douloureusement. Le coût en acquisition dépasse largement le revenu espéré.
3. **Ça inverse la boucle.** Si la valeur d'un spécimen est monétaire, le joueur
   optimise la revente, pas le plaisir. La boucle d'avidité qui fait fonctionner ce
   jeu est *interne* : elle ne survit pas à une avidité réelle branchée dessus.
4. **Complexité réglementaire** (KYC, fiscalité, statut de jeu d'argent selon les
   juridictions) sans commune mesure avec le revenu attendu à ce stade.

**Ma recommandation :** garder l'architecture ouverte, ne rien brancher maintenant.
Si l'audience existe un jour et la demande aussi, l'ajout se fait proprement via un
adaptateur `OwnershipProvider` à côté de `IapProvider` — sans toucher au jeu. Le
travail utile aujourd'hui, c'est la rétention D7.

## Ordre de priorité recommandé

1. **Rétention avant tout.** Instrumenter D1/D7, la vague moyenne, le taux d'abandon
   par vague. Ajuster la courbe de `buildWave()` avec ces chiffres.
2. Brancher un vrai SDK rewarded (le placement `continue` d'abord — c'est le plus rentable).
3. Publier le « Sans publicité » une fois que D7 > 10 %.
4. Classements en ligne pour la Run du jour (c'est le plus gros levier de rétention restant).
5. Pass saisonnier, seulement quand il y a assez de cosmétiques pour le remplir.
