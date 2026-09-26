# Koss Smart Pro : stratégie et fiche pédagogique

Stratégie SMC / ICT complète + indicateur TradingView [`koss_smart_pro.pine`](./koss_smart_pro.pine).

> **Le code n'a pas été compilé ici** (pas d'accès à TradingView). En cas d'erreur, envoyez le message exact avec le numéro de ligne.

---

## 1. Parlons franchement des 70 %

**Personne ne peut garantir 70 % de trades gagnants.** Ni moi, ni un formateur, ni un indicateur. Ce que je peux faire :
1. construire une stratégie qui **met toutes les chances de son côté** pour atteindre un taux élevé ;
2. faire en sorte que l'indicateur **mesure lui-même** son taux de réussite sur votre marché, pour que vous jugiez sur des chiffres et non sur des promesses.

### Taux de réussite et ratio gain / risque vont ensemble

Un taux de réussite seul ne veut rien dire. Ce qui compte, c'est **l'espérance** : ce que vous gagnez en moyenne par trade.

**Espérance = (taux de réussite × gain moyen) − (taux de perte × perte moyenne)**

| Si vous visez… | Taux de réussite minimum pour ne pas perdre |
|---|---|
| 0,5 R de gain moyen | 67 % |
| 1 R | 50 % |
| 2 R | 33 % |
| 3 R | 25 % |

