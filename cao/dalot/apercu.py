#!/usr/bin/env python3
"""Apercu raster d'un DXF produit par ce dossier, sans aucune dependance.

    python3 apercu.py sorties/DAL-01_coffrage.dxf apercu.png [largeur_px]
    python3 apercu.py fichier.dxf sortie.png 2400 --zone x1 y1 x2 y2

Sert au controle du dessin (implantation des vues, chevauchements, lisibilite)
avant ouverture dans AutoCAD. Le rendu est volontairement sommaire : traits,
textes en police vectorielle simplifiee, remplissages ignores.
"""

from __future__ import annotations

import math
import struct
import sys
import zlib

# --------------------------------------------------------- police vectorielle

G = {
    "A": [[(0, 0), (2, 6), (4, 0)], [(1, 2), (3, 2)]],
    "B": [[(0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0, 3)],
          [(3, 3), (4, 2), (4, 1), (3, 0), (0, 0)]],
    "C": [[(4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0), (3, 0), (4, 1)]],
    "D": [[(0, 0), (0, 6), (3, 6), (4, 5), (4, 1), (3, 0), (0, 0)]],
    "E": [[(4, 6), (0, 6), (0, 0), (4, 0)], [(0, 3), (3, 3)]],
    "F": [[(4, 6), (0, 6), (0, 0)], [(0, 3), (3, 3)]],
    "G": [[(4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0), (3, 0), (4, 1), (4, 3), (2, 3)]],
    "H": [[(0, 0), (0, 6)], [(4, 0), (4, 6)], [(0, 3), (4, 3)]],
    "I": [[(1, 0), (3, 0)], [(2, 0), (2, 6)], [(1, 6), (3, 6)]],
    "J": [[(4, 6), (4, 1), (3, 0), (1, 0), (0, 1)]],
    "K": [[(0, 0), (0, 6)], [(4, 6), (0, 3), (4, 0)]],
    "L": [[(0, 6), (0, 0), (4, 0)]],
    "M": [[(0, 0), (0, 6), (2, 3), (4, 6), (4, 0)]],
    "N": [[(0, 0), (0, 6), (4, 0), (4, 6)]],
    "O": [[(1, 0), (3, 0), (4, 1), (4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0)]],
    "P": [[(0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0, 3)]],
    "Q": [[(1, 0), (3, 0), (4, 1), (4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0)],
          [(2, 2), (4, 0)]],
    "R": [[(0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0, 3)], [(2, 3), (4, 0)]],
    "S": [[(0, 1), (1, 0), (3, 0), (4, 1), (4, 2), (0, 4), (0, 5), (1, 6), (3, 6), (4, 5)]],
    "T": [[(0, 6), (4, 6)], [(2, 6), (2, 0)]],
    "U": [[(0, 6), (0, 1), (1, 0), (3, 0), (4, 1), (4, 6)]],
    "V": [[(0, 6), (2, 0), (4, 6)]],
    "W": [[(0, 6), (1, 0), (2, 3), (3, 0), (4, 6)]],
    "X": [[(0, 0), (4, 6)], [(0, 6), (4, 0)]],
    "Y": [[(0, 6), (2, 3), (4, 6)], [(2, 3), (2, 0)]],
    "Z": [[(0, 6), (4, 6), (0, 0), (4, 0)]],
    "0": [[(1, 0), (3, 0), (4, 1), (4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0)],
          [(0, 1), (4, 5)]],
    "1": [[(1, 5), (2, 6), (2, 0)], [(1, 0), (3, 0)]],
    "2": [[(0, 5), (1, 6), (3, 6), (4, 5), (4, 4), (0, 0), (4, 0)]],
    "3": [[(0, 6), (4, 6), (2, 3), (4, 2), (4, 1), (3, 0), (1, 0), (0, 1)]],
    "4": [[(3, 0), (3, 6), (0, 2), (4, 2)]],
    "5": [[(4, 6), (0, 6), (0, 3), (3, 3), (4, 2), (4, 1), (3, 0), (1, 0), (0, 1)]],
    "6": [[(4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0), (3, 0), (4, 1), (4, 2), (3, 3), (0, 3)]],
    "7": [[(0, 6), (4, 6), (1, 0)]],
    "8": [[(1, 3), (0, 2), (0, 1), (1, 0), (3, 0), (4, 1), (4, 2), (3, 3), (1, 3),
           (0, 4), (0, 5), (1, 6), (3, 6), (4, 5), (4, 4), (3, 3)]],
    "9": [[(0, 1), (1, 0), (3, 0), (4, 1), (4, 5), (3, 6), (1, 6), (0, 5), (0, 4), (1, 3), (4, 3)]],
    ".": [[(2, 0), (2, 0.5)]], ",": [[(2, 0.6), (1.4, -0.8)]], "-": [[(1, 3), (3, 3)]],
    "_": [[(0, -1), (4, -1)]], "/": [[(0, 0), (4, 6)]],
    ":": [[(2, 1), (2, 1.6)], [(2, 3.6), (2, 4.2)]],
    ";": [[(2, 1), (2, 1.6)], [(2, 3.6), (2, 4.2)]],
    "(": [[(3, 6), (1, 4), (1, 2), (3, 0)]], ")": [[(1, 6), (3, 4), (3, 2), (1, 0)]],
    "+": [[(2, 1), (2, 5)], [(0, 3), (4, 3)]], "=": [[(0, 2), (4, 2)], [(0, 4), (4, 4)]],
    "%": [[(0, 0), (4, 6)], [(0, 4), (1, 6)], [(3, 0), (4, 2)]],
    "'": [[(2, 5), (2, 6)]], '"': [[(1, 5), (1, 6)], [(3, 5), (3, 6)]],
    "!": [[(2, 2), (2, 6)], [(2, 0), (2, 0.5)]],
    "?": [[(0, 5), (1, 6), (3, 6), (4, 5), (2, 3), (2, 2)], [(2, 0), (2, 0.5)]],
    "*": [[(2, 2), (2, 6)], [(0, 3), (4, 5)], [(0, 5), (4, 3)]],
    "@": [[(2, 3), (2, 6), (0, 4), (0, 1), (3, 0), (4, 2)]],
}

