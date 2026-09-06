# Plan d'exécution d'un dalot cadre — générateur DXF pour AutoCAD

Ce dossier produit un **plan d'exécution de dalot cadre fermé en béton armé**,
au format **DXF R12**, directement ouvrable dans AutoCAD (toutes versions, y
compris LT), BricsCAD, DraftSight, ZWCAD, LibreCAD ou QCAD.

Tout est paramétrique : la géométrie, les cotes, les quantités, la nomenclature
des aciers et la note de calcul découlent d'un seul fichier de paramètres.

---

## 1. Ce que vous obtenez

```
sorties/DAL-01_coffrage.dxf      Planche A1 — vue en plan, coupes A-A et B-B,
                                 quantités, hypothèses, notes générales, cartouche
sorties/DAL-02_ferraillage.dxf   Planche A1 — coupe ferraillée du cadre, plan de
                                 ferraillage de la traverse, mur en aile, détail
                                 gousset, nomenclature des aciers, cartouche
sorties/DAL-00_modele_1-1.dxf    Toutes les vues en mètres réels, à l'échelle 1:1
NOTE_DE_CALCUL.md                Note de pré-dimensionnement (générée, pas rédigée)
apercu/                          Rendus PNG des deux planches, pour relecture rapide
```

Ouvrage par défaut : **dalot cadre fermé 1 × (2,00 × 1,50), longueur 9,00 m**,
sous 0,60 m de couverture, murs en aile évasés à 30°, béton C25/30, acier FeE500.

## 2. Ouvrir et tracer dans AutoCAD

**Les deux planches sont dessinées en millimètres papier, à l'échelle finale.**

1. `OUVRIR` → sélectionner `DAL-01_coffrage.dxf`.
2. `ZE` (Zoom Étendu) — le format A1 (841 × 594 mm) apparaît entièrement.
3. `UNITES` : longueurs décimales, précision 0.000, unité d'insertion
   **millimètres** (`INSUNITS = 4`).
4. `TRACER` : format **A1**, échelle **1:1**, fenêtre = le cadre extérieur,
   « centrer le tracé ». Rien d'autre à régler.

Pour un tracé A3, imprimer à **50 %** (échelle 1:2) : les textes descendent à
1,1 mm, lisibles mais justes — préférer l'A1 pour le chantier.

### Épaisseurs de trait

Le DXF R12 ne porte pas les épaisseurs de plume : elles sont attachées aux
**couleurs**, comme sur un plan classique. Régler le style de tracé
(`.ctb`) selon ce tableau, ou laisser AutoCAD tracer en monochrome 0,25 mm.

| Calque | Couleur | Contenu | Plume conseillée |
|---|---|---|---|
| `00_CARTOUCHE` | 7 blanc/noir | Cadre de planche et cartouche | 0,35 mm |
| `01_AXES` | 1 rouge | Axes, traits de coupe | 0,13 mm |
| `02_BETON` | 7 blanc/noir | Contours du béton vu en coupe | **0,50 mm** |
| `03_BETON_CACHE` | 8 gris | Arêtes cachées (tirets) | 0,18 mm |
| `04_HACHURES` | 9 gris clair | Hachures béton | 0,09 mm |
| `05_TERRAIN` | 3 vert | Terrain naturel | 0,25 mm |
| `06_REMBLAI` | 42 brun | Remblai, talus | 0,18 mm |
| `07_CHAUSSEE` | 8 gris | Corps de chaussée, équipements | 0,25 mm |
| `08_ACIER_LONG` | 1 rouge | Aciers vus en vraie grandeur | **0,50 mm** |
| `09_ACIER_COUPE` | 2 jaune | Aciers vus en coupe (points) | 0,35 mm |
| `10_COTATION` | 4 cyan | Cotation, cotes de niveau | 0,13 mm |
| `11_TEXTE` | 7 blanc/noir | Titres, repères, renvois | 0,25 mm |
| `12_TABLEAU` | 7 blanc/noir | Tableaux | 0,25 mm |
| `13_EAU` | 5 bleu | Ligne d'eau, sens d'écoulement | 0,25 mm |
| `14_ENROCHEMENT` | 8 gris | Enrochements, drainage | 0,18 mm |
| `15_VU_ARRIERE` | 8 gris | Éléments vus derrière le plan de coupe | 0,25 mm |
| `16_BETON_FIN` | 8 gris | Béton en trait fin sur les plans d'armature | 0,13 mm |

### Le fichier modèle 1:1

`DAL-00_modele_1-1.dxf` contient les mêmes vues **en mètres réels**. C'est le
fichier à utiliser pour **mesurer** (`DISTANCE`, `AIRE`), pour caler l'ouvrage
sur un fond de plan topographique, ou pour repartir de la géométrie. Régler
`INSUNITS = 6` (mètres) à l'insertion.

