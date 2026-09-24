# Koss Smart Synth : fiche pédagogique

Version de Koss Smart pour les **indices synthétiques Deriv disponibles dans TradingView** (préfixe `DERIV:`).
Code : [`koss_smart_synth.pine`](./koss_smart_synth.pine) (c'est une **stratégie** : signaux, dessins, alertes et backtest dans un seul script).

> **À lire avant tout.** Ces indices sont produits par un **générateur de nombres aléatoires** (Deriv le dit lui-même). Il n'y a ni banques, ni liquidité, ni ordres en attente : les Order Blocks et FVG y apparaissent par hasard et n'ont **pas de base théorique**. Koss Smart Synth est donc un **outil de test honnête**, pas une promesse de gain. Il contient un **mode contrôle** (partie 4) qui sert à vérifier vous-même si le modèle fait mieux que le hasard.
>
> **Le code n'a pas été compilé ni testé** (pas d'accès à TradingView ici). En cas d'erreur, copiez le message exact.

## 1. Installation

1. Éditeur Pine → nouveau script → coller `koss_smart_synth.pine` → **Enregistrer** → **Ajouter au graphique**.
2. Ouvrir un symbole `DERIV:` (tapez « DERIV » ou « Volatility » dans la recherche de symboles).
3. Vérifier la **1ʳᵉ ligne du panneau** (en haut à droite) : elle affiche la famille détectée et le sens autorisé, par ex. « Boom · Ventes seulement ». Si la famille est fausse, forcez-la dans **6. Indices synthétiques → Famille d'indice**.
4. Alertes : clic droit → *Ajouter une alerte* → Condition « Koss Smart Synth » → **« Appels de la fonction alert() uniquement »**.

## 2. Ce qui change par rapport à Koss Smart

| Koss Smart (or, forex) | Koss Smart Synth | Pourquoi |
|---|---|---|
| Filtre de session (killzones) | **Supprimé** | Ces marchés tournent 24 h/24, 7 j/7, sans Londres ni New York. |
| Commission 0,02 % | **Commission 0** | Deriv ne prend pas de commission : le coût est le **spread**. |
| Tous les BOS sont acceptés | **Impulsions avec pic rejetées** | Sur Boom/Crash/Jump, un pic crée à lui seul un BOS + un FVG sans valeur. |
| — | **Pause après un pic** | Le prix est désordonné juste après un pic. |
| — | **Impulsion minimale (x ATR)** | Élimine les petites cassures dues au bruit. |
| — | **Sens selon la famille** | Boom : ventes seulement ; Crash : achats seulement (voir 3). |
| — | **Durée maximale d'un trade** | Option pour sortir d'un trade qui traîne. |
| — | **Mode contrôle** | Inverse tous les trades pour mesurer la part du hasard. |

Tout le reste est identique : structure, OB, FVG, OTE, bougie de réaction, stop au-delà de l'OB, TP1 1R / TP2 2R, taille selon le risque, période de backtest.

## 3. Nouveaux paramètres (groupe « 6. Indices synthétiques »)

| Paramètre | Défaut | Rôle |
|---|---|---|
| Famille d'indice | Auto | Déduite du nom du symbole (BOOM, CRASH, JUMP, STEP, RANGE ; sinon Volatility). **Vérifiez-la dans le panneau.** |
| Sens autorisé | Auto | Boom → ventes seulement ; Crash → achats seulement ; autres → les deux. |
| Seuil de pic | 4 × ATR | Une bougie plus grande que ce multiple de l'ATR est un « pic ». |
| Ignorer les impulsions contenant un pic | Oui | Rejette le setup si la jambe contient un pic. |
| Pause après un pic | 10 bougies | Aucun signal pendant ce délai. 0 = désactivé. |
| Impulsion minimale | 1,5 × ATR | Taille minimale de la jambe (départ → extrême). |
| Durée max. d'un trade | 0 (off) | Ferme le trade après N bougies. |
| Spread de votre courtier | 0 | Si vous le saisissez (en prix), le panneau affiche le **slippage en ticks** à mettre dans l'onglet *Propriétés*. |
| MODE CONTRÔLE | Non | Inverse tous les trades (voir partie 4). |
| Filtre de tendance HTF | Non, H1 | Même principe que Koss Smart. |

