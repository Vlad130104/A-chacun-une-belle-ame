# KossWin2 : fiche pédagogique

Indicateur Smart Money (SMC / ICT) **d'analyse uniquement**. Il ne donne **aucun signal** d'achat ou de vente et n'intègre **aucune stratégie** : il trace ce que vous devez voir, et c'est vous qui décidez.

| Plateforme | Fichier |
|---|---|
| TradingView (Pine Script v6) | [`kosswin2.pine`](./kosswin2.pine) |
| MetaTrader 5 (indicateur) | [`../mt5/KossWin2.mq5`](../mt5/KossWin2.mq5) |

Les deux versions ont la même logique. La version MT5 ne passe aucun ordre.

> **Non compilé ici** : je n'ai ni l'éditeur Pine ni MetaEditor. En cas d'erreur, envoyez-moi une capture ou le texte exact.

**Différence avec KossWin1** : KossWin2 retire tout ce qui ne fait pas partie de votre demande :
- les signaux ACHAT / VENTE ;
- l'escalier de zones ;
- le filtre de tendance H4 ;
- le sens automatique selon l'indice.

---

## 1. Ce qui est tracé (une couleur par type)

| Votre demande | Tracé | Couleur par défaut |
|---|---|---|
| 1. OB en confluence avec FVG | Rectangle « OB + FVG » haussier | Vert sarcelle |
| | Rectangle « OB + FVG » baissier | Violet |
| | Petit rectangle pointillé « FVG » | Gris-bleu |
| 1. Supply / Demand | Rectangle « Demand » | Bleu |
| | Rectangle « Supply » | Orange |
| 2. Inducement | Ligne pointillée « IDM » | Rose |
| 3. Tendance | Ligne pointillée « BOS » | Gris |
| | Ligne pointillée épaisse « CHoCH » | Jaune |
| 3. Liquidité | Lignes pointillées BSL / SSL / EQH / EQL | Cyan |
| 4. Sweep | **Point rouge** au-dessus / au-dessous de la bougie | Rouge vif |
| 5. Premium / Discount | Fonds Premium / Discount + niveaux 1 – 0,5 – 0 | Rouge pâle / vert pâle |

Toutes les couleurs se changent dans le groupe **6. Couleurs**.

## 2. Comment chaque élément est calculé

### Tendance : BOS et CHoCH (point 3)
- **Sommet / creux de structure** : entouré de 5 bougies plus basses (ou plus hautes) de chaque côté.
- **BOS** : une bougie **clôture** au-delà du dernier sommet (tendance haussière) ou du dernier creux (tendance baissière). La tendance continue.
- **CHoCH** : la clôture casse dans le sens opposé. La tendance change.
- La tendance actuelle est affichée dans le panneau.

### Order Block en confluence avec un FVG (point 1)
1. À chaque cassure de structure, l'indicateur repère l'**origine** du mouvement (le plus bas ou le plus haut avant la cassure).
2. **Order Block** = la dernière bougie de sens opposé à cette origine.
3. **FVG** = un trou entre la bougie 1 et la bougie 3 dans les 6 bougies qui suivent l'OB.
4. S'il y a un FVG, la zone devient **« OB + FVG »**. C'est la zone la plus forte.
5. Le mouvement doit faire au moins **1,5 ATR**, sinon aucune zone n'est créée.

