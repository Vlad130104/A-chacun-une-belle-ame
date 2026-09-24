# Koss Smart : réglages pour l'or et le forex + protocole de backtest

> **À lire d'abord.** Les réglages ci-dessous sont des **points de départ** choisis selon le comportement connu de chaque marché. **Ils n'ont pas été backtestés** (je n'ai pas accès aux données TradingView). C'est justement le rôle du protocole de la partie B : vérifier s'ils tiennent, avec vos données et votre courtier.

---

# PARTIE A : fiche de réglages

## A1. Choisir son style : le couple de timeframes

Le principe ICT : on lit la **tendance** sur un timeframe supérieur (HTF) et on **entre** sur un timeframe inférieur.

| Style | Graphique (entrée) | Filtre HTF | Longueur du swing | Filtre de session | Pour qui |
|---|---|---|---|---|---|
| Scalping | M5 | H1 | 3 à 5 | Oui | Disponible pendant les sessions, expérimenté |
| **Intraday (recommandé pour commencer)** | **M15** | **H4** | **5** | **Oui** | La plupart des traders |
| Swing | H1 | D (Daily) | 5 à 7 | Non (une killzone ne dure que 3 bougies H1) | Peu de temps devant l'écran |

Dans les paramètres : **6. Filtres** → cocher *Filtre de tendance HTF* et choisir le *Timeframe supérieur* du tableau.

## A2. Réglages par marché (style intraday M15 / H4)

| Paramètre | XAUUSD (or) | EURUSD | GBPUSD | USDJPY |
|---|---|---|---|---|
| Longueur du swing | 5 | 5 | 5 | 5 |
| Marge du stop (x ATR) | **0.2** | 0.1 | **0.15** | 0.1 |
| Killzone 1 | Londres 0200-0500 | Londres 0200-0500 | Londres 0200-0500 | Londres 0200-0500 (option : Asie 2000-2359) |
| Killzone 2 | New York 0700-1000 | New York 0700-1000 | New York 0700-1000 | New York 0700-1000 |
| Fuseau des sessions | America/New_York | America/New_York | America/New_York | America/New_York |
| Confluence obligatoire | Oui | Oui | Oui | Oui |
| Sortie | 50 % TP1 + 50 % TP2, stop à l'entrée après TP1 | idem | idem | idem |
| Risque par trade | 0,5 % au début | 0,5 % | 0,5 % | 0,5 % |

Pourquoi ces différences :
- **Or** : grandes mèches qui vont chercher les stops juste sous / au-dessus des OB → marge de stop plus large (0.2 ATR). Très réactif aux chiffres américains (NFP, CPI, FOMC).
- **GBPUSD** : plus nerveux que l'EURUSD → marge un peu plus large.
- **USDJPY** : bouge aussi pendant la session asiatique. L'option Asie est **à tester**, pas une certitude.
- Les niveaux Fibonacci (0.62 / 0.705 / 0.79) restent aux valeurs par défaut partout : ne pas y toucher.

## A3. Les killzones à l'heure du Cameroun (Douala, UTC+1)

Laissez le fuseau sur **America/New_York** : le script gère tout seul le changement d'heure américain. Ce tableau sert seulement à savoir **quand être devant l'écran** :

| Killzone (heure de New York) | À Douala, de novembre à mars | À Douala, de mars à novembre |
|---|---|---|
| Asie 20:00 – 00:00 | 02:00 – 06:00 | 01:00 – 05:00 |
| **Londres 02:00 – 05:00** | **08:00 – 11:00** | **07:00 – 10:00** |
| **New York 07:00 – 10:00** | **13:00 – 16:00** | **12:00 – 15:00** |

(Les dates exactes de changement d'heure aux États-Unis : 2ᵉ dimanche de mars et 1ᵉʳ dimanche de novembre.)

## A4. Annonces économiques (le script ne les filtre pas)

Le script ne connaît pas le calendrier économique. **Règle manuelle** : pas de nouveau trade 30 minutes avant et après **NFP, CPI, FOMC** (pour l'or et toutes les paires en USD), et les décisions de taux de la BCE (EUR), de la BoE (GBP) et de la BoJ (JPY). En backtest, ces trades sont inclus : c'est une des raisons pour lesquelles le réel sera un peu différent.

## A5. Bonus : indices boursiers (NAS100, US30)

Si vous voulez essayer : M5 ou M15, HTF H1, **une seule killzone** New York 0830-1100. Attention : l'ouverture de 09:30 (heure de NY) crée des gaps et de faux FVG.

---

# PARTIE B : protocole de backtest (pas à pas)

## B1. Préparer le test

1. **Le bon symbole.** Utilisez de préférence le flux de **votre courtier** s'il existe dans TradingView (ex. `PEPPERSTONE:XAUUSD`, `OANDA:EURUSD`…). Sinon, un flux proche (OANDA, FXCM, FOREX.com).
2. **Les coûts** (onglet *Propriétés* de la stratégie : cet onglet remplace les valeurs du code).
   - **Slippage (en ticks) = spread de votre courtier ÷ taille d'un tick.**
     - Pour connaître le tick : comptez les décimales du prix. EURUSD affiché `1.08452` → tick = 0.00001 ; spread 1 pip (0.0001) → **10 ticks**.
     - Or affiché `2345.67` → tick = 0.01 ; spread 0,30 $ → **30 ticks**. S'il est affiché `2345.672` → tick = 0.001 → **300 ticks**.
   - **Commission** : compte standard (sans commission, seulement le spread) → **0**. Compte ECN / Raw → en % par ordre = commission par lot et par côté ÷ valeur d'un lot × 100.
     - Exemple EURUSD : 3,5 $ par côté, 1 lot = 100 000 € ≈ 108 000 $ → 3,5 ÷ 108 000 × 100 ≈ **0,0032 %**.
   - En cas de doute, **mettez des coûts un peu trop élevés** plutôt que trop bas.
3. **L'historique disponible.** TradingView limite le nombre de bougies selon l'abonnement (de quelques milliers à environ 20 000). En M15, 5 000 bougies ≈ **10 semaines** de forex seulement : c'est peu. Solutions : tester **plusieurs marchés** et additionner les trades, passer en H1 pour avoir plus d'historique, ou utiliser le *Deep Backtesting* (abonnement Premium).

## B2. Les deux périodes : test puis validation

On coupe l'historique en deux, grâce au paramètre **7. Backtest → Limiter le backtest à une période** :

| Phase | Période | Ce qu'on a le droit de faire |
|---|---|---|
| **A. Test** | Les **70 %** les plus anciens de l'historique | Tester les réglages de départ. Au maximum **une** modification (par ex. longueur de swing 3, 5 ou 7), choisie **une seule fois**. |
| **B. Validation** | Les **30 %** les plus récents | **Aucune** modification. On lance et on lit le résultat, c'est tout. |

Si la phase B est mauvaise, **on ne recommence pas en changeant les réglages jusqu'à ce qu'elle soit bonne** : ce serait tricher avec soi-même (c'est la sur-optimisation).

## B3. Les critères de décision

Lisez l'onglet *Aperçu* et *Performance* du testeur de stratégie :

| Critère | Seuil minimal | Où le lire |
|---|---|---|
| Nombre de trades | ≥ **100** au total (tous marchés), dont ≥ **30** en phase B | *Total des trades* |
| Profit factor | ≥ **1,3** en phase A, ≥ **1,2** en phase B | *Facteur de profit* |
| Drawdown maximal | ≤ **15 %** du capital (à 1 % de risque) | *Drawdown max* |
| Espérance par trade | ≥ **+0,1 R** (gain moyen ÷ risque moyen) | *Trade moyen* ÷ (capital × risque %) |
| Dépendance à un seul trade | Aucun trade ne fait plus de **25 %** du gain total | *Liste des trades* |
| Courbe du capital | Montée régulière, pas un seul saut | Graphique du testeur |

**Tous les critères doivent passer.** Un seul raté = on ne passe pas à la suite.

## B4. Tests de solidité (à faire après une phase B réussie)

Le résultat doit rester **positif** (profit factor > 1,1) dans chacun de ces cas :

| Test | Comment |
|---|---|
| Coûts doublés | Slippage × 2 |
| Swing voisin | Longueur du swing ± 1 (4 et 6 au lieu de 5) |
| Autres marchés | Mêmes réglages sur les 3 autres marchés du tableau A2 |
| Sans un filtre | Désactiver le filtre de session, puis le filtre HTF (le résultat peut baisser, mais pas s'effondrer) |

Si le résultat s'effondre dans un de ces tests, le « bon » résultat venait d'un réglage chanceux, pas d'un vrai avantage.

## B5. Compte démo (forward test)

1. **Au moins 30 trades ou 2 mois** en démo, avec les mêmes réglages, en prenant **chaque** signal pendant vos heures de disponibilité.
2. Tenez un journal (modèle ci-dessous).
3. Comparez avec le backtest : profit factor et taux de réussite doivent être **du même ordre** (un écart de 20 à 30 % est normal).

| Date | Marché | Sens | Entrée | Stop | TP1 | TP2 | Résultat (R) | Killzone ? | Annonce proche ? | Remarque |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |

## B6. Passage en réel

- Risque **0,25 à 0,5 %** par trade pendant les 50 premiers trades.
- **Règle d'arrêt** : si le drawdown réel dépasse **1,5 fois** le drawdown maximal du backtest, on arrête et on analyse avant de continuer.
- On ne monte le risque (1 % maximum) qu'après 50 trades réels conformes au backtest.

---

## Résumé en une page

1. Commencer en **M15 avec filtre HTF H4**, swing 5, sur **XAUUSD, EURUSD, GBPUSD, USDJPY**.
2. Killzones **Londres et New York** (08:00–11:00 et 13:00–16:00 à Douala en hiver, une heure plus tôt en été).
3. Mettre les **vrais coûts** du courtier dans les propriétés.
4. **Période test (70 %)** puis **période validation (30 %)** sans rien changer.
5. Tous les critères du tableau B3, puis les tests de solidité B4.
6. **2 mois de démo**, puis réel à **0,25–0,5 %** de risque.
7. Si un critère échoue : la stratégie n'a pas prouvé son avantage sur ce marché. On ne la trade pas, même si c'est frustrant.
