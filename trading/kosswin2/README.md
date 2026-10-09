# KossWin2 : guide de l'indicateur

Deux fichiers, une seule logique :

| Plateforme   | Fichier                          |
| ------------ | -------------------------------- |
| TradingView  | `KossWin2.pine` (Pine Script v6) |
| MetaTrader 5 | `KossWin2.mq5` (MQL5), version 2 |

Les deux versions sont au même niveau : biais directionnel, doji de CHoCH, points de sweep réduits, sans Premium / Discount.

## 1. Installation

**TradingView**

1. Ouvrir **Pine Editor** (bas de l'écran), supprimer le code par défaut, coller tout le contenu de `KossWin2.pine`.
2. Cliquer sur **Enregistrer**, puis sur **Ajouter au graphique**.

**MetaTrader 5**

1. Dans MT5 : **Fichier → Ouvrir le dossier des données → MQL5 → Indicators**, et y copier `KossWin2.mq5`.
2. Ouvrir le fichier dans **MetaEditor** (F4) et cliquer sur **Compiler** (F7).
3. Dans MT5 : **Navigateur → Indicateurs → KossWin2**, puis le glisser sur le graphique.

> ⚠️ Aucun des deux fichiers n'a pu être compilé pendant la rédaction : TradingView et MetaEditor ne sont pas disponibles dans l'environnement de travail. La logique a été vérifiée par une réplique en Python (section 7). En cas d'erreur de compilation, envoie le message exact avec le numéro de ligne.

## 2. Ce que l'indicateur affiche

| Élément                | Aspect                                                                  | Couleur par défaut                 |
| ---------------------- | ----------------------------------------------------------------------- | ---------------------------------- |
| BOS / CHoCH            | Ligne pointillée + texte                                                | Vert (haussier) / rouge (baissier) |
| Liquidité              | Ligne en tirets + `BSL` `SSL` `EQH` `EQL`                               | Gris                               |
| Sweep d'EQH / EQL      | **Petit point rouge** (puce « • ») au-dessus ou en dessous de la bougie | Rouge                              |
| OB + FVG achat / vente | Rectangle plein `OB+FVG`                                                | Vert / rouge                       |
| Demand / Supply        | Rectangle plein `Demand` / `Supply`                                     | Bleu / orange                      |
| Inducement pris        | Ligne pointillée `IDM`                                                  | Gris                               |
| Doji de CHoCH          | Rectangle `Doji`, si le 1er contact a donné un rejet ou un retournement | Violet                             |
| Panneau                | Biais du TF supérieur + structure locale + alignement                   | Coin haut droit                    |

## 3. Définitions exactes utilisées

Ces notions n'ont pas de définition unique en SMC. Voici celles que le code applique, sans interprétation.

### 3.1 Structure et tendance

- **Swing** : sommet (ou creux) plus haut (ou plus bas) que les `5` bougies de chaque côté (réglable).
- **BOS** : une **clôture** casse le dernier sommet en tendance haussière, ou le dernier creux en tendance baissière.
- **CHoCH** : une clôture casse le dernier sommet en tendance **baissière** (ou le dernier creux en tendance haussière). La tendance s'inverse.
- **Tendance** : le sens de la dernière cassure, affiché dans le panneau.

### 3.2 Liquidité et sweeps

- **BSL / SSL** : les derniers sommets et creux de structure **non encore pris** (3 par côté au maximum).
- **EQH / EQL** : deux petits sommets (ou creux), swings de force `3` réglable, séparés de moins de `0,1 × ATR`, **dans un sens comme dans l'autre**. Entre les deux, le prix ne doit pas avoir dépassé le premier de plus que cette tolérance. La liquidité y est regroupée.
- **Sweep (point rouge) : uniquement sur les EQH / EQL.** La **mèche** dépasse le niveau égal, mais la bougie **clôture de l'autre côté**. Le niveau est alors retiré.
- Les BSL / SSL simples restent affichés comme niveaux de liquidité, mais leur prise **ne donne pas** de point rouge.
- Si la bougie **clôture** au-delà du niveau, c'est une prise de liquidité par cassure : le niveau est retiré sans point rouge.

### 3.3 Biais directionnel

Premium / Discount a été retiré de la version TradingView.

- **Biais** : le sens de la dernière cassure de structure (BOS ou CHoCH) sur un **timeframe supérieur**, calculé avec exactement les mêmes règles que la structure du graphique. Un BOS ou un CHoCH haussier donne un biais **haussier** ; baissier, un biais **baissier**.
- **Timeframe du biais** (automatique par défaut, réglable) :

  | Graphique | Biais |
  | --------- | ----- |
  | M1 à M5   | H1    |
  | M15 à M30 | H4    |
  | H1 à H4   | D     |
  | D         | W     |
  | Au-delà   | M     |

- **Le panneau affiche trois lignes** :
  - le biais : timeframe, sens et dernier événement ;
  - la structure du graphique : sens et dernier événement ;
  - l'**alignement** : ✔ si la structure locale va dans le sens du biais, ✘ sinon.
- **Utilisation** : on cherche des achats quand le biais est haussier **et** que la structure locale s'aligne, des ventes dans le cas inverse. Quand les deux divergent, la structure locale peut être en train de faire un repli dans la tendance du biais.
- **Option « Zones seulement dans le sens du biais »** (désactivée par défaut, pour ne rien changer au reste) : une fois activée, seules les zones dans le sens du biais sont affichées, par exemple uniquement les zones d'achat quand le biais est haussier.
- **Aucun repaint** : le biais utilise la dernière bougie **clôturée** du timeframe supérieur.

### 3.4 Zones

Toutes les zones naissent de **la jambe qui vient de casser la structure** (BOS ou CHoCH). Une zone sans cassure de structure n'est pas considérée comme valide.

- **OB + FVG** (confluence obligatoire) : on cherche le **premier FVG** de la jambe : 3 bougies où le bas de la 3ᵉ est au-dessus du haut de la 1ʳᵉ, ou l'inverse. L'Order Block est la **dernière bougie de couleur opposée** avant ce déplacement. Pas de FVG, pas d'OB.
- **Demand / Supply** : une **base** de 1 à 3 petites bougies (corps ≤ 50 %) juste avant une **bougie de départ** forte (amplitude ≥ 1,5 × ATR, corps ≥ 60 %) dans le sens de la cassure. Par défaut, une Demand ou Supply qui chevauche un OB+FVG est masquée, pour éviter les doublons.

### 3.5 Inducement (condition d'affichage)

- **IDM** = le **premier petit repli** (swing interne de force 2) formé **après** la cassure, situé **devant** la zone :
  - au-dessus d'une zone d'achat ;
  - en dessous d'une zone de vente.
- Une zone reste **invisible** tant que ce repli n'a pas été pris par le prix.
- Elle s'affiche à la bougie qui prend l'IDM.
- Une zone est **supprimée** dans quatre cas :
  - le prix revient dans la zone **sans** avoir formé d'inducement ;
  - une clôture traverse la zone (invalidation) ;
  - l'inducement n'est pas pris dans les 300 bougies ;
  - la limite de 4 zones par sens est dépassée (les plus anciennes partent).
- Au premier contact du prix, la zone pâlit. Elle peut aussi être effacée au premier contact, via une option.

```
Zone d'achat :

   cassure (BOS/CHoCH) ─┐      IDM = 1er repli après la cassure
                        │ ╱╲    ╱
          ╱╲   ╱╲      ╱╲╱  ╲  ╱──── IDM pris → la zone S'AFFICHE
   ╲  ╱╲ ╱  ╲ ╱  ╲    ╱       ╲╱
    ╲╱  ╳    ╳    ╲  ╱          ╲
   ┌────────────────╲╱──┐        ╲
   │ OB+FVG / Demand    │◄────────╲ (retour du prix dans la zone)
   └────────────────────┘
```

### 3.6 Doji de CHoCH (violet)

- **Doji** : bougie dont le corps fait au plus **10 %** de son amplitude (réglable).
- **Où on les cherche** : seulement autour des **CHoCH**, pas des BOS. La recherche couvre tout le mouvement qui mène au CHoCH : de la bougie du swing cassé (début de la dernière jambe) jusqu'à la **bougie de cassure incluse**. On couvre ainsi « avant le CHoCH » et « au niveau du CHoCH ».
- **Zone du doji** : du plus haut au plus bas de la bougie.
- **Condition d'affichage : le premier contact doit produire une réaction.** Une réaction, c'est un **rejet** ou un **retournement** du prix au moment où il touche la zone :
  - **Rejet** : la bougie qui touche la zone clôture **hors de la zone, côté réaction**, c'est-à-dire au-dessus pour un CHoCH haussier, en dessous pour un baissier ;
  - **Retournement** : cette clôture de réaction arrive dans les **3 bougies** suivant le premier contact, bougie de contact comprise (réglable ; 1 = rejet seul) ;
  - **Amplitude minimale** : la clôture de réaction doit s'éloigner de la zone d'au moins **0,25 × ATR** (réglable ; 0 = n'importe quelle clôture hors de la zone).
- **Si le premier contact ne réagit pas dans ce délai, le doji est écarté.** Un contact ultérieur ne le rattrape pas.
- **Effacement** : quand une clôture traverse la zone, quand le prix ne revient pas dans la zone dans les 300 bougies qui suivent le CHoCH, ou quand on dépasse 6 doji affichés (les plus anciens partent).

## 4. Garder le graphique propre

Réglages par défaut volontairement sobres :

- 4 BOS / CHoCH affichés ;
- 3 niveaux de liquidité par côté ;
- 4 zones par sens ;
- 6 doji violets au maximum ;
- les niveaux pris et les zones invalidées sont effacés ;
- points de sweep réduits (puce « • »).

Tout se règle dans les paramètres, et chaque élément peut être masqué.

**Aucun repaint** : tout est calculé à la **clôture** de la bougie. Un swing n'est confirmé que 5 bougies après sa formation, ce qui crée un retard voulu.

## 5. Alertes

- **TradingView** : Créer une alerte → condition « KossWin2 » → « Tout appel de fonction alert() ».
- **MT5** : popup automatique si le paramètre `Alertes` est activé.

Trois événements déclenchent une alerte : une zone validée par inducement, un sweep d'EQH / EQL, et un doji de CHoCH validé par une 1re réaction.

## 6. Analyse critique

1. **« Fortes probabilités de réaction » n'est pas démontré.** Aucun indicateur ne peut le garantir. KossWin2 applique des règles fixes. Si ces règles donnent un avantage, seul un test sur au moins 50 à 100 cas notés (gagnants **et** perdants) peut le montrer. Sans ce test, on ne retient que les zones qui ont fonctionné : c'est le biais de confirmation.
2. **OB et Supply/Demand se recoupent.** Ce sont souvent deux noms pour le même endroit. Les afficher tous les deux ne double pas la probabilité. C'est pourquoi les chevauchements sont masqués par défaut.
3. **« L'inducement selon SMC/ICT » n'est pas une définition unique.** Le terme vient surtout des formateurs SMC ; ICT parle plutôt de liquidité « engineered ». La définition la plus répandue est celle codée ici : **le premier repli valide après le BOS/CHoCH, qui doit être pris avant que le prix touche la zone**. D'autres variantes existent : dernier repli avant le sommet, repli « valide » seulement s'il casse le bas de la bougie précédente… L'indicateur approche cette notion de repli valide par un swing interne de force 2, réglable.
4. **Tout dépend du réglage « Force des swings ».** Avec 3, beaucoup de BOS/CHoCH ; avec 10, peu. Ce n'est pas « la » structure du marché, c'est une structure à une échelle choisie.
5. **Les points rouges sont rares, et c'est voulu.** Seuls les sweeps d'EQH / EQL sont marqués. Sur les données simulées, cela donne environ un point toutes les 250 bougies, contre un toutes les 25 quand tous les niveaux comptaient. Une détection EQH / EQL limitée aux gros swings n'en aurait donné qu'un toutes les 900 bougies environ, d'où la force dédiée. Pour en voir davantage : tolérance 0,2 ATR (environ 1 toutes les 130 bougies) ou force EQH / EQL de 2.
6. **TradingView et MT5 ne donneront pas exactement les mêmes zones.** Les flux de prix et les fuseaux horaires des bougies diffèrent d'un courtier à l'autre, et les cas d'égalité entre sommets peuvent être traités différemment. La logique est la même ; les données ne le sont pas.
7. **MT5 n'a pas de vraie transparence pour les rectangles.** Le remplissage est donc mélangé avec la couleur de fond du graphique pour la simuler. Les doji violets suivent la même règle.
8. **Particularités de la version MT5.**
   - **Biais** : calculé sur les 20 000 dernières bougies du timeframe du biais. Si ces données ne sont pas encore chargées, le panneau affiche « INDÉFINI » jusqu'au tick suivant.
   - **Taille du point de sweep** : réglage `Taille du point`, de 1 (minuscule, par défaut) à 3 (ancienne taille).
   - **Accents** : le fichier est enregistré en UTF-8 avec BOM, pour que MetaEditor affiche correctement les accents des textes. Si des caractères étranges apparaissent dans les alertes, réenregistre le fichier en UTF-8 depuis MetaEditor.
9. **Le biais n'est qu'une échelle de structure de plus.** Il dépend du timeframe choisi et de la force des swings. Un biais H4 haussier peut cohabiter avec une tendance journalière baissière. Il oriente la lecture, il ne prédit rien.
10. **C'est l'amplitude de la réaction qui fait le tri, pas la forme rejet / retournement.** Une zone de doji est petite, et le prix y revient puis en ressort facilement. Sur 546 doji candidats (données simulées), voici combien sont validés selon la règle :

    | Règle                                                       | Doji validés |
    | ----------------------------------------------------------- | ------------ |
    | Ancienne (réaction à n'importe quel moment)                 | 60 %         |
    | Rejet seul, bougie de contact                               | 45 %         |
    | Rejet ou retournement ≤ 3 bougies, sans amplitude minimale  | 56 %         |
    | **Rejet ou retournement ≤ 3 bougies + 0,25 × ATR (défaut)** | **43 %**     |
    | Rejet ou retournement ≤ 3 bougies + 0,5 × ATR               | 31 %         |

    Le seuil de 0,25 × ATR est un choix de ma part, pas une règle SMC. Le régler à 0 donne ta définition au pied de la lettre.

## 7. Vérifications faites

- **Doji** : sur 5 × 6 000 bougies simulées, on obtient 512 CHoCH et 546 doji candidats, dont 233 validés avec la règle par défaut (environ 1 doji violet toutes les 130 bougies). Invariants vérifiés sur chaque doji violet :
  - le contact retenu est bien le **premier** contact après le CHoCH ;
  - la clôture de réaction arrive au plus 3 bougies après ce contact ;
  - aucune clôture n'a traversé la zone avant l'affichage.
- Le biais n'a pas été simulé. Il réutilise exactement les règles de structure déjà vérifiées, appliquées au timeframe supérieur.
- La logique a été reproduite en Python et exécutée sur 5 × 6 000 bougies simulées. Sur ces données : 1 321 cassures (dont 512 CHoCH), 1 079 zones créées, dont 572 (53 %) validées par inducement.
- Invariants vérifiés sur chaque zone affichée :
  - l'IDM est formé après la cassure ;
  - l'IDM a bien été pris à la bougie d'affichage ;
  - le prix n'a jamais touché la zone avant l'IDM ;
  - aucune clôture n'a traversé la zone avant son affichage.
- Sur chaque sweep : le niveau est un EQH / EQL, la mèche le dépasse et la clôture revient de l'autre côté.
- **Non vérifié** : la compilation dans TradingView et dans MetaEditor, et le comportement sur de vraies données de marché.
