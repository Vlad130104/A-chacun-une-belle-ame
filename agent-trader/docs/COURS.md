# Cours : construire un agent trader IA

**Public :** débutants en trading, notions de base en programmation (variables, boucles, fonctions).
**Durée totale :** environ 12 heures (6 chapitres de 2 h).
**Support :** le code du dossier `agent-trader/`.

---

## Chapitre 1 : le marché et ses données

### 1.1 Ce qu'est un prix

Un prix est le dernier montant auquel un acheteur et un vendeur se sont mis d'accord. Il bouge parce que
l'offre et la demande changent en permanence. Personne ne connaît le prix de demain : c'est le point de départ
honnête de tout ce cours.

### 1.2 La bougie (chandelier) OHLCV

Sur une période (une journée, une heure…), on résume les échanges en 5 nombres :

| Lettre | Nom    | Signification              |
| ------ | ------ | -------------------------- |
| O      | Open   | premier prix de la période |
| H      | High   | prix le plus haut          |
| L      | Low    | prix le plus bas           |
| C      | Close  | dernier prix de la période |
| V      | Volume | quantité échangée          |

Dans le code : la classe `Candle` de `trader/data.py`.

### 1.3 Rendement

Rendement d'une période = `prix_final / prix_initial − 1`.
Exemple : de 100 à 110, le rendement vaut 110/100 − 1 = **+10 %**.

**Piège :** −50 % puis +50 % ne ramène pas à zéro. 100 → 50 → 75 : on a perdu 25 %. Plus une perte est grande,
plus il faut de gain pour la rattraper (−50 % exige +100 %). C'est la raison d'être de la gestion du risque.

### 1.4 Le « buy & hold »

Acheter au début et ne rien faire. C'est la référence obligatoire : une stratégie qui fait moins bien que le
buy & hold, avec plus de travail et plus de frais, n'a pas d'intérêt.

**Exercice 1.** Un actif passe de 80 à 60. Quel est le rendement ? Quel gain faut-il ensuite pour revenir à 80 ?

> _Corrigé :_ 60/80 − 1 = −25 %. Pour revenir à 80 : 80/60 − 1 = +33,3 %.

---

## Chapitre 2 : les indicateurs techniques

Un indicateur est un calcul sur les prix passés. Il **résume** le passé ; il ne prédit rien.

### 2.1 Moyenne mobile simple (SMA)

`SMA(n) = moyenne des n derniers prix de clôture`. Elle lisse le bruit et montre la tendance.
Exemple, SMA(3) sur 10, 11, 12, 13 : (10+11+12)/3 = 11, puis (11+12+13)/3 = 12.

### 2.2 Moyenne mobile exponentielle (EMA)

Comme la SMA, mais les prix récents pèsent plus : `EMA = prix × k + EMA_précédente × (1 − k)` avec
`k = 2 / (n + 1)`. Elle réagit plus vite, au prix de plus de faux signaux.

### 2.3 RSI (Relative Strength Index)

Compare la taille moyenne des hausses à celle des baisses sur 14 périodes. Résultat entre 0 et 100.

- au-dessus de 70 : **surachat** (le prix a beaucoup monté) ;
- en dessous de 30 : **survente** (le prix a beaucoup baissé).

Attention : un marché en forte tendance peut rester « suracheté » très longtemps.

### 2.4 MACD

`MACD = EMA(12) − EMA(26)`, `signal = EMA(9) du MACD`. Quand le MACD passe au-dessus de son signal,
l'accélération est haussière.

### 2.5 ATR (Average True Range)

Amplitude moyenne d'une bougie, en prix. C'est une mesure de **volatilité**. L'agent l'utilise pour placer
ses stops : un actif qui bouge beaucoup a besoin d'un stop plus large.

### 2.6 Bandes de Bollinger

Moyenne ± 2 écarts-types. Les bandes s'écartent quand la volatilité augmente.

