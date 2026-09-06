"""Couche de dessin : vues en coordonnees reelles (metres), hachures,
cotation et composition sur planche.

Principe : chaque vue est construite en metres reels, a l'echelle 1:1.
Les tailles d'annotation (texte, hachures, fleches) sont exprimees en
MILLIMETRES PAPIER via Vue.mm() et converties selon l'echelle de la vue.
La composition applique ensuite une homothetie :
  - fichier planche : facteur 1000/echelle  -> les mm papier redeviennent des mm ;
  - fichier modele  : facteur 1             -> la geometrie reste en metres reels.
Un meme code produit donc les deux livrables, toujours coherents.
"""

from __future__ import annotations

import math

from dxf import Dxf

# --------------------------------------------------------------- les calques
# (nom, couleur AutoCAD, type de ligne, epaisseur de trace conseillee en mm)
CALQUES = [
    ("00_CARTOUCHE", 7, "CONTINUOUS", 0.35),
    ("01_AXES", 1, "AXE", 0.13),
    ("02_BETON", 7, "CONTINUOUS", 0.50),
    ("03_BETON_CACHE", 8, "TIRETS", 0.18),
    ("04_HACHURES", 9, "CONTINUOUS", 0.09),
    ("05_TERRAIN", 3, "CONTINUOUS", 0.25),
    ("06_REMBLAI", 42, "CONTINUOUS", 0.18),
    ("07_CHAUSSEE", 8, "CONTINUOUS", 0.25),
    ("08_ACIER_LONG", 1, "CONTINUOUS", 0.50),
    ("09_ACIER_COUPE", 2, "CONTINUOUS", 0.35),
    ("10_COTATION", 4, "CONTINUOUS", 0.13),
    ("11_TEXTE", 7, "CONTINUOUS", 0.25),
    ("12_TABLEAU", 7, "CONTINUOUS", 0.25),
    ("13_EAU", 5, "CONTINUOUS", 0.25),
    ("14_ENROCHEMENT", 8, "CONTINUOUS", 0.18),
    ("15_VU_ARRIERE", 8, "CONTINUOUS", 0.25),
    ("16_BETON_FIN", 8, "CONTINUOUS", 0.13),
]

# Hauteurs de texte, en millimetres papier.
H_TITRE = 5.0
H_SOUS_TITRE = 2.5
H_COTE = 2.0
H_NOTE = 2.2
H_REPERE = 2.5


# ------------------------------------------------------------------ geometrie


def hachures(contours, angle_deg: float, espacement: float, marge: float = 0.0):
    """Genere les segments de hachure d'une surface definie par un ou
    plusieurs contours fermes (regle pair/impair : le 2e contour perce le 1er).

    Retourne une liste de couples de points, en coordonnees d'entree.
    """
    angle = math.radians(angle_deg)
    cos_a, sin_a = math.cos(-angle), math.sin(-angle)

    def tourne(point):
        return (point[0] * cos_a - point[1] * sin_a, point[0] * sin_a + point[1] * cos_a)

    def detourne(point):
        return (point[0] * cos_a + point[1] * sin_a, -point[0] * sin_a + point[1] * cos_a)

    aretes = []
    for contour in contours:
        points = [tourne(p) for p in contour]
        for indice in range(len(points)):
            aretes.append((points[indice], points[(indice + 1) % len(points)]))

    if not aretes:
        return []
    ordonnees = [p[1] for arete in aretes for p in arete]
    y_min, y_max = min(ordonnees) + marge, max(ordonnees) - marge

    segments = []
    nombre = int((y_max - y_min) / espacement) + 1
    for indice in range(nombre + 1):
        y = y_min + espacement * (indice + 0.5)
        if y >= y_max:
            break
        intersections = []
        for (xa, ya), (xb, yb) in aretes:
            if (ya <= y < yb) or (yb <= y < ya):
                if yb == ya:
                    continue
                intersections.append(xa + (y - ya) * (xb - xa) / (yb - ya))
        intersections.sort()
        for debut in range(0, len(intersections) - 1, 2):
            x1, x2 = intersections[debut], intersections[debut + 1]
            if x2 - x1 > 1e-9:
                segments.append((detourne((x1, y)), detourne((x2, y))))
    return segments


