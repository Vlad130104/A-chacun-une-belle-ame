#!/usr/bin/env python3
"""Genere le plan d'execution du dalot au format DXF, pret pour AutoCAD.

    python3 generer.py [parametres.json] [-o dossier_de_sortie]

Produit :
    DAL-01_coffrage.dxf     planche A1, a tracer a 1:1
    DAL-02_ferraillage.dxf  planche A1, a tracer a 1:1
    DAL-00_modele.dxf       toutes les vues en metres reels (echelle 1:1)
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import parametres
import vues
from dessin import CALQUES
from dxf import Dxf
from planches import Planche

NOTES_GENERALES = [
    "Cotes en metres sauf indication contraire ; cotes de nivellement relatives au fil d'eau amont (0.00),",
    "a rattacher au systeme altimetrique du projet avant execution.",
    "Beton arme C25/30, dosage minimal 350 kg/m3 de CEM II/B 42,5 ; classe d'exposition XC2 / XA1.",
    "Aciers a haute adherence FeE500 (NF A 35-016). Enrobage 4 cm, porte a 5 cm au contact du sol.",
    "Recouvrements 50 diametres minimum, decales en quinconce ; aucun recouvrement en zone de moment maximal.",
    "Beton de proprete dose a 150 kg/m3, epaisseur 10 cm, deborde de 10 cm du nu des fondations.",
    "Fond de fouille receptionne avant tout coulage ; portance admissible supposee 0,15 MPa, A CONFIRMER par essai.",
    "Remblais contigus en materiau selectionne, par couches de 20 cm compactees a 95 % OPM, montes",
    "symetriquement de part et d'autre du cadre ; engins lourds interdits a moins de 1,00 m des parements.",
    "Reprise de betonnage radier / piedroits a 15 cm au-dessus de l'extrados du radier : surface repiquee et lavee.",
    "Cure du beton pendant 7 jours minimum ; decoffrage des sous-faces apres 7 jours ou justification.",
    "Ne pas mettre en service avant 28 jours ou justification par essais de resistance.",
]

NOTES_FERRAILLAGE = [
    "Faconnage et mise en oeuvre conformes au BAEL 91 revise 99 et au CCTP.",
    "Diametre minimal de mandrin de cintrage : 10 diametres pour les HA12 et HA14.",
    "Cales d'enrobage en beton ou plastique, 4 par m2 minimum, en quinconce.",
    "Les aciers de repartition (rep. 6) sont poses a l'exterieur des aciers principaux.",
    "Les recouvrements des reperes 1/2 et 3/4 sont situes a mi-hauteur des piedroits (zone de moment faible).",
    "Aucune soudure sur armature n'est autorisee. Ligatures en fil recuit de 1,2 mm.",
    "Les quantites portees a la nomenclature sont donnees hors chutes et hors ligatures (+5 % a prevoir).",
    "Toute modification de ferraillage doit etre validee par l'ingenieur avant coulage.",
]

AVERTISSEMENT = [
    "PLAN TYPE ETABLI SUR HYPOTHESES - NE PAS EXECUTER EN L'ETAT",
    "A valider par l'ingenieur apres leve topographique, etude hydrologique du bassin versant",
    "et etude geotechnique. Le debit de projet et la portance du sol conditionnent le dimensionnement.",
]


def _table_quantites(P):
    lignes = []
    for designation, unite, quantite in P.quantites():
        lignes.append([designation, unite, "%.2f" % quantite])
    return lignes


def _table_aciers(P):
    lignes = []
    for ligne in P.nomenclature():
        lignes.append([str(ligne["rep"]), ligne["designation"], "HA%d" % ligne["diam"],
                       ligne["esp"], str(ligne["nb"]), "%.2f" % ligne["longueur"],
                       "%.1f" % ligne["total"], "%.1f" % ligne["poids"]])
    total = sum(ligne["poids"] for ligne in P.nomenclature())
    lignes.append(["", "TOTAL ACIERS HA", "", "", "", "", "", "%.0f" % total])
    return lignes


def _table_recapitulatif(P):
    par_diametre = {}
    for ligne in P.nomenclature():
        cumul = par_diametre.setdefault(ligne["diam"], [0.0, 0.0])
        cumul[0] += ligne["total"]
        cumul[1] += ligne["poids"]
    lignes = [["HA%d" % diametre, "%.0f" % valeurs[0], "%.0f" % valeurs[1]]
              for diametre, valeurs in sorted(par_diametre.items())]
    lignes.append(["TOTAL", "%.0f" % sum(v[0] for v in par_diametre.values()),
                   "%.0f" % sum(v[1] for v in par_diametre.values())])
    return lignes


def _table_hypotheses(P):
    debit, vitesse, section, rayon = P.debit_capable
    return [
        ["Beton / acier", "%s  -  %s" % (P.beton_classe, P.acier_nuance)],
        ["Reglement", "BAEL 91 rev. 99 - charges Fasc. 61 titre II (Bc / Bt)"],
        ["Couverture de remblai", "%.2f m mini sur l'extrados" % P.couverture_min],
        ["Poids volumique remblai", "%.0f kN/m3  -  angle de frottement %.0f deg"
         % (P.poids_remblai, P.angle_frottement)],
        ["Poussee des terres", "Ka = %.3f (etat actif, Rankine)"
         % ((1 - __import__("math").sin(__import__("math").radians(P.angle_frottement)))
            / (1 + __import__("math").sin(__import__("math").radians(P.angle_frottement))))],
        ["Contrainte de sol admise", "%.2f MPa  -  A CONFIRMER" % P.contrainte_sol_adm],
        ["Section hydraulique", "%.2f m2  -  rayon hydraulique %.3f m" % (section, rayon)],
        ["Debit capable (Strickler)", "%.1f m3/s a %.0f %% de remplissage (K=%.0f, I=%.1f %%)"
         % (debit, P.taux_remplissage * 100, P.strickler, P.pente_radier * 100)],
        ["Vitesse correspondante", "%.2f m/s  -  protection aval obligatoire" % vitesse],
        ["Debit de projet", "%s" % ("%.1f m3/s" % P.debit_projet if P.debit_projet
                                    else "A RENSEIGNER (etude de bassin versant)")],
    ]


# --------------------------------------------------------------- planche 1


def planche_coffrage(P):
    planche = Planche("A1")
    planche.placer(vues.vue_en_plan(P), 26.0, 88.0)
    planche.placer(vues.coupe_longitudinale(P), 370.0, 388.0)
    planche.placer(vues.coupe_transversale(P), 370.0, 170.0)

    planche.tableau(370.0, 162.0, "QUANTITES ESTIMATIVES", ["DESIGNATION", "U", "QUANTITE"],
                    [105.0, 15.0, 25.0], _table_quantites(P), alignements=[0, 1, 2],
                    hauteur_ligne=6.2, hauteur_texte=2.2)
    planche.tableau(525.0, 162.0, "HYPOTHESES DE DIMENSIONNEMENT", ["", ""],
                    [50.0, 95.0], _table_hypotheses(P), alignements=[0, 0],
                    hauteur_ligne=5.4, hauteur_texte=2.0)
    planche.notes(26.0, 80.0, "NOTES GENERALES", NOTES_GENERALES, largeur=330.0)
    planche.encadre(370.0, 545.0, 437.0, 33.0, AVERTISSEMENT, hauteur_texte=2.6)
    planche.cartouche(P, "PLANCHE 1 - COFFRAGE ET IMPLANTATION", "DAL-01",
                      "1:50 et 1:25 (A1)")
    return planche


# --------------------------------------------------------------- planche 2


def planche_ferraillage(P):
    planche = Planche("A1")
    planche.placer(vues.ferraillage_cadre(P), 26.0, 345.0)
    planche.placer(vues.plan_ferraillage_traverse(P), 352.0, 315.0)
    planche.placer(vues.mur_en_aile(P), 26.0, 80.0)
    planche.placer(vues.detail_gousset(P), 500.0, 165.0)

    planche.tableau(550.0, 530.0, "NOMENCLATURE DES ACIERS",
                    ["REP", "DESIGNATION", "%%c", "ESP.", "NB", "LONG. (m)", "TOTAL (m)",
                     "POIDS (kg)"],
                    [12.0, 118.0, 14.0, 16.0, 16.0, 20.0, 22.0, 22.0],
                    _table_aciers(P), alignements=[1, 0, 1, 1, 2, 2, 2, 2],
                    hauteur_ligne=6.2, hauteur_texte=2.2)
    planche.notes(550.0, 420.0, "NOTES DE FERRAILLAGE", NOTES_FERRAILLAGE, largeur=240.0)
    planche.tableau(550.0, 360.0, "RECAPITULATIF PAR DIAMETRE",
                    ["%%c", "LONGUEUR (m)", "POIDS (kg)"], [24.0, 44.0, 40.0],
                    _table_recapitulatif(P), alignements=[1, 2, 2], hauteur_ligne=6.2)
    planche.encadre(500.0, 105.0, 300.0, 50.0, AVERTISSEMENT, hauteur_texte=2.6)
    planche.cartouche(P, "PLANCHE 2 - FERRAILLAGE", "DAL-02", "1:10 a 1:50 (A1)")
    return planche


# ------------------------------------------------------ modele 1:1 (metres)


def modele(P, chemin):
    """Toutes les vues cote a cote, en metres reels : le fichier a mesurer."""
    dxf = Dxf()
    for nom, couleur, ltype, _ in CALQUES:
        dxf.calque(nom, couleur, ltype)
    liste = [vues.vue_en_plan(P), vues.coupe_longitudinale(P), vues.coupe_transversale(P),
             vues.ferraillage_cadre(P), vues.mur_en_aile(P), vues.detail_gousset(P),
             vues.plan_ferraillage_traverse(P)]
    curseur = 0.0
    for vue in liste:
        x1, y1, x2, y2 = vue.emprise()
        vue.titre_vue(x1, y1 - vue.mm(12.0))
        x1, y1, x2, y2 = vue.emprise()
        vue.emettre(dxf, 1.0, curseur - x1, -y1)
        curseur += (x2 - x1) + 6.0
    dxf.enregistrer(chemin)


def main(argv):
    chemin_json = None
    dossier = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sorties")
    arguments = list(argv[1:])
    if "-o" in arguments:
        indice = arguments.index("-o")
        dossier = arguments[indice + 1]
        del arguments[indice:indice + 2]
    if arguments:
        chemin_json = arguments[0]
    else:
        defaut = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parametres.json")
        chemin_json = defaut if os.path.exists(defaut) else None

    P = parametres.charger(chemin_json)
    os.makedirs(dossier, exist_ok=True)

    sorties = []
    for constructeur, nom in ((planche_coffrage, "DAL-01_coffrage.dxf"),
                              (planche_ferraillage, "DAL-02_ferraillage.dxf")):
        chemin = os.path.join(dossier, nom)
        constructeur(P).enregistrer(chemin)
        sorties.append(chemin)
    chemin_modele = os.path.join(dossier, "DAL-00_modele_1-1.dxf")
    modele(P, chemin_modele)
    sorties.append(chemin_modele)

    print("Dalot %s" % P.ouvrage)
    print("  ouverture         : %.2f x %.2f m" % (P.ouverture_largeur, P.ouverture_hauteur))
    print("  longueur          : %.2f m   couverture mini %.2f m" % (P.longueur_ouvrage,
                                                                     P.couverture_min))
    debit, vitesse, _, _ = P.debit_capable
    print("  debit capable     : %.1f m3/s  (V = %.2f m/s)" % (debit, vitesse))
    print("  beton arme        : %.2f m3" % [q for n, u, q in P.quantites()
                                             if n.startswith("TOTAL")][0])
    print("  aciers            : %.0f kg" % sum(l["poids"] for l in P.nomenclature()))
    for chemin in sorties:
        print("  ecrit : %s (%.0f ko)" % (chemin, os.path.getsize(chemin) / 1024.0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
