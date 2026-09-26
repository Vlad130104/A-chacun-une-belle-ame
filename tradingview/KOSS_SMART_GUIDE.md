# Koss Smart — fiche pédagogique

Indicateur TradingView (Pine Script v6) : **Order Block + FVG + OTE**, selon les Smart Money Concepts (ICT).
Deux fichiers :
- [`koss_smart.pine`](./koss_smart.pine) : l'**indicateur** (signaux + alertes) ;
- [`koss_smart_strategy.pine`](./koss_smart_strategy.pine) : la **stratégie** de backtest (même détection, avec ordres réels simulés).
- [`KOSS_SMART_REGLAGES_OR_FOREX.md`](./KOSS_SMART_REGLAGES_OR_FOREX.md) : **réglages conseillés pour l'or et le forex** et protocole de backtest pas à pas.
- [`koss_smart_synth.pine`](./koss_smart_synth.pine) + [`KOSS_SMART_SYNTH_GUIDE.md`](./KOSS_SMART_SYNTH_GUIDE.md) : **Koss Smart Synth**, version pour les indices synthétiques Deriv (avec mode contrôle).
- [`koss_sessions.pine`](./koss_sessions.pine) + [`KOSS_SESSIONS_GUIDE.md`](./KOSS_SESSIONS_GUIDE.md) : **Koss Sessions**, sessions Sydney / Tokyo / Londres / New York avec plus haut / plus bas exacts et PDH / PDL.
- [`../mt5/KossSmartEA.mq5`](../mt5/KossSmartEA.mq5) + [`../mt5/KOSS_SMART_EA_GUIDE.md`](../mt5/KOSS_SMART_EA_GUIDE.md) : **Koss Smart EA**, version MetaTrader 5 (ordres automatiques, backtest sur les données du courtier, mode contrôle).

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
| | Panneau d'état | Oui | Coin haut droit : tendance HTF (▲ / ▼ / –) et état de la session. |
| Filtres | Filtre de session (killzones) | Non | Le signal n'est accepté que pendant la killzone 1 (Londres, 02:00–05:00 New York) ou 2 (New York, 07:00–10:00). Ignoré en D/W/M. |
| | Fuseau horaire des sessions | America/New_York | Fuseau dans lequel les heures des killzones sont écrites (heure ICT = New York). |
| | Surligner les killzones | Non | Fond gris très léger pendant les sessions. |
| | Filtre de tendance HTF | Non | Achats seulement si la structure du timeframe supérieur est haussière (et inversement). Les setups contraires ne sont même pas dessinés. |
| | Timeframe supérieur / swing HTF | 240 (4H) / 5 | Doit être **supérieur** au timeframe du graphique, sinon le filtre est ignoré (le panneau affiche « invalide »). |

## 4. Version stratégie (backtest)

Coller `koss_smart_strategy.pine` dans un **nouveau** script, l'ajouter au graphique, puis ouvrir l'onglet **Testeur de stratégie**.

| Paramètre | Défaut | Rôle |
|---|---|---|
| Risque par trade | 1 % | La taille de position est calculée pour perdre 1 % du capital si le stop est touché. |
| Levier maximum | 10 | Plafonne la taille quand le stop est très serré (sinon position démesurée). |
| Sortie | 50 % TP1 + 50 % TP2 | Ou tout à TP1 (1R), ou tout à TP2 (2R). |
| Stop au point d'entrée après TP1 | Oui | En mode 50/50, le stop de la 2ᵉ moitié passe au prix d'entrée (break-even) dès que TP1 est pris. |
| Limiter le backtest à une période | Non | Début / fin de la période testée : sert à séparer période de test et période de validation. |

Réglages fixes dans l'en-tête `strategy(...)` : capital 10 000, commission 0,02 %, slippage 2 ticks, une seule position à la fois. **Adaptez commission et slippage à votre courtier**, sinon les résultats sont trop optimistes.

Comment l'ordre est exécuté :
- le signal est validé à la **clôture** de la bougie de réaction ; l'entrée se fait au marché à l'**ouverture de la bougie suivante** (c'est réaliste, mais le prix d'entrée réel diffère légèrement de la ligne `E`) ;
- stop et objectifs sont calculés sur la clôture du signal ;
- un nouveau signal est ignoré tant qu'une position est ouverte ;
- si une même bougie touche le stop et l'objectif, TradingView ne connaît pas l'ordre réel des mouvements dans la bougie : il fait une hypothèse. Activez *Bar Magnifier* (compte payant) pour plus de précision.

Comment lire le résultat : regardez au minimum le **nombre de trades (> 100)**, le **profit factor (> 1,3)**, le **drawdown maximal** et la stabilité sur plusieurs actifs et périodes. Un bon résultat sur un seul actif et une seule période, c'est probablement de la sur-optimisation.

