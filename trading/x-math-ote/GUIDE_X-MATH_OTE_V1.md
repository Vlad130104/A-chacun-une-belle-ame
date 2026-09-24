# X-MATH OTE V1 / V1.1 : guide technique et pédagogique

Fichier du code : [`X-MATH_OTE_V1.pine`](./X-MATH_OTE_V1.pine) (Pine Script v6, `strategy()`).

Ce document accompagne le code. Il explique chaque règle, les interprétations retenues quand le cahier des
charges en permettait plusieurs, les règles **ajoutées** (signalées ⚠), et le protocole de test.

---

## 0. Installation dans TradingView

1. Ouvrir un graphique, puis **Éditeur Pine** (en bas de l'écran).
2. Tout effacer, coller le contenu intégral de `X-MATH_OTE_V1.pine`.
3. **Enregistrer**, puis **Ajouter au graphique**.
4. Ouvrir le **Strategy Tester** (Testeur de stratégie).
5. Dans **Paramètres → Propriétés**, renseigner **commission** et **slippage** du marché testé. Le code les met à 0
   par défaut, car ils dépendent du marché (forex, crypto, indices). **Un backtest sans frais est optimiste.**

> Franchise : je n'ai pas de compilateur Pine hors de TradingView. Le code a été relu ligne par ligne contre la
> syntaxe v6, mais la vraie vérification reste la compilation dans l'éditeur. Si une erreur apparaît, envoyez-moi
> le message exact et le numéro de ligne.

---

## 1. Chaîne de décision

```
Biais ─► Swing ─► Impulsion ─► Fibonacci ─► Zone OTE ─► Confirmation ─► BUY/SELL ─► R ─► SL ─► TP1 ─► TP2
```

Chaque maillon est une condition booléenne. Un signal n'existe que si **tous** les maillons sont vrais sur la
même bougie clôturée.

---

## 2. Le biais

### Formules

| Composante     | Formule                                                  | Valeurs     |
| -------------- | -------------------------------------------------------- | ----------- |
| TrendDirection | +1 si EMA50 > EMA200, −1 si EMA50 < EMA200, 0 si égalité | {−1, 0, +1} |
| Slope          | (EMA50 − EMA50[n]) / ATR14                               | réel        |
| SlopeScore     | max(−1, min(+1, Slope / saturation))                     | [−1, +1]    |
| StructureScore | +1 si HH **et** HL, −1 si LH **et** LL, 0 sinon          | {−1, 0, +1} |
| BiasScore      | 0,40 × Trend + 0,30 × SlopeScore + 0,30 × Structure      | [−1, +1]    |

- Haussier si BiasScore ≥ +0,60 ; baissier si BiasScore ≤ −0,60 ; neutre sinon.
- Réglages par défaut : `n = 10` barres, `saturation = 1,0 ATR`.

### Interprétation choisie : normalisation de la pente

Le cahier des charges demande de normaliser la pente entre −1 et +1 sans dire comment. Deux options :

| Option                             | Formule                  | Avantage                                  | Inconvénient                         |
| ---------------------------------- | ------------------------ | ----------------------------------------- | ------------------------------------ |
| **A. Écrêtage linéaire (retenue)** | clamp(Slope / s, −1, +1) | Lisible : « 1 ATR en n barres = score 1 » | Plat au-delà de s                    |
| B. Tangente hyperbolique           | tanh(Slope / s)          | Continue, jamais saturée                  | Moins intuitive, 0,76 pour Slope = s |

J'ai retenu A parce qu'elle se lit directement en ATR.

### Table de vérité du biais (à connaître par cœur)

Avec les poids 0,40 / 0,30 / 0,30 et le seuil 0,60 :

| Trend | Structure  | Biais HAUSSIER si…      | Commentaire                        |
| ----- | ---------- | ----------------------- | ---------------------------------- |
| +1    | +1         | SlopeScore ≥ −0,33      | Presque toujours haussier          |
| +1    | 0          | SlopeScore ≥ +0,67      | Il faut une pente forte            |
| +1    | −1         | **jamais** (max = 0,40) | Structure contraire = pas de trade |
| 0/−1  | quelconque | **jamais**              | Il faut EMA50 > EMA200             |

Conséquence : **EMA50 > EMA200 est une condition nécessaire au BUY** (et EMA50 < EMA200 pour le SELL). Ce n'est pas
un bug, c'est ce que produisent les poids demandés.

---

## 3. Swings et structure

- `ta.pivothigh(high, 3, 3)` et `ta.pivotlow(low, 3, 3)`.
- Un pivot n'est **connu que 3 barres après** son sommet ou son creux. Le code ne s'en sert qu'à ce moment-là : pas de
  repaint. Les étiquettes HH/LH/HL/LL sont dessinées sur la bougie du pivot, mais elles n'apparaissent qu'à la
  confirmation.
- Sont conservés : dernier et précédent Swing High, dernier et précédent Swing Low.
- HH = dernier high > précédent ; LH = dernier high < précédent ; HL / LL pareil pour les lows. En cas d'égalité
  stricte, le code affiche EH / EL, et la structure vaut 0.

---

## 4. Impulsion et setup

### Définition retenue

- **Setup BUY** : créé quand un Swing High H est confirmé et que le dernier Swing Low L est **antérieur** à H.
  L'impulsion est L → H.
- **Setup SELL** : créé quand un Swing Low L est confirmé et que le dernier Swing High H est **antérieur** à L.
  L'impulsion est H → L.
- Impulsion valide si |H − L| / ATR ≥ 1,50, avec l'ATR de la bougie de confirmation du pivot, donc connu à ce
  moment-là.

### ⚠ Règles ajoutées pour rendre le setup non ambigu

Ces règles ne sont pas dans le cahier des charges. Je les ai ajoutées parce que sans elles le programme serait
ambigu ou tradérait des setups morts. Chacune peut être discutée.

| #   | Règle ajoutée                                                                                             | Pourquoi                                                                       |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A1  | L et H doivent être les **extrêmes** de la jambe (aucun high > H ni low < L entre les deux pivots)        | Sinon le Fibonacci serait tracé sur une jambe qui n'est pas la vraie impulsion |
| A2  | Un setup BUY actif n'est **remplacé** que par un nouveau Swing High **plus haut** que son H (miroir SELL) | Un petit LH formé pendant le repli ne doit pas effacer l'impulsion principale  |
| A3  | Setup BUY **invalidé** si une bougie clôture sous L (le 100 %) ; SELL si clôture au-dessus de H           | Structure cassée : l'OTE n'a plus de sens                                      |
| A4  | Setup **consommé** après l'entrée                                                                         | « Une seule entrée par setup »                                                 |
| A5  | Expiration après N barres : **désactivée par défaut (0)**                                                 | Option disponible, sans effet tant que vous ne la réglez pas                   |
| A6  | Aucun signal si une position est déjà ouverte                                                             | Avec `pyramiding = 0`, un SELL en position longue **retournerait** la position |

À propos de A6 : le setup n'est pas consommé s'il se présente pendant une position. Il pourra donner un trade plus
tard si les conditions se représentent une fois la position fermée.

---

## 5. Fibonacci et OTE

| Impulsion | Formule                | 0 % | 100 % |
| --------- | ---------------------- | --- | ----- |
| Haussière | F(r) = H − (H − L) × r | H   | L     |
| Baissière | F(r) = L + (H − L) × r | L   | H     |

Niveaux tracés : 50 % (gris pointillé), 62 % et 78,6 % (bords de la boîte OTE), 70,5 % (pointillé), 100 % (trait
plein), plus l'impulsion en tirets.

**Zone OTE** : entre F(0,62) et F(0,786), dans les deux sens. Les deux bornes sont des inputs ; le code les remet
dans l'ordre si vous les inversez.

**Exemple chiffré (BUY)** : L = 100, H = 110, donc H − L = 10.
F(0,62) = 110 − 6,2 = **103,80** ; F(0,786) = 110 − 7,86 = **102,14**. OTE BUY = [102,14 ; 103,80].

---

## 6. Confirmation

Les trois conditions sont évaluées **sur la même bougie clôturée** (interprétation stricte du texte).

### A. Prix dans l'OTE : interprétation choisie

| Option                                    | Formule (BUY)                            |
| ----------------------------------------- | ---------------------------------------- |
| **A. La bougie touche la zone (retenue)** | Low ≤ haut de zone ET High ≥ bas de zone |
| B. La clôture est dans la zone            | bas ≤ Close ≤ haut                       |

J'ai retenu A. Une bougie de displacement haussier clôture souvent **au-dessus** de l'OTE après y avoir plongé :
avec B, on rejetterait précisément les meilleures confirmations.

### B. Sweep de liquidité : deux définitions au choix (input)

| Mode                                       | PreviousLiquidityLow (BUY)                |
| ------------------------------------------ | ----------------------------------------- |
| **N bougies précédentes (défaut, N = 10)** | plus bas des 10 bougies avant la courante |
| Dernier swing confirmé                     | dernier Swing Low confirmé                |

- BUY : Low < PreviousLiquidityLow **et** Close > PreviousLiquidityLow.
- SELL : High > PreviousLiquidityHigh **et** Close < PreviousLiquidityHigh.

Pourquoi « N bougies » par défaut : pendant le repli vers l'OTE, les pivots de longueur 3 ne sont pas encore
confirmés. Le plus bas des N dernières bougies est une liquidité interne, objective et connue immédiatement.

### C. Displacement

- Body = |Close − Open| ; BodyATR = Body / ATR.
- BUY : Close > Open et BodyATR ≥ 0,60. SELL : Close < Open et BodyATR ≥ 0,60.

---

## 7. Entrée, R, SL et TP

| Élément | BUY                                | SELL                        |
| ------- | ---------------------------------- | --------------------------- |
| Entry   | Close de la bougie de confirmation | idem                        |
| SL      | Low du sweep − 0,10 × ATR          | High du sweep + 0,10 × ATR  |
| R       | Entry − SL                         | SL − Entry                  |
| TP1     | Entry + 1R (ferme 50 %)            | Entry − 1R (ferme 50 %)     |
| TP2     | Entry + 3R (ferme le reste)        | Entry − 3R (ferme le reste) |

- R ≤ 0 : pas de trade. Par construction, Close > PreviousLiquidityLow > Low, donc R > 0 dès que le buffer est ≥ 0.
- Le stop reste fixe. **Aucun passage au point mort après TP1** : ce n'est pas demandé, donc ce n'est pas fait.

### Taille de position (input)

- **Risque fixe en % du capital (défaut 1 %)** : Qty = Capital × 1 % / (R × valeur du point). Chaque trade perdant
  coûte donc environ 1 % : le résultat en % se lit directement en R.
- **Propriétés de la stratégie** : Qty prise dans l'onglet Propriétés (10 % du capital par défaut).

> ⚠ Sur un marché à contrats entiers (futures), avec 1 contrat, 50 % de 1 est arrondi à 0 : tout part à TP2 ou au
> SL. Il faut au moins 2 contrats pour que le fractionnement TP1/TP2 existe.

---

## 8. L'espérance mathématique : le point le plus important

Avec SL à −1R, TP1 à +1R (50 %) et TP2 à +3R (50 %), **un trade n'a que trois issues** (hors frais et slippage) :

| Issue               | Calcul                  | Résultat |
| ------------------- | ----------------------- | -------- |
| SL touché avant TP1 | −1R                     | **−1R**  |
| TP1 puis SL         | 0,5 × (+1) + 0,5 × (−1) | **0R**   |
| TP1 puis TP2        | 0,5 × (+1) + 0,5 × (+3) | **+2R**  |

Donc, en notant p₂ la part de trades qui atteignent TP2 et p₋₁ la part stoppée directement :

```
Espérance (R par trade) = 2 × p₂ − p₋₁
```

**La stratégie est rentable si et seulement si p₂ > p₋₁ / 2.** Exemple : 40 % de SL directs exigent plus de 20 % de
TP2.

Le « taux de réussite » du Strategy Tester est trompeur ici : TradingView compte **chaque sortie partielle comme un
trade**. Une position TP1 puis SL y apparaît comme 1 gagnant et 1 perdant. Le tableau de statistiques du script
regroupe les sorties partielles et raisonne **par position, en R**. C'est lui qu'il faut lire pour les R moyens.

---

## 9. Affichage

- EMA 50 (orange), EMA 200 (bleu).
- Étiquettes HH / LH / HL / LL sur les swings confirmés.
- Boîte OTE BUY (vert) / OTE SELL (rouge), prolongée tant que le setup est actif et figée ensuite.
- Étiquettes BUY / SELL, et une étiquette détaillée Entry / SL / TP1 / TP2 / R à l'entrée.
- Lignes Entry (gris), SL (rouge), TP1 (vert clair), TP2 (vert) tant que la position est ouverte.
- **Tableau d'état** (haut droite) : biais, BiasScore détaillé (T · P · S), swing, OTE, état, dernier signal, Entry,
  SL, TP1, TP2, R.
- **Tableau de statistiques** (bas droite), par position et en R : total, BUY, SELL, 4 sessions UTC, 3 régimes de
  volatilité. Colonnes : trades, % gagnants, profit factor en R, R moyen, gain moyen, perte moyenne, somme des R,
  % TP1 atteint, % TP2 atteint, puis la plus longue série de pertes.
- Fenêtre de données : BiasScore, SlopeScore, StructureScore, Body/ATR sur chaque bougie, pour vérifier une décision.

**Sessions** (heure d'ouverture de la bougie d'entrée, UTC) : Asie 00–07, Londres 07–13, New York 13–21,
hors session 21–24.
**Volatilité** : rang percentile de l'ATR sur 100 barres. Basse < 33,3, moyenne 33,3–66,7, haute > 66,7.

---

## 10. Alertes

Le script appelle `alert()` sur chaque BUY et chaque SELL, à la clôture de la bougie, avec un message JSON :

```json
{
  "project": "X-MATH OTE",
  "version": "V1",
  "signal": "BUY",
  "symbol": "OANDA:EURUSD",
  "timeframe": "15",
  "time": "2026-09-24T14:15:00Z",
  "entry": 1.1025,
  "sl": 1.1011,
  "tp1": 1.1039,
  "tp2": 1.1067,
  "r": 0.0014,
  "tp1_close_pct": 50,
  "qty": 71428.57
}
```

(`qty` vaut `null` en mode « Propriétés de la stratégie ».)

**Créer l'alerte :** Alerte → Condition : `X-MATH OTE V1` → **« Appels de fonction alert() uniquement »** → Message :
laisser vide (le JSON du script est utilisé) → Webhook si besoin.

Autre possibilité pour l'automatisation : condition « Exécutions d'ordres » avec le message
`{{strategy.order.alert_message}}`, qui contient le même JSON.

`alertcondition()` n'est volontairement pas utilisé : son message doit être une constante. Il ne pourrait donc pas
contenir Entry, SL, TP et R, alors que `alert()` accepte un message calculé.

---

## 11. Contrôle qualité (section 15 du cahier des charges)

| #   | Vérification              | Comment le code la respecte                                                                                |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Syntaxe Pine v6           | `//@version=6`, types explicites, pas de cast implicite int/float → bool, `const` pour les options d'input |
| 2   | Variables `na`            | Toute lecture d'un objet `Setup` est protégée par `not na(...)` ; ATR ≤ 0 ou `na` bloque tout calcul       |
| 3   | Index historiques         | `emaFast[n]`, `ta.lowest(...)[1]`, boucles bornées à 4 900 barres et `max_bars_back = 5000`                |
| 4   | Pas de repaint volontaire | Aucun `request.security`, pivots utilisés seulement une fois confirmés, `calc_on_every_tick = false`       |
| 5   | Pivots                    | `ta.pivothigh/low(len, len)` : barre du pivot = `bar_index − len`                                          |
| 6   | Une entrée par setup      | `active := false` à l'entrée + aucun signal hors position plate                                            |
| 7   | Symétrie BUY / SELL       | Blocs miroirs : L↔H, Low↔High, `<`↔`>`, `+`↔`−`                                                            |
| 8   | SL / TP dérivés de R      | `TP = Entry ± k × R`, avec R calculé une seule fois                                                        |
| 9   | TP1 = 1R, TP2 = 3R        | Valeurs par défaut des inputs `TP1` et `TP2`                                                               |
| 10  | Collable directement      | Un seul fichier, sans dépendance ni bibliothèque                                                           |

**Limites connues et assumées :**

- `process_orders_on_close = true` : l'entrée se fait au prix de clôture exact. En réel, on entre juste après, donc
  ajoutez du slippage dans les Propriétés.
- Si SL et TP sont touchés dans la **même bougie**, le Strategy Tester décide de l'ordre avec son modèle
  intra-bougie. Sur les petites unités de temps, activez le _Bar Magnifier_ si votre abonnement le permet.
- Le R des statistiques est calculé sur les prix d'exécution (slippage compris), **sans les commissions**.

---

## 12. Protocole de test

### Règle d'or

1. Tester la V1 **sans rien changer**.
2. Consigner les résultats (fiche ci-dessous).
3. Ne modifier **qu'une seule règle** à la fois, puis retester sur **les mêmes données**.
4. Valider sur une période **hors échantillon** (par exemple, régler sur 2022–2024, vérifier sur 2025–2026).

### Minimum statistique

En dessous de **30 positions**, aucune conclusion. En dessous de 100, les conclusions restent fragiles.

### Fiche de résultats à remplir après chaque test

| Champ                                             | Valeur |
| ------------------------------------------------- | ------ |
| Marché / unité de temps / période                 |        |
| Commission / slippage                             |        |
| Nombre de positions (tableau du script)           |        |
| % gagnants (par position)                         |        |
| Profit factor (Strategy Tester)                   |        |
| Profit factor en R (tableau)                      |        |
| Drawdown max (%)                                  |        |
| Gain moyen (R) / perte moyenne (R)                |        |
| R moyen par position                              |        |
| % TP1 atteint / % TP2 atteint                     |        |
| Série de pertes max                               |        |
| BUY : n / R moyen                                 |        |
| SELL : n / R moyen                                |        |
| Meilleure / pire session                          |        |
| Volatilité basse / moyenne / haute                |        |
| **Seule règle modifiée depuis le test précédent** |        |

### Pistes de V2, à tester une par une et seulement si les données le justifient

- Fenêtre de confirmation : sweep sur la bougie k, displacement jusqu'à k + M (aujourd'hui M = 0).
- Filtre de session, si une session est nettement négative sur un grand échantillon.
- Normalisation de la pente par `tanh`.

