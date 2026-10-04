# KossWin2 : guide de l'indicateur

Deux fichiers, une seule logique :

| Plateforme   | Fichier                          |
| ------------ | -------------------------------- |
| TradingView  | `KossWin2.pine` (Pine Script v6) |
| MetaTrader 5 | `KossWin2.mq5` (MQL5)            |

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

| Élément                | Aspect                                               | Couleur par défaut                 |
| ---------------------- | ---------------------------------------------------- | ---------------------------------- |
| BOS / CHoCH            | Ligne pointillée + texte                             | Vert (haussier) / rouge (baissier) |
| Liquidité              | Ligne en tirets + `BSL` `SSL` `EQH` `EQL`            | Gris                               |
| Sweep                  | **Point rouge** au-dessus ou en dessous de la bougie | Rouge                              |
| OB + FVG achat / vente | Rectangle plein `OB+FVG`                             | Vert / rouge                       |
| Demand / Supply        | Rectangle plein `Demand` / `Supply`                  | Bleu / orange                      |
| Inducement pris        | Ligne pointillée `IDM`                               | Gris                               |
| Premium / Discount     | Deux grands rectangles + ligne d'équilibre 50 %      | Rouge / vert, très clairs          |
| Panneau                | Tendance + dernier événement + position du prix      | Coin haut droit                    |

## 3. Définitions exactes utilisées

Ces notions n'ont pas de définition unique en SMC. Voici celles que le code applique, sans interprétation.

### 3.1 Structure et tendance

- **Swing** : sommet (ou creux) plus haut (ou plus bas) que les `5` bougies de chaque côté (réglable).
- **BOS** : une **clôture** casse le dernier sommet en tendance haussière, ou le dernier creux en tendance baissière.
- **CHoCH** : une clôture casse le dernier sommet en tendance **baissière** (ou le dernier creux en tendance haussière). La tendance s'inverse.
- **Tendance** : le sens de la dernière cassure, affiché dans le panneau.

### 3.2 Liquidité et sweeps

- **BSL / SSL** : les derniers sommets et creux de structure **non encore pris** (3 par côté au maximum).
- **EQH / EQL** : deux sommets (ou deux creux) séparés de moins de `0,1 × ATR`. La liquidité y est regroupée.
- **Sweep (point rouge)** : la **mèche** dépasse un niveau de liquidité, mais la bougie **clôture de l'autre côté**. Le niveau est alors retiré.
- Si la bougie **clôture** au-delà du niveau, c'est une prise de liquidité par cassure : le niveau est retiré sans point rouge.

### 3.3 Premium / Discount

- **Range** : la dernière jambe qui a cassé la structure, de son origine (creux ou sommet extrême) jusqu'au plus haut ou plus bas atteint depuis.
- **Équilibre** = 50 % du range. **Premium** = moitié haute, **Discount** = moitié basse.
- **Selon la tendance** : en tendance haussière, le **Discount** est mis en avant (c'est là qu'on cherche les achats) ; en tendance baissière, c'est le **Premium** (ventes).

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

## 4. Garder le graphique propre

Réglages par défaut volontairement sobres :

- 4 BOS / CHoCH affichés ;
- 3 niveaux de liquidité par côté ;
- 4 zones par sens ;
- les niveaux pris et les zones invalidées sont effacés ;
- Premium / Discount très transparents.

Tout se règle dans les paramètres, et chaque élément peut être masqué.

**Aucun repaint** : tout est calculé à la **clôture** de la bougie. Un swing n'est confirmé que 5 bougies après sa formation, ce qui crée un retard voulu.

## 5. Alertes

- **TradingView** : Créer une alerte → condition « KossWin2 » → « Tout appel de fonction alert() ».
- **MT5** : popup automatique si le paramètre `Alertes` est activé.

Deux événements déclenchent une alerte : une zone validée par inducement, et un sweep.

## 6. Analyse critique

1. **« Fortes probabilités de réaction » n'est pas démontré.** Aucun indicateur ne peut le garantir. KossWin2 applique des règles fixes. Si ces règles donnent un avantage, seul un test sur au moins 50 à 100 cas notés (gagnants **et** perdants) peut le montrer. Sans ce test, on ne retient que les zones qui ont fonctionné : c'est le biais de confirmation.
2. **OB et Supply/Demand se recoupent.** Ce sont souvent deux noms pour le même endroit. Les afficher tous les deux ne double pas la probabilité. C'est pourquoi les chevauchements sont masqués par défaut.
3. **L'inducement a plusieurs définitions** : premier repli après la cassure, dernier repli avant la zone, repli interne ou externe… J'ai codé « le premier repli interne après la cassure ». Si ta définition est différente, dis-le et je l'adapte.
4. **Tout dépend du réglage « Force des swings ».** Avec 3, beaucoup de BOS/CHoCH ; avec 10, peu. Ce n'est pas « la » structure du marché, c'est une structure à une échelle choisie.
5. **Les sweeps peuvent être nombreux.** Sur les données simulées, un point rouge apparaît environ toutes les 25 bougies. Sur un vrai marché, si c'est trop, réduis le nombre de niveaux par côté ou augmente la force des swings.
6. **TradingView et MT5 ne donneront pas exactement les mêmes zones.** Les flux de prix et les fuseaux horaires des bougies diffèrent d'un courtier à l'autre, et les cas d'égalité entre sommets peuvent être traités différemment. La logique est la même ; les données ne le sont pas.
7. **MT5 n'a pas de vraie transparence pour les rectangles.** Le remplissage est donc mélangé avec la couleur de fond du graphique pour la simuler. Premium / Discount y est dessiné en contour seulement : trait plein pour la moitié mise en avant, pointillé pour l'autre.

## 7. Vérifications faites

- La logique a été reproduite en Python et exécutée sur 5 × 6 000 bougies simulées. Sur ces données : 1 321 cassures (dont 512 CHoCH), 1 079 zones créées, dont 572 (53 %) validées par inducement.
- Invariants vérifiés sur chaque zone affichée :
  - l'IDM est formé après la cassure ;
  - l'IDM a bien été pris à la bougie d'affichage ;
  - le prix n'a jamais touché la zone avant l'IDM ;
  - aucune clôture n'a traversé la zone avant son affichage.
- Sur chaque sweep : la mèche dépasse le niveau et la clôture revient de l'autre côté.
- **Non vérifié** : la compilation dans TradingView et dans MetaEditor, et le comportement sur de vraies données de marché.