## 5. Choix de conception (à connaître)

- **Tendance** : elle est définie par la dernière cassure (cassure d'un swing high → haussière, d'un swing low → baissière). C'est l'équivalent pratique de la suite HH/HL ou LH/LL : un nouveau HH confirmé par clôture = BOS haussier ; la première cassure d'un HL = CHoCH.
- **Sens de la tendance** : comme une cassure met toujours la tendance dans son sens, le filtre ne peut porter que sur le **type** de cassure. Activé, il exclut les setups de retournement (CHoCH).
- **SL / TP** : le stop est toujours rouge et les objectifs toujours verts, quel que soit le sens, pour rester à 3 couleurs.

## 6. Limites connues (honnêtement)

1. **Le code n'a pas pu être compilé ici** : il a été écrit et relu pour Pine v6, mais testez-le dans l'éditeur. Si une erreur apparaît, copiez le message exact.
2. **Retard des pivots** : un swing n'est connu que `longueur` bougies après son sommet. Une cassure qui survient avant la confirmation du pivot est ignorée.
3. **Pas de repaint, mais du retard** : le signal apparaît à la clôture de la bougie de réaction, pas en temps réel.
4. **Un seul FVG retenu** (le premier de l'impulsion) ; son remplissage partiel n'est pas suivi.
5. **Un seul signal par setup.** Si le premier est stoppé, pas de ré-entrée sur la même zone.
6. **Backtest ≠ garantie** : les résultats passés, même avec commissions, ne prédisent pas les résultats futurs. Testez en démo avant le réel.
7. **Filtre HTF** : il utilise la bougie HTF **précédente clôturée** (pas de repaint), donc il réagit avec une bougie HTF de retard.
8. **Actifs à gaps** (indices cash, actions) : les gaps d'ouverture créent de faux FVG.

## 7. Pistes d'amélioration

- **Déplacement minimal** : exiger que l'impulsion fasse au moins *x* ATR.
- **Premium / Discount** : n'acheter que sous 50 % du range, vendre au-dessus.
- **Liquidité** : exiger un balayage d'un plus bas / plus haut avant le CHoCH.
- **Stop suiveur** (sous chaque nouveau HL) au lieu d'objectifs fixes.
- **Filtre de jours** (éviter lundi matin / vendredi soir, annonces économiques).
- **Suivi du trade** : afficher TP/SL touchés et un tableau de statistiques.

## 8. Indices synthétiques (Deriv, Weltrade)

**Le code fonctionne techniquement sur n'importe quel symbole présent dans TradingView.** La vraie question est : le symbole y est-il, et le modèle a-t-il un sens dessus ?

| Point | Deriv (Volatility, Boom/Crash, Jump, Step…) | Weltrade (GainX, PainX, FX Vol, SFX Vol…) |
|---|---|---|
| Données dans TradingView | Oui, préfixe `DERIV:` (ex. `DERIV:VOLATILITY_75_INDEX`). Vérifier chaque symbole dans la recherche. | Weltrade propose des graphiques TradingView, mais leur présence dans la recherche de symboles n'est pas confirmée. Taper `GainX` / `PainX` dans la recherche pour le savoir. |
| Exécution automatique depuis TradingView | Non : le script envoie des alertes, l'ordre se passe à la main sur MT5 / Deriv. | Non, même chose (MT4 / MT5). |

Réglages conseillés sur ces indices :
- **Filtre de session : désactivé.** Ces marchés tournent 24 h/24, 7 j/7, sans sessions ni annonces : les killzones n'y veulent rien dire.
- **Commission : 0 %.** Le coût réel est le **spread** : le saisir en *slippage* (en ticks) dans les propriétés de la stratégie.
- **Taille de position :** le backtest ne connaît ni le lot minimal ni le pas de lot du courtier. Vérifier sur MT5 que la taille calculée est réalisable.
- **Boom / Crash, GainX / PainX :** les pics créent des bougies géantes, donc des BOS et FVG « faciles » et des stops très larges. Le modèle y produit beaucoup de faux setups.

**À savoir honnêtement :** ces indices sont générés par un **générateur de nombres aléatoires** (déclaré par les courtiers eux-mêmes). Il n'y a ni banques, ni liquidité institutionnelle, ni ordres en attente : la base théorique des Smart Money Concepts (OB, FVG, liquidité) n'existe pas sur ces marchés. Sur un prix aléatoire, aucun motif graphique n'a d'avantage durable : un backtest positif y est, le plus souvent, du hasard ou de la sur-optimisation. Si vous testez quand même, exigez beaucoup de trades (> 300), testez plusieurs indices et plusieurs périodes, et restez en compte démo.
