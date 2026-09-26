# Koss Smart EA (MetaTrader 5) : fiche pédagogique

Expert Advisor MQL5 : [`KossSmartEA.mq5`](./KossSmartEA.mq5).
C'est la conversion de la stratégie **Koss Smart Synth** (TradingView) pour **MT5** : les ordres sont passés automatiquement, et le backtest se fait sur **les vraies données de votre courtier** (Deriv, Weltrade ou autre).

> **À lire avant tout.**
> 1. **Le code n'a pas été compilé ici** (pas de MetaEditor dans mon environnement). À la compilation (touche F7), MetaEditor affichera les erreurs éventuelles avec leur numéro de ligne : envoyez-les-moi telles quelles.
> 2. Les indices synthétiques (Volatility, Boom, Crash, Jump, GainX, PainX…) sont **générés par un générateur de nombres aléatoires**. Le modèle OB + FVG + OTE n'y a **pas de base théorique**. L'EA contient un **mode contrôle** pour le vérifier vous-même (partie 6).
> 3. **Compte démo d'abord, toujours.** Un robot peut perdre de l'argent très vite.

## 1. Installation (5 minutes)

1. Dans MT5 : **Fichier → Ouvrir le dossier des données**.
2. Ouvrez `MQL5` → `Experts`, et copiez-y `KossSmartEA.mq5`.
3. Dans MT5, appuyez sur **F4** (MetaEditor s'ouvre), ouvrez `KossSmartEA.mq5`, appuyez sur **F7** (compiler).
   - En bas, l'onglet *Erreurs* doit afficher **0 erreur**. Des « warnings » (avertissements) ne bloquent pas.
4. Retour dans MT5 : fenêtre **Navigateur** → *Expert Advisors* → clic droit → *Actualiser*.
5. Glissez **KossSmartEA** sur le graphique du symbole voulu (ex. *Volatility 75 Index*, *GainX 999*, *XAUUSD*).
6. Onglet *Commun* : cochez **Autoriser le trading algorithmique**. Onglet *Paramètres d'entrée* : réglez (partie 3).
7. Bouton **Algo Trading** en haut de MT5 : il doit être **vert**.

Le panneau en haut à gauche du graphique affiche : symbole, famille détectée, sens autorisé, tendance, setups suivis, position.

## 2. Ce que fait l'EA, bougie par bougie

À chaque **clôture de bougie** :
1. **Structure** : détecte les swings (pivots), la tendance, les **BOS** et **CHoCH**.
2. **Setup** : à chaque cassure, cherche l'**Order Block** (dernière bougie opposée avant l'impulsion) et un **FVG** dans l'impulsion. Pas d'OB **ou** pas de FVG → pas de setup.
3. **Filtres** : impulsion assez grande (x ATR), pas de pic dans l'impulsion, sens autorisé, tendance HTF (option).
4. **OTE** : zone 0.62 – 0.79 de la jambe. Tant que le prix ne l'a pas touchée, l'extrême peut s'étendre.
5. **Signal** : prix dans l'OTE + bougie de réaction (mèche de rejet ou englobante) + OTE qui touche l'OB ou le FVG + pas de pic récent + session (option).
6. **Ordre** : au marché, stop au-delà de l'OB (+ marge ATR), objectif 1R / 2R, taille calculée pour risquer X % du solde.

**Au démarrage**, l'EA relit les 500 dernières bougies **sans trader**, pour connaître la structure tout de suite.

À **chaque tick** : sortie de 50 % à TP1, stop remonté au prix d'entrée, durée maximale.

## 3. Paramètres

### 1. Structure
| Paramètre | Défaut | Rôle |
|---|---|---|
| Longueur du swing | 5 | Bougies de chaque côté d'un sommet / creux |
| Seulement dans le sens de la tendance | Oui | Ignore les setups nés d'un CHoCH |
| Recherche de l'OB | 10 | Bougies examinées avant l'impulsion |
| Longueur max. de la jambe | 150 | Limite de recherche |
| Nombre de setups suivis | 1 | Setups surveillés en même temps |