def offset_polygone(points, distance: float):
    """Decale un polygone ferme de `distance`, a DROITE du sens de parcours,
    avec raccords en onglet. Sert a placer un lit d'armature a l'enrobage.
    """
    nombre = len(points)
    droites = []
    for indice in range(nombre):
        (xa, ya) = points[indice]
        (xb, yb) = points[(indice + 1) % nombre]
        dx, dy = xb - xa, yb - ya
        longueur = math.hypot(dx, dy) or 1.0
        nx, ny = dy / longueur, -dx / longueur          # normale a droite
        droites.append(((xa + nx * distance, ya + ny * distance), (dx, dy)))

    resultat = []
    for indice in range(nombre):
        (p1, d1) = droites[(indice - 1) % nombre]
        (p2, d2) = droites[indice]
        denominateur = d1[0] * d2[1] - d1[1] * d2[0]
        if abs(denominateur) < 1e-12:                    # segments colineaires
            resultat.append(p2)
            continue
        t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / denominateur
        resultat.append((p1[0] + d1[0] * t, p1[1] + d1[1] * t))
    return resultat


def semer_points(points, espacement: float, depart: float = 0.0):
    """Repartit des points le long d'une polyligne, tous les `espacement`."""
    resultat = []
    reste = depart
    for indice in range(len(points) - 1):
        (xa, ya), (xb, yb) = points[indice], points[indice + 1]
        longueur = math.hypot(xb - xa, yb - ya)
        position = reste
        while position <= longueur + 1e-9:
            t = position / longueur if longueur else 0.0
            resultat.append((xa + (xb - xa) * t, ya + (yb - ya) * t))
            position += espacement
        reste = position - longueur
    return resultat


def decale_polyligne(points, distance: float):
    """Decalage grossier d'une polyligne ouverte, suffisant pour tracer un
    lit d'armature parallele a un parement."""
    resultat = []
    for indice, point in enumerate(points):
        if indice == 0:
            precedent, suivant = points[0], points[1]
        elif indice == len(points) - 1:
            precedent, suivant = points[-2], points[-1]
        else:
            precedent, suivant = points[indice - 1], points[indice + 1]
        dx, dy = suivant[0] - precedent[0], suivant[1] - precedent[1]
        longueur = math.hypot(dx, dy) or 1.0
        resultat.append((point[0] - dy / longueur * distance, point[1] + dx / longueur * distance))
    return resultat


# ------------------------------------------------------------------- la vue


