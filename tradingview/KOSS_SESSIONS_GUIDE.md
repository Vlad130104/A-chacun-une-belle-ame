# Koss Sessions : fiche pédagogique

Indicateur TradingView (Pine Script v6) : [`koss_sessions.pine`](./koss_sessions.pine).
Il délimite automatiquement les sessions **Sydney, Tokyo, Londres et New York**, trace leur **plus haut** et leur **plus bas exacts**, et ajoute le **plus haut / plus bas de la veille** (PDH / PDL).

> Le code n'a pas pu être compilé ici (pas d'accès à TradingView). En cas d'erreur, copiez le message exact avec le numéro de ligne.

## 1. Installation

1. TradingView → **Éditeur Pine** → nouveau script → **tout sélectionner (Ctrl + A) et effacer** le modèle proposé par TradingView (`indicator("Mon script")`, `plot(close)`…), puis coller `koss_sessions.pine`. Le script doit commencer par `//@version=6` et ne contenir **qu'un seul** `indicator(...)`.
2. **Enregistrer** → **Ajouter au graphique**.
3. Utiliser un timeframe **M1 à H1** (au-dessus, les sessions sont masquées : une bougie H4 couvre plusieurs sessions).

## 2. Ce que vous voyez

| Élément | Aspect | À quoi ça sert |
|---|---|---|
| Boîte de session | Rectangle très transparent, bord pointillé, couleur de la session | Voir d'un coup d'œil où commence et finit chaque session |
| Plus haut / plus bas | Ligne pleine de la couleur de la session, qui **part de la bougie exacte** du sommet / du creux | Niveau précis, sans tracé à la main |
| Prolongement | Les lignes de la dernière session continuent vers la droite jusqu'à la même session le lendemain | Voir si le prix revient chercher ces niveaux |
| Nom | « Londres », « Tokyo »… au-dessus de la boîte | Savoir quelle session on regarde |
| Prix | « Londres H 1.08452 » au bout des lignes | Lire la valeur exacte |
| PDH / PDL | Lignes grises en tirets | Plus haut / plus bas de la veille |
| Légende | Coin bas droit | Rappel des couleurs |

**Couleurs par défaut** : Sydney **violet**, Tokyo **rouge**, Londres **bleu**, New York **orange**, veille **gris**. La boîte, le plus haut, le plus bas et les étiquettes d'une session ont toujours **la même couleur**.

## 3. Pourquoi les niveaux sont exacts

- Le plus haut est le **plus haut des mèches** (`high`) de toutes les bougies de la session ; le plus bas, le **plus bas des mèches** (`low`). C'est le prix exact, pas une estimation.
- La ligne démarre **sur la bougie qui a fait le sommet** : plus de décalage visuel.
- Seule différence possible : si votre courtier et le flux TradingView n'ont pas exactement les mêmes prix (quelques points d'écart). Utilisez de préférence le flux de votre courtier dans TradingView.

## 4. Horaires (heure locale de chaque place)

Chaque session est calculée dans **le fuseau horaire de sa place**, donc les changements d'heure été / hiver sont gérés tout seuls.

| Session | Heure locale | Fuseau utilisé | À Douala en hiver (nov.–mars)* | À Douala en été (mars–nov.)* |
|---|---|---|---|---|
| Sydney | 07:00 – 16:00 | Australia/Sydney | 21:00 – 06:00 (veille) | 22:00 – 07:00 (veille) |
| Tokyo | 09:00 – 18:00 | Asia/Tokyo | 01:00 – 10:00 | 01:00 – 10:00 |
| Londres | 08:00 – 17:00 | Europe/London | 09:00 – 18:00 | 08:00 – 17:00 |
| New York | 08:00 – 17:00 | America/New_York | 14:00 – 23:00 | 13:00 – 22:00 |

\* Douala = UTC+1 toute l'année. Les colonnes « hiver / été » suivent l'hiver et l'été de l'hémisphère nord ; Sydney change d'heure à des dates différentes (avril et octobre), donc ses horaires à Douala peuvent varier d'une heure à ces périodes.

Vous pouvez modifier les heures de chaque session dans **1. Sessions**.

## 5. Paramètres

| Paramètre | Défaut | Rôle |
|---|---|---|
| Sessions (case + heures + couleur) | Les 4 activées | Activer / désactiver une session, changer ses heures ou sa couleur |
| Boîte de la session | Oui | Rectangle de la session |
| Transparence des boîtes | 92 | 80 à 100 (100 = invisible) |
| Lignes plus haut / plus bas | Oui | Les niveaux H / B |
| Prolonger H / B | Oui | Garde les niveaux de la dernière session visibles vers la droite |
| Épaisseur des lignes | 1 | 1 à 3 |
| Nom / Prix | Oui / Oui | Étiquettes |
| Nombre de sessions gardées | 3 | Par place : au-delà, les plus anciennes sont effacées (graphique propre) |
| Afficher jusqu'au timeframe | H1 | Au-dessus, sessions masquées |
| Légende | Oui | Rappel des couleurs |
| PDH / PDL | Oui | Plus haut / plus bas de la veille |

## 6. Alertes

Clic droit → *Ajouter une alerte* → Condition « Koss Sessions » :
- **Cassure d'un plus haut** / **d'un plus bas** : clôture au-delà du H / B d'une session **terminée** ;
- **Cassure PDH** / **PDL**.

Choisir « Une fois par clôture de barre ».

## 7. Comment l'utiliser (routine simple)

1. Le matin, regardez le **plus haut / plus bas de Tokyo** (session asiatique) et de la **veille**.
2. Pendant **Londres**, notez si le prix va chercher l'un de ces niveaux (souvent le cas : ce sont des zones où beaucoup de stops sont placés).
3. Pendant **New York**, surveillez les niveaux de Londres et de la veille.
4. Avec **Koss Smart** : un setup OB + FVG + OTE qui se forme juste après la prise d'un de ces niveaux est plus intéressant qu'un setup au milieu de nulle part.

**À savoir** : ces niveaux sont souvent touchés, mais « souvent touché » ne veut pas dire « le prix va rebondir ». Le prix peut les traverser. Ce sont des repères, pas des signaux d'entrée.

## 8. Limites

1. **Timeframes** : prévu pour M1 à H1.
2. **Weekend / jours fériés** : pas de bougies, donc pas de session dessinée.
3. **Sydney** commence le dimanche soir (heure de Douala) : la première session de la semaine peut être incomplète si votre courtier ouvre plus tard.
4. **PDH / PDL** : « la veille » suit la bougie journalière du symbole (pour le forex, elle se termine généralement à 17:00 heure de New York).
5. **Indices synthétiques** : ils n'ont pas de vraies sessions ; l'indicateur dessinera des boîtes, mais elles n'ont aucune signification sur ces marchés.
