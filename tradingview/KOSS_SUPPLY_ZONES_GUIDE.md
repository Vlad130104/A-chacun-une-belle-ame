# Koss Supply Zones : fiche pédagogique

Indicateur tiré de **votre** setup gagnant sur PainX 600 et PainX 1200 : la **vente sur l'escalier d'offre** (analyse complète : [`../strategie/ANALYSE_SETUP_PAINX.md`](../strategie/ANALYSE_SETUP_PAINX.md)).

| Plateforme | Fichier |
|---|---|
| TradingView (Pine Script v6) | [`koss_supply_zones.pine`](./koss_supply_zones.pine) |
| MetaTrader 5 (indicateur) | [`../mt5/KossSupplyZones.mq5`](../mt5/KossSupplyZones.mq5) |

Les deux versions ont **la même logique et les mêmes réglages**. Elles **ne passent aucun ordre** : elles détectent, dessinent, alertent et comptent les résultats.

> **À lire avant tout**
> 1. **Non compilé ici** (pas d'éditeur Pine ni de MetaEditor dans mon environnement). En cas d'erreur, envoyez-moi une capture ou le texte exact.
> 2. J'ai testé la **logique** en Python sur 200 000 bougies de prix aléatoires de type PainX, **sans tendance** :
>    - elle produit bien des zones, des signaux et des trades ;
>    - le résultat moyen est d'environ **0R par trade** (−0,01R avec confirmation, −0,08R sans).
>
>    C'est normal : **sur des prix sans tendance, aucune méthode ne gagne**. Seules les vraies données PainX diront si votre setup a un avantage (partie 7).

---

## 1. La stratégie en 5 étapes

```
   ███ marche 1
      ██ marche 2          ← chaque zone d'offre est plus basse
         ███ marche 3  ◄── zone ACTIVE (la dernière)
             \  ← 1. le prix revient dans la zone
              \ ← 2. bougie baissière qui clôture sous la zone = confirmation
               \   3. VENTE, stop au-dessus de la zone
   ─ ─ ─ ─ ─ ─ ─\─ ─ EQL (creux égaux) ← 4. TP2 sous la liquidité
                 ▼    5. TP1 à 1,5R : 50 % fermés, stop à l'entrée
```

| Étape | Règle exacte (réglages par défaut) |
|---|---|
| **Zone d'offre** | Une bougie **clôture sous le dernier creux** et la chute fait au moins **1,5 × ATR**. La zone va du **plus haut** de la chute à l'**ouverture de la dernière bougie haussière** avant la chute. |
| **Escalier** | Si la nouvelle zone est **plus basse** que la précédente, l'escalier gagne une marche. Sinon il repart à 1. Si une bougie **clôture au-dessus** de la zone, l'escalier repart à 0. |
| **Zone active** | Seulement la **dernière** zone créée, et seulement si l'escalier a **au moins 2 marches**. |
| **Toucher** | Le prix atteint le **bas de la zone − 0,1 ATR** (votre niveau d'entrée habituel). |
| **Confirmation** (activée) | Dans les **5 bougies**, une bougie **baissière** clôture **sous** ce niveau. **Entrée à sa clôture.** |
| **Stop** | **Haut de la zone + 0,2 ATR.** |
| **TP2** | **Liquidité** (creux non encore pris) sous l'entrée, − 0,5 ATR, avec **au moins 2R**. Par défaut, c'est la plus proche qui donne 2R. |
| **TP1** | **1,5R** : 50 % fermés, stop remonté au prix d'entrée. |
| **Sortie forcée** | Au bout de **48 bougies** si rien n'est touché. |

**Les achats** (zones de demande, en vert) suivent la même logique à l'envers : chaque creux est plus haut, achat au retour dans la dernière zone de demande.

## 2. Le sens automatique

| Symbole | Sens en mode « Auto » | Pourquoi |
|---|---|---|
| **PainX**, **Crash** | **Ventes** (zones d'offre) | L'indice chute brutalement : on vend dans le sens des chutes, comme vos trades |
| **GainX**, **Boom** | **Achats** (zones de demande) | L'indice monte par pics : on achète dans le sens des pics |
| Autres (Volatility, FX Vol, or, forex…) | Les deux | Pas de sens privilégié |

La détection lit le **nom du symbole**. Vérifiez la ligne « Sens » du panneau. Si le nom n'est pas reconnu, choisissez le sens à la main.

> Le sens des indices « miroir » (GainX / Boom) est une **hypothèse** : vos deux exemples sont des ventes sur PainX. Testez-la avant de l'utiliser.

## 3. Installation

### TradingView
1. Ouvrez l'**éditeur Pine** (en bas du graphique).
2. **Effacez tout** le modèle proposé par TradingView (Ctrl + A puis Suppr). Il ne doit rester **qu'une seule** ligne `indicator(...)`.
3. Collez le contenu de `koss_supply_zones.pine`.
4. Cliquez sur **Enregistrer**, puis **Ajouter au graphique**.
5. Réglez le graphique :
   - PainX 600 : **M30** ;
   - PainX 1200 : **H1**.

### MetaTrader 5
1. MT5 → **Fichier → Ouvrir le dossier des données → MQL5 → Indicators** : copiez `KossSupplyZones.mq5`.
2. **F4** (MetaEditor) → ouvrez le fichier → **F7** (compiler) → **0 erreur** attendue.
3. MT5 → *Navigateur* → *Indicateurs* → clic droit → *Actualiser*.
4. Glissez **KossSupplyZones** sur le graphique PainX (M30 ou H1).
5. Le panneau s'affiche en haut à gauche.

> Sur **MT5 mobile** (téléphone), les indicateurs personnalisés ne s'installent pas. Installez-le sur MT5 **ordinateur**, puis activez les **notifications** (partie 6) pour recevoir les signaux sur le téléphone.

## 4. Lire le graphique

| Élément | Signification |
|---|---|
| Rectangle **violet plein**, « Offre · marche 3 » | **Zone d'offre active** (la seule qui peut donner une vente) |
| Rectangle violet **pâle / pointillé** | Ancienne zone, déjà utilisée ou remplacée : repère visuel seulement |
| Rectangle **vert** | Zone de demande (achats) |
| Ligne grise pointillée **EQL / EQH** | Creux égaux / sommets égaux : liquidité. Elle s'arrête quand le prix la prend. |
| Ligne épaisse + étiquette « VENTE · marche 3 … » | Signal : entrée, stop, TP1, TP2, gain / risque et **lot conseillé** |
| Ligne rouge pointillée | Stop (remonte au prix d'entrée après TP1) |
| Lignes vertes | TP1 (pointillés fins), TP2 (tirets) |
| Étiquette « +2.40R » / « −1.00R » | Résultat du trade virtuel |

### Le panneau

| Ligne | Contenu |
|---|---|
| Sens | Sens actif (et « auto » si détecté par le symbole) |
| Escalier d'offre / de demande | Nombre de marches (✔ quand le minimum est atteint) |
| Zone active / Plan | Bornes de la zone, prix d'entrée et stop prévus |
| Lot | Lot pour risquer votre % de capital sur ce plan |
| Trade | Trade virtuel en cours |
| État | Ce que fait l'indicateur (attente, confirmation, setup ignoré et pourquoi…) |
| Statistiques | Sur tout l'historique chargé : nombre de trades, réussite, TP1 / TP2 atteints, espérance (R moyen), total, profit factor |

## 5. Les réglages

### 1. Sens des trades
| Paramètre | Défaut | Rôle |
|---|---|---|
| Sens | Auto | Voir partie 2 |

### 2. Zones et escalier
| Paramètre | Défaut | Rôle |
|---|---|---|
| Longueur des swings | 3 | Bougies de chaque côté pour valider un creux / sommet |
| Mouvement impulsif minimal | 1,5 × ATR | Plus haut = moins de zones, plus « propres » |
| Recherche de l'origine | 20 bougies | Où chercher le sommet de départ de la chute |
| Hauteur de la zone | Mèche + corps | Ou « Bougie entière » (zone plus haute, stop plus loin) |
| Marches minimales | **2** | 1 = toutes les zones ; 3 = escaliers plus longs seulement |
| Durée de vie d'une zone | 150 bougies | Au-delà, la zone disparaît |
| Période ATR | 14 | |

### 3. Entrée
| Paramètre | Défaut | Rôle |
|---|---|---|
| Entrée avant le bord de la zone | 0,1 × ATR | Votre habitude : vendre un peu sous la zone |
| Confirmation de rejet | **Oui** | Non = entrée directe au toucher (comme votre trade PainX 1200) |
| Délai de confirmation | 5 bougies | Sans confirmation dans ce délai : zone abandonnée |

### 4. Stop et objectifs
| Paramètre | Défaut | Rôle |
|---|---|---|
| Marge du stop | 0,2 × ATR | Au-delà du haut de la zone |
| TP1 / part fermée / stop à l'entrée | 1,5R / 50 % / Oui | |
| Cible (TP2) | Liquidité la plus proche (≥ R min.) | Ou « la plus extrême » (votre TP à 103 393 correspondait plutôt à ce choix) |
| Gain / risque minimal | 2R | En dessous : pas de trade |
| Marge au-delà de la liquidité | 0,5 × ATR | Le TP2 est placé un peu **après** le creux, là où les stops sont déclenchés |
| Sans liquidité visible | 3R | Si aucun creux n'existe sous le prix ; 0 = pas de trade |
| Tolérance EQL / EQH | 0,15 × ATR | Écart max. entre deux creux « égaux » |
| Durée max. | 48 bougies | 0 = pas de limite |

### 5. Taille de position
| Paramètre | TradingView | MT5 |
|---|---|---|
| Capital | À saisir (1 000 $ par défaut) | 0 = **équité du compte** |
| Risque par trade | 1 % | 1 % |
| Valeur d'un point pour 1 lot | À saisir (**≈ 1 USD sur PainX**, mesuré sur vos captures) | Lue automatiquement chez le courtier |

**Exemple** (votre trade PainX 600) :
- Entrée 103 917, stop 104 010 : **93 points** de risque.
- Pour risquer 1 % de 10 000 $ (100 $) : 100 ÷ 93 = **1,07 lot**.
- Vous aviez pris 7 lots, soit environ **650 $ de risque**.

### 6. Affichage (et alertes sur MT5)
- Zones par sens : 4.
- EQL / EQH, trades et panneau : oui.
- Trades gardés sur le graphique : 5.
- Couleurs : violet (offre), vert (demande), gris (neutre), rouge (stop), vert foncé (objectifs).
- MT5 uniquement :
  - bougies analysées : 5 000 ;
  - alertes : oui ;
  - notifications sur le téléphone : non.

## 6. Les alertes

### TradingView
Créez une alerte (icône réveil), puis dans *Condition*, choisissez **Koss Supply Zones** et l'une de ces options :

| Condition | Quand |
|---|---|
| KSZ : signal de VENTE / d'ACHAT | Confirmation obtenue : c'est le moment d'entrer |
| KSZ : prix dans la zone active | Le prix vient de toucher la zone (préparez-vous) |
| KSZ : nouvelle zone | Une nouvelle marche vient d'apparaître |
| KSZ : TP1 / TP2 / stop | Le trade virtuel évolue |
| « Tout appel de fonction alert() » | Message complet : entrée, stop, TP1, TP2, gain / risque, lot |

Fréquence : **une fois par clôture de bougie**.

### MT5
Alertes activées par défaut (fenêtre MT5).

Pour les recevoir sur le téléphone :
1. MT5 ordinateur → **Outils → Options → Notifications**.
2. Saisissez votre **MetaQuotes ID** (application MT5 mobile → *Réglages → Messages*).
3. Mettez **Notifications sur le téléphone = true** dans l'indicateur.

## 7. Le test qui compte (avant tout argent réel)

1. **Statistiques du panneau.**
   - Sur PainX 600 (M30) et PainX 1200 (H1), chargez le plus d'historique possible (sur TradingView, faites défiler vers la gauche).
   - Notez le **nombre de trades**, l'**espérance** et le **profit factor**.
2. **Retirez le spread.** Les statistiques n'en tiennent pas compte.
   - Formule : spread ÷ risque moyen.
   - Exemple : spread 10 points, risque 90 points → environ **0,11R à retirer** de l'espérance.
3. **Comparez avec et sans confirmation.** Sur des prix aléatoires, la confirmation divise le nombre de trades par environ **10**. Sur vos données, vérifiez qu'elle améliore vraiment l'espérance.
4. **Test contraire.** Mettez *Sens = Achats (zones de demande)* sur PainX. Si les achats font aussi bien que les ventes, la stratégie n'a pas d'avantage propre.
5. **Seuils de décision.** Il faut **30 trades minimum** pour une première idée, et **100 ou plus** pour décider.

   | Espérance après spread | Décision |
   |---|---|
   | Supérieure à **+0,2R** sur 2 indices et 2 périodes | Passer en **démo** pendant 1 mois |
   | Entre 0 et +0,2R | Avantage trop faible : ne pas trader en réel |
   | Négative | Ne pas trader ce setup |

6. **Journal.** Reportez les trades réels ou de démo dans le journal ([`../journal/Journal_Koss_Smart_Pro.xlsx`](../journal/Journal_Koss_Smart_Pro.xlsx)), avec « Escalier d'offre » dans la colonne *Leçon / remarque*.

## 8. Limites connues

1. **Retard des creux et sommets.** Un creux n'est validé qu'après 3 bougies. La zone apparaît donc après la chute, jamais avant. Rien n'est redessiné ensuite.
2. **Statistiques prudentes mais simplifiées.**
   - Si le stop et un objectif sont touchés **dans la même bougie**, le stop compte.
   - Le spread et le glissement ne sont **pas** comptés.
3. **Un seul trade virtuel à la fois.** Une zone touchée pendant un trade est ignorée.
4. **Seule la dernière zone** peut donner un signal (c'est votre règle). Les anciennes zones sont affichées comme repères.
5. **TradingView limite l'historique** : les statistiques ne couvrent que les bougies chargées (environ 5 000 à 20 000 selon l'abonnement).
6. **Les deux plateformes peuvent différer légèrement** : prix du courtier, heure du serveur, historique disponible.
7. **Indices générés par un algorithme** : un bon résultat passé ne garantit rien. Seul un test sur beaucoup de trades a de la valeur.

## 9. Problèmes fréquents

| Problème | Solution |
|---|---|
| TradingView : erreur sur une 2ᵉ ligne `indicator(...)` | Le modèle de TradingView n'a pas été effacé (partie 3, étape 2) |
| Aucune zone | Baissez le *mouvement impulsif minimal* (1,2) ou vérifiez le *Sens* dans le panneau |
| Zones mais jamais de signal | Normal si l'escalier a moins de 2 marches ; sinon, regardez la ligne *État* (« cible à moins de 2R », « pas de confirmation »…) |
| Très peu de signaux | Essayez *Confirmation = Non*, ou *Marches minimales = 1*, et comparez les statistiques |
| MT5 : l'indicateur n'apparaît pas | Il doit être dans **Indicators** (pas Experts), compilé sans erreur |
| MT5 : lot affiché = 0,00 | Le risque en $ est trop petit pour le lot minimal du courtier : augmentez le risque % ou le capital |
