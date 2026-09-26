# Koss Smart Pro Vol (MT5) : fiche pédagogique

Expert Advisor : [`KossSmartProVol.mq5`](./KossSmartProVol.mq5).
Conversion de la stratégie **Koss Smart Pro** (Liquidité → MSS → FVG) pour **MetaTrader 5**, adaptée aux indices de volatilité **FX Vol (Weltrade)** et **Volatility 10 / 25 / 50 / 75 / 100 et versions 1s (Deriv)**.

> **À lire avant tout**
> 1. **Non compilé ici** (pas de MetaEditor dans mon environnement). À la compilation (F7), envoyez-moi le texte exact de l'onglet *Erreurs*.
> 2. Ces indices sont produits par un **générateur de nombres aléatoires** à volatilité constante. Il n'y a ni banques ni vraie liquidité : les sweeps, MSS et FVG détectés sont des formes de prix sans pouvoir prédictif prouvé. Le **mode contrôle** (partie 7) sert à le vérifier.
> 3. **Compte démo d'abord.**

---

## 1. Pourquoi une version séparée de « Synth » ?

| | Boom / Crash / GainX / PainX | **FX Vol / Volatility** |
|---|---|---|
| Pics | Oui, dans un seul sens | **Non** |
| Dérive | Lente, opposée aux pics | **Aucune** : le prix monte et descend au hasard |
| Sens des trades | Imposé (contre les pics) | **Achats et ventes** |
| Danger principal | Le pic qui saute le stop | **Les phases de range** (le prix tourne en rond) et **le spread** |
| EA à utiliser | `KossSmartProSynth.mq5` | **`KossSmartProVol.mq5`** |

Si vous lancez cet EA sur un Boom, Crash, GainX, PainX ou Jump, il affiche un avertissement dans l'onglet *Experts*.

## 2. Ce qui change par rapport à Koss Smart Pro (TradingView)

| Koss Smart Pro | Koss Smart Pro Vol | Pourquoi |
|---|---|---|
| Killzones Londres / New York | **Supprimées** | Ouvert 24 h/24, 7 j/7 : pas de sessions |
| Range asiatique | **Bougie H4 précédente** (H4 H / H4 L) | Niveau neutre, sans notion de session |
| 2 trades / jour en killzone | **Limites journalières** : 3 trades, 2 % de perte, **3 pertes consécutives** | Discipline sans sessions |
| — | **Filtre de tendance « efficiency ratio »** sur le HTF | Évite les phases de range, où le modèle perd le plus |
| — | **Stop borné** entre 0,5 et 4 × ATR | Stop trop serré = mangé par le spread ; trop large = taille ridicule |
| — | **Spread ≤ 10 % du risque** | Les Volatility 75 / 100 ont un spread important |
| — | **Stop suiveur ATR** optionnel après TP1 | Laisser courir la 2ᵉ moitié quand le prix part |
| Ordre limite | **Entrée au toucher** (ordre au marché au retour dans la zone) | Tous courtiers + mode contrôle |