### 2. OTE et confirmation
| Paramètre | Défaut | Rôle |
|---|---|---|
| Fibo OTE début / fin / centre | 0.62 / 0.79 / 0.705 | Zone OTE |
| Confluence obligatoire | Oui | L'OTE doit toucher l'OB ou le FVG |
| Mèche de rejet min. | 0.5 | Mèche ≥ 50 % de la bougie |
| Expiration d'un setup | 100 | Bougies avant abandon |

### 3. Indices synthétiques et pics
| Paramètre | Défaut | Rôle |
|---|---|---|
| Famille d'indice | Auto | Détectée dans le nom du symbole : BOOM → Boom, CRASH → Crash, JUMP / GAINX / PAINX → indice à pics, sinon Standard |
| Sens autorisé | Auto | Boom → ventes seulement, Crash → achats seulement, autres → les deux |
| Seuil de pic | 4 × ATR | Au-delà, une bougie est un « pic » |
| Ignorer les impulsions contenant un pic | Oui | Un pic crée à lui seul un faux BOS + FVG |
| Pause après un pic | 10 bougies | Aucun signal pendant ce délai |
| Impulsion minimale | 1,5 × ATR | Élimine les petites cassures |

**GainX / PainX (Weltrade)** : je n'ai pas pu vérifier de façon fiable dans quel sens partent leurs pics. L'EA les classe donc en « indice à pics » avec **achats et ventes autorisés**. Si vous observez que les pics vont toujours dans le même sens, réglez **Sens autorisé** à l'opposé des pics (pics vers le haut → *Ventes seulement* ; pics vers le bas → *Achats seulement*), comme pour Boom / Crash.

### 4. Filtres
| Paramètre | Défaut | Rôle |
|---|---|---|
| Filtre de tendance HTF + timeframe + swing | Non, H1, 5 | Trades seulement dans le sens de la structure HTF |
| Filtre de session | Non | **Pour le forex / l'or seulement** (inutile sur les synthétiques, ouverts 24 h/24) |
| Décalage heure serveur - GMT | 0 | Deriv : serveur en GMT (0). Beaucoup de courtiers forex : 2 ou 3. Regardez l'heure du *Market Watch* et comparez à l'heure GMT |
| Sessions 1 et 2 (heures GMT) | 7-10 et 12-15 | Environ Londres et New York (killzones) |
| Spread max. | 0 (off) | Ignore un signal si le spread dépasse ce nombre de points |

### 5. Gestion du risque
| Paramètre | Défaut | Rôle |
|---|---|---|
| Risque par trade | 0,5 % | La taille est calculée pour perdre ce % du solde si le stop est touché |
| Marge du stop | 0,1 × ATR | Au-delà de l'OB |
| Sortie | 50 % TP1 + 50 % TP2 | Ou tout à TP1, ou tout à TP2 |
| Stop au prix d'entrée après TP1 | Oui | Protège la deuxième moitié |
| Durée max. d'un trade | 0 (off) | Ferme après N bougies |
| Taille max. | 0 (limite courtier) | Plafond de sécurité |
| Trader le lot minimal si taille trop petite | **Non** | Voir ci-dessous |

**Le lot minimal, piège n°1 sur les synthétiques.** Avec un petit compte, la taille calculée pour 0,5 % de risque est souvent **inférieure au lot minimal** du symbole. Par défaut, l'EA **n'ouvre pas** le trade (et l'écrit dans l'onglet *Experts*). Si vous activez « trader le lot minimal », votre risque réel peut être **bien plus grand** que 0,5 % : vérifiez-le avant.

### 6. Divers
| Paramètre | Défaut | Rôle |
|---|---|---|
| MODE CONTRÔLE | Non | Inverse tous les trades (partie 6) |
| Passer les ordres | Oui | Non = alertes seulement, l'EA ne trade pas |
| Dessiner | Oui | OB, FVG, OTE, BOS / CHoCH, flèches |
| Alertes / Notifications | Oui / Non | Notification sur le téléphone : configurer l'ID MetaQuotes dans *Outils → Options → Notifications* |
| Numéro magique | 260925 | Différent pour chaque graphique où l'EA tourne |

## 4. Comment l'ordre est géré