### Style de texte

Les textes utilisent le style `STANDARD` avec la police `txt.shx`, présente sur
toutes les installations. Pour un rendu plus soigné : `STYLE` → `STANDARD` →
police `romans.shx` ou `isocp.shx`, facteur de largeur 0,85. Les textes sont
écrits **sans accents** (le DXF R12 dépend de la page de code du poste qui
l'ouvre ; s'en passer garantit un affichage identique partout).

## 3. Modifier l'ouvrage

Tout se règle dans `parametres.json` — puis on régénère :

```bash
python3 generer.py                 # relit parametres.json, réécrit les 3 DXF
python3 note_calcul.py > NOTE_DE_CALCUL.md
```

Aucune dépendance : Python 3.8+ suffit, rien à installer.

Exemples de modifications courantes :

| Besoin | Paramètre |
|---|---|
| Ouverture 3,00 × 2,00 | `ouverture_largeur`, `ouverture_hauteur` |
| Route plus large | `longueur_ouvrage`, `largeur_chaussee`, `largeur_accotement` |
| Remblai plus épais | `couverture_min` (la cote de chaussée se recale seule) |
| Sol médiocre | `contrainte_sol_adm`, puis vérifier la note de calcul |
| Débit connu | `debit_projet` — la note compare alors capacité et besoin |
| Espacement des aciers | `espacement_cadre`, `diam_cadre`, `espacement_repartition` |

Les cotes, les quantités, la nomenclature et la note de calcul suivent
automatiquement. `parametres.py` contient la liste complète des paramètres et
leurs valeurs par défaut.

## 4. Relire sans AutoCAD

```bash
python3 apercu.py sorties/DAL-01_coffrage.dxf /tmp/planche1.png 2400
python3 apercu.py sorties/DAL-01_coffrage.dxf /tmp/zoom.png 1800 --zone 20 80 370 560
```

`apercu.py` relit le DXF produit et le rasterise en PNG (stdlib seule). Le rendu
est sommaire — police vectorielle simplifiée, pas de remplissage — mais il
suffit à contrôler l'implantation des vues, les chevauchements et la cotation.

## 5. Ce que ce plan n'est pas

**Un plan type, pas un plan d'exécution signé.** Un avertissement encadré le
rappelle sur chaque planche. Trois données de projet manquent et conditionnent
tout le dimensionnement :

1. **Le débit de projet.** L'ouverture 2,00 × 1,50 est une hypothèse de départ.
   La capacité calculée est de 11,2 m³/s à 80 % de remplissage — encore faut-il
   la comparer au débit centennal du bassin versant.
2. **La portance du sol** (0,15 MPa supposée). À confirmer par reconnaissance.
3. **Le levé topographique** : cotes de fil d'eau, profil en travers réel,
   biais éventuel de l'ouvrage par rapport à la route.

Deux points de vigilance ressortent de la note de calcul :

- **Vitesse d'écoulement de 4,67 m/s** avec une pente de radier de 1 %. C'est
  érosif. Soit on réduit la pente (à 0,5 %, la vitesse tombe à 3,3 m/s), soit on
  renforce la protection aval au-delà des 1,50 m d'enrochement prévus.
- **Glissement du mur en aile : coefficient 1,52** pour un seuil de 1,50. La
  marge est nulle. Si l'étude géotechnique donne un frottement d'interface
  inférieur à `tan φ`, il faut une bêche sous semelle ou un talon plus large.

Doivent encore être traités par le bureau d'études : phasage de construction
(remblaiement dissymétrique), tassements différentiels, charges militaires si
l'itinéraire les impose, dispositif de retenue selon la classe de trafic.

## 6. Organisation du code

| Fichier | Rôle |
|---|---|
| `dxf.py` | Écriture DXF R12 (LINE, POLYLINE, CIRCLE, ARC, SOLID, TEXT) |
| `dessin.py` | Vues en mètres réels, hachures, cotation, renvois, calques |
| `parametres.py` | Paramètres, géométrie dérivée, quantités, nomenclature |
| `vues.py` | Construction des 7 vues (plan, coupes, ferraillage, détails) |
| `planches.py` | Cadre, cartouche, tableaux, notes, composition des planches |
| `generer.py` | Point d'entrée : écrit les 3 fichiers DXF |
| `note_calcul.py` | Note de pré-dimensionnement, calculée à l'exécution |
| `apercu.py` | Relecture : DXF → PNG, sans dépendance |

Principe de la mise à l'échelle : chaque vue est construite **en mètres réels**,
et les tailles d'annotation sont exprimées **en millimètres papier** via
`Vue.mm()`. La composition applique ensuite une homothétie — `1000/échelle` pour
la planche, `1` pour le modèle. Un même code produit donc les deux livrables,
toujours cohérents entre eux.
