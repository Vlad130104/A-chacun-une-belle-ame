# Fiche pédagogique : construire et évaluer un agent trader IA

| Rubrique   | Contenu                                                                             |
| ---------- | ----------------------------------------------------------------------------------- |
| Discipline | Informatique / algorithmique appliquée à la finance                                 |
| Public     | Lycée (terminale, option informatique), BTS, licence, formation adulte              |
| Prérequis  | Variables, conditions, boucles, fonctions, listes ; pourcentages                    |
| Durée      | 6 séances de 2 h (une par chapitre du [cours](./COURS.md))                          |
| Matériel   | Un ordinateur par binôme, Python 3.10+, le dossier `agent-trader/`, vidéoprojecteur |
| Option     | Clé API Anthropic pour la séance 6 (démonstration par le formateur suffit)          |

## Objectif général

Comprendre comment fonctionne un agent de trading algorithmique, savoir évaluer honnêtement une stratégie, et
développer un regard critique sur les promesses de « trading automatique par IA ».

## Objectifs spécifiques (à la fin de la séquence, l'apprenant est capable de…)

1. lire une bougie OHLCV et calculer un rendement ;
2. calculer à la main une SMA et interpréter un RSI ;
3. expliquer la différence entre suivi de tendance et retour à la moyenne ;
4. calculer une taille de position avec la règle du 1 % et un stop basé sur l'ATR ;
5. lancer un backtest et interpréter rendement, drawdown, Sharpe et nombre de trades ;
6. repérer un biais d'anticipation et un surapprentissage ;
7. décrire la boucle d'un agent et le rôle limité confié à l'IA ;
8. ajouter une stratégie au code et la tester.

## Compétences visées

- **Savoirs :** indicateurs techniques, gestion du risque, mesures de performance.
- **Savoir-faire :** lire et modifier du code Python, écrire un test, exécuter une ligne de commande.
- **Savoir-être :** esprit critique, prudence face au risque financier, honnêteté dans la présentation de résultats.

## Déroulé des séances

### Séance 1 : le marché et ses données (2 h)

| Temps  | Phase        | Activité du formateur                                 | Activité des apprenants                         |
| ------ | ------------ | ----------------------------------------------------- | ----------------------------------------------- |
| 15 min | Accroche     | Question : « Peut-on devenir riche avec un robot ? »  | Débat, hypothèses notées au tableau             |
| 30 min | Apport       | Prix, bougie OHLCV, rendement, piège −50 % / +50 %    | Prise de notes                                  |
| 20 min | Manipulation | Faire générer `python -m trader generate --out d.csv` | Ouvrir le CSV dans un tableur, tracer la courbe |
| 35 min | Exercice     | Exercice 1 du cours                                   | Calcul en binôme, correction collective         |
| 20 min | Synthèse     | Notion de buy & hold comme référence                  | Reformulation orale                             |

### Séance 2 : les indicateurs (2 h)

| Temps  | Phase    | Activité                                                                         |
| ------ | -------- | -------------------------------------------------------------------------------- |
| 10 min | Rappel   | Questions flash sur la séance 1                                                  |
| 40 min | Apport   | SMA, EMA, RSI, MACD, ATR, Bollinger ; insister : « un indicateur ne prédit pas » |
| 40 min | Atelier  | Lecture commentée de `indicators.py` ; exercices 2 et 3                          |
| 20 min | Défi     | Calculer à la main un RSI simplifié sur 5 valeurs, comparer au code              |
| 10 min | Synthèse | Tableau récapitulatif indicateur / ce qu'il mesure                               |

### Séance 3 : les stratégies (2 h)

| Temps  | Phase         | Activité                                                                 |
| ------ | ------------- | ------------------------------------------------------------------------ |
| 30 min | Apport        | Tendance vs retour à la moyenne ; stratégie combinée                     |
| 20 min | Démonstration | Le biais d'anticipation, avec le test `NoLookAheadTest`                  |
| 50 min | Atelier       | Exercice 4 : `compare` avec plusieurs `--seed` ; tableau des classements |
| 20 min | Débat         | « Si le classement change à chaque fois, que vaut une stratégie ? »      |

### Séance 4 : la gestion du risque (2 h) — séance clé

| Temps  | Phase        | Activité                                                                        |
| ------ | ------------ | ------------------------------------------------------------------------------- |
| 15 min | Accroche     | Jeu : pile ou face à gain 2 / perte 1, mise 50 % vs 2 % du capital (au tableau) |
| 35 min | Apport       | Stop-loss, règle du 1 %, rapport gain/risque, plafond, coupe-circuit, frais     |
| 40 min | Exercices    | Exercice 5 (calcul), exercice 6 (`--risk 0.05`)                                 |
| 20 min | Lecture code | `risk.py` et `broker.py` : retrouver chaque règle dans le code                  |
| 10 min | Synthèse     | « On ne contrôle pas le marché, on contrôle sa perte »                          |

### Séance 5 : le backtest honnête (2 h)

| Temps  | Phase       | Activité                                                                  |
| ------ | ----------- | ------------------------------------------------------------------------- |
| 30 min | Apport      | Mesures de performance ; 5 pièges (surapprentissage, échantillon, frais…) |
| 45 min | Atelier     | Exercice 7 ; puis séparer un CSV en deux périodes (réglage / validation)  |
| 30 min | Restitution | Chaque binôme présente un résultat **et ses limites**                     |
| 15 min | Synthèse    | Grille « backtest crédible » (voir évaluation)                            |

### Séance 6 : l'agent IA (2 h)

| Temps  | Phase         | Activité                                                                 |
| ------ | ------------- | ------------------------------------------------------------------------ |
| 20 min | Apport        | Boucle de l'agent ; rôle d'avocat du diable confié à Claude              |
| 20 min | Démonstration | `simulate --ai` par le formateur ; lecture du journal JSONL              |
| 20 min | Analyse       | Pourquoi l'IA ne peut que freiner ; ses limites (connaît le passé, coût) |
| 50 min | Projet        | Exercice 8 : ajouter la stratégie Bollinger + un test                    |
| 10 min | Clôture       | Retour sur les hypothèses de la séance 1                                 |

## Évaluation

### Formative (pendant les séances)

Exercices corrigés collectivement, questions flash en début de séance, lecture des journaux.

### Sommative (projet final, sur 20)

| Critère                                                                 | Points |
| ----------------------------------------------------------------------- | ------ |
| La nouvelle stratégie fonctionne et est enregistrée dans `STRATEGIES`   | 4      |
| Au moins un test unitaire pertinent, et tous les tests passent          | 3      |
| Aucun biais d'anticipation (n'utilise que les données 0..i)             | 3      |
| Backtest avec frais, comparé au buy & hold et aux autres stratégies     | 3      |
| Validation sur une période non utilisée pour le réglage                 | 3      |
| Note écrite d'une page : résultats **et limites** présentés honnêtement | 4      |

Une stratégie qui perd de l'argent mais dont l'analyse est rigoureuse peut obtenir 20/20. Une stratégie
« gagnante » présentée sans ses limites ne peut pas dépasser 12/20.

## Points de vigilance pour le formateur

- Rappeler à chaque séance : **simulation uniquement**, aucun conseil d'investissement.
- Certains apprenants voudront brancher un vrai compte : expliquer pourquoi c'est prématuré (chapitre 6 et
  synthèse du cours).
- Méfiance envers les publicités de « robots IA » garantissant des gains : c'est un terrain fréquent d'arnaques.
  Une promesse de gain garanti est un signal d'alerte.
- Les résultats sur données synthétiques sont du hasard : c'est l'enseignement voulu, pas un défaut.