**Exercice 2.** Lisez `trader/indicators.py`, fonction `sma`. Pourquoi les premières valeurs valent `None` ?

> _Corrigé :_ avec moins de `period` prix, la moyenne n'existe pas encore. Mettre 0 ou une moyenne partielle
> fausserait les signaux.

**Exercice 3.** Calculez à la main la SMA(2) de 4, 6, 10. Vérifiez avec
`python -c "from trader.indicators import sma; print(sma([4,6,10],2))"`.

> _Corrigé :_ [None, 5.0, 8.0].

---

## Chapitre 3 : les stratégies

Une stratégie transforme des indicateurs en décision : **BUY**, **SELL** ou **HOLD**.

### 3.1 Suivi de tendance : croisement de moyennes (`ma_cross`)

- achat quand SMA(20) passe au-dessus de SMA(50) ;
- vente quand elle repasse en dessous.

Idée : « la tendance est mon amie ». Gagne dans les marchés qui montent longtemps, perd dans les marchés
qui oscillent sans direction (beaucoup de faux croisements).

### 3.2 Retour à la moyenne : RSI (`rsi`)

- achat quand le RSI remonte au-dessus de 30 ;
- vente quand il redescend sous 70.

Idée : « ce qui a trop baissé va rebondir ». Gagne dans les marchés qui oscillent, perd gros dans les chutes
durables (on achète un couteau qui tombe).

Les deux philosophies sont **opposées** : aucune ne marche tout le temps.

### 3.3 Stratégie combinée (`combined`)

Achat seulement si trois conditions sont réunies :

1. tendance de fond haussière (EMA 50 > EMA 200) ;
2. accélération (MACD croise son signal vers le haut) ;
3. pas déjà en surachat (RSI < 70).

Plus de filtres = moins de trades, moins de faux signaux, mais aussi des opportunités manquées.

### 3.4 Le biais d'anticipation (look-ahead bias)

L'erreur n°1 des débutants : utiliser, au moment de décider, une information qu'on n'avait pas encore.
Exemple : décider d'acheter en voyant la clôture d'aujourd'hui… et acheter **à cette même clôture**. En
réalité, quand on a lu la clôture, le marché est fermé. L'agent exécute donc à l'**ouverture suivante**
(`trader/agent.py`). Le test `NoLookAheadTest` vérifie que changer le futur ne change pas les décisions passées.

**Exercice 4.** Lancez `python -m trader compare`. Quelle stratégie gagne ? Changez `--seed 7` puis
`--seed 123`. Le classement reste-t-il le même ? Que peut-on en conclure ?

> _Corrigé :_ le classement change selon les données. Sur un marché aléatoire, aucune stratégie n'a d'avantage
> réel : les écarts viennent du hasard. Avec `--seed 7`, l'actif monte de +40 à +50 % alors que les stratégies
> gagnent 2 à 5 % : quand le marché monte, rester souvent hors du marché coûte cher. Avec la graine par défaut,
> l'actif baisse et les stratégies « battent » le buy & hold simplement parce qu'elles étaient peu investies.
> Conclusion : un bon résultat sur une seule série ne prouve rien.

---

## Chapitre 4 : la gestion du risque

C'est le chapitre le plus important. On ne contrôle pas le marché ; on contrôle combien on perd quand on a tort.

### 4.1 Le stop-loss

Prix auquel on vend automatiquement pour limiter la perte. L'agent le place à **2 ATR** sous le prix d'entrée.

### 4.2 La taille de position (règle du 1 %)

On décide d'abord **combien on accepte de perdre** (1 % du capital), puis on en déduit la quantité :

```
quantité = (capital × 1 %) / (prix d'entrée − stop)
```

**Exemple :** capital 10 000 €, prix 100 €, ATR 2 € → stop à 100 − 2×2 = 96 €.
Risque accepté : 100 €. Quantité = 100 / 4 = **25 actions** (2 500 €).
Si le stop est touché : 25 × 4 = 100 € de perte, soit exactement 1 %.

