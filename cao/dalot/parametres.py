"""Parametres du dalot et grandeurs derivees (niveaux, metres, aciers).

TOUT le plan decoule de ce fichier : modifier une valeur ici (ou dans
parametres.json) et relancer `python3 generer.py` suffit a produire un plan
coherent (geometrie, cotes, quantites, nomenclature).
"""

from __future__ import annotations

import json
import math
import os

# Masse lineique des aciers a haute adherence, en kg/m.
MASSE_LINEIQUE = {6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888, 14: 1.208,
                  16: 1.578, 20: 2.466, 25: 3.854}

DEFAUTS = {
    # -- identification
    "projet": "AMENAGEMENT ROUTIER - FRANCHISSEMENT HYDRAULIQUE",
    "ouvrage": "DALOT CADRE FERME 1 x (2.00 x 1.50)",
    "localisation": "PK 0+000 - A COMPLETER",
    "maitre_ouvrage": "A COMPLETER",
    "bureau_etudes": "A COMPLETER",
    "indice": "A",
    "date": "",

    # -- geometrie du cadre (m)
    "ouverture_largeur": 2.00,
    "ouverture_hauteur": 1.50,
    "ep_piedroit": 0.25,
    "ep_traverse": 0.25,
    "ep_radier": 0.30,
    "gousset": 0.20,
    "nombre_ouvertures": 1,

    # -- implantation
    "longueur_ouvrage": 9.00,      # suivant l'axe hydraulique = largeur de plateforme
    "largeur_chaussee": 7.00,
    "largeur_accotement": 1.00,
    "devers": 0.025,
    "pente_radier": 0.01,          # vers l'aval
    "biais": 0.0,                  # ouvrage droit
    "couverture_min": 0.60,        # remblai + chaussee au-dessus de l'extrados
    "ep_corps_chaussee": 0.25,
    "talus_remblai": 1.5,          # 1.5 H / 1 V (talus 3/2)

    # -- fondation et protections
    "ep_beton_proprete": 0.10,
    "debord_proprete": 0.10,
    "beche_hauteur": 0.60,
    "beche_largeur": 0.30,
    "mur_tete_ep": 0.25,
    "enrochement_longueur": 1.50,
    "enrochement_ep": 0.40,

    # -- murs en aile
    "mur_aile_longueur": 3.00,
    "mur_aile_angle": 30.0,        # deg par rapport a l'axe hydraulique
    "mur_aile_ep_tete": 0.25,
    "mur_aile_ep_pied": 0.40,
    "mur_aile_semelle_largeur": 2.00,
    "mur_aile_semelle_ep": 0.35,
    "mur_aile_patin": 0.40,
    "mur_aile_fiche": 0.60,        # profondeur d'encastrement sous le fil d'eau

    # -- materiaux
    "beton_classe": "C25/30",
    "fc28": 25.0,
    "acier_nuance": "FeE500 (HA)",
    "fe": 500.0,
    "enrobage": 0.04,
    "enrobage_fondation": 0.05,
    "poids_beton": 25.0,           # kN/m3
    "poids_remblai": 20.0,         # kN/m3
    "angle_frottement": 30.0,      # deg
    "contrainte_sol_adm": 0.15,    # MPa - A CONFIRMER par etude geotechnique

    # -- ferraillage retenu
    "diam_cadre": 12,
    "espacement_cadre": 0.15,
    "diam_repartition": 8,
    "espacement_repartition": 0.20,
    "diam_gousset": 12,
    "diam_mur": 12,
    "espacement_mur": 0.15,

    # -- hydraulique (a caler sur l'etude de bassin versant)
    "debit_projet": 0.0,           # m3/s - 0 = non renseigne
    "strickler": 70.0,
    "taux_remplissage": 0.80,
}