- **Une seule position à la fois** par symbole (et par numéro magique).
- **Entrée** : au marché, au tick qui suit la clôture de la bougie signal.
- **Stop** : au-delà de l'OB. **TP1** = 1 fois le risque, **TP2** = 2 fois.
- **Sortie 50/50** : l'ordre est envoyé avec l'objectif TP2 ; quand le prix atteint TP1, **l'EA ferme lui-même la moitié** (au marché) puis remonte le stop au prix d'entrée. Ça marche sur les comptes « hedging » et « netting ».
- Si la taille ne peut pas être coupée en deux (lot minimal), tout sort à TP2.
- Si l'EA redémarre avec une position ouverte, il relit TP1 dans le commentaire de la position (`KS1 …`).

## 5. Backtest dans MT5 (Testeur de stratégie)

1. **Affichage → Testeur de stratégie** (Ctrl + R).
2. Expert : **KossSmartEA**. Symbole : celui de votre courtier. Timeframe : M5 ou M15.
3. **Modélisation** : *Chaque tick basé sur des ticks réels* (le plus fidèle). Si ce n'est pas disponible, *Chaque tick*.
4. **Dates** : faites deux périodes, comme sur TradingView :
   - **Période de test** : les 70 % les plus anciens ;
   - **Période de validation** : les 30 % les plus récents, **sans rien changer**.
5. Dépôt : le montant de votre vrai compte. Levier : celui de votre compte.
6. Lancez, puis lisez l'onglet **Backtest** : nombre de trades, facteur de profit, drawdown maximal.

**Attention** : l'historique disponible dans le testeur dépend de votre courtier. Si les données sont courtes ou incomplètes, le résultat n'a pas de valeur. Vérifiez la période réellement testée dans le *Journal*.

## 6. Le mode contrôle (test du hasard)

1. Faites un backtest normal : notez **facteur de profit** et **profit net**.
2. Refaites **exactement le même** backtest avec **MODE CONTRÔLE = true** : chaque achat devient une vente (et inversement), avec les mêmes distances de stop et d'objectifs.
3. Comparez :

| Résultat | Signification |
|---|---|
| Les deux perdent à peu près le coût du spread | Aucun avantage : le modèle fait comme le hasard (résultat attendu sur un prix aléatoire) |
| Normal gagne, contrôle perd, sur un seul symbole ou une seule période | Probablement de la chance : refaites sur d'autres symboles et périodes |
| Normal nettement meilleur, sur 3 symboles ou plus ET sur la période de validation | Piste sérieuse, à confirmer 2 mois en démo |
| Contrôle meilleur que normal | Le modèle fait pire que le hasard ici : ne pas l'utiliser |

## 7. Critères avant de passer en réel

- ≥ **300 trades** au total sur les synthétiques (≥ 100 sur forex / or) ;
- facteur de profit ≥ **1,3** en test et ≥ **1,2** en validation ;
- drawdown maximal ≤ **15 %** ;
- mode contrôle nettement moins bon que le mode normal ;
- **2 mois de démo** conformes au backtest ;
- en réel : **0,25 à 0,5 %** de risque, et arrêt si le drawdown dépasse 1,5 fois celui du backtest.

## 8. Différences avec la version TradingView

| Point | TradingView | MT5 |
|---|---|---|
| Données | Flux TradingView | Données de **votre courtier** |
| Exécution | Simulée | **Réelle** (glissement, refus d'ordre possibles) |
| Sortie à TP1 | Ordre limite | Fermeture au marché par l'EA quand TP1 est touché (léger glissement possible) |
| Dessins | Boîtes transparentes | Rectangles en contour (MT5 ne gère pas la transparence) |
| Préchauffage | Tout l'historique | 500 dernières bougies |
| Filtre de session | Fuseau horaire nommé | Heures GMT + décalage du serveur à renseigner |

## 9. Problèmes fréquents

| Message dans l'onglet *Experts* | Cause | Solution |
|---|---|---|
| « taille … inférieure au lot minimal » | Compte trop petit pour le risque demandé | Augmenter le risque %, ou activer « trader le lot minimal » en connaissance de cause |
| « Ordre refusé : code 10030 » | Mode de remplissage non accepté | Signalez-le-moi avec le nom du courtier et du symbole |
| « stop ou objectif trop proche » | Distance minimale du courtier | Normal sur certains symboles : le signal est ignoré |
| Aucun trade du tout | Algo Trading désactivé, sens bloqué par la famille, ou filtres trop stricts | Vérifier le bouton Algo Trading, le panneau (famille / sens), désactiver les filtres un par un |
