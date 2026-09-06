# Note de calcul de pre-dimensionnement

**Ouvrage :** DALOT CADRE FERME 1 x (2.00 x 1.50)  
**Projet :** AMENAGEMENT ROUTIER - FRANCHISSEMENT HYDRAULIQUE  
**Localisation :** PK 0+000 - A COMPLETER  
**Date :** 06/09/2026 — **Indice :** A

> Document **genere** par `note_calcul.py` a partir de `parametres.py`. Il accompagne les planches `DAL-01` et `DAL-02`. Il s'agit d'un **pre-dimensionnement** : il ne remplace pas une note d'execution signee, qui suppose un leve topographique, une etude hydrologique du bassin versant et une etude geotechnique.

## 1. Donnees et hypotheses

| Grandeur | Valeur |
|---|---|
| Ouverture | 2.00 m x 1.50 m |
| Epaisseurs traverse / piedroit / radier | 0.25 / 0.25 / 0.30 m |
| Goussets | 0.20 x 0.20 m a 45 deg |
| Longueur de l'ouvrage (axe hydraulique) | 9.00 m |
| Largeur de plateforme | 9.00 m (chaussee 7.00 + 2 x 1.00) |
| Couverture de remblai mini | 0.60 m |
| Pente du radier | 1.0 % |
| Beton | C25/30, fc28 = 25 MPa, ft28 = 2.10 MPa |
| Acier | FeE500 (HA), fe = 500 MPa |
| Enrobage | 4 cm (5 cm au contact du sol) |
| Remblai | gamma = 20 kN/m3, phi = 30 deg |
| Contrainte de sol admissible | 0.15 MPa (**hypothese a confirmer**) |
| Reglement | BAEL 91 rev. 99 ; charges routieres fascicule 61 titre II |

Cote de reference : fil d'eau amont = 0.00. Cote de l'axe de chaussee deduite de la couverture minimale : **+2.462**. Couverture reelle : 0.60 m a l'amont, 0.76 m a l'axe, 0.69 m a l'aval.

## 2. Verification hydraulique

Ecoulement uniforme, formule de Manning-Strickler `Q = K x S x Rh^(2/3) x I^(1/2)`, remplissage limite a 80 % de la hauteur libre (revanche 0.30 m).

| Grandeur | Valeur |
|---|---|
| Tirant d'eau retenu | 1.20 m |
| Section mouillee S | 2.40 m2 |
| Perimetre mouille | 4.40 m |
| Rayon hydraulique Rh | 0.545 m |
| Coefficient de Strickler K | 70 (beton lisse) |
| Pente I | 1.0 % |
| **Debit capable Q** | **11.22 m3/s** |
| Vitesse moyenne V | 4.67 m/s |

> **Le debit de projet n'est pas renseigne.** L'ouverture retenue n'est donc pas justifiee : renseigner `debit_projet` dans `parametres.json` a partir de l'etude de bassin versant (methode rationnelle, ORSTOM/CIEH ou Caquot selon le contexte) avant toute execution.

> **Point de vigilance — vitesse de 4.67 m/s.** Au-dela de 4 m/s, l'affouillement aval est a craindre. Deux leviers : reduire la pente du radier (a 0.5 %, la vitesse tombe a 3.30 m/s) ou renforcer la protection aval (enrochement sur 3.00 m, bassin de dissipation). La protection prevue au plan (1.50 m d'enrochement de 0.40 m + beche de 0.60 m) est un minimum a valider.

## 3. Descente de charges sur la traverse

| Charge | Detail | Valeur |
|---|---|---|
| Poids propre traverse | 0.25 m x 25 kN/m3 | 6.25 kN/m2 |
| Remblai + corps de chaussee | 0.60 m x 21 kN/m3 | 12.60 kN/m2 |
| **Charges permanentes G** | | **18.85 kN/m2** |
| Roue Bt 8 t, impact 0.60 x 0.30 | diffusion a 45 deg sur 0.60 m -> 1.80 x 1.50 m | 29.63 kN/m2 |
| Majoration dynamique | x 1.15 | 34.07 kN/m2 |
| **Charge d'exploitation Q** | | **34.07 kN/m2** |

