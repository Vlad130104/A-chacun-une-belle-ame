# Koss Smart Pro Synth (MT5) : fiche pédagogique

Expert Advisor : [`KossSmartProSynth.mq5`](./KossSmartProSynth.mq5).
Conversion de la stratégie **Koss Smart Pro** (Liquidité → MSS → FVG) pour **MetaTrader 5**, adaptée aux indices synthétiques **GainX / PainX (Weltrade)** et **Boom / Crash (Deriv)**.

> **À lire avant tout**
> 1. **Non compilé ici** (pas de MetaEditor dans mon environnement). À la compilation (F7), envoyez-moi le texte exact de l'onglet *Erreurs*.
> 2. Ces indices sont produits par un **générateur de nombres aléatoires** : il n'y a ni banques, ni vraie liquidité. Les « liquidités », sweeps et FVG que l'EA détecte sont des formes de prix, sans garantie qu'elles aient un pouvoir prédictif. Le **mode contrôle** (partie 7) sert à le vérifier.
> 3. **Compte démo d'abord.** Un pic peut sauter par-dessus un stop : la perte réelle peut dépasser 1 R.

---

## 1. Ce qui change par rapport à Koss Smart Pro (TradingView)

| Koss Smart Pro (or, forex) | Koss Smart Pro Synth | Pourquoi |
|---|---|---|
| Killzones Londres / New York | **Supprimées** | Ces indices tournent 24 h/24, 7 j/7 : il n'y a pas de sessions |
| Range asiatique (AS H / AS L) | **Bougie H4 précédente** (H4 H / H4 L) | Remplace un niveau de « session » par un niveau horaire neutre |
| « 2 trades par jour, en killzone » | **Limites journalières** : trades max. + perte max. en % | Garde la discipline sans sessions |
| Pas de notion de pic | **Détection des pics** (bougie > 3 × ATR) | Les pics faussent FVG et cassures |
| Tous les FVG | **FVG créés par un pic ignorés** | Un pic crée des « trous » sans valeur |
| — | **Pause après un pic** (5 bougies) | Le prix est désordonné juste après |
| — | **Déplacement minimal** (1 × ATR) | Le MSS doit venir d'un vrai mouvement |
| Achats et ventes | **Sens selon la famille** (voir partie 2) | On trade dans le sens de la dérive, pas contre les pics |
| Ordre limite | **Entrée « virtuelle » au toucher** (ordre au marché quand le prix revient dans la zone) | Fonctionne chez tous les courtiers, et permet le mode contrôle |
| Statistiques sur le graphique | **Statistiques réelles du compte** (trades, réussite, résultat, profit factor) | Calculées à partir de l'historique MT5 |

Tout le reste est identique : biais HTF, premium / discount, liquidité (PDH / PDL, BSL / SSL, EQH / EQL), sweep, MSS (CHoCH / BOS), FVG / OB, entrée au milieu (CE), stop au-delà du sweep, TP1 à 1R avec 50 % fermés et stop à l'entrée, TP2 sur la liquidité opposée, espace minimal de 1,5R.

## 2. Les familles d'indices et le sens des trades

| Indice | Comportement | Famille détectée | Sens par défaut |
|---|---|---|---|
| **Boom** (Deriv) | Baisse lente, **pics vers le haut** | Pics vers le haut | **Ventes seulement** |
| **GainX** (Weltrade) | Baisse régulière, **pics soudains vers le haut** | Pics vers le haut | **Ventes seulement** |
| **Crash** (Deriv) | Hausse lente, **chutes brutales** | Pics vers le bas | **Achats seulement** |
| **PainX** (Weltrade) | Hausse progressive, **chutes brutales** | Pics vers le bas | **Achats seulement** |
| Autres (Volatility…) | Sans pics | Autre | Achats et ventes |

**Logique** : on trade **dans le sens de la dérive** (le mouvement lent), là où la structure (sweep → MSS → FVG) a le temps de se former. Le danger, c'est le pic contre la position : c'est pour ça que le stop est placé au-delà du sweep et que la taille est calculée sur le risque.