---

## 13. V1.1 : augmenter le taux de réussite sans se mentir

### Ce qu'il faut savoir avant tout

**Le taux de réussite seul ne dit pas si une stratégie gagne de l'argent.** Il faut le lire avec le rapport
gain / perte :

| Gain moyen / perte moyenne | Taux de réussite minimum pour ne pas perdre |
| -------------------------- | ------------------------------------------- |
| 0,5                        | 66,7 %                                      |
| 1                          | 50 %                                        |
| 2                          | 33,3 %                                      |
| 3                          | 25 %                                        |

Formule : taux minimum = 1 / (1 + gain moyen / perte moyenne).

Il est très facile d'obtenir 80 % de trades gagnants : un TP à 0,3R et un stop large suffisent. La stratégie perd
quand même, car les 20 % de pertes effacent tout. **Tout levier qui augmente le taux de réussite doit être jugé sur
l'espérance en R, jamais sur le taux seul.**

### Les leviers, classés du plus sain au plus dangereux

| Levier                                  | Effet sur le taux | Effet sur l'espérance                      | Verdict                             |
| --------------------------------------- | ----------------- | ------------------------------------------ | ----------------------------------- |
| **M1 · Point mort après TP1**           | ↑ fort            | Incertain (voir ci-dessous)                | À tester en premier                 |
| **M2 · Clôture en extrémité de bougie** | ↑ probable        | ↑ si le filtre retire surtout des perdants | À tester                            |
| **M3 · Filtre de session**              | ↑ possible        | ↑ seulement si l'écart est réel            | Uniquement avec ≥ 30 trades/session |
| **M4 · Filtre de volatilité**           | ↑ possible        | Idem                                       | Idem                                |
| Baisser TP1 (ex. 0,5R)                  | ↑                 | ↓ souvent                                  | Déconseillé                         |
| Élargir le SL                           | ↑                 | Neutre à ↓ (R plus grand, TP plus loin)    | Déconseillé                         |
| Durcir tous les seuils à la fois        | ↑ sur le passé    | Illusion (sur-optimisation)                | **Interdit** par notre méthode      |