class Vue:
    """Un dessin en metres reels, destine a etre trace a `echelle`."""

    def __init__(self, nom: str, echelle: int, titre: str = "", sous_titre: str = "") -> None:
        self.nom = nom
        self.echelle = echelle
        self.titre = titre
        self.sous_titre = sous_titre
        self.primitives: list[dict] = []

    # -- conversion --------------------------------------------------------

    def mm(self, millimetres_papier: float) -> float:
        """Convertit une taille papier (mm) en unites du dessin (m)."""
        return millimetres_papier * self.echelle / 1000.0

    # -- primitives --------------------------------------------------------

    def ligne(self, p1, p2, calque="02_BETON", ltype=None):
        self.primitives.append({"t": "ligne", "pts": [tuple(p1), tuple(p2)], "c": calque, "lt": ltype})

    def lignes(self, segments, calque="04_HACHURES", ltype=None):
        for p1, p2 in segments:
            self.ligne(p1, p2, calque, ltype)

    def poly(self, points, calque="02_BETON", ferme=False, ltype=None):
        self.primitives.append({"t": "poly", "pts": [tuple(p) for p in points],
                                "c": calque, "f": ferme, "lt": ltype})

    def cercle(self, centre, rayon, calque="02_BETON", ltype=None):
        self.primitives.append({"t": "cercle", "pts": [tuple(centre)], "r": rayon, "c": calque, "lt": ltype})

    def arc(self, centre, rayon, a0, a1, calque="02_BETON", ltype=None):
        self.primitives.append({"t": "arc", "pts": [tuple(centre)], "r": rayon,
                                "a0": a0, "a1": a1, "c": calque, "lt": ltype})

    def solide(self, p1, p2, p3, p4=None, calque="10_COTATION"):
        points = [tuple(p1), tuple(p2), tuple(p3), tuple(p4 if p4 is not None else p3)]
        self.primitives.append({"t": "solide", "pts": points, "c": calque})

    def texte(self, position, contenu, hauteur_mm, calque="11_TEXTE", rotation=0.0,
              ah=0, av=0):
        self.primitives.append({"t": "texte", "pts": [tuple(position)], "txt": contenu,
                                "h": self.mm(hauteur_mm), "c": calque, "rot": rotation,
                                "ah": ah, "av": av})

    # -- helpers de dessin -------------------------------------------------

    def rectangle(self, x1, y1, x2, y2, calque="02_BETON", ltype=None):
        self.poly([(x1, y1), (x2, y1), (x2, y2), (x1, y2)], calque, ferme=True, ltype=ltype)

    def hachurer(self, contours, angle=45.0, espacement_mm=2.0, calque="04_HACHURES"):
        self.lignes(hachures(contours, angle, self.mm(espacement_mm)), calque)

    def hachure_beton(self, contours):
        """Hachure fine a 45 deg, convention beton en coupe."""
        self.hachurer(contours, 45.0, 2.2)

    def symbole_terrain(self, points, hauteur_mm=1.6, pas_mm=4.0):
        """Trait de terrain naturel avec petites hachures obliques dessous."""
        self.poly(points, "05_TERRAIN")
        hauteur, pas = self.mm(hauteur_mm), self.mm(pas_mm)
        for indice in range(len(points) - 1):
            (x1, y1), (x2, y2) = points[indice], points[indice + 1]
            longueur = math.hypot(x2 - x1, y2 - y1)
            nombre = max(int(longueur / pas), 1)
            for k in range(nombre):
                t = (k + 0.5) / nombre
                x, y = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
                self.ligne((x, y), (x - hauteur, y - hauteur), "05_TERRAIN")

    def symbole_remblai(self, contours):
        self.hachurer(contours, 45.0, 6.0, "06_REMBLAI")
        self.hachurer(contours, 135.0, 6.0, "06_REMBLAI")

    def enrochement(self, x1, x2, y_bas, epaisseur):
        """Bande d'enrochement : contour + semis de blocs figuratifs."""
        self.rectangle(x1, y_bas, x2, y_bas + epaisseur, "14_ENROCHEMENT")
        largeur = epaisseur * 0.60
        for rang in range(2):
            y = y_bas + epaisseur * (0.10 + 0.45 * rang)
            x = x1 + (largeur / 2.0 if rang else largeur * 0.15)
            while x + largeur < x2:
                self.poly([(x, y), (x + largeur * 0.35, y + epaisseur * 0.38),
                           (x + largeur * 0.75, y + epaisseur * 0.30), (x + largeur, y)],
                          "14_ENROCHEMENT", ferme=True)
                x += largeur * 1.15

    # -- axes --------------------------------------------------------------

    def axe_vertical(self, x, y1, y2, etiquette=None):
        depassement = self.mm(6.0)
        self.ligne((x, y1 - depassement), (x, y2 + depassement), "01_AXES")
        if etiquette:
            self.texte((x, y2 + depassement * 1.6), etiquette, H_SOUS_TITRE, "01_AXES", ah=1, av=1)

    def axe_horizontal(self, y, x1, x2, etiquette=None):
        depassement = self.mm(6.0)
        self.ligne((x1 - depassement, y), (x2 + depassement, y), "01_AXES")
        if etiquette:
            self.texte((x2 + depassement * 1.6, y), etiquette, H_SOUS_TITRE, "01_AXES", ah=0, av=2)

    # -- cotation ----------------------------------------------------------

    def _tiret_oblique(self, point, angle_deg=45.0, longueur_mm=2.5):
        demi = self.mm(longueur_mm) / 2.0
        angle = math.radians(angle_deg)
        dx, dy = demi * math.cos(angle), demi * math.sin(angle)
        self.ligne((point[0] - dx, point[1] - dy), (point[0] + dx, point[1] + dy), "10_COTATION")

    def _valeur(self, longueur, unite="m"):
        if unite == "cm":
            return f"{longueur * 100:.0f}"
        return f"{longueur:.2f}"

    def cote_h(self, x1, x2, y_ligne, y_attache=None, texte=None, au_dessus=True, unite="m"):
        """Cote horizontale entre x1 et x2, ligne de cote a l'ordonnee y_ligne."""
        if abs(x2 - x1) < 1e-9:
            return
        y_attache = y_ligne if y_attache is None else y_attache
        depassement = self.mm(1.5)
        sens = 1.0 if y_ligne > y_attache else -1.0
        for x in (x1, x2):
            self.ligne((x, y_attache + sens * self.mm(1.0)),
                       (x, y_ligne + sens * depassement), "10_COTATION")
        self.ligne((x1, y_ligne), (x2, y_ligne), "10_COTATION")
        self._tiret_oblique((x1, y_ligne))
        self._tiret_oblique((x2, y_ligne))
        contenu = texte if texte is not None else self._valeur(abs(x2 - x1), unite)
        decalage = self.mm(0.8)
        self.texte(((x1 + x2) / 2.0, y_ligne + (decalage if au_dessus else -decalage)),
                   contenu, H_COTE, "10_COTATION", ah=1, av=(1 if au_dessus else 3))

    def cote_v(self, y1, y2, x_ligne, x_attache=None, texte=None, a_gauche=True, unite="m"):
        """Cote verticale entre y1 et y2, ligne de cote a l'abscisse x_ligne."""
        if abs(y2 - y1) < 1e-9:
            return
        x_attache = x_ligne if x_attache is None else x_attache
        depassement = self.mm(1.5)
        sens = 1.0 if x_ligne > x_attache else -1.0
        for y in (y1, y2):
            self.ligne((x_attache + sens * self.mm(1.0), y),
                       (x_ligne + sens * depassement, y), "10_COTATION")
        self.ligne((x_ligne, y1), (x_ligne, y2), "10_COTATION")
        self._tiret_oblique((x_ligne, y1))
        self._tiret_oblique((x_ligne, y2))
        contenu = texte if texte is not None else self._valeur(abs(y2 - y1), unite)
        decalage = self.mm(0.8)
        self.texte((x_ligne + (-decalage if a_gauche else decalage), (y1 + y2) / 2.0),
                   contenu, H_COTE, "10_COTATION", rotation=90.0, ah=1,
                   av=(3 if a_gauche else 1))

    def cote_chaine_h(self, abscisses, y_ligne, y_attache=None, unite="m"):
        for indice in range(len(abscisses) - 1):
            self.cote_h(abscisses[indice], abscisses[indice + 1], y_ligne, y_attache, unite=unite)

    def cote_chaine_v(self, ordonnees, x_ligne, x_attache=None, unite="m"):
        for indice in range(len(ordonnees) - 1):
            self.cote_v(ordonnees[indice], ordonnees[indice + 1], x_ligne, x_attache, unite=unite)

    def niveau(self, point, contenu, a_gauche=False, longueur_mm=16.0):
        """Cote de niveau : triangle sur la ligne, valeur au-dessus."""
        x, y = point
        demi = self.mm(1.6)
        hauteur = self.mm(2.8)
        self.poly([(x - demi, y + hauteur), (x + demi, y + hauteur), (x, y)],
                  "10_COTATION", ferme=True)
        longueur = self.mm(longueur_mm)
        x_fin = x - longueur if a_gauche else x + longueur
        self.ligne((x, y + hauteur), (x_fin, y + hauteur), "10_COTATION")
        self.texte((x_fin, y + hauteur + self.mm(0.8)), contenu, H_COTE, "10_COTATION",
                   ah=(0 if a_gauche else 2), av=1)

    # -- annotations -------------------------------------------------------

    def fleche(self, pointe, origine, longueur_mm=2.5, largeur_mm=0.9):
        dx, dy = pointe[0] - origine[0], pointe[1] - origine[1]
        longueur_totale = math.hypot(dx, dy) or 1.0
        ux, uy = dx / longueur_totale, dy / longueur_totale
        longueur, demi_largeur = self.mm(longueur_mm), self.mm(largeur_mm) / 2.0
        base = (pointe[0] - ux * longueur, pointe[1] - uy * longueur)
        self.solide(pointe,
                    (base[0] - uy * demi_largeur, base[1] + ux * demi_largeur),
                    (base[0] + uy * demi_largeur, base[1] - ux * demi_largeur),
                    calque="11_TEXTE")

    def renvoi(self, cible, position_texte, contenu, hauteur_mm=H_REPERE, a_gauche=False,
               calque="11_TEXTE"):
        """Ligne de renvoi : fleche sur la cible, palier horizontal, texte."""
        palier = self.mm(4.0)
        x_palier = position_texte[0] - palier if not a_gauche else position_texte[0] + palier
        self.ligne(cible, (x_palier, position_texte[1]), calque)
        self.ligne((x_palier, position_texte[1]), position_texte, calque)
        self.fleche(cible, (x_palier, position_texte[1]))
        decalage = self.mm(1.0)
        self.texte((position_texte[0] + (decalage if not a_gauche else -decalage), position_texte[1]),
                   contenu, hauteur_mm, calque, ah=(0 if not a_gauche else 2), av=2)

    def repere_coupe(self, p1, p2, etiquette, cote=1.0):
        """Trace de coupe : deux traits epais, fleches et lettre."""
        longueur = self.mm(10.0)
        dx, dy = p2[0] - p1[0], p2[1] - p1[1]
        norme = math.hypot(dx, dy) or 1.0
        ux, uy = dx / norme, dy / norme
        nx, ny = -uy * cote, ux * cote
        self.ligne(p1, p2, "01_AXES")
        for point, sens in ((p1, -1.0), (p2, 1.0)):
            extremite = (point[0] + ux * sens * longueur * 0.0, point[1] + uy * sens * longueur * 0.0)
            fin = (extremite[0] + nx * longueur, extremite[1] + ny * longueur)
            self.ligne(extremite, fin, "01_AXES")
            self.fleche(fin, extremite)
            self.texte((fin[0] + nx * self.mm(4.0), fin[1] + ny * self.mm(4.0)),
                       etiquette, H_REPERE * 1.4, "11_TEXTE", ah=1, av=2)

    def titre_vue(self, x, y, largeur_soulignement=None):
        """Titre + echelle, ancres en (x, y) coin bas gauche du bloc titre."""
        self.texte((x, y), self.titre, H_TITRE, "11_TEXTE", ah=0, av=1)
        largeur = largeur_soulignement if largeur_soulignement is not None else self.mm(
            len(self.titre) * H_TITRE * 0.62)
        self.ligne((x, y - self.mm(1.6)), (x + largeur, y - self.mm(1.6)), "11_TEXTE")
        if self.sous_titre:
            self.texte((x, y - self.mm(4.6)), self.sous_titre, H_SOUS_TITRE, "11_TEXTE", ah=0, av=1)

    # -- emprise et emission ----------------------------------------------

    LARGEUR_CARACTERE = 0.62   # largeur moyenne d'un caractere, en fraction de sa hauteur

    def emprise(self):
        """Rectangle englobant, encombrement des textes compris."""
        abscisses, ordonnees = [], []
        for primitive in self.primitives:
            for point in primitive["pts"]:
                abscisses.append(point[0])
                ordonnees.append(point[1])
            if primitive["t"] in ("cercle", "arc"):
                centre = primitive["pts"][0]
                abscisses += [centre[0] - primitive["r"], centre[0] + primitive["r"]]
                ordonnees += [centre[1] - primitive["r"], centre[1] + primitive["r"]]
            elif primitive["t"] == "texte":
                x, y = primitive["pts"][0]
                hauteur = primitive["h"]
                largeur = len(primitive["txt"]) * hauteur * self.LARGEUR_CARACTERE
                debut = {0: 0.0, 1: -largeur / 2.0, 2: -largeur}[primitive["ah"]]
                bas = {0: 0.0, 1: 0.0, 2: -hauteur / 2.0, 3: -hauteur}[primitive["av"]]
                if abs(primitive["rot"] - 90.0) < 1e-6:
                    abscisses += [x + bas, x + bas + hauteur]
                    ordonnees += [y + debut, y + debut + largeur]
                else:
                    abscisses += [x + debut, x + debut + largeur]
                    ordonnees += [y + bas, y + bas + hauteur]
        if not abscisses:
            return (0.0, 0.0, 0.0, 0.0)
        return (min(abscisses), min(ordonnees), max(abscisses), max(ordonnees))

    def emettre(self, dxf: Dxf, facteur: float, dx: float, dy: float) -> None:
        def transforme(point):
            return (point[0] * facteur + dx, point[1] * facteur + dy)

        for primitive in self.primitives:
            type_primitive = primitive["t"]
            calque = primitive["c"]
            ltype = primitive.get("lt")
            if type_primitive == "ligne":
                dxf.ligne(transforme(primitive["pts"][0]), transforme(primitive["pts"][1]), calque, ltype)
            elif type_primitive == "poly":
                dxf.polyligne([transforme(p) for p in primitive["pts"]], calque, primitive["f"], ltype)
            elif type_primitive == "cercle":
                dxf.cercle(transforme(primitive["pts"][0]), primitive["r"] * facteur, calque, ltype)
            elif type_primitive == "arc":
                dxf.arc(transforme(primitive["pts"][0]), primitive["r"] * facteur,
                        primitive["a0"], primitive["a1"], calque, ltype)
            elif type_primitive == "solide":
                points = [transforme(p) for p in primitive["pts"]]
                dxf.solide(points[0], points[1], points[2], points[3], calque)
            elif type_primitive == "texte":
                dxf.texte(transforme(primitive["pts"][0]), primitive["txt"],
                          primitive["h"] * facteur, calque, primitive["rot"],
                          primitive["ah"], primitive["av"])
