# Analyse du setup gagnant sur PainX 600 et PainX 1200 : fiche pédagogique

Objectif : **faire ressortir la stratégie** cachée derrière vos trades sur PainX, pour construire ensuite **notre propre version** et l'indicateur qui va avec.

Captures analysées :

| Capture | Symbole | Unité de temps | Plateforme |
|---|---|---|---|
| [`painx600_m30_tradingview.jpg`](./images/painx600_m30_tradingview.jpg) | PainX 600 | M30 | TradingView (analyse) |
| [`painx600_m30_mt5.jpg`](./images/painx600_m30_mt5.jpg) | PainX 600 | M30 | MT5 (position ouverte) |
| [`painx1200_h1_mt5.jpg`](./images/painx1200_h1_mt5.jpg) | PainX 1200 | H1 | MT5 (positions ouvertes) |

> Les prix ci-dessous sont **lus à l'œil sur les captures** : ils sont justes à quelques points près.

---

## 1. Ce qu'on voit, trade par trade

### 1.1 PainX 600 (M30)

**Sur TradingView :**
1. **Ligne noire en haut (~104 300)** : un ancien sommet, donc de la liquidité acheteuse. Le prix monte le toucher le 23 septembre (points rouge et vert), puis se retourne. C'est le **sommet majeur**.
2. **4 rectangles violets en escalier descendant** : chaque rebond s'arrête **plus bas** que le précédent, et laisse une **zone d'offre** (order block baissier) :

   | Zone | Haut | Bas |
   |---|---|---|
   | Z1 | ~104 275 | ~104 210 |
   | Z2 | ~104 225 | ~104 180 |
   | Z3 | ~104 190 | ~104 100 |
   | Z4 | ~104 100 | ~104 050 |

3. **Ligne noire en bas (~103 660)** : deux creux presque égaux (24 et 25 septembre). Ce sont des **creux égaux**, donc de la **liquidité vendeuse (SSL)** : les stops des acheteurs sont en dessous.
4. **25 septembre** : le prix remonte dans **Z4** (~104 080), il est rejeté, puis chute violemment le 26 jusqu'à **~103 400**. La chute **traverse les creux égaux** (la SSL est prise).
   - Le tracé gris/vert « 1 / 0,5 / 0 » mesure exactement ce mouvement : de 104 080 à 103 400, soit **~680 points**.
5. **Nouvelle zone violette Z5 (~103 990 / 103 920)** : c'est le point de départ de la chute. Z5 est la **nouvelle marche de l'escalier**.

**Sur MT5 (capture de 21 h 04) :**
- Une position **SELL 7 lots à 103 916,91**, **TP à 103 393,26**. Aucun stop visible.
- Le prix est remonté à ~103 930 **dans Z5**, et la vente a été déclenchée **juste sous le bord inférieur de Z5** (103 920).
- Au moment de la capture, le prix est à 103 631,18 et la position affiche **+1 994,51 USD** :
  - 7 lots × 285,7 points ≈ 2 000 USD, donc **environ 1 USD par point et par lot** ;
  - si le TP est atteint (523,65 points), le gain serait d'**environ 3 660 USD**.

### 1.2 PainX 1200 (H1)

