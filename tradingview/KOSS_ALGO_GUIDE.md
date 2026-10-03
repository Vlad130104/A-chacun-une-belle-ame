# Koss Algo : fiche pédagogique

Indicateur qui repère les **bougies algorithmiques** du dernier mouvement avant un **CHoCH**, sur deux unités de temps.

| Plateforme | Fichier |
|---|---|
| TradingView (Pine Script v6) | [`koss_algo.pine`](./koss_algo.pine) |
| MetaTrader 5 (indicateur) | [`../mt5/KossAlgo.mq5`](../mt5/KossAlgo.mq5) |

Il n'y a **aucun signal d'achat ou de vente** : seulement les tracés demandés.

> **À lire avant tout**
> 1. **Non compilé ici** (ni éditeur Pine ni MetaEditor). En cas d'erreur, envoyez-moi une capture ou le texte exact.
> 2. **Définition de la bougie algo : la vôtre**, c'est-à-dire **très petit corps et longues mèches**, traduite en chiffres réglables (partie 1). Si les bougies marquées ne correspondent pas à ce que vous voyez, envoyez-moi une capture avec 2 ou 3 bougies algo entourées : j'ajusterai les seuils.

---

## 1. Définitions utilisées

| Notion | Règle exacte (réglages par défaut) |
|---|---|
| **Bougie algorithmique** | **Très petit corps et longues mèches** : corps ≤ **25 %** de la bougie, donc mèches ≥ 75 %. La bougie doit aussi mesurer au moins **1 × ATR(14)** du plus haut au plus bas, pour ignorer les petites bougies sans importance. Sa couleur (verte ou rouge) n'a pas d'importance. |
| **Option « deux longues mèches »** | Si elle est activée, la mèche du haut **et** celle du bas font chacune au moins 25 % de la bougie (forme de toupie ou de doji). Désactivée par défaut : une seule longue mèche suffit (marteau, étoile filante). |
| **Sommet / creux de structure** | Plus haut (ou plus bas) que les **3 bougies** de chaque côté |
| **CHoCH haussier** | Une bougie **clôture au-dessus** du dernier sommet alors que la tendance était **baissière** |
| **CHoCH baissier** | Une bougie **clôture sous** le dernier creux alors que la tendance était **haussière** |
| **Dernier mouvement avant le CHoCH** | Pour un CHoCH haussier : la dernière **baisse**, du sommet cassé jusqu'au plus bas. C'est l'inverse pour un CHoCH baissier. |
| **Mouvement CHoCH** (rectangle vert) | Du sommet cassé jusqu'à la bougie du CHoCH, entre le plus haut et le plus bas de cette période |

Au maximum **3 bougies algo** par mouvement sont retenues : les **plus grandes** (mèches comprises).

## 2. Étape 1 : unité d'analyse (Daily, H4 ou H1)

Vous choisissez l'unité d'analyse dans *1. Étape 1 → Unité d'analyse* (H4 par défaut). Le graphique, lui, reste en M5, M15 ou M30.

