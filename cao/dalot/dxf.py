"""Ecriture de fichiers DXF R12 (AC1009) sans aucune dependance externe.

R12 est volontairement choisi : c'est le format DXF le plus universellement
lu (AutoCAD toutes versions, AutoCAD LT, BricsCAD, DraftSight, ZWCAD,
LibreCAD, QCAD, nanoCAD). Les entites emises sont limitees a LINE, POLYLINE,
CIRCLE, ARC, SOLID et TEXT : aucune n'a besoin d'etre convertie a l'ouverture.

Le texte est ecrit en ASCII pur (accents supprimes) pour eviter toute
dependance a la page de code du poste qui ouvre le fichier.
"""

from __future__ import annotations

import unicodedata

# ---------------------------------------------------------------- utilitaires


def sans_accent(texte: str) -> str:
    """Supprime les accents et tout caractere non ASCII d'une chaine."""
    decompose = unicodedata.normalize("NFD", texte)
    plat = "".join(c for c in decompose if unicodedata.category(c) != "Mn")
    remplacements = {"Œ": "OE", "œ": "oe", "°": "deg", "Ø": "%%c", "ø": "%%c"}
    for source, cible in remplacements.items():
        plat = plat.replace(source, cible)
    return plat.encode("ascii", "replace").decode("ascii")


def _f(valeur: float) -> str:
    return f"{valeur:.6f}"


# ------------------------------------------------------------------ le module