class Parametres(dict):
    """Dictionnaire de parametres + grandeurs derivees accessibles en attribut."""

    def __getattr__(self, nom):
        try:
            return self[nom]
        except KeyError as erreur:
            raise AttributeError(nom) from erreur

    # -- geometrie derivee -------------------------------------------------

    @property
    def largeur_exterieure(self):
        """Largeur hors tout du cadre, mesuree suivant l'axe de la route."""
        nombre = self.nombre_ouvertures
        return (nombre * self.ouverture_largeur + (nombre + 1) * self.ep_piedroit)

    @property
    def hauteur_exterieure(self):
        return self.ep_radier + self.ouverture_hauteur + self.ep_traverse

    @property
    def hauteur_extrados(self):
        """Hauteur de l'extrados de la traverse au-dessus du fil d'eau."""
        return self.ouverture_hauteur + self.ep_traverse

    @property
    def largeur_plateforme(self):
        return self.largeur_chaussee + 2 * self.largeur_accotement

    def fil_eau(self, y):
        """Cote du fil d'eau a l'abscisse y (axe hydraulique, amont en -L/2)."""
        return -self.pente_radier * (y + self.longueur_ouvrage / 2.0)

    @property
    def cote_axe_chaussee(self):
        """Cote de l'axe de la chaussee garantissant la couverture minimale."""
        demi = self.longueur_ouvrage / 2.0
        maximum = max(self.fil_eau(y) + self.devers * abs(y)
                      for y in (-demi, 0.0, demi))
        return self.couverture_min + self.hauteur_extrados + maximum

    def cote_plateforme(self, y):
        return self.cote_axe_chaussee - self.devers * abs(y)

    def couverture(self, y):
        return self.cote_plateforme(y) - (self.fil_eau(y) + self.hauteur_extrados)

    def hauteur_mur_tete(self, cote=-1):
        """Hauteur du mur de tete au-dessus de l'extrados (amont : cote=-1)."""
        y = cote * self.longueur_ouvrage / 2.0
        return self.cote_plateforme(y) - (self.fil_eau(y) + self.hauteur_extrados)

    @property
    def cote_sous_semelle_aile(self):
        return -self.mur_aile_fiche - self.mur_aile_semelle_ep

    # -- hydraulique -------------------------------------------------------

    @property
    def debit_capable(self):
        """Debit capable en ecoulement uniforme (Manning-Strickler)."""
        hauteur = self.taux_remplissage * self.ouverture_hauteur
        section = self.nombre_ouvertures * self.ouverture_largeur * hauteur
        perimetre = self.nombre_ouvertures * (self.ouverture_largeur + 2 * hauteur)
        rayon = section / perimetre
        vitesse = self.strickler * rayon ** (2.0 / 3.0) * math.sqrt(self.pente_radier)
        return section * vitesse, vitesse, section, rayon

    # -- metres ------------------------------------------------------------

    def quantites(self):
        longueur = self.longueur_ouvrage
        largeur = self.largeur_exterieure
        hauteur = self.hauteur_exterieure
        gousset = self.gousset

        aire_pleine = largeur * hauteur
        aire_vide = (self.nombre_ouvertures
                     * (self.ouverture_largeur * self.ouverture_hauteur
                        - 4 * gousset ** 2 / 2.0))
        aire_beton = aire_pleine - aire_vide

        beton_cadre = aire_beton * longueur
        largeur_proprete = largeur + 2 * self.debord_proprete
        proprete = largeur_proprete * self.ep_beton_proprete * longueur
        beches = 2 * largeur_proprete * self.beche_largeur * self.beche_hauteur
        tetes = sum(largeur * self.mur_tete_ep * self.hauteur_mur_tete(cote)
                    for cote in (-1, 1))

        hauteur_voile_max = (self.cote_plateforme(self.longueur_ouvrage / 2.0)
                             + self.mur_aile_fiche)
        hauteur_voile_moy = (hauteur_voile_max + 0.60) / 2.0
        ep_moyenne = (self.mur_aile_ep_tete + self.mur_aile_ep_pied) / 2.0
        voiles = 4 * self.mur_aile_longueur * hauteur_voile_moy * ep_moyenne
        semelles = (4 * self.mur_aile_longueur * self.mur_aile_semelle_largeur
                    * self.mur_aile_semelle_ep)

        beton_arme = beton_cadre + tetes + voiles + semelles + beches

        coffrage_interieur = (self.nombre_ouvertures
                              * (2 * self.ouverture_largeur + 2 * self.ouverture_hauteur
                                 - 8 * gousset + 4 * gousset * math.sqrt(2))) * longueur
        coffrage_exterieur = (2 * hauteur + largeur) * longueur
        coffrage_ailes = 4 * self.mur_aile_longueur * hauteur_voile_moy * 2
        coffrage = coffrage_interieur + coffrage_exterieur + coffrage_ailes

        aciers = self.nomenclature()
        poids_acier = sum(ligne["poids"] for ligne in aciers)

        fouille_largeur = largeur_proprete + 2 * 0.50
        fouille_profondeur = hauteur + self.ep_beton_proprete + 0.10
        deblai = fouille_largeur * fouille_profondeur * longueur * 1.15
        remblai_contact = max(deblai - beton_cadre - proprete, 0.0) * 0.6
        enrochement = (2 * self.enrochement_longueur * self.enrochement_ep
                       * (largeur + 2 * self.mur_aile_longueur
                          * math.sin(math.radians(self.mur_aile_angle))))

        return [
            ("Deblais en terrain ordinaire (fouilles)", "m3", deblai),
            ("Beton de proprete dose a 150 kg/m3", "m3", proprete),
            ("Beton arme " + self.beton_classe + " - cadre", "m3", beton_cadre),
            ("Beton arme " + self.beton_classe + " - murs de tete", "m3", tetes),
            ("Beton arme " + self.beton_classe + " - murs en aile et semelles", "m3",
             voiles + semelles),
            ("Beton arme " + self.beton_classe + " - beches amont / aval", "m3", beches),
            ("TOTAL beton arme", "m3", beton_arme),
            ("Coffrage ordinaire et soigne", "m2", coffrage),
            ("Aciers HA " + self.acier_nuance, "kg", poids_acier),
            ("Remblai contigu compacte a 95 % OPM", "m3", remblai_contact),
            ("Perre / enrochement de protection", "m3", enrochement),
        ]

    # -- nomenclature des aciers ------------------------------------------

    def nomenclature(self):
        """Liste des reperes d'armature, deduite de la geometrie (aucune saisie)."""
        enrobage = self.enrobage
        longueur = self.longueur_ouvrage
        largeur = self.largeur_exterieure
        hauteur = self.hauteur_exterieure
        diametre = self.diam_cadre
        espacement = self.espacement_cadre
        recouvrement = 50 * diametre / 1000.0   # 50 phi (fissuration prejudiciable)

        nombre_transversal = int(longueur / espacement) + 1
        retour = (hauteur - 2 * enrobage) / 2.0 + recouvrement / 2.0
        developpe_ext = (largeur - 2 * enrobage) + 2 * retour
        developpe_int = (self.ouverture_largeur + 2 * enrobage) + 2 * retour

        hauteur_voile = self.cote_plateforme(longueur / 2.0) + self.mur_aile_fiche
        nombre_aile = int(self.mur_aile_longueur / self.espacement_mur) + 1
        nombre_semelle = int(self.mur_aile_longueur / 0.15) + 1

        perimetre_ext = 2 * (largeur - 2 * enrobage) + 2 * (hauteur - 2 * enrobage)
        perimetre_int = 2 * (self.ouverture_largeur + 2 * enrobage) + 2 * (
            self.ouverture_hauteur + 2 * enrobage)
        nombre_long = int((perimetre_ext + perimetre_int) / self.espacement_repartition)

        lignes = [
            (1, "Cadre - lit ext. - U inferieur (radier + piedroits)", diametre,
             "e=%.0f" % (espacement * 100), nombre_transversal, developpe_ext),
            (2, "Cadre - lit ext. - U superieur (traverse + piedroits)", diametre,
             "e=%.0f" % (espacement * 100), nombre_transversal, developpe_ext),
            (3, "Cadre - lit int. - U inferieur (radier + piedroits)", diametre,
             "e=%.0f" % (espacement * 100), nombre_transversal, developpe_int),
            (4, "Cadre - lit int. - U superieur (traverse + piedroits)", diametre,
             "e=%.0f" % (espacement * 100), nombre_transversal, developpe_int),
            (5, "Filants d'angle - 2 HA par gousset", self.diam_gousset, "-", 8,
             longueur - 2 * enrobage),
            (6, "Repartition longitudinale - 2 nappes", self.diam_repartition,
             "e=%.0f" % (self.espacement_repartition * 100), nombre_long,
             longueur - 2 * enrobage),
            (7, "Mur en aile - verticaux face terre (+ retour semelle)", self.diam_mur,
             "e=%.0f" % (self.espacement_mur * 100), 4 * nombre_aile,
             hauteur_voile + self.mur_aile_semelle_largeur * 0.70),
            (8, "Mur en aile - verticaux face vue (constructif)", 10, "e=20",
             4 * (int(self.mur_aile_longueur / 0.20) + 1), hauteur_voile * 0.85),
            (9, "Mur en aile - horizontaux, 2 nappes", 10, "e=20",
             4 * 2 * (int(hauteur_voile / 0.20) + 1), self.mur_aile_longueur),
            (10, "Semelle d'aile - transversaux (2 nappes)", self.diam_mur, "e=15",
             4 * 2 * nombre_semelle, self.mur_aile_semelle_largeur - 2 * self.enrobage_fondation),
            (11, "Semelle d'aile - filants longitudinaux", 10, "e=20",
             4 * 2 * 5, self.mur_aile_longueur),
            (12, "Beche amont / aval - cadres", 10, "e=20",
             2 * (int((largeur + 0.20) / 0.20) + 1),
             2 * (self.beche_hauteur + self.beche_largeur) - 0.20),
            (13, "Mur de tete - treillis equivalent (2 nappes)", 10, "e=20",
             2 * 2 * (int(largeur / 0.20) + 1), self.hauteur_mur_tete(-1) + 0.50),
        ]

        resultat = []
        for repere, designation, diam, esp, nombre, longueur_barre in lignes:
            longueur_barre = round(longueur_barre, 2)
            total = round(nombre * longueur_barre, 1)
            resultat.append({
                "rep": repere, "designation": designation, "diam": diam, "esp": esp,
                "nb": nombre, "longueur": longueur_barre, "total": total,
                "poids": round(total * MASSE_LINEIQUE[diam], 1),
            })
        return resultat


def charger(chemin: str | None = None) -> Parametres:
    valeurs = dict(DEFAUTS)
    if chemin and os.path.exists(chemin):
        with open(chemin, encoding="utf-8") as fichier:
            valeurs.update(json.load(fichier))
    if not valeurs.get("date"):
        import datetime
        valeurs["date"] = datetime.date.today().strftime("%d/%m/%Y")
    return Parametres(valeurs)