**Le piège** : pour avoir 70 % de gagnants, on prend souvent le profit très tôt (petit gain), et une seule perte efface plusieurs gains. Avec la gestion de cette stratégie (50 % fermés à 1R, stop remis à l'entrée) :
- si TP2 n'est **jamais** atteint, chaque « gagnant » ne rapporte que 0,5 R → il faut **plus de 67 %** de TP1 pour ne pas perdre ;
- si TP2 (≈ 3R) est atteint une fois sur deux, le gain moyen monte à ≈ 1,25 R → **44 %** de TP1 suffisent déjà pour être gagnant.

**Conclusion** : l'objectif réaliste n'est pas « 70 % à tout prix », c'est **une espérance positive**. Le panneau de l'indicateur affiche les deux : le taux de TP1 **et** l'espérance en R.

---

## 2. La stratégie en 6 étapes (modèle « Liquidité → MSS → FVG »)

C'est le modèle ICT le plus enseigné pour l'intraday : le marché va d'abord **chercher la liquidité** (les stops des autres), puis **change de direction**, et laisse une **zone d'entrée** (FVG / OB) sur son passage.

### Étape 1 : le biais (timeframe supérieur)
- **Tendance** : sur le HTF (H4 pour trader en M15), la dernière cassure de structure (BOS) donne le sens. On ne cherche **que des achats** en tendance haussière, **que des ventes** en baissière.
- **Premium / discount** : on coupe le dernier range HTF (swing haut ↔ swing bas) en deux. **Acheter en discount** (sous le milieu), **vendre en premium** (au-dessus). On achète « pas cher » et on vend « cher ».

### Étape 2 : repérer la liquidité
Là où se trouvent les stops des traders :
| Niveau | Nom | Pourquoi |
|---|---|---|
| Plus haut / plus bas de la veille | PDH / PDL | Niveaux regardés par tout le monde |
| Plus haut / plus bas de la session asiatique | AS H / AS L | Souvent pris à l'ouverture de Londres ou de New York |
| Sommets / creux récents | BSL / SSL | Stops au-dessus des sommets (BSL), sous les creux (SSL) |
| Sommets / creux égaux | EQH / EQL | « Double top / bottom » : beaucoup de stops groupés |

### Étape 3 : attendre le **sweep** (prise de liquidité)
- **Achat** : une mèche passe **sous** un niveau de liquidité basse (PDL, AS L, SSL, EQL)… puis la bougie **clôture au-dessus**. Les vendeurs ont été piégés.
- **Vente** : l'inverse au-dessus d'un niveau haut.
- Une clôture franche au-delà du niveau n'est **pas** un sweep : c'est une cassure, on ne trade pas contre.

### Étape 4 : le **MSS** (changement de structure) avec **déplacement**
- Dans les **20 bougies** qui suivent le sweep, le prix doit **casser le dernier sommet interne** (pour un achat) en clôture : c'est le MSS (CHoCH si la structure interne était baissière).
- Le mouvement doit laisser un **FVG** (déséquilibre de 3 bougies) **au-dessus du sweep** : c'est la preuve d'un vrai déplacement.
- L'**Order Block** = la dernière bougie opposée avant ce déplacement.

### Étape 5 : l'entrée
- **Ordre limite** au **milieu du FVG** (CE, 50 %) ou au bord du FVG.
- Le FVG doit être **valide et non mitigé** : c'est le premier retour du prix dedans.
- L'entrée n'est prise **que pendant une killzone** : Londres (02:00–05:00 heure de New York) ou New York (07:00–10:00).
- **2 trades maximum par jour.**
- Si le prix atteint TP1 sans revenir dans la zone : on laisse partir. Si l'ordre n'est pas rempli en 20 bougies : annulé.

### Étape 6 : la gestion
- **Stop** : juste au-delà de la mèche du sweep (+ 0,1 ATR).
- **TP1 = 1R** : on ferme 50 % et on remet le stop au prix d'entrée (le trade ne peut plus perdre).
- **TP2** = le niveau de liquidité opposé le plus proche (ex. AS H, PDH). S'il n'y en a pas : 2R.
- **Pas assez de place** (liquidité opposée à moins de 1,5R) → pas de trade.

### Pourquoi ces règles augmentent le taux de réussite
| Règle | Effet |
|---|---|
| Biais HTF + premium / discount | On trade dans le sens du courant principal, depuis une zone « bon marché » |
| Sweep obligatoire | Les stops des autres ont déjà été pris : le « carburant » du mouvement contraire est consommé |
| MSS + FVG obligatoires | Le changement de direction est confirmé, pas deviné |
| Killzone | Volume et volatilité suffisants pour atteindre TP1 |
| TP1 à 1R + stop à l'entrée | Objectif proche = atteint plus souvent ; ensuite, le trade est protégé |
| Espace ≥ 1,5R | On évite les trades bloqués par un niveau juste au-dessus |
| 2 trades / jour | On évite la sur-exposition et le « revenge trading » |

---

## 3. Timeframes et sessions

| Style | Biais (HTF) | Entrée | Killzones |
|---|---|---|---|
| **Intraday (recommandé)** | **H4** | **M15** (ou M5) | Londres + New York |
| Scalping | H1 | M1 – M5 | Londres + New York |
| Swing (moins d'écran) | D | H1 | Désactiver le filtre (killzones trop courtes en H1) |

**Killzones à l'heure de Douala (UTC+1)** :
| Killzone | Nov. – mars | Mars – nov. |
|---|---|---|
| Asie (range, pas d'entrée) | 02:00 – 06:00 | 01:00 – 05:00 |
| **Londres** | **08:00 – 11:00** | **07:00 – 10:00** |
| **New York** | **13:00 – 16:00** | **12:00 – 15:00** |

**Marchés conseillés** : XAUUSD, EURUSD, GBPUSD, NAS100 / US30 (flux du courtier de préférence). **À éviter** : indices synthétiques (pas de liquidité réelle, pas de sessions).

**Annonces** (NFP, CPI, FOMC, décisions de taux) : pas de nouveau trade 30 minutes avant / après. L'indicateur ne les connaît pas : c'est à vous de le faire.

---

## 4. Ce que vous voyez sur le graphique

Trois couleurs seulement : **vert** (achat), **rouge** (vente), **gris** (neutre).

| Élément | Aspect |
|---|---|
| Niveaux de liquidité | Pointillés gris fins + petit nom (PDH, AS L, EQH…). Ils disparaissent dès qu'ils sont pris. 2 swings max. par côté |
| Sweep | « ✕ PDL » en gris à la mèche qui a pris la liquidité |
| MSS | Tirets gris + « CHoCH » ou « BOS » en couleur |
| Zone d'entrée | Boîte FVG (ou OB) très transparente |
| Entrée | Triangle ▲ / ▼ |
| Trade | Entrée (gris), stop (rouge tirets), TP1 (vert pointillé), TP2 (vert tirets) |
| Résultat | « ✓ +1.8R » ou « ✕ −1R » à la sortie |
| Panneau (haut droite) | Biais HTF, premium / discount, killzone, état du setup, **statistiques** |

Seuls les **3 derniers trades** restent dessinés (réglable).

### Le panneau de statistiques
- **Trades** : nombre d'entrées sur l'historique chargé.
- **TP1 %** : part des trades clôturés qui ont atteint TP1 avant le stop → **c'est votre « taux de réussite »**.
- **TP2 %** : part qui a atteint l'objectif final.
- **Résultat / Espérance** : gain total et moyen par trade, en R (1R = le risque d'un trade).

Règles de simulation (prudentes) : entrée au prix limite ; si le stop est touché sur la bougie d'entrée → perte ; spread et commissions **non** comptés (enlevez environ 0,05 à 0,1 R par trade selon le marché).

---

## 5. Paramètres

| Groupe | Paramètre | Défaut | Rôle |
|---|---|---|---|
| Biais | Timeframe du biais | H4 | Doit être supérieur au graphique |
| | Sens du biais / premium-discount | Oui / Oui | Les deux filtres principaux |
| Liquidité | PDH-PDL / Asie / swings | Oui | Niveaux utilisés pour les sweeps et les objectifs |
| | Session asiatique | 20:00–23:59 (NY) | Range asiatique |
| | Longueur des swings / tolérance EQ | 5 / 0,1 ATR | Détection BSL / SSL / EQH / EQL |
| Déclencheur | Swings internes (MSS) | 3 | Plus petit = MSS plus rapide mais plus fragile |
| | Délai sweep → MSS | 20 bougies | Au-delà, le sweep est oublié |
| | Zone d'entrée | FVG | Ou Order Block, ou les deux réunis |
| | Prix d'entrée | Milieu (CE) | Ou bord de zone (plus d'entrées, stop plus large) |
| | Expiration de l'ordre | 20 bougies | |
| | Marge du stop | 0,1 ATR | Au-delà de la mèche du sweep |
| Sessions | Killzones / trades par jour | Oui / 2 | |
| Objectifs | TP1 / part fermée | 1R / 50 % | |
| | Espace minimal | 1,5R | Jusqu'à la liquidité opposée |
| | TP2 par défaut | 2R | Si aucune liquidité opposée |
| Affichage | Trades gardés, panneau, timeframe max., couleurs, transparence | 3, oui, H1 | |

**Alertes** : setup achat / vente (ordre à placer), entrée achat / vente, TP1 atteint, stop touché. Fréquence « Une fois par clôture de barre ».

---

## 6. Routine quotidienne (15 minutes)

1. **Avant Londres** : graphique H4 → biais ▲ ou ▼ ? Prix en discount ou premium ? Si le biais est « indéfini » : journée sans trade.
2. **Graphique M15** : repérez PDH / PDL et le range asiatique (tracés automatiquement).
3. **Pendant la killzone** : attendez l'alerte « Setup » (sweep + MSS). Vérifiez le calendrier économique.
4. **Ordre limite** au prix indiqué, stop et TP1 / TP2 comme dessinés. Risque **0,5 à 1 %** du capital.
5. **À TP1** : fermez 50 %, stop à l'entrée. Ne touchez plus au trade.
6. **Journal** : notez chaque trade (capture, niveau pris, résultat en R).

---

## 7. Comment vérifier les 70 % (protocole)

1. Chargez **XAUUSD M15** (puis EURUSD, GBPUSD) avec les réglages par défaut.
2. Faites défiler le graphique vers la gauche pour charger le maximum d'historique.
3. Lisez le panneau : **TP1 %**, **TP2 %**, **espérance**.
4. Exigez au moins **50 trades par marché** avant de conclure (moins = hasard).
5. Si **TP1 % ≥ 65 %** et **espérance > +0,2 R** sur plusieurs marchés → **2 mois de démo** avant le réel.
6. **Ne modifiez pas les réglages jusqu'à obtenir un joli chiffre** : c'est de la sur-optimisation, et ça ne se reproduit pas en réel.

---

## 8. Limites connues (honnêtement)

1. **Pas de garantie de 70 %** (voir partie 1). Le panneau vous dira la vérité sur votre marché.
2. **Historique limité** : les statistiques portent sur les bougies chargées (quelques semaines à quelques mois selon l'abonnement TradingView).
3. **Simulation simplifiée** : pas de spread ni de glissement ; ordre du mouvement dans une bougie inconnu (d'où la règle « stop sur la bougie d'entrée = perte »).
4. **Liquidité simplifiée** : l'indicateur ne voit que PDH / PDL, Asie, swings et égaux. Pas de liquidité hebdomadaire ni de niveaux ronds.
5. **Une seule position à la fois** ; un nouveau setup remplace un ordre en attente.
6. **Pas de filtre d'annonces économiques.**
7. Le biais HTF réagit avec une bougie HTF de retard (pour éviter le repaint).