Avec cette règle, il faut **20 pertes d'affilée** pour perdre environ 18 % du capital. Sans elle, un seul
mauvais trade peut en coûter 50 %.

### 4.3 Le rapport gain/risque

L'objectif de gain (take-profit) est placé à 2 fois la distance du stop. Avec un rapport de 2, on peut se
tromper 6 fois sur 10 et rester à l'équilibre (avant frais) : 4 × 2 − 6 × 1 = +2.

### 4.4 Le plafond de position

Aucune position ne dépasse 25 % du capital, même si la formule en demande plus (quand l'ATR est très petit).

### 4.5 Le coupe-circuit (drawdown maximal)

Le **drawdown** est la baisse depuis le plus haut atteint. Si le capital tombe à −20 % de son plus haut,
l'agent vend tout et s'arrête. Un humain doit alors comprendre ce qui ne va pas avant de relancer.

### 4.6 Frais et glissement

Chaque ordre coûte des frais (0,1 % ici) et s'exécute un peu moins bien que prévu (glissement de 0,05 %).
Un aller-retour coûte donc environ 0,3 %. Une stratégie qui fait 200 trades par an paie environ 60 % de son
capital… en frais. Le test `test_round_trip_costs_money` le montre : acheter et revendre au même prix fait perdre.

**Exercice 5.** Capital 5 000 €, prix 50 €, ATR 1,5 €, risque 1 %, stop à 2 ATR. Calculez le stop, la quantité,
le take-profit, la valeur de la position. Le plafond de 25 % s'applique-t-il ?

> _Corrigé :_ stop = 50 − 3 = 47 €. Risque = 50 €. Quantité = 50 / 3 ≈ 16,67. Take-profit = 50 + 6 = 56 €.
> Valeur ≈ 833 € (16,7 % du capital) : le plafond (1 250 €) ne s'applique pas.

**Exercice 6.** Relancez `python -m trader compare --risk 0.05`. Que deviennent rendement et drawdown ?

> _Corrigé :_ sur les données par défaut, le drawdown de `rsi` passe d'environ 7,6 % à 10,4 % et sa perte de
> −5,6 % à −8,0 %, mais l'effet reste limité : le plafond de 25 % par position (4.4) bloque la plupart des
> tailles. Relancez avec `--risk 0.05` en modifiant `max_position_pct` à 1.0 dans `risk.py` : les pertes
> grossissent beaucoup plus. Leçon double : prendre plus de risque n'améliore pas une stratégie, cela grossit
> ses défauts ; et plusieurs garde-fous valent mieux qu'un seul.

---

## Chapitre 5 : évaluer honnêtement une stratégie (backtest)

### 5.1 Le backtest

Rejouer la stratégie sur le passé, bougie par bougie, comme si on y était. `python -m trader backtest`.

### 5.2 Les mesures à lire

| Mesure           | Question à laquelle elle répond               | Repère                         |
| ---------------- | --------------------------------------------- | ------------------------------ |
| Rendement total  | Combien ai-je gagné ?                         | à comparer au buy & hold       |
| Drawdown maximal | Quelle a été la pire chute ?                  | supportable moralement ?       |
| Ratio de Sharpe  | Le gain vaut-il le stress (la volatilité) ?   | > 1 bon, < 0,5 faible          |
| Taux de réussite | Combien de trades gagnants ?                  | seul, ne veut rien dire        |
| Profit factor    | Gains totaux / pertes totales                 | > 1,5 intéressant              |
| Nombre de trades | Le résultat est-il statistiquement solide ?   | < 30 : on ne peut pas conclure |
| Temps investi    | Quelle part du temps l'argent est-il exposé ? | —                              |

### 5.3 Les pièges

1. **Surapprentissage (overfitting).** Tester 100 réglages et garder le meilleur, c'est trouver celui qui a eu de
   la chance. Il échouera sur de nouvelles données.
   → Remède : régler sur une période (ex. 2019-2022), valider **une seule fois** sur une autre (2023-2024).
2. **Trop peu de trades.** 6 trades gagnants peuvent être du pur hasard.
3. **Oublier les frais.** Toujours les inclure.
4. **Biais du survivant.** Tester seulement des actions qui existent encore aujourd'hui oublie celles qui ont fait
   faillite.
5. **Biais d'anticipation.** Voir chapitre 3.4.

**Exercice 7.** Lancez `python -m trader backtest --strategy rsi --fees 0` puis `--fees 0.005`. Comparez.

> _Corrigé :_ le rendement baisse nettement avec des frais élevés. L'écart mesure la dépendance de la stratégie
> aux coûts.

---

## Chapitre 6 : l'agent IA

### 6.1 Qu'est-ce qu'un agent ?

Un programme qui tourne en boucle : **percevoir → analyser → décider → agir → mémoriser**. Ouvrez
`trader/agent.py` : chaque étape est numérotée dans la méthode `run`.

### 6.2 Le rôle de l'IA (Claude) dans cet agent

Un modèle de langage comme Claude **ne prédit pas les prix** : personne ne le peut de façon fiable. Il sait en
revanche lire un contexte et produire un raisonnement structuré. On lui donne donc un rôle limité :
**avocat du diable**. La stratégie propose un achat ; l'IA cherche les raisons de ne pas le faire.

Trois réponses possibles, imposées par un schéma JSON (`DECISION_SCHEMA` dans `trader/llm.py`) :

- `approve` : on garde 50 à 100 % de la taille ;
- `reduce` : on garde 10 à 50 % ;
- `reject` : pas de trade.

### 6.3 Pourquoi l'IA ne peut que freiner

- elle ne crée jamais de trade et n'augmente jamais une taille (le facteur est plafonné à 1) ;
- les ventes ne passent pas par elle : on ne bloque jamais une réduction du risque ;
- en cas de panne, de refus ou de réponse illisible : **pas de trade**.

Principe de conception : **une erreur de l'IA ne doit jamais coûter d'argent**. Au pire, elle fait rater une
opportunité.

### 6.4 Les limites spécifiques à l'IA

- **Elle connaît le passé.** Sur des données réelles anciennes, Claude a pu apprendre ce qui s'est produit.
  Un backtest avec IA sur ces dates triche sans le vouloir.
- **Coût.** Chaque signal d'achat coûte un appel d'API payant.
- **Pas de garantie.** Rien ne prouve que son filtre améliore les résultats. Il faut le **mesurer** : même
  période, même stratégie, avec et sans IA, sur des données qu'elle n'a pas pu voir.

### 6.5 Le journal

Chaque décision est écrite dans `journal/*.jsonl` : signal, avis de l'IA, taille, stops, résultat. C'est la
mémoire de l'agent et l'outil d'audit du formateur.

**Exercice 8 (projet).** Ajoutez une 4e stratégie « cassure de Bollinger » dans `trader/strategies.py` : achat
quand la clôture dépasse la bande haute, vente quand elle repasse sous la moyenne. Enregistrez-la dans
`STRATEGIES`, écrivez un test, comparez-la aux autres.

> _Piste :_ inspirez-vous de `RsiMeanReversion`. Utilisez `bollinger()` dans `prepare`, comparez `closes[i]`
> à `upper[i]` dans `signal`.

---

## Synthèse

1. Personne ne prédit le marché ; on gère le risque de se tromper.
2. Un indicateur résume le passé, une stratégie est une règle, un backtest est une hypothèse.
3. La taille de position et le stop comptent plus que le signal d'entrée.
4. Un bon backtest inclut frais, glissement, et aucune information du futur.
5. L'IA est un filtre prudent, pas un oracle ; son apport se mesure, il ne se suppose pas.
6. Passer au réel demande des mois de simulation, un compte de démonstration, et uniquement de l'argent qu'on
   peut perdre.