À chaque CHoCH sur l'unité d'analyse, l'indicateur :
1. **repère** les bougies algo du dernier mouvement avant ce CHoCH ;
2. les **trace en ORANGE** (rectangle plein, de la largeur d'une bougie H4, étiquette « Algo H4 ») ;
3. **encadre** le mouvement du CHoCH avec un **rectangle VERT fin** (étiquette « CHoCH H4 ▲ » ou « ▼ »).

Seuls les **2 derniers** mouvements CHoCH restent à l'écran (réglable).

## 3. Étape 2 : unité d'entrée (M5, M15, M30 = le graphique)

1. L'indicateur cherche les CHoCH de l'unité d'entrée.
2. Pour chacun, il repère les bougies algo du **dernier mouvement avant ce CHoCH**.
3. Il ne garde que celles qui se trouvent **dans la zone verte** de l'unité d'analyse (dans ses prix, après son début).
4. Il les **trace en orange pâle** (contour, étiquette « algo ») avec le niveau du CHoCH en pointillés gris.

Seuls les **3 derniers** CHoCH de l'unité d'entrée qui ont des bougies algo restent à l'écran (réglable). Un CHoCH sans bougie algo dans la zone n'est **pas** dessiné.

## 4. Graphique propre

| Élément | Couleur | Style |
|---|---|---|
| Bougie algo de l'unité d'analyse | Orange vif | Rectangle plein |
| Mouvement CHoCH de l'unité d'analyse | Vert | Rectangle fin, vide |
| Bougie algo de l'unité d'entrée | Orange pâle | Rectangle fin |
| Niveau du CHoCH de l'unité d'entrée | Gris | Pointillés |

Rien d'autre n'est affiché : pas de panneau, pas de swings, pas de liquidité.

## 5. Installation

### TradingView
1. Ouvrez l'**éditeur Pine**, **effacez tout** le modèle proposé (Ctrl + A puis Suppr).
2. Collez le contenu de `koss_algo.pine`, puis **Enregistrer** et **Ajouter au graphique**.
3. Passez le graphique en **M5, M15 ou M30**, et choisissez l'unité d'analyse (D, 240 = H4, 60 = H1).

### MetaTrader 5
1. **Fichier → Ouvrir le dossier des données → MQL5 → Indicators** : copiez `KossAlgo.mq5`.
2. **F4** → ouvrez le fichier → **F7** (compiler) → **0 erreur** attendue.
3. *Navigateur* → *Indicateurs* → clic droit → *Actualiser* → glissez **KossAlgo** sur un graphique M5, M15 ou M30.
4. Si rien n'apparaît au début, l'historique H4 se charge : attendez la bougie suivante ou changez d'unité de temps puis revenez.

## 6. Réglages

| Groupe | Paramètre | Défaut | Rôle |
|---|---|---|---|
| 1. Étape 1 | Unité d'analyse | H4 | Daily, H4 ou H1 |
| | Swings de l'unité d'analyse | 3 | Plus grand = moins de CHoCH, plus importants |
| | Mouvements CHoCH gardés | 2 | |
| 2. Étape 2 | Bougies algo de l'unité d'entrée | Oui | |
| | Swings de l'unité d'entrée | 3 | |
| | Seulement dans la zone verte | **Oui** | Non = toutes les bougies algo avant un CHoCH |
| | Niveau du CHoCH | Oui | Ligne grise pointillée |
| | CHoCH gardés | 3 | |
| 3. Bougie algo | Taille minimale de la bougie | 1 × ATR | Plus petit = plus de bougies algo, y compris de petites |
| | Corps maximal | 25 % | Plus petit (15 %) = corps plus minuscule, mèches plus longues |
| | Exiger deux longues mèches | Non | Oui = seulement les toupies et les dojis |
| | Bougies algo max. par mouvement | 3 | |
| | Chercher aussi dans la jambe du CHoCH | Non | Oui = inclure le mouvement qui fait le CHoCH |
| 4. Couleurs | Orange, orange pâle, vert, gris | | |
| MT5 | Bougies analysées, alertes, notifications | 1 500 / 3 000, Oui, Non | |

**Si vous voyez trop peu de bougies algo** : baissez la *taille minimale* à 0,7 × ATR ou montez le *corps maximal* à 33 %.
**S'il y en a trop** : montez la *taille minimale* à 1,5 × ATR, baissez le *corps maximal* à 15 % ou activez *deux longues mèches*.

## 7. Alertes
- *CHoCH + bougies algo (unité d'analyse)* : un nouveau rectangle vert apparaît.
- *Bougies algo dans la zone (unité d'entrée)* : de nouvelles bougies algo orange pâle apparaissent.

Sur MT5, les mêmes alertes sont disponibles, avec les notifications sur le téléphone en option.

## 8. Limites (franchement)

1. **Retard de confirmation** : un sommet ou un creux n'est confirmé que 3 bougies après. Un CHoCH n'est donc reconnu qu'à la clôture de la bougie qui casse.
2. **Pas de repaint** : l'étape 1 utilise uniquement les bougies H4 (ou D1, H1) **clôturées**, et l'étape 2 les bougies clôturées du graphique.
3. **Les seuils (25 %, 1 × ATR) sont des points de départ.** Comparez avec ce que vous repérez à l'œil et dites-moi ce qu'il faut ajuster.
4. **Cet indicateur ne dit pas** si le prix va réagir sur ces bougies : il les montre, c'est vous qui décidez.
5. **TradingView et MT5 peuvent différer légèrement** (historique et heure du courtier, surtout en Daily).