COULEURS = {1: (200, 40, 40), 2: (190, 150, 30), 3: (40, 150, 60), 4: (30, 150, 180),
            5: (40, 70, 200), 6: (180, 40, 180), 7: (25, 25, 25), 8: (140, 140, 140),
            9: (175, 175, 175), 42: (150, 110, 60), 32: (200, 120, 40)}


def lire_dxf(chemin):
    with open(chemin, encoding="ascii", errors="replace") as fichier:
        contenu = fichier.read().replace("\r\n", "\n").split("\n")
    paires = []
    for indice in range(0, len(contenu) - 1, 2):
        try:
            paires.append((int(contenu[indice].strip()), contenu[indice + 1]))
        except ValueError:
            pass

    calques = {}
    for indice, (code, valeur) in enumerate(paires):
        if code == 0 and valeur.strip() == "LAYER":
            nom, couleur = None, 7
            for code2, valeur2 in paires[indice + 1:indice + 8]:
                if code2 == 0:
                    break
                if code2 == 2:
                    nom = valeur2.strip()
                elif code2 == 62:
                    couleur = int(valeur2)
            if nom:
                calques[nom] = couleur

    debut = next(i for i, (c, v) in enumerate(paires) if c == 2 and v.strip() == "ENTITIES")
    entites, courante = [], None
    for code, valeur in paires[debut:]:
        if code == 0:
            if courante:
                entites.append(courante)
            courante = {"type": valeur.strip(), "codes": []}
            if valeur.strip() in ("ENDSEC", "EOF"):
                break
        elif courante is not None:
            courante["codes"].append((code, valeur.strip()))
    return calques, entites


def _valeur(entite, code, defaut=None):
    for code_courant, valeur in entite["codes"]:
        if code_courant == code:
            try:
                return float(valeur)
            except ValueError:
                return valeur
    return defaut


def segments(entites, calques):
    resultat = []
    polyligne = None
    for entite in entites:
        type_entite = entite["type"]
        calque = str(_valeur(entite, 8, "0"))
        couleur = COULEURS.get(calques.get(calque, 7), (0, 0, 0))
        if type_entite == "LINE":
            resultat.append(((_valeur(entite, 10, 0), _valeur(entite, 20, 0)),
                             (_valeur(entite, 11, 0), _valeur(entite, 21, 0)), couleur))
        elif type_entite == "POLYLINE":
            polyligne = {"pts": [], "couleur": couleur,
                         "ferme": int(_valeur(entite, 70, 0) or 0) & 1}
        elif type_entite == "VERTEX" and polyligne is not None:
            polyligne["pts"].append((_valeur(entite, 10, 0), _valeur(entite, 20, 0)))
        elif type_entite == "SEQEND" and polyligne is not None:
            points = polyligne["pts"]
            if polyligne["ferme"] and points:
                points = points + [points[0]]
            for indice in range(len(points) - 1):
                resultat.append((points[indice], points[indice + 1], polyligne["couleur"]))
            polyligne = None
        elif type_entite == "SOLID":
            points = [(_valeur(entite, 10 + i, 0), _valeur(entite, 20 + i, 0)) for i in range(4)]
            ordre = [points[0], points[1], points[3], points[2], points[0]]
            for indice in range(4):
                resultat.append((ordre[indice], ordre[indice + 1], couleur))
        elif type_entite in ("CIRCLE", "ARC"):
            centre = (_valeur(entite, 10, 0), _valeur(entite, 20, 0))
            rayon = _valeur(entite, 40, 0)
            a0 = math.radians(_valeur(entite, 50, 0) or 0)
            a1 = math.radians(_valeur(entite, 51, 360) if type_entite == "ARC" else 360)
            if a1 <= a0:
                a1 += 2 * math.pi
            pas = max(int((a1 - a0) / 0.2), 6)
            precedent = None
            for indice in range(pas + 1):
                angle = a0 + (a1 - a0) * indice / pas
                point = (centre[0] + rayon * math.cos(angle), centre[1] + rayon * math.sin(angle))
                if precedent:
                    resultat.append((precedent, point, couleur))
                precedent = point
        elif type_entite == "TEXT":
            contenu = ""
            for code_courant, valeur in entite["codes"]:
                if code_courant == 1:
                    contenu = valeur.replace("%%c", "@").upper()
                    break
            hauteur = _valeur(entite, 40, 2.5)
            largeur = _valeur(entite, 41, 0.85) or 0.85
            rotation = math.radians(_valeur(entite, 50, 0) or 0)
            ancre = (_valeur(entite, 11, None), _valeur(entite, 21, None))
            if ancre[0] is None:
                ancre = (_valeur(entite, 10, 0), _valeur(entite, 20, 0))
            ah = int(_valeur(entite, 72, 0) or 0)
            av = int(_valeur(entite, 73, 0) or 0)
            echelle = hauteur / 6.0
            avance = 5.2 * echelle * largeur
            longueur = avance * len(contenu)
            decalage_x = {0: 0.0, 1: -longueur / 2.0, 2: -longueur}.get(ah, 0.0)
            decalage_y = {0: 0.0, 1: 0.0, 2: -hauteur / 2.0, 3: -hauteur}.get(av, 0.0)
            cos_r, sin_r = math.cos(rotation), math.sin(rotation)
            for indice, caractere in enumerate(contenu):
                traits = G.get(caractere)
                if not traits:
                    continue
                for trait in traits:
                    precedent = None
                    for (gx, gy) in trait:
                        px = decalage_x + indice * avance + gx * echelle * largeur
                        py = decalage_y + gy * echelle
                        point = (ancre[0] + px * cos_r - py * sin_r,
                                 ancre[1] + px * sin_r + py * cos_r)
                        if precedent:
                            resultat.append((precedent, point, couleur))
                        precedent = point
    return resultat


