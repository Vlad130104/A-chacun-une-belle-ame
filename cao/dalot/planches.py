"""Mise en planche : cadre, cartouche, tableaux, notes et composition.

Une planche est une Vue d'echelle 1000 : ses unites sont donc des
MILLIMETRES PAPIER (vue.mm(x) == x). Les vues metier y sont placees avec le
facteur 1000/echelle, ce qui les amene a leur echelle de trace.
"""

from __future__ import annotations

from dessin import CALQUES, H_COTE, H_NOTE, H_SOUS_TITRE, Vue
from dxf import Dxf

FORMATS = {"A1": (841.0, 594.0), "A0": (1189.0, 841.0), "A2": (594.0, 420.0)}
CADRE = "00_CARTOUCHE"
TABLEAU = "12_TABLEAU"


class Planche:
    """Une feuille de dessin, en millimetres."""

    def __init__(self, format_papier="A1", marge_gauche=20.0, marge=10.0):
        self.largeur, self.hauteur = FORMATS[format_papier]
        self.format = format_papier
        self.feuille = Vue("planche", 1000)
        self.vues: list[tuple[Vue, float, float]] = []
        self.marge_gauche, self.marge = marge_gauche, marge
        self._cadre()

    # -- cadre -------------------------------------------------------------

    def _cadre(self):
        x1, y1 = self.marge_gauche, self.marge
        x2, y2 = self.largeur - self.marge, self.hauteur - self.marge
        self.feuille.rectangle(0.0, 0.0, self.largeur, self.hauteur, CADRE)
        self.feuille.rectangle(x1, y1, x2, y2, CADRE)
        self.feuille.rectangle(x1 + 1.5, y1 + 1.5, x2 - 1.5, y2 - 1.5, CADRE)
        # reperes de centrage
        for x in (self.largeur / 2.0,):
            self.feuille.ligne((x, 0.0), (x, self.marge / 2.0), CADRE)
            self.feuille.ligne((x, self.hauteur), (x, self.hauteur - self.marge / 2.0), CADRE)
        for y in (self.hauteur / 2.0,):
            self.feuille.ligne((0.0, y), (self.marge / 2.0, y), CADRE)
            self.feuille.ligne((self.largeur, y), (self.largeur - self.marge / 2.0, y), CADRE)

    @property
    def zone(self):
        """(x_min, y_min, x_max, y_max) de la zone de dessin utile."""
        return (self.marge_gauche + 4.0, self.marge + 4.0,
                self.largeur - self.marge - 4.0, self.hauteur - self.marge - 4.0)

    # -- placement ---------------------------------------------------------

    HAUTEUR_TITRE = 18.0        # bandeau de titre reserve sous chaque vue

    def placer(self, vue: Vue, x: float, y: float, ancrage="bg", avec_titre=True):
        """Place une vue. (x, y) est le coin `ancrage` du bloc complet, titre
        de vue compris ; le titre est trace sous le dessin, en mm papier."""
        facteur = 1000.0 / vue.echelle
        x1, y1, x2, y2 = [valeur * facteur for valeur in vue.emprise()]
        largeur, hauteur = x2 - x1, y2 - y1
        bandeau = self.HAUTEUR_TITRE if (avec_titre and vue.titre) else 0.0
        origine_x = {"b": x, "c": x - largeur / 2.0, "d": x - largeur}[ancrage[0]]
        origine_y = {"b": y, "g": y, "m": y - (hauteur + bandeau) / 2.0,
                     "h": y - (hauteur + bandeau)}[ancrage[1]] + bandeau
        self.vues.append((vue, origine_x - x1, origine_y - y1))
        if bandeau:
            feuille = self.feuille
            base = origine_y - bandeau
            feuille.texte((origine_x, base + 7.0), vue.titre, 5.0, "11_TEXTE", ah=0, av=1)
            longueur = len(vue.titre) * 5.0 * 0.62 + 6.0
            feuille.ligne((origine_x, base + 5.0), (origine_x + longueur, base + 5.0), "11_TEXTE")
            if vue.sous_titre:
                feuille.texte((origine_x, base + 0.8), vue.sous_titre, 2.6, "11_TEXTE",
                              ah=0, av=1)
        return (origine_x, origine_y - bandeau, origine_x + largeur, origine_y + hauteur)

    # -- cartouche ---------------------------------------------------------

    def cartouche(self, P, titre_planche, numero, echelles, largeur=190.0, hauteur=72.0):
        x2, y1 = self.largeur - self.marge - 4.0, self.marge + 4.0
        x1, y2 = x2 - largeur, y1 + hauteur
        feuille = self.feuille
        feuille.rectangle(x1, y1, x2, y2, CADRE)

        lignes_y = [y1, y1 + 10.0, y1 + 22.0, y1 + 34.0, y1 + 46.0, y1 + 59.0, y2]
        for y in lignes_y[1:-1]:
            feuille.ligne((x1, y), (x2, y), CADRE)

        def champ(x_gauche, x_droite, y_bas, y_haut, libelle, valeur, hauteur_valeur=3.0):
            feuille.texte((x_gauche + 2.0, y_haut - 3.2), libelle, 2.0, TABLEAU, ah=0, av=3)
            disponible = x_droite - x_gauche - 4.0
            if valeur and len(valeur) * hauteur_valeur * 0.62 > disponible:
                hauteur_valeur = max(disponible / (len(valeur) * 0.62), 1.8)
            feuille.texte((x_gauche + 2.0, y_bas + 2.4), valeur, hauteur_valeur, TABLEAU, ah=0, av=1)

        champ(x1, x2, lignes_y[5], lignes_y[6], "MAITRE D'OUVRAGE", P.maitre_ouvrage, 3.2)
        feuille.ligne((x1 + largeur * 0.55, lignes_y[5]), (x1 + largeur * 0.55, lignes_y[6]), CADRE)
        champ(x1 + largeur * 0.55, x2, lignes_y[5], lignes_y[6], "BUREAU D'ETUDES", P.bureau_etudes, 3.2)
        champ(x1, x2, lignes_y[4], lignes_y[5], "PROJET", P.projet, 2.8)
        champ(x1, x2, lignes_y[3], lignes_y[4], "OUVRAGE", P.ouvrage + " - " + P.localisation, 2.8)
        champ(x1, x2, lignes_y[2], lignes_y[3], "TITRE DE LA PLANCHE", titre_planche, 3.6)

        colonnes = [x1, x1 + 52.0, x1 + 92.0, x1 + 122.0, x2]
        for x in colonnes[1:-1]:
            feuille.ligne((x, lignes_y[1]), (x, lignes_y[2]), CADRE)
        champ(colonnes[0], colonnes[1], lignes_y[1], lignes_y[2], "ECHELLES", echelles, 3.0)
        champ(colonnes[1], colonnes[2], lignes_y[1], lignes_y[2], "DATE", P.date, 3.0)
        champ(colonnes[2], colonnes[3], lignes_y[1], lignes_y[2], "INDICE", P.indice, 3.0)
        champ(colonnes[3], colonnes[4], lignes_y[1], lignes_y[2], "N% DE PLAN".replace("%", "o"),
              numero, 3.6)

        tiers = largeur / 3.0
        for indice in (1, 2):
            feuille.ligne((x1 + tiers * indice, lignes_y[0]), (x1 + tiers * indice, lignes_y[1]), CADRE)
        for indice, libelle in enumerate(("DESSINE", "VERIFIE", "APPROUVE")):
            champ(x1 + tiers * indice, x1 + tiers * (indice + 1), lignes_y[0], lignes_y[1],
                  libelle, "", 2.6)
        return (x1, y1, x2, y2)

    # -- tableaux ----------------------------------------------------------

    def tableau(self, x, y_haut, titre, entetes, largeurs, lignes, alignements=None,
                hauteur_ligne=6.5, hauteur_texte=2.4):
        feuille = self.feuille
        largeur = sum(largeurs)
        alignements = alignements or [0] * len(largeurs)
        y = y_haut
        feuille.rectangle(x, y - 8.0, x + largeur, y, TABLEAU)
        feuille.texte((x + 2.0, y - 4.0), titre, 3.2, TABLEAU, ah=0, av=2)
        y -= 8.0

        feuille.rectangle(x, y - hauteur_ligne, x + largeur, y, TABLEAU)
        position = x
        for indice, entete in enumerate(entetes):
            if indice:
                feuille.ligne((position, y - hauteur_ligne), (position, y), TABLEAU)
            feuille.texte((position + largeurs[indice] / 2.0, y - hauteur_ligne / 2.0),
                          entete, hauteur_texte, TABLEAU, ah=1, av=2)
            position += largeurs[indice]
        y -= hauteur_ligne

        for ligne in lignes:
            gras = ligne[0].startswith("TOTAL") or ligne[-1].startswith("TOTAL")
            feuille.rectangle(x, y - hauteur_ligne, x + largeur, y, TABLEAU)
            position = x
            for indice, cellule in enumerate(ligne):
                if indice:
                    feuille.ligne((position, y - hauteur_ligne), (position, y), TABLEAU)
                alignement = alignements[indice]
                marge_cellule = 1.8
                if alignement == 0:
                    ancre = position + marge_cellule
                elif alignement == 1:
                    ancre = position + largeurs[indice] / 2.0
                else:
                    ancre = position + largeurs[indice] - marge_cellule
                feuille.texte((ancre, y - hauteur_ligne / 2.0), cellule,
                              hauteur_texte * (1.1 if gras else 1.0), TABLEAU,
                              ah=alignement, av=2)
                position += largeurs[indice]
            y -= hauteur_ligne
        return (x, y, x + largeur, y_haut)

    @staticmethod
    def _decouper(texte, caracteres_max):
        """Retour a la ligne au mot, sur `caracteres_max` caracteres."""
        lignes, courante = [], ""
        for mot in texte.split():
            essai = (courante + " " + mot).strip()
            if len(essai) > caracteres_max and courante:
                lignes.append(courante)
                courante = mot
            else:
                courante = essai
        if courante:
            lignes.append(courante)
        return lignes

    def notes(self, x, y_haut, titre, elements, largeur=180.0, hauteur_texte=2.3,
              interligne=4.2, retrait=6.0):
        feuille = self.feuille
        feuille.texte((x, y_haut), titre, 3.2, "11_TEXTE", ah=0, av=3)
        feuille.ligne((x, y_haut - 4.6), (x + largeur, y_haut - 4.6), "11_TEXTE")
        caracteres = max(int((largeur - retrait) / (hauteur_texte * 0.62)), 20)
        y = y_haut - 8.6
        for indice, element in enumerate(elements, start=1):
            for rang, ligne in enumerate(self._decouper(element, caracteres)):
                if rang == 0:
                    feuille.texte((x, y), "%d." % indice, hauteur_texte, "11_TEXTE", ah=0, av=3)
                feuille.texte((x + retrait, y), ligne, hauteur_texte, "11_TEXTE", ah=0, av=3)
                y -= interligne
        return (x, y, x + largeur, y_haut)

    def encadre(self, x, y_bas, largeur, hauteur, lignes, hauteur_texte=2.6):
        feuille = self.feuille
        feuille.rectangle(x, y_bas, x + largeur, y_bas + hauteur, CADRE)
        feuille.rectangle(x + 1.0, y_bas + 1.0, x + largeur - 1.0, y_bas + hauteur - 1.0, CADRE)
        pas = hauteur / (len(lignes) + 1.0)
        for indice, ligne in enumerate(lignes):
            feuille.texte((x + largeur / 2.0, y_bas + hauteur - pas * (indice + 1)), ligne,
                          hauteur_texte, CADRE, ah=1, av=2)

    # -- sortie ------------------------------------------------------------

    def enregistrer(self, chemin):
        dxf = Dxf()
        for nom, couleur, ltype, _ in CALQUES:
            dxf.calque(nom, couleur, ltype)
        self.feuille.emettre(dxf, 1.0, 0.0, 0.0)
        for vue, dx, dy in self.vues:
            vue.emettre(dxf, 1000.0 / vue.echelle, dx, dy)
        dxf.enregistrer(chemin)