1. **4 rectangles gris en escalier descendant**, du 12 au 16 septembre. Même logique : des sommets de plus en plus bas, chacun laissant une zone d'offre :

   | Zone | Haut | Bas |
   |---|---|---|
   | Z1 | ~92 175 | ~92 135 |
   | Z2 | ~92 115 | ~92 065 |
   | Z3 | ~92 050 | ~92 010 |
   | Z4 | ~92 030 | ~91 960 (prolongée jusqu'au 18) |

2. **Ligne blanche (~91 745)** : deux creux égaux (13 et 16 septembre), donc une **SSL**.
3. **17 septembre** : le prix casse cette ligne et descend à **~91 520**. La SSL est prise.
4. **17 et 18 septembre** : forte remontée (~445 points) jusque **dans Z4** (~91 965).
5. Deux ventes **juste sous le bord inférieur de Z4** :
   - **SELL 3 lots à 91 948,00**, qui affiche +392,43 USD ;
   - **SELL 2 lots à 91 934,54**, qui affiche +234,70 USD.
   - Prix actuel : 91 816,74. Là encore, environ 1 USD par point et par lot.
   - Aucun stop ni TP visible.

---

## 2. La stratégie qui se cache derrière

Les deux trades suivent **exactement le même schéma**. Je l'appelle **« Vente sur l'escalier d'offre »** :

```
   Sommet majeur (liquidité prise)
        ▼
        ███ Z1
           ██ Z2           ← chaque rebond s'arrête plus bas
              ███ Z3          et laisse une zone d'offre
                 ██ Z4  ◄── le prix revient dans la DERNIÈRE zone
                     \         → VENTE au bord inférieur
                      \
   ───────────────────\────── creux égaux (SSL) = cible
                       \
                        ▼ chute (les « drops » de PainX)
```

| Élément | Nom ICT / SMC | Nom offre / demande | Rôle dans vos trades |
|---|---|---|---|
| Sommets de plus en plus bas | Structure baissière (lower highs) | Tendance baissière | **Contexte** : on ne vend que dans ce cas |
| Rectangles | Order blocks baissiers | Zones d'offre | **Zone d'entrée** |
| Ligne sous les creux égaux | Liquidité vendeuse (SSL), creux égaux (EQL) | Support | **Cible** (TP) |
| Remontée dans la dernière zone | Retour en premium, mitigation | Retest de la zone | **Déclencheur** |
| Vente au bord inférieur de la zone | Entrée au bord proche (proximal) | Ordre limite au bord de la zone | **Entrée** |

### Pourquoi c'est cohérent avec PainX

PainX est un **indice qui monte lentement et chute brutalement** (une chute toutes les 600 ou 1 200 ticks en moyenne).
- **Vendre**, c'est se placer **dans le sens des chutes** : quand une chute arrive, elle accélère votre gain d'un coup. C'est ce qu'on voit sur les deux captures.
- Le danger vient de la **montée lente** : si la chute tarde, le prix grignote la position vers le haut.
- **La zone d'offre joue le rôle de plafond** : tant que le prix reste sous la zone, la vente est valable. S'il clôture au-dessus, l'idée est fausse.

---

## 3. Ce que je dois vous dire franchement

1. **Deux exemples ne font pas une stratégie.**
   - Au moment des captures, **les positions étaient encore ouvertes**, en gain latent : le TP de 103 393 n'était pas encore atteint.
   - On ne voit que les trades gagnants. Combien de retours dans une zone d'offre ont été cassés vers le haut ? Il faut compter **au moins 30 setups** en revue manuelle (et 300 en backtest automatique) pour avoir une idée.
2. **Aucun stop visible sur vos positions.**
   - Avec 7 lots à 1 USD par point, 500 points contre vous coûtent **3 500 USD**.
   - Sur PainX, les chutes jouent **pour** une vente. Mais la montée lente, elle, peut durer des jours.
3. **Le 2ᵉ trade (PainX 1200) est plus risqué que le 1ᵉʳ.**
   - **1ᵉʳ trade** : la vente se fait après une **chute qui a cassé la structure** (Z5 est née d'un déplacement baissier). C'est un setup **confirmé**.
   - **2ᵉ trade** : la vente se fait **contre une remontée en V de 445 points**, qui venait de prendre la SSL. En lecture ICT classique, une SSL prise suivie d'une forte remontée est souvent un signal **d'achat**. Ici, c'est la zone Z4 qui a tenu. C'est **possible**, mais c'est un pari sur la zone, sans confirmation.
4. **Ces indices sont générés par un algorithme (RNG).** Il n'y a pas de vendeurs institutionnels derrière les zones. Si la méthode a un avantage, il vient de la **forme du prix de PainX** (dérive lente vers le haut, chutes brutales), pas de la « smart money ». Seul un test sur beaucoup de trades peut le prouver.
5. **Contradiction avec l'EA Koss Smart Pro Synth.** Par défaut, cet EA ne fait que des **achats** sur PainX (dans le sens de la dérive lente). Vos deux trades gagnants sont des **ventes** (dans le sens des chutes). Il faudra choisir laquelle des deux logiques garder, ou les tester l'une contre l'autre.

---

## 4. Notre version : règles proposées (à valider ensemble)

Ce sont vos trades, rendus **mesurables** et **protégés**. Chaque règle a un chiffre, pour qu'un indicateur puisse la détecter et qu'on puisse la tester.

| # | Règle | Détail proposé |
|---|---|---|
| 1 | **Unité de temps** | PainX 600 → M30 ; PainX 1200 → H1 (comme vos captures). Contexte sur H4. |
| 2 | **Structure** | Au moins **2 sommets de plus en plus bas**, chacun avec sa zone d'offre (l'escalier). |
| 3 | **Zone valide** | Dernière bougie haussière avant une chute d'au moins **1,5 × ATR** qui **casse un creux**. Zone = du plus haut de cette bougie à son ouverture. |
| 4 | **Zone fraîche** | Jamais retouchée depuis sa création. Invalide si une bougie **clôture au-dessus** de son haut. |
| 5 | **Cible** | Creux égaux (SSL) ou dernier creux marquant, sous le prix. |
| 6 | **Entrée** | Vente limite **au bord inférieur de la zone, moins 0,1 × ATR** (c'est ce que vous faites déjà : 103 917 pour une zone qui commence à 103 920). |
| 7 | **Confirmation (option)** | Le prix doit clôturer sous la zone sur l'unité de temps inférieure. Elle évite les cas comme le 2ᵉ trade. |
| 8 | **Stop** | Au-dessus du haut de la zone **+ 0,2 × ATR**. **Obligatoire.** |
| 9 | **TP1** | 1,5R : fermer 50 % et mettre le stop au prix d'entrée. |
| 10 | **TP2** | Sous la SSL (−0,5 × ATR), pour profiter des chutes. |
| 11 | **Rapport gain / risque** | Minimum **2R** jusqu'à la cible, sinon pas de trade. |
| 12 | **Taille de position** | **1 % du capital maximum** par zone, même en deux entrées (comme vos SELL 3 + SELL 2). |

### Vos trades avec ces règles

| | PainX 600 | PainX 1200 |
|---|---|---|
| Entrée | 103 917 | ~91 941 (moyenne) |
| Stop proposé | ~104 010 (haut de Z5 + marge) | ~92 050 (haut de Z4 + marge) |
| Risque | ~93 points | ~110 points |
| Cible | 103 393 (votre TP) | 91 745 (SSL) puis 91 520 (creux du 17) |
| Rapport gain / risque | **~5,6R** | **~1,8R** puis **~3,8R** |
| Taille pour risquer 100 USD | ~1,07 lot | ~0,9 lot |
| Verdict | Setup A+ | Setup B (sans confirmation, et SSL déjà prise) |

À titre de comparaison, vos 7 lots sur le 1ᵉʳ trade représentaient environ **650 USD de risque** avec ce stop, et un risque **illimité** sans stop.

---

## 5. L'indicateur qui convient

Je propose un indicateur dédié, plutôt que de modifier Koss Smart Pro : sa logique (sweep → MSS → FVG, entrée au milieu du FVG) n'est **pas** celle de vos trades.

**Réalisé : Koss Supply Zones**, pour TradingView ([`../tradingview/koss_supply_zones.pine`](../tradingview/koss_supply_zones.pine)) et MT5 ([`../mt5/KossSupplyZones.mq5`](../mt5/KossSupplyZones.mq5)), confirmation activée par défaut. Mode d'emploi : [`../tradingview/KOSS_SUPPLY_ZONES_GUIDE.md`](../tradingview/KOSS_SUPPLY_ZONES_GUIDE.md).

Ce qu'il fera :
1. **Détecter et dessiner les zones d'offre** créées par une chute impulsive (règle 3), avec des rectangles propres qui s'arrêtent quand la zone est touchée ou cassée.
2. **Repérer l'escalier** : afficher le nombre de sommets de plus en plus bas, et mettre en évidence la **zone active** (la dernière zone fraîche).
3. **Tracer la cible** : creux égaux (SSL) et dernier creux marquant.
4. **Signaler l'entrée** quand le prix revient dans la zone active, avec la confirmation en option.
5. **Afficher entrée, stop, TP1, TP2** et le rapport gain / risque, avec un **calcul de lot** selon votre capital et votre risque %.
6. **Proposer une version miroir**, pour les indices qui montent par pics :
   - sur **Boom / GainX** : achats sur un escalier de **demande** ;
   - sur **Crash**, qui chute comme PainX : ventes, comme ici.
7. **Envoyer des alertes** à la création d'une zone, au retour dans la zone et au TP.
8. **Garder le graphique propre**, sans repaint : tout est calculé sur bougie clôturée.

Ensuite, si les 30 premiers setups en revue manuelle sont bons : un **EA MT5** avec le mode contrôle, comme pour les versions précédentes.

---

## 6. Ce que vous pouvez faire tout de suite (revue manuelle)

1. Sur PainX 600 (M30) et PainX 1200 (H1), remontez **3 mois** en arrière.
2. Pour chaque escalier d'offre (règle 2), notez le 1ᵉʳ retour dans la dernière zone :
   - entrée, stop et cible selon les règles 6, 8 et 10 ;
   - **résultat** : TP atteint, stop touché ou rien au bout de 48 bougies.
3. Reportez chaque cas dans le **Journal** ([`../journal/Journal_Koss_Smart_Pro.xlsx`](../journal/Journal_Koss_Smart_Pro.xlsx)) :
   - remplissez l'entrée, le stop, le TP2 et le résultat ;
   - écrivez « Escalier d'offre » dans la colonne *Leçon / remarque*.

   Le score /7 du journal est fait pour Koss Smart Pro : ignorez-le pour ce setup. Je l'adapterai une fois les règles validées.
4. Au bout de **30 cas**, regardez :
   - le **taux de réussite** ;
   - le **R moyen**, qui doit être supérieur à 0,3R après le spread pour que ça vaille le coup.