**Pourquoi « Boom = ventes seulement » ?** Sur un Boom, le prix dérive lentement vers le bas entre deux pics vers le haut. Vendre dans le sens de la dérive évite de se battre contre elle. **Mais** : par construction, la dérive et les pics se compensent en moyenne (sinon l'indice offrirait un gain garanti). Le pic finit toujours par toucher les stops de certaines ventes. Idem, en miroir, pour Crash.

## 4. Le mode contrôle : la pièce maîtresse

C'est le test le plus important. Il répond à la question : **le modèle fait-il mieux que le hasard ?**

1. Lancez le backtest avec vos réglages : notez **profit factor**, **profit net**, **nombre de trades**.
2. Cochez **MODE CONTRÔLE** sans rien changer d'autre : chaque achat devient une vente (et inversement), avec **les mêmes distances** de stop et d'objectifs. Notez les mêmes chiffres.
3. Comparez :

| Ce que vous voyez | Ce que ça veut dire |
|---|---|
| Normal et contrôle **tous deux perdants**, d'un montant proche du coût du spread | **Aucun avantage.** Le modèle fait comme le hasard. C'est le résultat attendu sur un prix aléatoire. |
| Normal **gagnant**, contrôle **perdant**, sur un seul indice ou une seule période | Probablement de la **chance**. Refaites le test sur d'autres indices et une autre période. |
| Normal nettement **meilleur** que contrôle, **sur 3 indices ou plus ET sur la période de validation** | Signal intéressant, à confirmer en démo. Restez très prudent. |
| Contrôle **meilleur** que normal | Le modèle fait pire que le hasard sur cet indice : ne pas le trader. |

(Les dessins sur le graphique restent dans le sens d'origine ; seuls les ordres du backtest sont inversés.)

## 5. Réglages de départ par famille

**Non testés** : ce sont des points de départ logiques, à valider avec le protocole.

| Famille | Graphique | Réglages à changer (le reste par défaut) |
|---|---|---|
| Volatility 10 / 25 | M15 | Aucun |
| Volatility 50 / 75 / 100 (et 1s) | M5 ou M15 | Marge du stop 0.2 × ATR |
| Boom / Crash 500 et 1000 | M5 | Seuil de pic 3, pause 5 bougies |
| Jump | M5 ou M15 | Seuil de pic 3 |
| Step | M15 | Aucun (bougies très mécaniques : attendez-vous à peu de signaux de qualité) |
| Range Break | M5 | Aucun (modèle peu adapté aux ranges tirés au sort) |

Pour tous : risque **0,5 %**, sortie **50 % TP1 + 50 % TP2** avec stop à l'entrée après TP1, filtre HTF H1 à tester en option.

## 6. Protocole de test (résumé)

1. **Coûts** : commission 0 ; saisissez votre spread dans *Spread de votre courtier* et reportez la valeur de slippage affichée dans l'onglet *Propriétés*.
2. **Période de test (70 %)** puis **période de validation (30 %)** avec l'option *Limiter le backtest à une période* : aucune modification entre les deux.
3. **Critères** : ≥ 300 trades au total, profit factor ≥ 1,3 (test) et ≥ 1,2 (validation), drawdown ≤ 15 %.
4. **Mode contrôle** (partie 4) sur chaque période.
5. **Plusieurs indices** : mêmes réglages sur au moins 3 indices de la même famille.
6. **Démo** : 2 mois minimum. Jamais de réel si une seule étape échoue.

Pourquoi 300 trades et pas 100 comme pour le forex : sur un prix aléatoire, les séries chanceuses sont fréquentes ; il faut beaucoup plus de trades pour les distinguer d'un vrai avantage.

## 7. Limites connues

1. **Noms des symboles** : la détection automatique repose sur le nom (`BOOM`, `CRASH`…). Je n'ai pas pu vérifier tous les noms exacts dans TradingView : contrôlez la famille dans le panneau.
2. **Lot minimal** : le backtest ne connaît pas les contraintes de lot de Deriv. Vérifiez la taille sur MT5.
3. **Pas d'exécution automatique** : le script envoie des alertes ; l'ordre se passe à la main.
4. **Pics et stops** : un pic peut sauter par-dessus le stop. En backtest, TradingView exécute le stop au prix prévu ; en réel, la sortie peut être pire.
5. **Historique limité** en M1/M5 selon l'abonnement TradingView.
6. **Base théorique absente** : voir l'avertissement en haut. C'est la limite principale, et aucun réglage ne la corrige.