- ELU : `p_u = 1.35 G + 1.6 Q =` **80.0 kN/m2**
- ELS : `p_ser = G + Q =` **52.9 kN/m2**

## 4. Sollicitations dans la traverse

Portee de calcul (entraxe des piedroits) : `L = 2.00 + 0.25 = 2.25 m`.

Le cadre ferme est traite par les bornes enveloppes usuelles d'un portique a noeuds rigides : moment d'encastrement `pL2/12` sur appuis, `pL2/14` en travee (valeur majorante par rapport au `pL2/24` de la poutre bi-encastree, qui couvre la redistribution due a la souplesse des piedroits).

| Sollicitation | ELU | ELS |
|---|---|---|
| Moment sur appui (angles) | 33.7 kN.m/ml | 22.3 kN.m/ml |
| Moment en travee | 28.9 kN.m/ml | 19.1 kN.m/ml |
| Effort tranchant sur appui | 90.0 kN/ml | — |

## 5. Armatures de la traverse

Hauteur utile `d = 0.25 - 0.04 - 0.006 = 0.204 m`. `fbu = 14.17 MPa`, `fsu = 435 MPa`.

**ELU** — `mu = 0.0572` (< 0.371, pas d'acier comprime), `alpha = 0.0737`, `z = 0.1980 m` -> **As = 3.92 cm2/ml**.

**ELS, fissuration prejudiciable** — `sigma_s_lim = min(2/3 fe ; 110 x sqrt(1.6 ft28)) = 202 MPa`. Position de l'axe neutre `y = 0.0520 m`, bras de levier `z = 0.1867 m` -> **As = 5.93 cm2/ml**.

**Section minimale de non-fragilite** — `0.23 b d ft28 / fe = 1.97 cm2/ml`.

| Critere | As requis |
|---|---|
| ELU | 3.92 cm2/ml |
| ELS (fissuration prejudiciable) | **5.93 cm2/ml — dimensionnant** |
| Non-fragilite | 1.97 cm2/ml |

**Choix : HA12 espaces de 15 cm, soit 7.54 cm2/ml** (contrainte acier a l'ELS ramenee a 160 MPa < 202 MPa). C'est bien l'ELS qui commande : a l'ELU seul, un HA12 e=20 aurait suffi.

**Effort tranchant** — `tau_u = V / (b d) = 0.441 MPa` contre une limite de `0.07 fc28 / 1.5 = 1.17 MPa` : pas besoin d'armatures d'effort tranchant.

## 6. Radier et contrainte sur le sol

| Charge ramenee au ml d'ouvrage | Valeur |
|---|---|
| Traverse | 15.6 kN/ml |
| Piedroits | 18.8 kN/ml |
| Radier | 18.8 kN/ml |
| Remblai + chaussee | 31.5 kN/ml |
| **Total permanent G** | **84.6 kN/ml** |
| Exploitation Q | 85.2 kN/ml |

Largeur d'assise = 2.50 m.  
- Contrainte ELS sur le sol : **68 kPa = 0.068 MPa** contre 0.15 MPa admissible -> **verifie**.  
- Contrainte ELU : 100 kPa.

Reaction nette sur le radier (deduction faite de son poids propre) : 60.4 kPa a l'ELS. Moment sur appui `pL2/12 = 25.5 kN.m/ml`, hauteur utile `d = 0.244 m` -> **As = 5.61 cm2/ml** a l'ELS. Le HA12 e=15 retenu (7.54 cm2/ml) couvre ce besoin.

## 7. Piedroits

Poussee des terres au repos d'un etat actif de Rankine : `Ka = (1 - sin phi) / (1 + sin phi) = 0.333`, surcharge d'exploitation en tete 10 kPa.

- Poussee en tete de piedroit : 3.3 kPa
- Poussee en pied de piedroit : 19.0 kPa
- Resultante : 19.5 kN/ml, moment de flexion de l'ordre de 2.8 kN.m/ml

Ce moment reste tres inferieur a celui de la traverse (22.3 kN.m/ml a l'ELS) : le HA12 e=15 sur les deux faces, continu depuis le radier jusqu'a la traverse, est largement suffisant. L'effort normal (85 kN/ml sur 0.25 m2, soit 0.34 MPa) est negligeable devant la resistance du beton.

## 8. Stabilite du mur en aile

Mur le plus haut (au nu de l'ouvrage) : voile de 2.95 m, semelle de 2.00 m x 0.35 m (patin 0.40, talon 1.20), hauteur totale 3.30 m.

| Terme | Valeur |
|---|---|
| Poussee des terres + surcharge | 47.3 kN/ml |
| Bras de levier de la poussee | 1.23 m |
| Moment renversant | 58.1 kN.m/ml |
| Poids du voile | 24.0 kN/ml |
| Poids de la semelle | 17.5 kN/ml |
| Terre sur talon (+ surcharge) | 82.8 kN/ml |
| **Resultante verticale N** | **124.3 kN/ml** |
| Moment stabilisant | 147.8 kN.m/ml |

| Verification | Valeur | Seuil | Resultat |
|---|---|---|---|
| Renversement | 2.54 | 1.50 | OK |
| Glissement (tan phi, sans beche) | 1.52 | 1.50 | OK |
| Excentrement e | 0.278 m | B/6 = 0.333 m | OK, resultante dans le tiers central |
| Contrainte max sur le sol | 114 kPa | 150 kPa | OK |

Le glissement est le critere le plus tendu : il suppose un frottement sol/beton egal a `tan phi`. Si l'etude geotechnique donne un angle de frottement d'interface plus faible, ajouter une beche sous la semelle ou elargir le talon.

## 9. Quantites et ratios

| Poste | U | Quantite |
|---|---|---|
| Deblais en terrain ordinaire (fouilles) | m3 | 86.16 |
| Beton de proprete dose a 150 kg/m3 | m3 | 2.43 |
| Beton arme C25/30 - cadre | m3 | 19.84 |
| Beton arme C25/30 - murs de tete | m3 | 0.81 |
| Beton arme C25/30 - murs en aile et semelles | m3 | 15.32 |
| Beton arme C25/30 - beches amont / aval | m3 | 0.97 |
| TOTAL beton arme | m3 | 36.95 |
| Coffrage ordinaire et soigne | m2 | 160.78 |
| Aciers HA FeE500 (HA) | kg | 2455.70 |
| Remblai contigu compacte a 95 % OPM | m3 | 38.33 |
| Perre / enrochement de protection | m3 | 6.60 |

Ratio d'armature : **66 kg/m3** de beton arme. C'est coherent avec l'ordre de grandeur habituel des dalots cadres (60 a 90 kg/m3). Prevoir +5 % pour chutes et ligatures.

## 10. Limites de la presente note

1. **Le debit de projet n'est pas etabli ici.** L'ouverture 2.00 x 1.50 est une hypothese de depart ; elle doit etre confrontee au debit centennal du bassin versant.
2. **La portance du sol est une hypothese** (0.15 MPa). Un essai pressiometrique ou une reconnaissance a la pelle est indispensable avant execution.
3. Le modele de portique est simplifie (bornes enveloppes). Un calcul de portique complet ou un modele aux elements finis peut reduire les sections d'acier, surtout en travee.
4. Les tassements differentiels, la verification en phase de construction (remblai dissymetrique) et la sensibilite au biais ne sont pas traites.
5. Les charges militaires (Mc80/Mc120) et exceptionnelles ne sont pas considerees ; les introduire si l'itineraire les impose.
6. Aucun calcul sismique n'est mene.