Tout le reste est identique : biais HTF, premium / discount, liquidité (PDH / PDL, BSL / SSL, EQH / EQL), sweep, MSS (CHoCH / BOS), FVG / OB, entrée au milieu (CE), stop au-delà du sweep, TP1 1R (50 % + stop à l'entrée), TP2 sur la liquidité opposée, espace minimal 1,5R.

## 3. L'efficiency ratio, expliqué simplement

Sur les 20 dernières bougies du timeframe de biais (H1 par défaut) :

**Efficiency ratio = distance entre le premier et le dernier prix ÷ chemin total parcouru**

| Valeur | Ce que fait le marché | L'EA |
|---|---|---|
| Proche de **0** | Il fait des allers-retours sans avancer (range) | **Ne trade pas** |
| **0,30** et plus | Il avance dans une direction | Trade autorisé |
| Proche de **1** | Il avance en ligne droite | Trade autorisé |

Pourquoi : le modèle ICT suppose qu'après un sweep, le prix repart dans le sens du biais. En range, les sweeps s'enchaînent dans les deux sens et les MSS sont faux. Le panneau affiche la valeur en direct : « Efficiency ratio 0.42 (tendance) » ou « 0.18 (RANGE : pas de trade) ».

## 4. Installation

1. MT5 → **Fichier → Ouvrir le dossier des données → MQL5 → Experts** → copier `KossSmartProVol.mq5`.
2. **F4** (MetaEditor) → ouvrir → **F7** (compiler) → **0 erreur** attendue.
3. MT5 → *Navigateur* → *Expert Advisors* → clic droit → *Actualiser*.
4. Glisser **KossSmartProVol** sur le graphique (ex. *Volatility 75 Index*, *FX Vol 20*).
5. Onglet *Commun* : **Autoriser le trading algorithmique** ; bouton **Algo Trading** vert.
6. Un graphique par symbole, ou un **numéro magique différent** par graphique (défaut 280926 ; Synth utilise 270926, ils peuvent tourner ensemble).

## 5. Réglages conseillés (points de départ, non testés)

| Indice | Graphique | Biais (HTF) | À changer |
|---|---|---|---|
| Volatility 10 / 25 (et 1s) | M5 | H1 | Aucun |
| Volatility 50 / 75 / 100 (et 1s) | M1 ou M5 | M15 ou H1 | Spread max. 10–15 % du risque selon votre courtier |
| FX Vol (Weltrade) | M5 | H1 | Aucun |

Pour tous : **risque 0,5 %**, efficiency ratio 0,30, stop entre 0,5 et 4 ATR.

**Stop suiveur** : laissez-le à 0 (désactivé) pour vos premiers tests, afin de comparer avec la stratégie d'origine. Testez ensuite 1,5 × ATR et comparez les deux backtests.

## 6. Tous les paramètres

### 1. Biais — 2. Liquidité — 3. Déclencheur — 5. Objectifs
Identiques à Koss Smart Pro Synth (voir `KOSS_SMART_PRO_SYNTH_GUIDE.md`, partie 5) : biais H1, premium / discount, PDH / PDL, H4 précédente, swings et EQ, MSS 3, délai 20 bougies, zone FVG, entrée CE, expiration 20 bougies, marge du stop 0,1 ATR, déplacement minimal 1 ATR, TP1 1R, 50 %, stop à l'entrée, espace 1,5R, TP2 par défaut 2R.

### 4. Indices de volatilité
| Paramètre | Défaut | Rôle |
|---|---|---|
| Sens autorisé | Achats et ventes | Vous pouvez restreindre |
| Filtre de tendance (efficiency ratio) | Oui | Voir partie 3 |
| Efficiency ratio : bougies HTF | 20 | Période de mesure |
| Efficiency ratio minimum | 0,30 | Plus haut = moins de trades, plus sélectifs |
| Stop minimum / maximum | 0,5 / 4 × ATR | Setups hors de cette fourchette ignorés |
| Spread max. en % du risque | 10 % | Au-delà, l'entrée est ignorée |
| Stop suiveur après TP1 | 0 (off) | Ex. 1,5 = stop à 1,5 ATR du prix, seulement après le passage au prix d'entrée |
| Pertes consécutives max. / jour | 3 | Arrêt jusqu'au lendemain |

### 6. Risque et limites
Risque 0,5 % · taille max. · lot minimal refusé par défaut · 3 trades / jour · perte max. 2 % / jour · spread max. en points (optionnel).

### 7. Divers
Mode contrôle · passer les ordres · dessins · alertes · notifications · numéro magique 280926 · glissement toléré.

## 7. Le test qui compte : mode contrôle

Testeur de stratégie (Ctrl + R), modélisation *« Chaque tick basé sur des ticks réels »* :
1. Backtest normal → **profit factor** et **résultat net**.
2. Même backtest avec **MODE CONTRÔLE = true** (chaque trade inversé, mêmes distances).
3. Comparez, sur **300 trades minimum** :

| Résultat | Signification |
|---|---|
| Les deux perdent à peu près le spread | Aucun avantage : c'est ce que j'attends sur un prix aléatoire |
| Normal nettement meilleur sur 3 indices et une 2ᵉ période | Piste à confirmer 2 mois en démo |
| Contrôle meilleur que normal | Ne pas utiliser l'EA sur cet indice |

**Test bonus** : refaites le backtest normal avec *Filtre de tendance = false*. Si le résultat est identique, l'efficiency ratio n'apporte rien sur cet indice.

## 8. Limites connues

1. **Prix aléatoires** : aucun filtre ne crée un avantage qui n'existe pas.
2. **Entrée au marché** au toucher : léger glissement possible.
3. **Spread** : sur Volatility 75 / 100, il peut représenter une part importante du risque ; le filtre évite le pire, pas tout.
4. **PDH / PDL** selon l'heure du serveur du courtier.
5. **Lot minimal** : sur petit compte, beaucoup de signaux ignorés (voir l'onglet *Experts*).
6. **Un seul setup à la fois.**
7. **Les statistiques du panneau** comptent tous les trades de ce numéro magique sur ce symbole, mode contrôle compris.

## 9. Problèmes fréquents

| Message (onglet *Experts*) | Solution |
|---|---|
| « spread … > 10 % du risque » | Normal sur les indices à gros spread ; augmentez le paramètre ou passez en M5 (stops plus larges) |
| « RANGE : pas de trade » (panneau) | Normal : l'EA attend une tendance sur le HTF |
| « 3 pertes consécutives aujourd'hui » | Normal : reprise le lendemain |
| « taille … sous le lot minimal » | Augmenter le risque %, ou accepter le lot minimal en connaissance de cause |
| « ATTENTION : ce symbole a des pics » | Utilisez `KossSmartProSynth.mq5` pour ce symbole |
| Aucun setup | Désactivez un filtre à la fois (efficiency ratio, biais, premium / discount) pour voir lequel bloque |