**À vérifier vous-même** : le panneau affiche la famille détectée (ex. « pics vers le haut (Boom / GainX) »). Si ce qu'il affiche ne correspond pas à ce que vous voyez sur le graphique, forcez la famille dans **4. Indices synthétiques → Famille d'indice**. Pour GainX / PainX, je me suis appuyé sur les descriptions publiques de Weltrade : **regardez 100 bougies avant de lancer l'EA** pour confirmer le sens des pics.

## 3. Installation

1. MT5 → **Fichier → Ouvrir le dossier des données → MQL5 → Experts** → copier `KossSmartProSynth.mq5`.
2. **F4** (MetaEditor) → ouvrir le fichier → **F7** (compiler) → **0 erreur** attendue.
3. MT5 → *Navigateur* → *Expert Advisors* → clic droit → *Actualiser*.
4. Glisser **KossSmartProSynth** sur le graphique (ex. *Boom 1000 Index* ou *GainX 999*), timeframe **M1 ou M5**.
5. Onglet *Commun* : **Autoriser le trading algorithmique**. Bouton **Algo Trading** vert.
6. Un seul graphique par symbole avec cet EA (ou un **numéro magique différent** par graphique).

Le panneau (haut gauche) affiche : famille et sens, biais H1, discount / premium, pause après pic, état du setup, limites du jour, statistiques de l'EA.

## 4. Réglages conseillés (points de départ, non testés)

| Indice | Graphique | Biais (HTF) | Réglages à changer |
|---|---|---|---|
| Boom / Crash 1000 | M1 | M15 | Aucun |
| Boom / Crash 500 et 300 | M1 | M15 | Seuil de pic 2,5 ; pause 8 bougies |
| GainX / PainX | M1 ou M5 | M15 ou H1 | Aucun (vérifier la famille) |
| Volatility (sans pics) | M5 | H1 | Famille « Autre » |

Pour tous : **risque 0,5 %**, 3 trades max. par jour, perte max. 2 % par jour.

## 5. Tous les paramètres

### 1. Biais
| Paramètre | Défaut | Rôle |
|---|---|---|
| Timeframe du biais | H1 | Doit être supérieur au graphique |
| Longueur du swing HTF | 5 | |
| Sens du biais / premium-discount | Oui / Oui | Les deux filtres principaux |

### 2. Liquidité
| Paramètre | Défaut | Rôle |
|---|---|---|
| PDH / PDL | Oui | Jour selon l'heure du serveur du courtier |
| Bougie H4 précédente | Oui | Remplace le range asiatique |
| Sommets / creux, EQH / EQL | Oui, longueur 5, tolérance 0,1 ATR | 2 niveaux max. par côté |

### 3. Déclencheur
| Paramètre | Défaut | Rôle |
|---|---|---|
| Swings internes (MSS) | 3 | |
| Délai sweep → MSS | 20 bougies | |
| Zone d'entrée / prix d'entrée | FVG / milieu (CE) | Ou OB, ou les deux ; ou bord de zone |
| Expiration de l'ordre | 20 bougies | |
| Marge du stop | 0,1 ATR | Au-delà de la mèche du sweep |
| Déplacement minimal | 1 ATR | Taille minimale du mouvement sweep → MSS |

### 4. Indices synthétiques
| Paramètre | Défaut | Rôle |
|---|---|---|
| Famille / sens | Auto / Auto | Voir partie 2 |
| Seuil de pic | 3 × ATR | Au-delà, une bougie est un pic |
| Ignorer les FVG créés par un pic | Oui | |
| Pause après un pic | 5 bougies | Pas de nouveau setup ni d'entrée pendant ce délai |

### 5. Objectifs
| Paramètre | Défaut | Rôle |
|---|---|---|
| TP1 / part fermée / stop à l'entrée | 1R / 50 % / Oui | |
| Espace minimal | 1,5R | Jusqu'à la liquidité opposée |
| TP2 par défaut | 2R | Si aucune liquidité opposée |
| Durée max. | 0 (off) | |