class Dxf:
    """Accumulateur d'entites DXF, ecrites en coordonnees deja transformees."""

    def __init__(self) -> None:
        self._entites: list[str] = []
        self._calques: dict[str, tuple[int, str]] = {}
        self._ltypes: dict[str, tuple[str, list[float]]] = {
            "CONTINUOUS": ("Trait continu", []),
            "AXE": ("Axe ____ _ ____ _ ____", [0.6, -0.12, 0.12, -0.12]),
            "TIRETS": ("Tirets __ __ __ __ __", [0.25, -0.12]),
            "POINTILLE": ("Pointille . . . . . .", [0.0, -0.15]),
        }
        self.calque("0", 7)

    # -- tables ------------------------------------------------------------

    def calque(self, nom: str, couleur: int = 7, ltype: str = "CONTINUOUS") -> str:
        nom = sans_accent(nom).upper()
        self._calques[nom] = (couleur, ltype)
        return nom

    # -- entites -----------------------------------------------------------

    def _g(self, code: int, valeur) -> None:
        self._entites.append(f"{code}\n{valeur}\n")

    def _entete(self, type_entite: str, calque: str, ltype: str | None = None) -> None:
        self._g(0, type_entite)
        self._g(8, sans_accent(calque).upper())
        if ltype and ltype != "CONTINUOUS":
            self._g(6, ltype)

    def ligne(self, p1, p2, calque: str = "0", ltype: str | None = None) -> None:
        self._entete("LINE", calque, ltype)
        self._g(10, _f(p1[0]))
        self._g(20, _f(p1[1]))
        self._g(30, "0.0")
        self._g(11, _f(p2[0]))
        self._g(21, _f(p2[1]))
        self._g(31, "0.0")

    def polyligne(self, points, calque: str = "0", ferme: bool = False, ltype: str | None = None) -> None:
        points = list(points)
        if len(points) < 2:
            return
        self._entete("POLYLINE", calque, ltype)
        self._g(66, 1)
        self._g(10, "0.0")
        self._g(20, "0.0")
        self._g(30, "0.0")
        self._g(70, 1 if ferme else 0)
        for point in points:
            self._entete("VERTEX", calque, ltype)
            self._g(10, _f(point[0]))
            self._g(20, _f(point[1]))
            self._g(30, "0.0")
        self._g(0, "SEQEND")
        self._g(8, sans_accent(calque).upper())

    def cercle(self, centre, rayon: float, calque: str = "0", ltype: str | None = None) -> None:
        self._entete("CIRCLE", calque, ltype)
        self._g(10, _f(centre[0]))
        self._g(20, _f(centre[1]))
        self._g(30, "0.0")
        self._g(40, _f(rayon))

    def arc(self, centre, rayon: float, angle_debut: float, angle_fin: float,
            calque: str = "0", ltype: str | None = None) -> None:
        self._entete("ARC", calque, ltype)
        self._g(10, _f(centre[0]))
        self._g(20, _f(centre[1]))
        self._g(30, "0.0")
        self._g(40, _f(rayon))
        self._g(50, _f(angle_debut))
        self._g(51, _f(angle_fin))

    def solide(self, p1, p2, p3, p4=None, calque: str = "0") -> None:
        """SOLID : triangle (p4 omis) ou quadrilatere plein."""
        p4 = p4 if p4 is not None else p3
        self._entete("SOLID", calque)
        for indice, point in enumerate((p1, p2, p3, p4)):
            self._g(10 + indice, _f(point[0]))
            self._g(20 + indice, _f(point[1]))
            self._g(30 + indice, "0.0")

    def texte(self, position, contenu: str, hauteur: float, calque: str = "0",
              rotation: float = 0.0, alignement_h: int = 0, alignement_v: int = 0,
              facteur_largeur: float = 0.85) -> None:
        """alignement_h : 0 gauche, 1 centre, 2 droite. alignement_v : 0 base,
        1 bas, 2 milieu, 3 haut."""
        self._entete("TEXT", calque)
        self._g(10, _f(position[0]))
        self._g(20, _f(position[1]))
        self._g(30, "0.0")
        self._g(40, _f(hauteur))
        self._g(1, sans_accent(contenu))
        if rotation:
            self._g(50, _f(rotation))
        self._g(41, _f(facteur_largeur))
        self._g(7, "STANDARD")
        self._g(72, alignement_h)
        self._g(11, _f(position[0]))
        self._g(21, _f(position[1]))
        self._g(31, "0.0")
        self._g(73, alignement_v)

    # -- ecriture ----------------------------------------------------------

    def _section_tables(self, etendue) -> str:
        (xmin, ymin), (xmax, ymax) = etendue
        morceaux: list[str] = ["0\nSECTION\n2\nTABLES\n"]

        # VPORT : une fenetre active cadree sur le dessin.
        centre_x, centre_y = (xmin + xmax) / 2.0, (ymin + ymax) / 2.0
        hauteur = max(ymax - ymin, 1.0) * 1.1
        morceaux.append("0\nTABLE\n2\nVPORT\n70\n1\n0\nVPORT\n2\n*ACTIVE\n70\n0\n")
        morceaux.append("10\n0.0\n20\n0.0\n11\n1.0\n21\n1.0\n")
        morceaux.append(f"12\n{_f(centre_x)}\n22\n{_f(centre_y)}\n")
        morceaux.append("13\n0.0\n23\n0.0\n14\n0.5\n24\n0.5\n15\n0.0\n25\n0.0\n")
        morceaux.append("16\n0.0\n26\n0.0\n36\n1.0\n17\n0.0\n27\n0.0\n37\n0.0\n")
        morceaux.append(f"40\n{_f(hauteur)}\n41\n1.5\n42\n50.0\n43\n0.0\n44\n0.0\n")
        morceaux.append("50\n0.0\n51\n0.0\n71\n0\n72\n1000\n73\n1\n74\n3\n75\n0\n76\n1\n77\n0\n78\n0\n")
        morceaux.append("0\nENDTAB\n")

        # LTYPE
        morceaux.append(f"0\nTABLE\n2\nLTYPE\n70\n{len(self._ltypes)}\n")
        for nom, (description, motif) in self._ltypes.items():
            longueur = sum(abs(segment) for segment in motif)
            morceaux.append("0\nLTYPE\n2\n" + nom + "\n70\n0\n3\n" + description + "\n72\n65\n")
            morceaux.append(f"73\n{len(motif)}\n40\n{_f(longueur)}\n")
            for segment in motif:
                morceaux.append(f"49\n{_f(segment)}\n")
        morceaux.append("0\nENDTAB\n")

        # LAYER
        morceaux.append(f"0\nTABLE\n2\nLAYER\n70\n{len(self._calques)}\n")
        for nom, (couleur, ltype) in self._calques.items():
            morceaux.append(f"0\nLAYER\n2\n{nom}\n70\n0\n62\n{couleur}\n6\n{ltype}\n")
        morceaux.append("0\nENDTAB\n")

        # STYLE : txt.shx, present sur toutes les installations.
        morceaux.append("0\nTABLE\n2\nSTYLE\n70\n1\n0\nSTYLE\n2\nSTANDARD\n70\n0\n")
        morceaux.append("40\n0.0\n41\n0.85\n50\n0.0\n71\n0\n42\n2.5\n3\ntxt\n4\n\n")
        morceaux.append("0\nENDTAB\n")

        morceaux.append("0\nENDSEC\n")
        return "".join(morceaux)

    def _etendue(self):
        abscisses: list[float] = []
        ordonnees: list[float] = []
        code_courant = None
        for morceau in self._entites:
            code, _, valeur = morceau.partition("\n")
            try:
                code_courant = int(code)
            except ValueError:
                continue
            if code_courant in (10, 11, 12, 13):
                try:
                    abscisses.append(float(valeur))
                except ValueError:
                    pass
            elif code_courant in (20, 21, 22, 23):
                try:
                    ordonnees.append(float(valeur))
                except ValueError:
                    pass
        if not abscisses or not ordonnees:
            return (0.0, 0.0), (100.0, 100.0)
        return (min(abscisses), min(ordonnees)), (max(abscisses), max(ordonnees))

    def enregistrer(self, chemin: str) -> None:
        etendue = self._etendue()
        (xmin, ymin), (xmax, ymax) = etendue
        entete = (
            "0\nSECTION\n2\nHEADER\n"
            "9\n$ACADVER\n1\nAC1009\n"
            "9\n$DWGCODEPAGE\n3\nANSI_1252\n"
            "9\n$INSBASE\n10\n0.0\n20\n0.0\n30\n0.0\n"
            f"9\n$EXTMIN\n10\n{_f(xmin)}\n20\n{_f(ymin)}\n30\n0.0\n"
            f"9\n$EXTMAX\n10\n{_f(xmax)}\n20\n{_f(ymax)}\n30\n0.0\n"
            f"9\n$LIMMIN\n10\n{_f(xmin)}\n20\n{_f(ymin)}\n"
            f"9\n$LIMMAX\n10\n{_f(xmax)}\n20\n{_f(ymax)}\n"
            "9\n$LTSCALE\n40\n1.0\n"
            "9\n$TEXTSTYLE\n7\nSTANDARD\n"
            "9\n$CLAYER\n8\n0\n"
            "9\n$LUNITS\n70\n2\n9\n$LUPREC\n70\n3\n"
            "0\nENDSEC\n"
        )
        corps = (
            entete
            + self._section_tables(etendue)
            + "0\nSECTION\n2\nBLOCKS\n0\nENDSEC\n"
            + "0\nSECTION\n2\nENTITIES\n"
            + "".join(self._entites)
            + "0\nENDSEC\n0\nEOF\n"
        )
        with open(chemin, "w", encoding="ascii", newline="\r\n") as fichier:
            fichier.write(corps)