### M1 · Stop au point mort après TP1

⚠ **Modifie une règle existante** (la règle 9 : SL fixe). Désactivé par défaut.

Les trois issues deviennent :

| Issue                      | V1  | V1.1 avec M1 (décalage 0) |
| -------------------------- | --- | ------------------------- |
| SL avant TP1               | −1R | −1R                       |
| TP1 puis retour à l'entrée | 0R  | **+0,5R** (gagnant)       |
| TP1 puis TP2               | +2R | +2R                       |

Tous les trades qui atteignent TP1 deviennent gagnants : **le taux de réussite par position devient égal au
% TP1 atteint.** C'est le levier le plus puissant sur le taux.

Le prix à payer : certains trades qui revenaient à l'entrée **puis** allaient à TP2 (+2R en V1) sont maintenant
sortis à +0,5R. Seul le backtest dit lequel des deux effets l'emporte. Comparez le **R moyen**, pas le taux.

Détail technique : TP1 est connu à la clôture de la bougie où il est exécuté. Le nouveau stop s'applique donc à
partir de la bougie suivante. Si cette bougie ouvre déjà sous l'entrée, la sortie se fait à l'ouverture.

### M2 · Clôture dans l'extrémité de la bougie

Précise le displacement (règle 6C) par une condition supplémentaire :