### Supply et Demand (point 1)
Si le mouvement n'a **pas** laissé de FVG, l'indicateur trace la **base** du mouvement (les 2 à 3 bougies d'hésitation avant le départ) :
- **Demand** si le départ est vers le haut ;
- **Supply** si le départ est vers le bas.

### « Valides » : les zones où le prix a le plus de chances de réagir
- Elles sont créées par une **cassure de structure**, avec un **mouvement fort** (au moins 1,5 ATR).
- Elles ne sont tracées qu'**après l'inducement** (point 2).
- Elles sont **fraîches** : dès que le prix les touche, elles deviennent **pâles**.
- Elles sont **intactes** : si une bougie **clôture au-delà**, la zone est **effacée**.

### Inducement (point 2)
Après une cassure, le prix fait souvent un **petit creux interne** (ou un petit sommet en tendance baissière) entre la zone et le prix. Les traders impatients y entrent et y placent leurs stops : c'est le **piège à liquidité**.

**Règle** : la zone reste **invisible** tant que ce petit creux (ou sommet) n'a pas été pris par le prix. Quand il est pris, la zone apparaît avec la ligne rose « IDM ».

Vous pouvez désactiver cette règle dans *Tracer seulement après inducement*.

### Liquidité et sweep (points 3 et 4)
- **BSL** : stops au-dessus des sommets de structure.
- **SSL** : stops sous les creux de structure.
- **EQH / EQL** : deux sommets ou deux creux presque égaux (écart d'au plus 0,1 ATR).
- **Sweep = point rouge** : la mèche dépasse le niveau **et** la bougie clôture en retour. Le niveau disparaît ensuite.
- Si la bougie clôture au-delà du niveau, il est simplement « pris » : pas de point rouge.

### Premium / Discount selon la tendance (point 5)
L'indicateur prend le **mouvement de la tendance actuelle**, du début (**1**) à la fin (**0**), comme un Fibonacci :
- **Tendance baissière** : 1 au sommet de départ, 0 au plus bas atteint.
- **Tendance haussière** : 1 au creux de départ, 0 au plus haut atteint.
- Au-dessus de **0,5** : **Premium** (prix cher).
- Sous **0,5** : **Discount** (prix bon marché).
- La plage suit le prix tant que la tendance continue et se redessine à chaque nouvelle cassure.

### Graphique propre et lisible (point 6)
- 3 zones validées maximum par sens.
- 3 niveaux de liquidité maximum par côté.
- Seules les 10 dernières cassures de structure restent affichées.
- Les zones cassées sont effacées, les zones touchées deviennent pâles.
- Textes en petite taille, un seul panneau compact.
- Chaque élément peut être masqué dans les réglages.

## 3. Installation

### TradingView
1. Ouvrez l'**éditeur Pine** et **effacez tout** le modèle proposé (Ctrl + A puis Suppr). Il ne doit rester qu'une seule ligne `indicator(...)`.
2. Collez le contenu de `kosswin2.pine`.
3. Cliquez sur **Enregistrer**, puis **Ajouter au graphique**.

### MetaTrader 5
1. **Fichier → Ouvrir le dossier des données → MQL5 → Indicators** : copiez `KossWin2.mq5`.
2. **F4** (MetaEditor) → ouvrez le fichier → **F7** (compiler) → **0 erreur** attendue.
3. *Navigateur* → *Indicateurs* → clic droit → *Actualiser* → glissez **KossWin2** sur le graphique.
4. **Fond blanc** : choisissez des couleurs pâles pour *Premium* et *Discount* (celles par défaut sont prévues pour un fond noir).

> **MT5 mobile** n'accepte pas les indicateurs personnalisés. Installez-le sur MT5 ordinateur. Pour recevoir les alertes sur le téléphone :
> 1. *Outils → Options → Notifications* ;
> 2. saisissez votre MetaQuotes ID ;
> 3. mettez *Notifications sur le téléphone* = true.

## 4. Réglages

| Groupe | Paramètre | Défaut |
|---|---|---|
| 1. Structure | Swings externes (structure) | 5 |
| | Swings internes (inducement) | 2 |
| | Afficher BOS / CHoCH | Oui |
| 2. Zones | OB + FVG / FVG / Supply-Demand | Oui |
| | Tracer seulement après inducement | **Oui** |
| | Afficher l'inducement | Oui |
| | Déplacement minimal | 1,5 × ATR |
| | Zones par sens | 3 |
| | Durée de vie d'une zone | 300 bougies |
| 3. Liquidité | Niveaux par côté | 3 |
| | Tolérance EQH / EQL | 0,1 × ATR |
| | Sweep : point rouge | Oui |
| 4. Premium / Discount | Afficher | Oui |
| 5. Panneau (TradingView) / Alertes (MT5) | Panneau ; alertes, notifications, bougies analysées | Oui ; Oui, Non, 3 000 |
| 6. Couleurs | Une couleur par tracé | Voir partie 1 |

**Le panneau affiche** :
- la tendance de l'unité de temps du graphique ;
- si le prix est en premium ou en discount ;
- le nombre de zones validées à l'achat et à la vente.

## 5. Alertes

**TradingView** : créez une alerte, choisissez **KossWin2**, puis l'une de ces conditions :
- *sweep de liquidité* ;
- *CHoCH* ;
- *zone validée (IDM pris)*.

**MT5** : les mêmes événements, dans la fenêtre d'alertes et en notification sur le téléphone (en option).

## 6. Limites (franchement)

1. **Pas de repaint, mais du retard** :
   - un sommet de structure est confirmé 5 bougies après ;
   - une zone n'apparaît qu'après la prise de l'inducement.
2. **« Fortes probabilités » n'est pas une garantie.** Les filtres gardent les zones de meilleure qualité selon les règles SMC (cassure, mouvement fort, FVG, inducement, zone fraîche et intacte), mais aucun indicateur ne garantit la réaction du prix.
3. **Les règles SMC n'ont pas de définition officielle.** Un autre indicateur SMC peut tracer des zones un peu différentes.
4. **Sur les indices synthétiques** (PainX, GainX, Boom, Crash, Volatility), les prix sont générés par un algorithme. Les formes SMC apparaissent, mais leur valeur prédictive reste à vérifier sur votre propre historique.
5. **TradingView et MT5 peuvent différer légèrement** (prix et historique du courtier).

## 7. Problèmes fréquents

| Problème | Solution |
|---|---|
| Erreur sur une 2ᵉ ligne `indicator(...)` | Le modèle de TradingView n'a pas été effacé |
| Aucune zone | Normal tant que l'inducement n'est pas pris. Sinon, baissez le *déplacement minimal* à 1,2, ou désactivez la règle d'inducement pour comparer |
| Trop de tracés | *Zones par sens* = 2, *Niveaux par côté* = 2, masquez le FVG ou les BOS |
| Zones trop petites ou trop nombreuses en M1 / M5 | *Swings externes* = 7 ou 8 |
