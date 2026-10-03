# KossWin1 : fiche pédagogique

Indicateur Smart Money (SMC / ICT) pour un graphique **propre et lisible**.

| Plateforme | Fichier |
|---|---|
| TradingView (Pine Script v6) | [`kosswin1.pine`](./kosswin1.pine) |
| MetaTrader 5 (indicateur) | [`../mt5/KossWin1.mq5`](../mt5/KossWin1.mq5) |

Les deux versions ont la **même logique**. Elles **ne passent aucun ordre**.

> **À lire avant tout**
> 1. **Non compilé ici** : je n'ai ni l'éditeur Pine ni MetaEditor. En cas d'erreur, envoyez-moi une capture ou le texte exact.
> 2. J'ai vérifié la **logique** en Python sur 16 000 bougies de prix aléatoires de type PainX. Résultat :
>    - 736 zones détectées, dont 469 validées par l'inducement ;
>    - 58 signaux, soit environ 1 signal tous les 6 jours en M30 ;
>    - un résultat moyen d'environ **0R par trade**.
>
>    C'est normal sur des prix sans tendance. **Seules vos vraies données diront si le setup a un avantage.**

---

## 1. Ce que l'indicateur trace (une couleur par type)

| Tracé | Couleur | Signification |
|---|---|---|
| Rectangle **« OB + FVG »** haussier | Vert sarcelle | Order Block haussier **avec un FVG** juste après : zone d'achat prioritaire |
| Rectangle **« OB + FVG »** baissier | Violet | Order Block baissier **avec un FVG** juste après : zone de vente prioritaire (vos rectangles violets) |
| Petit rectangle pointillé « FVG » | Gris-bleu | Le déséquilibre (Fair Value Gap) qui confirme l'OB |
| Rectangle **« Demand »** | Bleu | Zone de demande (base d'achat) quand le mouvement n'a pas laissé de FVG |
| Rectangle **« Supply »** | Orange | Zone d'offre (base de vente) quand le mouvement n'a pas laissé de FVG |
| Ligne pointillée **« BOS »** | Gris | Cassure de structure dans le sens de la tendance |
| Ligne pointillée épaisse **« CHoCH »** | Jaune | Changement de tendance |
| Ligne pointillée **« IDM »** | Rose | L'inducement qui a été pris : il valide la zone |
| Lignes pointillées **BSL / SSL / EQH / EQL** | Cyan | Liquidité au-dessus des sommets et sous les creux (EQ = sommets ou creux égaux) |
| **Point rouge** | Rouge vif | **Sweep** : la mèche a pris la liquidité et la bougie a clôturé en retour |
| Fond **Premium** / **Discount** | Rouge pâle / vert pâle | Moitié haute / moitié basse du mouvement en cours, avec les niveaux **1 – 0,5 – 0** |
| Étiquette **VENTE** / **ACHAT** | Rouge / vert | Signal du setup Koss (partie 4). Passez la souris dessus pour voir l'entrée, le stop, l'objectif et le gain / risque |

**Graphique propre** :
- 3 zones maximum par sens ;
- 3 niveaux de liquidité par côté ;
- les 10 dernières cassures de structure ;
- les zones cassées disparaissent ;
- les zones déjà touchées deviennent pâles.

## 2. Les notions, expliquées simplement

### Tendance : BOS et CHoCH
- **Sommets et creux de structure** : un sommet (ou creux) entouré de 5 bougies plus basses (ou plus hautes) de chaque côté.
- **BOS** (Break of Structure) : une bougie **clôture** au-delà du dernier sommet en tendance haussière (ou du dernier creux en tendance baissière). La tendance **continue**.
- **CHoCH** (Change of Character) : la clôture casse dans le **sens opposé** à la tendance. La tendance **change**.

### Order Block en confluence avec un FVG
- **Order Block (OB)** : la dernière bougie de sens opposé avant le mouvement qui a cassé la structure. Pour une baisse, c'est la dernière bougie haussière.
- **FVG** (Fair Value Gap) : un trou entre la bougie 1 et la bougie 3. Le prix est parti si vite que la bougie 2 a laissé un vide.
- **OB + FVG** : l'OB est suivi d'un FVG dans les 6 bougies. C'est la preuve d'un départ violent : **zone prioritaire**.

### Supply et Demand
Si le mouvement n'a **pas** laissé de FVG, l'indicateur trace la **base** du mouvement, c'est-à-dire les 2 ou 3 bougies où le prix a hésité avant de partir :
- **Supply** (offre) pour une baisse ;
- **Demand** (demande) pour une hausse.

Ces zones sont moins prioritaires qu'un OB + FVG.

### Inducement (IDM) : la clé du graphique propre
Après une cassure de structure, le prix fait souvent un **petit creux interne** (en tendance haussière) avant de revenir vers la vraie zone. Les traders impatients achètent sur ce petit creux et placent leur stop juste en dessous : c'est **l'inducement**, un piège à liquidité.

**Règle de KossWin1** : une zone n'est **tracée qu'après la prise de son inducement**. Tant que le petit creux (ou sommet) interne n'a pas été pris, la zone reste invisible. Vous ne voyez donc que des zones où la liquidité « piège » a déjà été ramassée.

Vous pouvez désactiver cette règle dans *Tracer seulement après inducement*.

### Liquidité et sweep
- **BSL** (Buy Side Liquidity) : les stops des vendeurs, au-dessus des sommets.
- **SSL** (Sell Side Liquidity) : les stops des acheteurs, sous les creux.
- **EQH / EQL** : deux sommets ou deux creux presque égaux. C'est beaucoup de stops au même endroit, une cible favorite.
- **Sweep** (point rouge) : la mèche dépasse le niveau, puis la bougie **clôture en retour**. La liquidité a été prise et rejetée, ce qui est souvent le signe d'un retournement.
- Si la bougie **clôture au-delà** du niveau, il est simplement « pris » : pas de point rouge.

### Premium / Discount (votre outil Fibonacci 1 – 0,5 – 0)
L'indicateur trace automatiquement le **mouvement en cours**, du début (**1**) à la fin (**0**), comme votre Fibonacci sur PainX 600 :

| Tendance | Niveau 1 | Niveau 0 | On vend en | On achète en |
|---|---|---|---|---|
| Baissière | Sommet d'où part la baisse | Plus bas atteint | **Premium** (au-dessus de 0,5) | – |
| Haussière | Creux d'où part la hausse | Plus haut atteint | – | **Discount** (sous 0,5) |

## 3. Unités de temps : H4 pour analyser, M30 pour entrer

| Étape | Unité de temps | Ce que vous regardez |
|---|---|---|
| 1. Tendance de fond | **H4** | La ligne « Tendance H4 » du panneau |
| 2. Setup et entrée | **M30** | Escalier de zones, retour, retournement, signal |

Les signaux en M30 exigent par défaut que la **tendance H4 soit dans le même sens** (*Filtre : tendance de l'unité supérieure*). Vous pouvez changer l'unité supérieure dans les réglages, par exemple H1.

## 4. Le setup Koss (signaux)

Vos règles, traduites pour l'indicateur. Exemple en **vente** (les achats sont le miroir) :

| # | Règle | Ce que vérifie l'indicateur |
|---|---|---|
| 1 | **Tendance baissière** | Dernière cassure en M30 = baissière, et tendance H4 baissière |
| 2 | **Deux OB en escalier** | Au moins 2 zones baissières successives, chacune plus basse que la précédente (*Zones en escalier minimum* = 2) |
| 3a | **Option 1** : le prix revient dans le **dernier OB** | La mèche touche la dernière zone validée (résistance) |
| 3b | **Option 2** : le prix revient en **zone premium** | La mèche dépasse le niveau 0,5 du mouvement |
| 4 | **Confirmation (retournement)** | Dans les 3 bougies suivant le contact, une bougie **baissière clôture sous le plus bas de la bougie précédente** |
| 5 | **Gain / risque** | Stop au-dessus de la zone (ou du niveau 1) + 0,2 ATR ; objectif = **niveau 0** ; signal seulement si le gain / risque est d'au moins **1,5R** |

**Le sens des signaux dépend de l'indice (*Sens* = Auto)** :

| Indice | Comportement | Signaux |
|---|---|---|
| **PainX** (tous), **Crash** | Monte lentement, chute brutalement | **Ventes** |
| **GainX** (tous), **Boom** | Baisse lentement, monte brutalement | **Achats** |
| Autres | – | Achats et ventes |

> Le sens des indices GainX, Boom et Crash est une **hypothèse** (le miroir de vos trades PainX). Testez-la avant de l'utiliser.

## 5. Installation

### TradingView
1. Ouvrez l'**éditeur Pine**, **effacez tout** le modèle proposé (Ctrl + A puis Suppr). Il ne doit rester qu'une seule ligne `indicator(...)`.
2. Collez le contenu de `kosswin1.pine`, puis cliquez sur **Enregistrer** et **Ajouter au graphique**.
3. Passez le graphique en **M30** : le panneau (en bas à droite) affiche la tendance M30 et la tendance H4.

### MetaTrader 5
1. **Fichier → Ouvrir le dossier des données → MQL5 → Indicators** : copiez `KossWin1.mq5`.
2. **F4** (MetaEditor) → ouvrez le fichier → **F7** (compiler) → **0 erreur** attendue.
3. *Navigateur* → *Indicateurs* → clic droit → *Actualiser* → glissez **KossWin1** sur le graphique M30.
4. Le panneau s'affiche en haut à gauche.
5. **Fond de graphique blanc** : les couleurs Premium / Discount par défaut sont foncées (prévues pour un fond noir). Mettez par exemple *Premium* = rose pâle et *Discount* = vert pâle.

> **MT5 mobile** n'accepte pas les indicateurs personnalisés. Installez-le sur MT5 ordinateur et activez les **notifications** pour recevoir les signaux sur le téléphone : *Outils → Options → Notifications*, MetaQuotes ID, et *Notifications sur le téléphone* = true.

## 6. Tous les réglages

| Groupe | Paramètre | Défaut | Rôle |
|---|---|---|---|
| 1. Structure | Swings externes | 5 | Sommets / creux de structure (BOS, CHoCH, liquidité) |
| | Swings internes | 2 | Petits sommets / creux utilisés pour l'inducement |
| | Afficher BOS / CHoCH | Oui | |
| 2. Zones | OB + FVG / FVG / Supply-Demand | Oui | Afficher ou masquer chaque type |
| | Tracer seulement après inducement | **Oui** | La règle n° 2 de votre demande |
| | Afficher l'inducement | Oui | Ligne rose « IDM » |
| | Déplacement minimal | 1,5 × ATR | Taille minimale du mouvement qui crée la zone |
| | Zones par sens | 3 | Plus = graphique plus chargé |
| | Durée de vie | 300 bougies | |
| 3. Liquidité | Niveaux par côté | 3 | |
| | Tolérance EQH / EQL | 0,1 × ATR | Écart max. entre deux sommets « égaux » |
| | Sweep : point rouge | Oui | |
| 4. Premium / Discount | Afficher | Oui | Niveaux 1 – 0,5 – 0 |
| 5. Signaux | Afficher les signaux | Oui | |
| | Sens | Auto | Voir partie 4 |
| | Zones en escalier minimum | 2 | Votre règle « deux OB en escalier » |
| | Zone d'entrée | Zone ou premium / discount | Ou « dans la zone » seulement (option 1 uniquement) |
| | Gain / risque minimal | 1,5R | |
| | Filtre unité supérieure | Oui, H4 | |
| 6. Couleurs | Une couleur par tracé | Voir partie 1 | |
| MT5 seulement | Alertes / notifications / bougies analysées | Oui / Non / 3 000 | |

## 7. Les alertes

**TradingView** : créez une alerte, puis dans *Condition*, choisissez **KossWin1** et l'une de ces options :
- *VENTE* ou *ACHAT* ;
- *sweep de liquidité* ;
- *CHoCH* ;
- *zone validée (IDM pris)* ;
- ou « Tout appel de fonction alert() » pour un message complet (entrée, stop, objectif, R).

**MT5** : alertes intégrées (signaux, sweeps, CHoCH, zones validées), plus les notifications sur le téléphone en option.

## 8. Comment l'utiliser au quotidien

1. **H4** : notez la tendance (ligne du panneau).
2. **M30** : attendez que l'escalier atteigne **au moins 2 zones** dans le sens de la H4.
3. Attendez le **retour** du prix dans la dernière zone, ou en premium / discount.
4. Attendez la **bougie de retournement**. Le signal apparaît à sa clôture.
5. Passez la souris sur l'étiquette pour lire le stop et l'objectif. Calculez votre lot pour **risquer 1 % maximum**.
6. Notez chaque trade dans votre journal ([`../journal/Journal_Koss_Smart_Pro.xlsx`](../journal/Journal_Koss_Smart_Pro.xlsx)).

## 9. Le test qui compte

1. **Revue manuelle** : sur 3 mois de M30 (PainX 600, PainX 1200, GainX, Boom, Crash), comptez les signaux et leur résultat.
2. **Seuil minimal** : il faut **30 signaux minimum** pour une première idée, et 100 ou plus pour décider.
3. **Retirez le spread** :
   - formule : spread ÷ distance entrée – stop ;
   - exemple : spread 10 points, stop à 100 points → 0,1R de moins par trade.
4. **Décision** : si le résultat moyen dépasse **+0,2R** après spread, sur 2 indices et 2 périodes, passez en **démo** pendant 1 mois. Ensuite seulement, je vous prépare l'Expert Advisor.

## 10. Limites connues

1. **Pas de repaint, mais du retard** :
   - un sommet de structure n'est confirmé que 5 bougies après ;
   - une zone n'apparaît qu'après la prise de l'inducement.

   C'est le prix à payer pour un graphique honnête.
2. **Les règles SMC n'ont pas de définition officielle unique.** Celles-ci sont précises et chiffrées, mais un autre indicateur SMC peut tracer des zones un peu différentes.
3. **Un seul mouvement premium / discount** : le dernier, celui de la tendance actuelle.
4. **Indices générés par un algorithme** (PainX, GainX, Boom, Crash) : il n'y a ni banques ni vraie liquidité. Les formes SMC peuvent fonctionner ou non : seul le test le dira.
5. **TradingView et MT5 peuvent différer légèrement** : prix et historique du courtier.

## 11. Problèmes fréquents

| Problème | Solution |
|---|---|
| Erreur sur une 2ᵉ ligne `indicator(...)` (TradingView) | Le modèle de TradingView n'a pas été effacé (partie 5) |
| Aucune zone | Normal tant que l'inducement n'est pas pris ; sinon baissez le *déplacement minimal* (1,2) ou désactivez *Tracer seulement après inducement* pour comparer |
| Aucun signal | Vérifiez dans le panneau : la tendance H4 et M30 doivent être dans le même sens, et l'escalier doit avoir au moins 2 zones |
| « Tendance H4 : unité trop petite » | L'unité supérieure doit être plus grande que celle du graphique |
| MT5 : « Tendance H4 : – » au début | L'historique H4 se charge : attendez quelques secondes ou changez d'unité de temps puis revenez |
| Trop de tracés | Baissez *Zones par sens* à 2, *Niveaux par côté* à 2, ou masquez le FVG |