def ecrire_png(chemin, largeur, hauteur, tampon):
    lignes = b"".join(b"\x00" + bytes(tampon[y * largeur * 3:(y + 1) * largeur * 3])
                      for y in range(hauteur))

    def bloc(nom, donnees):
        return (struct.pack(">I", len(donnees)) + nom + donnees
                + struct.pack(">I", zlib.crc32(nom + donnees) & 0xFFFFFFFF))

    with open(chemin, "wb") as fichier:
        fichier.write(b"\x89PNG\r\n\x1a\n")
        fichier.write(bloc(b"IHDR", struct.pack(">IIBBBBB", largeur, hauteur, 8, 2, 0, 0, 0)))
        fichier.write(bloc(b"IDAT", zlib.compress(lignes, 6)))
        fichier.write(bloc(b"IEND", b""))


def rendre(chemin_dxf, chemin_png, largeur_px=2400, zone=None):
    calques, entites = lire_dxf(chemin_dxf)
    traits = segments(entites, calques)
    if not traits:
        raise SystemExit("aucune entite lisible")
    if zone:
        x1, y1, x2, y2 = zone
    else:
        abscisses = [p[0] for trait in traits for p in trait[:2]]
        ordonnees = [p[1] for trait in traits for p in trait[:2]]
        x1, y1, x2, y2 = min(abscisses), min(ordonnees), max(abscisses), max(ordonnees)
        marge = 0.02 * max(x2 - x1, y2 - y1)
        x1, y1, x2, y2 = x1 - marge, y1 - marge, x2 + marge, y2 + marge

    echelle = largeur_px / (x2 - x1)
    hauteur_px = max(int((y2 - y1) * echelle), 1)
    tampon = bytearray(b"\xff" * (largeur_px * hauteur_px * 3))

    def pixel(x, y, couleur):
        if 0 <= x < largeur_px and 0 <= y < hauteur_px:
            indice = (y * largeur_px + x) * 3
            tampon[indice:indice + 3] = bytes(couleur)

    for (xa, ya), (xb, yb), couleur in traits:
        ax = int((xa - x1) * echelle)
        ay = hauteur_px - 1 - int((ya - y1) * echelle)
        bx = int((xb - x1) * echelle)
        by = hauteur_px - 1 - int((yb - y1) * echelle)
        dx, dy = abs(bx - ax), -abs(by - ay)
        sx = 1 if ax < bx else -1
        sy = 1 if ay < by else -1
        erreur = dx + dy
        while True:
            pixel(ax, ay, couleur)
            if ax == bx and ay == by:
                break
            double = 2 * erreur
            if double >= dy:
                erreur += dy
                ax += sx
            if double <= dx:
                erreur += dx
                ay += sy
    ecrire_png(chemin_png, largeur_px, hauteur_px, tampon)
    return largeur_px, hauteur_px, len(traits)


if __name__ == "__main__":
    arguments = sys.argv[1:]
    zone = None
    if "--zone" in arguments:
        indice = arguments.index("--zone")
        zone = [float(valeur) for valeur in arguments[indice + 1:indice + 5]]
        del arguments[indice:indice + 5]
    largeur = int(arguments[2]) if len(arguments) > 2 else 2400
    print("%d x %d px, %d segments" % rendre(arguments[0], arguments[1], largeur, zone))
