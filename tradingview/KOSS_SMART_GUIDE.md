# Koss Smart — fiche pédagogique

Indicateur TradingView (Pine Script v6) : **Order Block + FVG + OTE**, selon les Smart Money Concepts (ICT).
Code source : [`koss_smart.pine`](./koss_smart.pine).

## 1. Installation

1. TradingView → onglet **Éditeur Pine** (en bas de l'écran).
2. Tout effacer, coller le contenu de `koss_smart.pine`.
3. **Enregistrer**, puis **Ajouter au graphique**.
4. Alertes : clic droit sur le graphique → *Ajouter une alerte* → Condition « Koss Smart » → choisir *Achat*, *Vente* ou *BOS / CHoCH*, fréquence **« Une fois par clôture de barre »**.

## 2. Le modèle, étape par étape

| Étape | Ce que fait l'indicateur | Ce que vous voyez |
|---|---|---|
| 1. Structure | Swings validés par `ta.pivothigh/pivotlow`. La clôture au-delà du dernier swing crée un **BOS** (dans la tendance) ou un **CHoCH** (première cassure contre la tendance). | Ligne grise pointillée + label `BOS` / `CHoCH` |
| 2. Impulsion | Départ de la jambe = plus bas (achat) ou plus haut (vente) depuis le swing cassé. | Petit rond gris au point de départ |
| 3. Order Block | Dernière bougie opposée (baissière pour un achat, haussière pour une vente) avant l'impulsion. | Boîte `OB` |
| 4. FVG | Premier écart de 3 bougies **dans** l'impulsion (`low > high[2]` à l'achat, `high < low[2]` à la vente). | Boîte `FVG` en pointillés |
| 5. Validation | Le setup n'existe **que si** OB + FVG + cassure sont réunis. | — |
| 6. OTE | Retracement 0.62 – 0.79 de la jambe (ligne 0.705 au centre). Tant que le prix ne l'a pas touchée, l'extrême de la jambe suit les nouveaux plus hauts / plus bas. | Boîte grise `OTE` + rond gris à l'extrême |
| 7. Confirmation | Prix dans l'OTE + bougie de réaction (mèche de rejet ou englobante) + OTE qui touche l'OB ou le FVG (si « confluence obligatoire »). | Triangle ▲ / ▼ |
| 8. Trade | Entrée = clôture de la bougie signal. Stop = au-delà de l'OB (+ marge ATR). TP1 = 1R, TP2 = 2R. | Lignes `E`, `SL`, `TP1`, `TP2` |

**Invalidation automatique** (le setup est effacé) : clôture au-delà de la limite opposée de l'OB (OB mitigé), clôture au-delà du départ de la jambe, ou aucun signal après *N* bougies (expiration).

## 3. Paramètres

| Groupe | Paramètre | Défaut | Rôle |
|---|---|---|---|
| Structure | Longueur du swing | 5 | Plus grand = moins de swings, structure plus « majeure ». 3 pour le scalping, 5–10 en swing. |
| | Trader uniquement dans le sens de la tendance | Oui | Ne garde que les setups nés d'un **BOS**. Les CHoCH restent affichés mais ne créent pas de setup. |
| | Afficher BOS / CHoCH, nombre affiché | Oui, 3 | Lisibilité. |
| OB / FVG | Afficher OB, afficher FVG | Oui | — |
| | Recherche de l'OB | 10 | Nombre de bougies examinées avant le départ de la jambe pour trouver la bougie opposée. |
| | Longueur max. de la jambe | 150 | Limite de calcul. |
| OTE | Fibo début / fin / centre | 0.62 / 0.79 / 0.705 | Bornes de la zone OTE. |
| | Confluence obligatoire | Oui | Exige que l'OTE touche l'OB ou le FVG. |
| | Mèche de rejet min. | 0.5 | La mèche doit faire au moins 50 % de la bougie, clôture dans la moitié favorable. |
| | Expiration du setup | 100 | Bougies avant suppression d'un setup sans signal. |
| Trade | Signaux, Entrée/SL/TP | Oui | On/off. |
| | Marge du stop (x ATR) | 0.1 | Évite un stop pile sur le bord de l'OB. 0 = stop exactement sur l'OB. |
| Affichage | Nombre de setups affichés | 1 | Ne garde que les N plus récents. |
| | Transparence des zones | 88 | 85 à 100. |
| | Couleurs | vert / rouge / gris | 3 couleurs maximum. |

## 4. Choix de conception (à connaître)

- **Tendance** : elle est définie par la dernière cassure (cassure d'un swing high → haussière, d'un swing low → baissière). C'est l'équivalent pratique de la suite HH/HL ou LH/LL : un nouveau HH confirmé par clôture = BOS haussier ; la première cassure d'un HL = CHoCH.
- **Sens de la tendance** : comme une cassure met toujours la tendance dans son sens, le filtre ne peut porter que sur le **type** de cassure. Activé, il exclut les setups de retournement (CHoCH).
- **SL / TP** : le stop est toujours rouge et les objectifs toujours verts, quel que soit le sens, pour rester à 3 couleurs.

## 5. Limites connues (honnêtement)

1. **Le code n'a pas pu être compilé ici** : il a été écrit et relu pour Pine v6, mais testez-le dans l'éditeur. Si une erreur apparaît, copiez le message exact.
2. **Retard des pivots** : un swing n'est connu que `longueur` bougies après son sommet. Une cassure qui survient avant la confirmation du pivot est ignorée.
3. **Pas de repaint, mais du retard** : le signal apparaît à la clôture de la bougie de réaction, pas en temps réel.
4. **Un seul FVG retenu** (le premier de l'impulsion) ; son remplissage partiel n'est pas suivi.
5. **Un seul signal par setup.** Si le premier est stoppé, pas de ré-entrée sur la même zone.
6. **Pas de backtest** : c'est un indicateur, pas une stratégie. Les R:R affichés ne disent rien du taux de réussite.
7. **Actifs à gaps** (indices cash, actions) : les gaps d'ouverture créent de faux FVG.

## 6. Pistes d'amélioration

- **Filtre de session / Killzones** (Londres, New York) via `time(timeframe.period, "0700-1000")`.
- **Filtre HTF** : tendance d'une unité supérieure via `request.security(..., lookahead = barmerge.lookahead_off)` sur une valeur confirmée.
- **Déplacement minimal** : exiger que l'impulsion fasse au moins *x* ATR.
- **Premium / Discount** : n'acheter que sous 50 % du range, vendre au-dessus.
- **Liquidité** : exiger un balayage d'un plus bas / plus haut avant le CHoCH.
- **Version `strategy()`** pour mesurer le taux de réussite et le facteur de profit.
- **Suivi du trade** : afficher TP/SL touchés et un tableau de statistiques.
