# Bougies Algo × CHoCH : guide de l'indicateur

Indicateur TradingView (Pine Script v6) : `bougies_algo_choch.pine`.

## 1. Installation (2 minutes)

1. Ouvrir TradingView, puis **Pine Editor** (en bas de l'écran).
2. Supprimer le code par défaut et coller tout le contenu de `bougies_algo_choch.pine`.
3. Cliquer sur **Enregistrer**, puis sur **Ajouter au graphique**.
4. Si TradingView affiche une erreur de compilation, copier le message exact (avec le numéro de ligne) pour qu'on la corrige. Le code n'a pas pu être compilé dans TradingView pendant sa rédaction.

## 2. Définition utilisée

| Élément         | Formule                                                               |
| --------------- | --------------------------------------------------------------------- | ------------------- | --- |
| Amplitude       | `haut − bas`                                                          |
| Corps           | `                                                                     | clôture − ouverture | `   |
| Mèches          | `amplitude − corps` (haute + basse)                                   |
| **Bougie algo** | `corps ≤ 35 % de l'amplitude` **et** `mèche(s) ≥ 65 % de l'amplitude` |

> ⚠️ **Point de logique important** : corps + mèches = 100 % de la bougie. Donc « corps ≤ 35 % » et « mèches ≥ 65 % » sont **exactement la même règle**. La seconde n'ajoute rien.
> La seule lecture où la règle des 65 % filtre réellement, c'est si **une seule mèche** doit faire 65 % (bougie de rejet, type pin bar). Les deux lectures sont proposées dans le paramètre **« Mesure de la mèche »** :
>
> - _Mèches cumulées_ (par défaut) : ta définition au sens strict. Elle inclut les dojis et les toupies (petit corps au milieu, deux mèches moyennes).
> - _Une seule mèche_ : plus strict, seules les bougies de rejet franches sont retenues.

## 3. Ce que fait l'indicateur

### Étape 1 : graphique D, H4 ou H1 (mode « Analyse »)

1. **Structure** : les sommets et creux (swings) sont validés par `N` bougies de chaque côté (paramètre « Force des swings », 5 par défaut).
2. **CHoCH** :
   - _haussier_ : la tendance était baissière et une **clôture** passe au-dessus du dernier sommet ;
   - _baissier_ : la tendance était haussière et une clôture passe sous le dernier creux.
   - Une cassure dans le sens de la tendance est un BOS : elle est ignorée.
3. **Dernière jambe avant le CHoCH** :
   - pour un CHoCH haussier : du sommet cassé jusqu'au creux le plus bas atteint ensuite (la dernière jambe baissière) ;
   - pour un CHoCH baissier : symétrique.
4. Chaque **bougie algo** de cette jambe est tracée en **zone marron** (du haut au bas de la bougie, prolongée de 10 bougies vers la droite par défaut).
5. Un **rectangle violet fin** (sans remplissage) encadre **tout le mouvement** : du début de la jambe jusqu'à la bougie de cassure, du plus haut au plus bas.
   - Le rectangle n'est tracé **que s'il contient au moins une bougie algo**, pour garder le graphique propre.

```
CHoCH haussier :

  sommet cassé ──┐                          ┌── clôture au-dessus = CHoCH
                 │ ▓ ← bougie algo (marron)  │
  ┌──────────────┼───── rectangle violet ────┼──┐
  │              ╲   ▓                      ╱   │
  │               ╲      ▓                ╱     │
  │                ╲_____________________╱      │
  │                     creux le plus bas       │
  └─────────────────────────────────────────────┘
       |← dernière jambe baissière →|← mouvement du CHoCH →|
```

### Étape 2 : graphique M30, M15 ou M5 (mode « Entrée »)

1. L'indicateur calcule en arrière-plan les **rectangles violets du timeframe H4** (modifiable : D ou H1) et les affiche sur le petit timeframe.
2. Sur le petit timeframe, il détecte ses propres CHoCH et repère les bougies algo de la dernière jambe avant chacun d'eux.
3. Il ne trace en **marron** que les bougies algo qui sont **dans un rectangle violet H4**.

Deux filtres possibles (« Filtre de la zone ») :

| Filtre                                        | Effet                                                                                                                                                                 | Usage                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Dans le rectangle (temps + prix)** (défaut) | La bougie M15 doit être à l'intérieur du rectangle H4, dans le temps et dans le prix. C'est ta consigne au sens strict.                                               | Affiner la zone H4 en une zone M15 plus étroite, puis attendre que le prix y revienne. |
| **Rectangle + retour du prix**                | Accepte aussi les bougies algo formées **après** le rectangle, si le prix revient dans sa fourchette de prix pendant la durée de validité (50 bougies H4 par défaut). | Chercher un déclencheur au moment où le prix revient dans la zone.                     |

> Avec le filtre par défaut, les zones M15 apparaissent **après coup** : le rectangle H4 n'existe qu'une fois le CHoCH H4 confirmé, et à ce moment-là les bougies M15 qu'il contient sont déjà passées. C'est normal et voulu : ce sont des zones de retour, pas des signaux en direct.

### Mode automatique

| Timeframe du graphique              | Mode              |
| ----------------------------------- | ----------------- |
| H1 et au-dessus (H1, H4, D, W)      | Analyse (étape 1) |
| En dessous de H1 (M30, M15, M5, M1) | Entrée (étape 2)  |

On peut forcer le mode dans les paramètres.

## 4. Paramètres

| Groupe      | Paramètre                           | Défaut        | Conseil                                                                  |
| ----------- | ----------------------------------- | ------------- | ------------------------------------------------------------------------ |
| Bougie algo | Corps maximum                       | 35 %          | Ta définition.                                                           |
|             | Mèche minimum                       | 65 %          | Utile seulement en mode « une seule mèche ».                             |
|             | Mesure de la mèche                  | Cumulées      | Voir la section 2.                                                       |
|             | Amplitude minimale (× ATR)          | 0 (désactivé) | Mettre 0,3 à 0,5 en M5 pour éliminer les micro-dojis des marchés calmes. |
| Structure   | Force des swings (analyse / entrée) | 5 / 5         | Plus grand : moins de CHoCH, structure plus majeure.                     |
|             | Cassure validée par                 | Clôture       | « Mèche » donne plus de CHoCH, dont plus de fausses cassures.            |
| Étape 2     | Timeframe du rectangle violet       | H4            |                                                                          |
| Affichage   | Prolonger les zones marron          | 10 bougies    |                                                                          |
|             | Nombre max de structures            | 15            | Les plus anciennes sont effacées.                                        |
|             | Afficher le niveau cassé            | Non           | Ligne pointillée violette + étiquette « CHoCH ».                         |

**Alertes** : _Créer une alerte → condition « Bougies Algo × CHoCH » → « Tout appel de fonction alert() »_. Tu es alerté à chaque nouveau CHoCH avec des bougies algo (étape 1) et à chaque nouvelle zone marron dans une zone H4 (étape 2).

## 5. Ce que l'indicateur ne fait pas : limites à connaître

1. **Le CHoCH n'est pas une vérité objective.** Il dépend de la « force des swings ». Avec 3, tu verras beaucoup de CHoCH ; avec 10, peu. L'indicateur rend ta lecture **reproductible**, pas « juste ». Compare-le à 20 ou 30 de tes annotations manuelles avant de lui faire confiance.
2. **La définition est large.** Avec la mesure « cumulées », tous les dojis et toutes les toupies sont des bougies algo. Sur un petit timeframe en range, il peut y en avoir beaucoup. D'où le filtre ATR et le mode « une seule mèche ».
3. **Rien ne prouve que ces bougies soient liées à des algorithmes.** Une bougie à petit corps et longues mèches montre une indécision ou un rejet ; c'est tout ce qu'on observe. L'avantage statistique de ces zones est **à démontrer par un backtest**, pas à supposer.
4. **Biais de confirmation** : en regardant le graphique, on retient les zones qui ont tenu et on oublie les autres. Note **toutes** les zones tracées (gagnantes et perdantes) sur au moins 50 cas avant de conclure.
5. **Retard inévitable** : un swing n'est validé que `N` bougies après sa formation. Le CHoCH n'est donc confirmé qu'à la clôture de la bougie de cassure.
6. **Historique limité en M5** : TradingView ne charge que quelques milliers de bougies M5 (quelques semaines). Les rectangles H4 plus anciens ne peuvent donc pas être affinés.
7. **Pas de repaint sur l'historique** : le calcul H4 utilise la bougie H4 clôturée précédente (`[1]` + `lookahead_on`), et les CHoCH du graphique ne sont tracés qu'à la clôture.

## 6. Vérifications faites pendant la rédaction

- La logique (swings, CHoCH, dernière jambe, extrême, bougies algo, rectangle) a été reproduite en Python sur 1 500 bougies simulées. Trois invariants ont été vérifiés sur chaque CHoCH : l'extrême de la jambe est bien le plus bas ou le plus haut ; toutes les bougies algo sont dans la jambe ; le rectangle contient tout le mouvement.
- **Non vérifié** : la compilation dans TradingView (aucun compilateur Pine n'est disponible hors de TradingView), et la fréquence réelle des bougies algo sur de vraies données (l'accès aux données de marché était bloqué pendant la rédaction).