### 6. Risque et limites journalières
| Paramètre | Défaut | Rôle |
|---|---|---|
| Risque par trade | 0,5 % | Taille calculée sur la distance entrée → stop |
| Taille max. | 0 | Plafond de sécurité |
| Trader le lot minimal | **Non** | Si la taille calculée est trop petite, le trade est **ignoré** (sinon risque réel plus élevé) |
| Trades max. par jour | 3 | Remplace les killzones |
| Perte max. par jour | 2 % | L'EA s'arrête jusqu'au lendemain |
| Spread max. | 0 (off) | |

### 7. Divers
| Paramètre | Défaut | Rôle |
|---|---|---|
| MODE CONTRÔLE | Non | Inverse chaque trade (partie 7) |
| Passer les ordres | Oui | Non = alertes seulement |
| Dessins / alertes / notifications | Oui / Oui / Non | |
| Numéro magique | 270926 | Un différent par graphique |

## 6. Ce que l'EA fait, bougie par bougie

1. **Pic ?** Si la bougie dépasse 3 × ATR : pause de 5 bougies.
2. **Liquidité** : ajoute PDH / PDL (nouveau jour), H4 H / H4 L (nouvelle H4), BSL / SSL / EQH / EQL (nouveaux swings).
3. **Sweep** : une mèche dépasse un niveau et la bougie clôture en retour → le niveau est « pris », un sweep est mémorisé 20 bougies.
4. **MSS** : clôture au-delà du dernier swing interne dans le sens opposé au sweep.
5. **Setup** si tout est bon : déplacement ≥ 1 ATR, FVG (pas créé par un pic), sens autorisé, biais HTF, discount / premium, place jusqu'à la liquidité opposée, pas de pause.
6. **Ordre virtuel** : quand le prix revient au milieu du FVG → ouverture au marché (si les limites du jour le permettent).
7. **Gestion** : à TP1, 50 % fermés et stop à l'entrée ; le reste vise TP2.

**Au démarrage**, l'EA relit les 500 dernières bougies **sans trader** pour connaître la structure et la liquidité.

## 7. Le test qui compte : mode contrôle

Dans le **Testeur de stratégie** (Ctrl + R), modélisation *« Chaque tick basé sur des ticks réels »* :
1. Backtest normal → notez **profit factor** et **résultat net**.
2. Même backtest avec **MODE CONTRÔLE = true** (chaque trade inversé, mêmes distances).
3. Comparez :

| Résultat | Signification |
|---|---|
| Les deux perdent à peu près le spread | Aucun avantage : c'est ce que j'attends sur un prix aléatoire |
| Normal nettement meilleur, sur 3 indices et une 2ᵉ période | Piste à confirmer 2 mois en démo |
| Contrôle meilleur que normal | Ne pas utiliser l'EA sur cet indice |

Exigez **300 trades minimum** avant de conclure.

## 8. Limites connues

1. **Pics et glissement** : un pic peut dépasser le stop ; la perte réelle peut être supérieure à 1R. Le backtest ne le montre pas toujours.
2. **Entrée au marché** au toucher de la zone : léger glissement possible (paramètre *Glissement toléré*).
3. **PDH / PDL** dépendent de l'heure du serveur du courtier.
4. **Lot minimal** : avec un petit compte, beaucoup de signaux seront ignorés (voir l'onglet *Experts*).
5. **Statistiques du panneau** : elles comptent tous les trades de l'EA sur ce symbole (même numéro magique), y compris ceux du mode contrôle.
6. **Un seul setup à la fois** ; un nouveau setup remplace un ordre non déclenché.
7. **Base théorique absente** sur des prix aléatoires (voir l'avertissement en haut).

## 9. Problèmes fréquents

| Message (onglet *Experts*) | Solution |
|---|---|
| « taille … sous le lot minimal » | Augmenter le risque %, ou accepter le lot minimal en connaissance de cause |
| « quota du jour atteint » / « perte max. du jour atteinte » | Normal : l'EA reprend le lendemain |
| « pic récent (pause) » | Normal : attente de 5 bougies |
| « Ordre refusé : code … » | M'envoyer le code, le courtier et le symbole |
| Aucun setup | Vérifier famille / sens dans le panneau ; désactiver un filtre à la fois (biais, premium-discount) pour voir lequel bloque |