- BUY : (Close − Low) / (High − Low) ≥ 0,70, soit une clôture dans les 30 % hauts de la bougie ;
- SELL : (High − Close) / (High − Low) ≥ 0,70.

Idée : une bougie qui plonge sous la liquidité puis clôture tout en haut montre un rejet net. Une bougie de gros
corps mais avec une longue mèche opposée est une confirmation plus faible.

### M3 et M4 · Filtres de session et de volatilité

Ils ne s'activent **qu'après lecture du tableau de statistiques**, et seulement si :

1. la catégorie compte **au moins 30 positions** ;
2. son R moyen est nettement négatif alors que les autres sont positifs ;
3. l'écart se confirme sur une **seconde période** (hors échantillon).

Sinon, couper une session revient à effacer les pertes du passé sans rien prédire de l'avenir.

### Ordre de test imposé

| Étape | Réglage                         | On compare au test… |
| ----- | ------------------------------- | ------------------- |
| 0     | Tous modules OFF (V1 pur)       | référence           |
| 1     | M1 seul                         | étape 0             |
| 2     | M2 seul (M1 remis comme décidé) | meilleur de 0 / 1   |
| 3     | M3 si le tableau le justifie    | meilleur précédent  |
| 4     | M4 si le tableau le justifie    | meilleur précédent  |

Un module est **conservé** seulement si, sur la période de test **et** sur la période hors échantillon :

- le R moyen par position ne baisse pas ;
- le drawdown n'augmente pas de plus de 20 % ;
- le nombre de positions reste ≥ 30.

La ligne « Modules actifs » du tableau d'état rappelle toujours ce qui est activé, pour ne jamais comparer deux
captures prises avec des réglages différents sans le savoir.
