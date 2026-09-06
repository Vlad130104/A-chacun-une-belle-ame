"""Construction des vues du dalot, en metres reels.

Reperes utilises :
  - vue en plan          : X = axe de la route, Y = axe hydraulique (+Y vers l'aval)
  - coupe A-A            : abscisse = Y (axe hydraulique), ordonnee = cote Z
  - coupe B-B / detail   : abscisse = X (axe de la route),  ordonnee = cote Z
La cote 0.00 est le fil d'eau amont ; les cotes sont relatives et doivent etre
rattachees au nivellement du projet (voir cartouche).
"""

from __future__ import annotations

import math

from dessin import H_COTE, H_NOTE, H_REPERE, H_SOUS_TITRE, Vue

BETON = "02_BETON"
CACHE = "03_BETON_CACHE"
VU = "15_VU_ARRIERE"


# --------------------------------------------------------------- geometries


def contour_exterieur(P, z0=0.0):
    demi = P.largeur_exterieure / 2.0
    return [(-demi, z0 - P.ep_radier), (demi, z0 - P.ep_radier),
            (demi, z0 + P.hauteur_extrados), (-demi, z0 + P.hauteur_extrados)]


def contour_interieur(P, z0=0.0):
    demi = P.ouverture_largeur / 2.0
    gousset = P.gousset
    haut = z0 + P.ouverture_hauteur
    return [(-demi, z0 + gousset), (-demi + gousset, z0), (demi - gousset, z0),
            (demi, z0 + gousset), (demi, haut - gousset), (demi - gousset, haut),
            (-demi + gousset, haut), (-demi, haut - gousset)]


def profil_talus(P, cote, y_depart, z_depart, pas=0.05, portee=12.0):
    """Ligne de talus 3/2 depuis le bord de plateforme jusqu'au terrain naturel."""
    points = [(y_depart, z_depart)]
    y, z = y_depart, z_depart
    while abs(y - y_depart) < portee:
        y += cote * pas
        z -= pas / P.talus_remblai
        if z <= P.fil_eau(y):
            z = P.fil_eau(y)
            points.append((y, z))
            break
        points.append((y, z))
    return points


# ----------------------------------------------- coupe B-B (cadre, 1:25)


def coupe_transversale(P, echelle=25):
    vue = Vue("coupe_bb", echelle, "COUPE B-B", "Coupe transversale sur le cadre - Ech. 1:%d" % echelle)
    demi_ext = P.largeur_exterieure / 2.0
    demi_int = P.ouverture_largeur / 2.0
    z_radier = -P.ep_radier
    z_extrados = P.hauteur_extrados
    z_intrados = P.ouverture_hauteur
    z_plateforme = P.cote_plateforme(0.0) - P.fil_eau(0.0)
    z_forme = z_plateforme - P.ep_corps_chaussee
    x_max = demi_ext + 2.60

    exterieur = contour_exterieur(P)
    interieur = contour_interieur(P)

    # -- proprete et fouille
    demi_proprete = demi_ext + P.debord_proprete
    z_proprete = z_radier - P.ep_beton_proprete
    proprete = [(-demi_proprete, z_proprete), (demi_proprete, z_proprete),
                (demi_proprete, z_radier), (-demi_proprete, z_radier)]
    x_fouille_bas = demi_proprete + 0.50
    x_fouille_haut = x_fouille_bas + (0.0 - z_proprete)
    fouille = [(-x_max, 0.0), (-x_fouille_haut, 0.0), (-x_fouille_bas, z_proprete),
               (x_fouille_bas, z_proprete), (x_fouille_haut, 0.0), (x_max, 0.0),
               (x_max, z_forme), (-x_max, z_forme)]

    # -- remblai contigu (hachure), perce par l'ouvrage
    vue.symbole_remblai([fouille, exterieur, proprete])
    vue.poly([(-x_fouille_haut, 0.0), (-x_fouille_bas, z_proprete)], CACHE)
    vue.poly([(x_fouille_haut, 0.0), (x_fouille_bas, z_proprete)], CACHE)
    vue.symbole_terrain([(-x_max, 0.0), (-x_fouille_haut, 0.0)])
    vue.symbole_terrain([(x_fouille_haut, 0.0), (x_max, 0.0)])

    # -- corps de chaussee
    vue.rectangle(-x_max, z_forme, x_max, z_plateforme, "07_CHAUSSEE")
    vue.ligne((-x_max, z_plateforme - 0.05), (x_max, z_plateforme - 0.05), "07_CHAUSSEE")
    vue.hachurer([[(-x_max, z_forme), (x_max, z_forme),
                   (x_max, z_plateforme - 0.05), (-x_max, z_plateforme - 0.05)]],
                 0.0, 1.2, "07_CHAUSSEE")

    # -- beton de proprete et cadre
    vue.poly(proprete, BETON, ferme=True)
    vue.hachurer([proprete], 135.0, 1.6)
    vue.poly(exterieur, BETON, ferme=True)
    vue.poly(interieur, BETON, ferme=True)
    vue.hachure_beton([exterieur, interieur])

    # -- ligne d'eau (remplissage de calcul)
    z_eau = P.taux_remplissage * P.ouverture_hauteur
    vue.ligne((-demi_int, z_eau), (demi_int, z_eau), "13_EAU")
    for signe in (-1, 1):
        x = signe * demi_int / 2.0
        vue.ligne((x - vue.mm(2.0), z_eau + vue.mm(1.6)), (x + vue.mm(2.0), z_eau + vue.mm(1.6)), "13_EAU")
    vue.texte((0.0, z_eau + vue.mm(2.8)), "NIVEAU DE CALCUL 0.80 H", H_COTE, "13_EAU", ah=1, av=1)

    # -- axe
    vue.axe_vertical(0.0, z_proprete, z_plateforme)

    # -- cotation
    y_cote = z_proprete - 0.45
    vue.cote_chaine_h([-demi_ext, -demi_int, demi_int, demi_ext], y_cote, z_proprete)
    vue.cote_h(-demi_ext, demi_ext, y_cote - 0.45, z_proprete)
    vue.cote_h(-demi_proprete, demi_proprete, y_cote - 0.90, z_proprete)

    x_cote = demi_ext + 0.55
    vue.cote_chaine_v([z_radier, 0.0, z_intrados, z_extrados], x_cote, demi_ext)
    vue.cote_v(z_radier, z_extrados, x_cote + 0.45, demi_ext)
    vue.cote_v(z_extrados, z_plateforme, x_cote, demi_ext)
    vue.cote_v(z_proprete, z_radier, x_cote, demi_ext)

    # -- niveaux
    vue.niveau((-demi_int + 0.30, 0.0), "0.00  FIL D'EAU", a_gauche=True, longueur_mm=22.0)
    vue.niveau((-x_max + 0.60, z_plateforme), "%+.2f  AXE CHAUSSEE" % P.cote_axe_chaussee,
               longueur_mm=26.0)

    # -- annotations
    vue.renvoi((0.0, z_extrados - P.ep_traverse / 2.0), (demi_ext + 2.10, z_extrados + 0.55),
               "TRAVERSE SUPERIEURE ep. %.2f" % P.ep_traverse)
    vue.renvoi((-demi_int - P.ep_piedroit / 2.0, 0.75), (-demi_ext - 2.10, 1.35),
               "PIEDROIT ep. %.2f" % P.ep_piedroit, a_gauche=True)
    vue.renvoi((0.55, z_radier / 2.0), (demi_ext + 2.10, -0.75),
               "RADIER ep. %.2f" % P.ep_radier)
    vue.renvoi((-demi_int + P.gousset / 2.0, P.gousset / 2.0), (-demi_ext - 2.10, -0.55),
               "GOUSSET %.2f x %.2f" % (P.gousset, P.gousset), a_gauche=True)
    vue.renvoi((demi_proprete - 0.15, z_proprete + P.ep_beton_proprete / 2.0),
               (demi_ext + 2.10, -1.25),
               "BETON DE PROPRETE ep. %.2f" % P.ep_beton_proprete)
    vue.renvoi((-demi_ext - 0.75, 1.30), (-demi_ext - 2.10, 2.05),
               "REMBLAI CONTIGU COMPACTE A 95 %% OPM", a_gauche=True)
    vue.renvoi((1.60, z_plateforme - 0.12), (demi_ext + 2.10, z_plateforme + 0.60),
               "CORPS DE CHAUSSEE ep. %.2f" % P.ep_corps_chaussee)
    vue.texte((0.0, z_intrados / 2.0), "%.2f x %.2f" % (P.ouverture_largeur, P.ouverture_hauteur),
              H_REPERE * 1.3, "11_TEXTE", ah=1, av=2)
    return vue


# ------------------------------------- coupe A-A (axe hydraulique, 1:50)


def coupe_longitudinale(P, echelle=50):
    vue = Vue("coupe_aa", echelle, "COUPE A-A",
              "Coupe longitudinale suivant l'axe hydraulique - Ech. 1:%d" % echelle)
    demi = P.longueur_ouvrage / 2.0
    fe_amont, fe_aval = P.fil_eau(-demi), P.fil_eau(demi)
    z_plateforme_bord = P.cote_plateforme(demi)
    ep_tete = P.mur_tete_ep

    talus_amont = profil_talus(P, -1, -demi, z_plateforme_bord)
    talus_aval = profil_talus(P, +1, demi, z_plateforme_bord)
    y_min = talus_amont[-1][0] - 2.00
    y_max = talus_aval[-1][0] + 2.00

    # -- terrain naturel / lit du cours d'eau
    lit = [(y_min, P.fil_eau(y_min)), (y_max, P.fil_eau(y_max))]

    # -- enveloppe de l'ouvrage (trou dans le remblai)
    enveloppe = [
        (-demi, fe_amont - P.ep_radier - P.ep_beton_proprete),
        (demi, fe_aval - P.ep_radier - P.ep_beton_proprete),
        (demi, z_plateforme_bord), (demi - ep_tete, z_plateforme_bord),
        (demi - ep_tete, fe_aval + P.hauteur_extrados),
        (-demi + ep_tete, fe_amont + P.hauteur_extrados),
        (-demi + ep_tete, z_plateforme_bord), (-demi, z_plateforme_bord),
    ]
    remblai = (talus_amont[::-1] + [(-demi, z_plateforme_bord), (demi, z_plateforme_bord)]
               + talus_aval + [(talus_aval[-1][0], P.fil_eau(talus_aval[-1][0])),
                               (talus_amont[-1][0], P.fil_eau(talus_amont[-1][0]))])
    vue.symbole_remblai([remblai, enveloppe])

    vue.symbole_terrain([(y_min, P.fil_eau(y_min)), (talus_amont[-1][0], talus_amont[-1][1])])
    vue.symbole_terrain([(talus_aval[-1][0], talus_aval[-1][1]), (y_max, P.fil_eau(y_max))])
    vue.poly(talus_amont, "06_REMBLAI")
    vue.poly(talus_aval, "06_REMBLAI")

    # -- corps de chaussee et plateforme
    z_axe = P.cote_axe_chaussee
    dessus = [(-demi, z_plateforme_bord), (0.0, z_axe), (demi, z_plateforme_bord)]
    dessous = [(y, z - P.ep_corps_chaussee) for y, z in dessus]
    vue.poly(dessus, "07_CHAUSSEE")
    vue.poly(dessous, "07_CHAUSSEE")
    vue.poly([(-demi, z_plateforme_bord - 0.05), (0.0, z_axe - 0.05), (demi, z_plateforme_bord - 0.05)],
             "07_CHAUSSEE")
    vue.ligne((-demi, z_plateforme_bord), (-demi, z_plateforme_bord - P.ep_corps_chaussee), "07_CHAUSSEE")
    vue.ligne((demi, z_plateforme_bord), (demi, z_plateforme_bord - P.ep_corps_chaussee), "07_CHAUSSEE")

    # -- radier, traverse, murs de tete
    radier = [(-demi, fe_amont), (demi, fe_aval), (demi, fe_aval - P.ep_radier),
              (-demi, fe_amont - P.ep_radier)]
    traverse = [(-demi, fe_amont + P.ouverture_hauteur), (demi, fe_aval + P.ouverture_hauteur),
                (demi, fe_aval + P.hauteur_extrados), (-demi, fe_amont + P.hauteur_extrados)]
    tete_amont = [(-demi, fe_amont + P.hauteur_extrados), (-demi + ep_tete, fe_amont + P.hauteur_extrados),
                  (-demi + ep_tete, z_plateforme_bord), (-demi, z_plateforme_bord)]
    tete_aval = [(demi - ep_tete, fe_aval + P.hauteur_extrados), (demi, fe_aval + P.hauteur_extrados),
                 (demi, z_plateforme_bord), (demi - ep_tete, z_plateforme_bord)]
    proprete = [(-demi - P.debord_proprete, fe_amont - P.ep_radier - P.ep_beton_proprete),
                (demi + P.debord_proprete, fe_aval - P.ep_radier - P.ep_beton_proprete),
                (demi + P.debord_proprete, fe_aval - P.ep_radier),
                (-demi - P.debord_proprete, fe_amont - P.ep_radier)]

    # -- beches amont / aval
    beches = []
    for signe, fe in ((-1, fe_amont), (1, fe_aval)):
        y1 = signe * (demi + P.debord_proprete)
        y2 = y1 + signe * P.beche_largeur
        z_haut = fe - P.ep_radier - P.ep_beton_proprete
        beches.append([(min(y1, y2), z_haut - P.beche_hauteur), (max(y1, y2), z_haut - P.beche_hauteur),
                       (max(y1, y2), z_haut), (min(y1, y2), z_haut)])

    for contour in (proprete,) + tuple(beches):
        vue.poly(contour, BETON, ferme=True)
    vue.hachurer([proprete] + beches, 135.0, 2.4)
    for contour in (radier, traverse, tete_amont, tete_aval):
        vue.poly(contour, BETON, ferme=True)
    vue.hachure_beton([radier])
    vue.hachure_beton([traverse])
    vue.hachure_beton([tete_amont])
    vue.hachure_beton([tete_aval])

    # -- enrochement de protection
    longueur_enr = P.enrochement_longueur
    vue.enrochement(-demi - P.debord_proprete - P.beche_largeur - longueur_enr,
                    -demi - P.debord_proprete - P.beche_largeur,
                    fe_amont - P.enrochement_ep, P.enrochement_ep)
    vue.enrochement(demi + P.debord_proprete + P.beche_largeur,
                    demi + P.debord_proprete + P.beche_largeur + longueur_enr,
                    fe_aval - P.enrochement_ep, P.enrochement_ep)

    # -- murs en aile vus en elevation
    for signe, fe in ((-1, fe_amont), (1, fe_aval)):
        y_fin = signe * (demi + P.mur_aile_longueur * math.cos(math.radians(P.mur_aile_angle)))
        z_fin = z_plateforme_bord - abs(y_fin - signe * demi) / P.talus_remblai
        z_semelle = fe - P.mur_aile_fiche
        vue.poly([(signe * demi, z_plateforme_bord), (y_fin, z_fin),
                  (y_fin, z_semelle), (signe * demi, z_semelle)], VU)
        vue.poly([(y_fin, z_semelle), (y_fin, z_semelle - P.mur_aile_semelle_ep),
                  (signe * demi, z_semelle - P.mur_aile_semelle_ep), (signe * demi, z_semelle)],
                 CACHE)

    # -- dispositif de retenue
    for signe in (-1, 1):
        y = signe * (demi - 0.60)
        vue.ligne((y, z_plateforme_bord), (y, z_plateforme_bord + 0.75), "07_CHAUSSEE")
        vue.ligne((y - 0.25, z_plateforme_bord + 0.60), (y + 0.25, z_plateforme_bord + 0.60), "07_CHAUSSEE")

    # -- axes et repere de coupe B-B
    vue.axe_vertical(0.0, fe_amont - 1.40, z_axe + 1.00)
    vue.repere_coupe((0.0, fe_amont - 1.10), (0.0, z_axe + 0.70), "B")

    # -- cotation
    z_cote = min(P.fil_eau(y_min), fe_aval) - 1.70
    vue.cote_chaine_h([-demi, -P.largeur_chaussee / 2.0, P.largeur_chaussee / 2.0, demi],
                      z_cote, fe_amont - P.ep_radier - P.ep_beton_proprete - P.beche_hauteur)
    vue.cote_h(-demi, demi, z_cote - 0.60,
               fe_amont - P.ep_radier - P.ep_beton_proprete - P.beche_hauteur)
    vue.cote_h(talus_amont[-1][0], -demi, z_cote - 0.60, texte="TALUS 3/2")
    vue.cote_h(demi, talus_aval[-1][0], z_cote - 0.60, texte="TALUS 3/2")

    vue.cote_v(fe_amont, fe_amont + P.ouverture_hauteur, y_min + 1.10, -demi)
    vue.cote_v(fe_amont + P.hauteur_extrados, z_plateforme_bord, y_min + 1.10, -demi)

    # -- niveaux
    vue.niveau((-demi - 0.90, fe_amont), "%+.3f  F.E. AMONT" % fe_amont, a_gauche=True, longueur_mm=24.0)
    vue.niveau((demi + 0.90, fe_aval), "%+.3f  F.E. AVAL" % fe_aval, longueur_mm=24.0)
    vue.niveau((0.0, z_axe), "%+.3f  AXE CHAUSSEE" % z_axe, longueur_mm=26.0)

    # -- annotations
    vue.texte((-demi - 1.80, z_plateforme_bord + 1.20), "AMONT", H_REPERE * 1.4, "11_TEXTE", ah=1, av=2)
    vue.texte((demi + 1.80, z_plateforme_bord + 1.20), "AVAL", H_REPERE * 1.4, "11_TEXTE", ah=1, av=2)
    vue.texte((0.0, fe_amont - P.ep_radier - 0.55),
              "PENTE DU RADIER %.1f %% VERS L'AVAL" % (P.pente_radier * 100),
              H_NOTE, "11_TEXTE", ah=1, av=2)
    vue.fleche((1.80, fe_amont - P.ep_radier - 0.55), (0.90, fe_amont - P.ep_radier - 0.55))
    vue.renvoi((-demi + ep_tete / 2.0, z_plateforme_bord - 0.30),
               (-demi - 2.40, z_plateforme_bord + 0.60),
               "MUR DE TETE ep. %.2f" % ep_tete, a_gauche=True)
    vue.renvoi((-demi - 1.40, z_plateforme_bord - 1.10), (-demi - 3.40, z_plateforme_bord - 0.40),
               "MUR EN AILE (VU)", a_gauche=True)
    vue.renvoi((-demi - P.debord_proprete - P.beche_largeur / 2.0,
                fe_amont - P.ep_radier - P.ep_beton_proprete - P.beche_hauteur / 2.0),
               (-demi - 2.60, fe_amont - 1.30),
               "BECHE %.2f x %.2f" % (P.beche_largeur, P.beche_hauteur), a_gauche=True)
    vue.renvoi((demi + P.debord_proprete + P.beche_largeur + longueur_enr / 2.0,
                fe_aval - P.enrochement_ep / 2.0),
               (demi + 2.20, fe_aval - 1.30),
               "ENROCHEMENT ep. %.2f SUR %.2f m" % (P.enrochement_ep, longueur_enr))
    vue.renvoi((demi - 0.60, z_plateforme_bord + 0.60), (demi + 1.60, z_plateforme_bord + 1.90),
               "DISPOSITIF DE RETENUE (POUR MEMOIRE)")
    return vue


# ------------------------------------------------------ vue en plan (1:50)


def vue_en_plan(P, echelle=50):
    vue = Vue("plan", echelle, "VUE EN PLAN",
              "Traverse superieure arrachee - Ech. 1:%d" % echelle)
    demi_ext = P.largeur_exterieure / 2.0
    demi_int = P.ouverture_largeur / 2.0
    demi_long = P.longueur_ouvrage / 2.0
    angle = math.radians(P.mur_aile_angle)
    longueur_aile = P.mur_aile_longueur

    # -- murs en aile : quatre ailes evasees
    ailes = []
    for signe_y in (-1, 1):
        for signe_x in (-1, 1):
            depart = (signe_x * demi_int, signe_y * demi_long)
            direction = (signe_x * math.sin(angle), signe_y * math.cos(angle))
            fin = (depart[0] + direction[0] * longueur_aile,
                   depart[1] + direction[1] * longueur_aile)
            normale = (signe_x * math.cos(angle), -signe_y * math.sin(angle))
            for epaisseur, calque, ferme in ((P.mur_aile_ep_tete, BETON, True),):
                aile = [depart, fin,
                        (fin[0] + normale[0] * epaisseur, fin[1] + normale[1] * epaisseur),
                        (depart[0] + normale[0] * epaisseur, depart[1] + normale[1] * epaisseur)]
                vue.poly(aile, calque, ferme=ferme)
                vue.hachure_beton([aile])
            patin = P.mur_aile_patin
            arriere = P.mur_aile_semelle_largeur - patin
            semelle = [(depart[0] - normale[0] * patin, depart[1] - normale[1] * patin),
                       (fin[0] - normale[0] * patin, fin[1] - normale[1] * patin),
                       (fin[0] + normale[0] * arriere, fin[1] + normale[1] * arriere),
                       (depart[0] + normale[0] * arriere, depart[1] + normale[1] * arriere)]
            vue.poly(semelle, CACHE, ferme=True)
            ailes.append((depart, fin, normale))

    # -- cadre
    vue.rectangle(-demi_ext, -demi_long, demi_ext, demi_long, BETON)
    vue.rectangle(-demi_int, -demi_long, demi_int, demi_long, CACHE)
    for signe in (-1, 1):
        y = signe * (demi_long - P.mur_tete_ep)
        vue.ligne((-demi_ext, y), (demi_ext, y), BETON)
    vue.hachure_beton([[(-demi_ext, -demi_long), (demi_ext, -demi_long),
                        (demi_ext, demi_long), (-demi_ext, demi_long)],
                       [(-demi_int, -demi_long), (demi_int, -demi_long),
                        (demi_int, demi_long), (-demi_int, demi_long)]])

    # -- emprise de la route et pied de talus
    demi_chaussee = P.largeur_chaussee / 2.0
    x_route = demi_ext + longueur_aile * math.sin(angle) + 3.20
    for y, calque, ltype in ((-demi_long, "07_CHAUSSEE", None), (demi_long, "07_CHAUSSEE", None),
                             (-demi_chaussee, "07_CHAUSSEE", "TIRETS"),
                             (demi_chaussee, "07_CHAUSSEE", "TIRETS")):
        vue.ligne((-x_route, y), (x_route, y), calque, ltype)
    talus = profil_talus(P, -1, -demi_long, P.cote_plateforme(demi_long))
    debord = abs(talus[-1][0]) - demi_long
    for signe in (-1, 1):
        y_pied = signe * (demi_long + debord)
        for cote in (-1, 1):
            x_debut = cote * (demi_ext + longueur_aile * math.sin(angle) + 0.30)
            vue.ligne((x_debut, y_pied), (cote * x_route, y_pied), "05_TERRAIN")
            pas = 0.55
            x = x_debut
            while abs(x) < abs(cote * x_route):
                vue.ligne((x, y_pied), (x, signe * demi_long), "06_REMBLAI")
                x += cote * pas * 2
    vue.texte((x_route - 0.30, -demi_long - debord / 2.0), "PIED DE TALUS", H_COTE, "05_TERRAIN",
              ah=2, av=1)

    # -- axes
    vue.axe_horizontal(0.0, -x_route, x_route, "AXE ROUTE")
    vue.axe_vertical(0.0, -demi_long - debord - 1.60, demi_long + debord + 1.60)
    vue.texte((vue.mm(2.0), demi_long + debord + 2.40), "AXE HYDRAULIQUE", H_COTE, "01_AXES",
              rotation=90.0, ah=1, av=1)

    # -- sens d'ecoulement (place hors de l'ouvrage, cote aval)
    x_fleche = -(demi_ext + longueur_aile * math.sin(angle)) + 0.20
    y_fleche = demi_long + debord + 1.60
    vue.ligne((x_fleche, y_fleche - 1.60), (x_fleche, y_fleche), "13_EAU")
    vue.fleche((x_fleche, y_fleche), (x_fleche, y_fleche - 1.60), 4.0, 1.6)
    vue.texte((x_fleche - 0.30, y_fleche - 0.80), "SENS D'ECOULEMENT", H_COTE, "13_EAU",
              rotation=90.0, ah=1, av=3)

    # -- reperes de coupe
    vue.repere_coupe((-x_route + 0.40, 0.0), (x_route - 0.40, 0.0), "B", cote=-1.0)
    vue.repere_coupe((0.0, -demi_long - debord - 0.80), (0.0, demi_long + debord + 0.80), "A")

    # -- cotation
    y_cote = -demi_long - debord - 2.40
    vue.cote_chaine_h([-demi_ext, -demi_int, demi_int, demi_ext], y_cote, -demi_long)
    vue.cote_h(-demi_ext, demi_ext, y_cote - 0.80, -demi_long)
    x_cote = x_route + 0.90
    vue.cote_chaine_v([-demi_long, -demi_chaussee, demi_chaussee, demi_long], x_cote, demi_ext)
    vue.cote_v(-demi_long, demi_long, x_cote + 0.90, demi_ext)

    # -- annotations des ailes
    depart, fin, normale = ailes[0]
    milieu = ((depart[0] + fin[0]) / 2.0, (depart[1] + fin[1]) / 2.0)
    vue.renvoi(milieu, (-x_route - 0.20, -demi_long - 1.80),
               "MUR EN AILE L=%.2f" % longueur_aile, a_gauche=True)
    # angle de biais du mur en aile, mesure sur l'aile amont gauche
    angle_aile = 270.0 - P.mur_aile_angle
    vue.arc(depart, 1.00, angle_aile, 270.0, "10_COTATION")
    vue.ligne(depart, (depart[0], depart[1] - 1.30), "01_AXES")
    milieu_angle = math.radians(angle_aile + P.mur_aile_angle / 2.0)
    vue.texte((depart[0] + 1.45 * math.cos(milieu_angle), depart[1] + 1.45 * math.sin(milieu_angle)),
              "%.0f deg" % P.mur_aile_angle, H_COTE, "10_COTATION", ah=1, av=2)
    vue.renvoi((demi_int + P.ep_piedroit / 2.0, 1.60), (x_route + 0.30, 2.80),
               "SEMELLE D'AILE (VUE EN PLAN CACHEE)")
    vue.texte((0.0, 0.0), "%d x (%.2f x %.2f)" % (P.nombre_ouvertures, P.ouverture_largeur,
                                                  P.ouverture_hauteur),
              H_REPERE * 1.2, "11_TEXTE", ah=1, av=2)
    return vue


# =========================================================== FERRAILLAGE ====

ACIER = "08_ACIER_LONG"
ACIER_COUPE = "09_ACIER_COUPE"
BETON_FIN = "16_BETON_FIN"


def barre_coupe(vue, point, calque=ACIER_COUPE):
    """Armature vue en coupe : point plein."""
    rayon = vue.mm(0.75)
    x, y = point
    vue.solide((x - rayon, y - rayon), (x + rayon, y - rayon),
               (x - rayon, y + rayon), (x + rayon, y + rayon), calque)


def _lits_du_cadre(P):
    """Trace des deux lits d'armature du cadre et longueurs de retour."""
    from dessin import offset_polygone

    enrobage, enrobage_bas = P.enrobage, P.enrobage_fondation
    x_ext = P.largeur_exterieure / 2.0 - enrobage
    z_bas = -P.ep_radier + enrobage_bas
    z_haut = P.hauteur_extrados - enrobage
    recouvrement = 50 * P.diam_cadre / 1000.0
    retour = (z_haut - z_bas) / 2.0 + recouvrement / 2.0

    lit_ext = [(-x_ext, z_bas), (x_ext, z_bas), (x_ext, z_haut), (-x_ext, z_haut)]
    lit_int = offset_polygone(contour_interieur(P), enrobage)
    x_int = abs(lit_int[0][0])
    z_int_bas, z_int_haut = lit_int[1][1], lit_int[6][1]

    barres = {
        1: [(-x_ext, z_bas + retour), (-x_ext, z_bas), (x_ext, z_bas), (x_ext, z_bas + retour)],
        2: [(-x_ext, z_haut - retour), (-x_ext, z_haut), (x_ext, z_haut), (x_ext, z_haut - retour)],
        3: ([(-x_int, z_int_bas + retour)] + [lit_int[0], lit_int[1], lit_int[2], lit_int[3]]
            + [(x_int, z_int_bas + retour)]),
        4: ([(-x_int, z_int_haut - retour)] + [lit_int[7], lit_int[6], lit_int[5], lit_int[4]]
            + [(x_int, z_int_haut - retour)]),
    }
    return barres, lit_ext, lit_int, retour, recouvrement


def ferraillage_cadre(P, echelle=20):
    vue = Vue("ferraillage_cadre", echelle, "COUPE C-C - FERRAILLAGE DU CADRE",
              "Ech. 1:%d - aciers HA %s" % (echelle, P.acier_nuance))
    barres, lit_ext, lit_int, retour, recouvrement = _lits_du_cadre(P)
    demi_ext = P.largeur_exterieure / 2.0
    z_extrados = P.hauteur_extrados

    # -- beton en trait fin
    vue.poly(contour_exterieur(P), BETON_FIN, ferme=True)
    vue.poly(contour_interieur(P), BETON_FIN, ferme=True)

    # -- aciers transversaux (vus en vraie grandeur)
    for repere in (1, 2, 3, 4):
        vue.poly(barres[repere], ACIER)

    # -- aciers longitudinaux vus en coupe
    from dessin import semer_points
    for contour in (lit_ext, lit_int):
        for point in semer_points(contour + [contour[0]], P.espacement_repartition, 0.10):
            barre_coupe(vue, point)

    # -- filants d'angle dans les goousets
    for indice, (a, b) in enumerate(((0, 1), (2, 3), (4, 5), (6, 7))):
        pa, pb = lit_int[a], lit_int[b]
        milieu = ((pa[0] + pb[0]) / 2.0, (pa[1] + pb[1]) / 2.0)
        centre = (0.0, P.ouverture_hauteur / 2.0)
        dx, dy = milieu[0] - centre[0], milieu[1] - centre[1]
        norme = math.hypot(dx, dy) or 1.0
        base = (milieu[0] + dx / norme * 0.07, milieu[1] + dy / norme * 0.07)
        tangente = (-dy / norme, dx / norme)
        for signe in (-1, 1):
            barre_coupe(vue, (base[0] + tangente[0] * signe * 0.06,
                              base[1] + tangente[1] * signe * 0.06), ACIER)

    # -- zone de recouvrement
    z_lap_bas = barres[2][0][1]
    z_lap_haut = barres[1][0][1]
    vue.cote_v(z_lap_bas, z_lap_haut, -demi_ext - 0.55, -demi_ext,
               texte="RECOUVR. %.2f = 50 %%%%c" % recouvrement)

    # -- cotation et niveaux
    vue.cote_chaine_h([-demi_ext, -P.ouverture_largeur / 2.0, P.ouverture_largeur / 2.0, demi_ext],
                      -P.ep_radier - 0.40, -P.ep_radier)
    vue.cote_chaine_v([-P.ep_radier, 0.0, P.ouverture_hauteur, z_extrados],
                      demi_ext + 0.40, demi_ext)

    # -- reperes
    vue.renvoi((0.0, barres[2][1][1]), (demi_ext + 1.30, z_extrados + 0.55),
               "2 - %d HA%d %s" % (61, P.diam_cadre, "e=15"))
    vue.renvoi((0.0, barres[1][1][1]), (demi_ext + 1.30, -P.ep_radier - 0.85),
               "1 - %d HA%d e=15" % (61, P.diam_cadre))
    vue.renvoi((0.30, barres[4][2][1]), (demi_ext + 1.30, z_extrados - 0.35),
               "4 - %d HA%d e=15" % (61, P.diam_cadre))
    vue.renvoi((0.30, barres[3][2][1]), (demi_ext + 1.30, -P.ep_radier - 0.35),
               "3 - %d HA%d e=15" % (61, P.diam_cadre))
    vue.renvoi((-demi_ext + P.enrobage, 1.10), (-demi_ext - 1.30, z_extrados + 0.20),
               "6 - HA%d e=%.0f (filants)" % (P.diam_repartition, P.espacement_repartition * 100),
               a_gauche=True)
    vue.renvoi((lit_int[0][0] - 0.09, lit_int[0][1] - 0.05), (-demi_ext - 1.30, -0.75),
               "5 - 2 HA%d par gousset" % P.diam_gousset, a_gauche=True)
    vue.texte((0.0, P.ouverture_hauteur / 2.0 + 0.30),
              "ENROBAGE %.0f cm" % (P.enrobage * 100), H_NOTE, "11_TEXTE", ah=1, av=2)
    vue.texte((0.0, P.ouverture_hauteur / 2.0),
              "(%.0f cm AU CONTACT DU SOL)" % (P.enrobage_fondation * 100), H_NOTE,
              "11_TEXTE", ah=1, av=2)
    return vue


def detail_gousset(P, echelle=10):
    vue = Vue("detail_gousset", echelle, "DETAIL 1 - GOUSSET ET ENROBAGE",
              "Angle inferieur gauche - Ech. 1:%d" % echelle)
    barres, lit_ext, lit_int, retour, _ = _lits_du_cadre(P)
    demi_ext = P.largeur_exterieure / 2.0
    demi_int = P.ouverture_largeur / 2.0
    gousset = P.gousset

    x_min, x_max = -demi_ext - 0.12, -demi_int + 0.55
    z_min, z_max = -P.ep_radier - 0.12, 0.62

    # -- beton
    vue.poly([(-demi_ext, z_max), (-demi_ext, -P.ep_radier), (x_max, -P.ep_radier)], BETON)
    vue.poly([(-demi_int, z_max), (-demi_int, gousset), (-demi_int + gousset, 0.0), (x_max, 0.0)],
             BETON)
    vue.hachure_beton([[(-demi_ext, z_max), (-demi_ext, -P.ep_radier), (x_max, -P.ep_radier),
                        (x_max, 0.0), (-demi_int + gousset, 0.0), (-demi_int, gousset),
                        (-demi_int, z_max)]])
    vue.ligne((x_max, z_max), (x_max, -P.ep_radier), "03_BETON_CACHE")

    # -- aciers
    vue.poly([(lit_ext[0][0], z_max), (lit_ext[0][0], lit_ext[0][1]), (x_max, lit_ext[0][1])], ACIER)
    vue.poly([(lit_int[0][0], z_max), lit_int[0], lit_int[1], (x_max, lit_int[1][1])], ACIER)
    pa, pb = lit_int[0], lit_int[1]
    milieu = ((pa[0] + pb[0]) / 2.0, (pa[1] + pb[1]) / 2.0)
    for signe in (-1, 1):
        barre_coupe(vue, (milieu[0] - 0.049 + signe * 0.042, milieu[1] - 0.049 - signe * 0.042), ACIER)

    # -- cotation
    vue.cote_h(-demi_int, -demi_int + gousset, 0.30, 0.0)
    vue.cote_v(0.0, gousset, -demi_int - 0.34, -demi_int, a_gauche=False)
    vue.cote_h(-demi_ext, lit_ext[0][0], z_max - 0.06, texte="%.0f" % (P.enrobage * 100), unite="cm")
    vue.cote_v(-P.ep_radier, lit_ext[0][1], x_max - 0.10, x_max,
               texte="%.0f" % (P.enrobage_fondation * 100))
    vue.cote_h(-demi_ext, -demi_int, z_min + 0.06, -P.ep_radier)
    vue.cote_v(-P.ep_radier, 0.0, x_min + 0.06, -demi_ext)

    vue.renvoi(((-demi_int - 0.10 + -demi_int + gousset) / 2.0, 0.10), (x_max - 0.05, 0.50),
               "5 - 2 HA%d FILANTS" % P.diam_gousset)
    vue.texte(((x_min + x_max) / 2.0, z_min - 0.10),
              "GOUSSET %.2f x %.2f A 45 deg" % (gousset, gousset), H_NOTE, "11_TEXTE", ah=1, av=3)
    return vue


def mur_en_aile(P, echelle=25):
    vue = Vue("mur_aile", echelle, "MUR EN AILE - COUPE TYPE ET ELEVATION",
              "Ech. 1:%d - 4 murs identiques" % echelle)
    largeur = P.mur_aile_semelle_largeur
    patin = P.mur_aile_patin
    ep_pied, ep_tete = P.mur_aile_ep_pied, P.mur_aile_ep_tete
    ep_semelle = P.mur_aile_semelle_ep
    hauteur = P.cote_plateforme(P.longueur_ouvrage / 2.0) + P.mur_aile_fiche
    enrobage = P.enrobage
    x_arriere = patin + ep_pied

    # ---------------------------------------------------------- coupe type
    semelle = [(0.0, -ep_semelle), (largeur, -ep_semelle), (largeur, 0.0), (0.0, 0.0)]
    voile = [(patin, 0.0), (x_arriere, 0.0), (x_arriere, hauteur),
             (x_arriere - ep_tete, hauteur)]
    vue.poly(semelle, BETON, ferme=True)
    vue.poly(voile, BETON, ferme=True)
    vue.hachure_beton([semelle])
    vue.hachure_beton([voile])

    # terrain et remblai
    vue.symbole_terrain([(-1.30, P.mur_aile_fiche), (patin - 0.02, P.mur_aile_fiche)])
    remblai = [(x_arriere, 0.0), (largeur + 1.40, 0.0), (largeur + 1.40, hauteur),
               (x_arriere, hauteur)]
    vue.symbole_remblai([remblai])
    vue.poly([(x_arriere, hauteur), (largeur + 1.40, hauteur)], "06_REMBLAI")
    vue.hachurer([[(x_arriere, 0.0), (x_arriere + 0.30, 0.0), (x_arriere + 0.30, hauteur),
                   (x_arriere, hauteur)]], 90.0, 1.4, "14_ENROCHEMENT")

    # barbacanes
    for niveau in (0.90, hauteur - 0.80):
        vue.ligne((patin - 0.05, niveau + 0.05), (x_arriere + 0.32, niveau), "07_CHAUSSEE")
        vue.ligne((patin - 0.05, niveau - 0.05), (x_arriere + 0.32, niveau - 0.10), "07_CHAUSSEE")

    # aciers
    face_terre = x_arriere - enrobage
    face_vue = patin + enrobage + 0.03
    vue.poly([(largeur - P.enrobage_fondation, -ep_semelle + P.enrobage_fondation),
              (face_terre, -ep_semelle + P.enrobage_fondation),
              (face_terre, hauteur - enrobage)], ACIER)
    vue.poly([(face_vue, 0.10), (face_vue + 0.02, hauteur * 0.85)], ACIER)
    vue.poly([(P.enrobage_fondation, -ep_semelle + P.enrobage_fondation),
              (P.enrobage_fondation, -P.enrobage_fondation),
              (largeur - P.enrobage_fondation, -P.enrobage_fondation)], ACIER)
    from dessin import semer_points
    for point in semer_points([(face_terre, 0.10), (face_terre, hauteur - 0.10)], 0.20):
        barre_coupe(vue, point)
    for point in semer_points([(face_vue, 0.10), (face_vue, hauteur * 0.80)], 0.20):
        barre_coupe(vue, point)

    # cotation
    vue.cote_chaine_h([0.0, patin, x_arriere, largeur], -ep_semelle - 0.45, -ep_semelle)
    vue.cote_h(0.0, largeur, -ep_semelle - 0.95, -ep_semelle)
    vue.cote_v(-ep_semelle, 0.0, -0.45, 0.0)
    vue.cote_v(0.0, hauteur, -0.45, 0.0)
    vue.cote_h(x_arriere - ep_tete, x_arriere, hauteur + 0.35, hauteur)
    vue.niveau((-1.10, P.mur_aile_fiche), "T.N. / FIL D'EAU", a_gauche=False, longueur_mm=14.0)

    vue.renvoi((face_terre, hauteur * 0.55), (largeur + 1.70, hauteur * 0.80),
               "7 - HA%d e=%.0f" % (P.diam_mur, P.espacement_mur * 100))
    vue.renvoi((face_vue, hauteur * 0.45), (largeur + 1.70, hauteur * 0.45),
               "8 - HA10 e=20  /  9 - HA10 e=20")
    vue.renvoi((largeur / 2.0, -ep_semelle + 0.10), (largeur + 1.70, -ep_semelle - 0.35),
               "10 - HA%d e=15  /  11 - HA10 e=20" % P.diam_mur)
    vue.renvoi((x_arriere + 0.15, 1.60), (largeur + 1.70, 1.55),
               "MATERIAU DRAINANT + GEOTEXTILE")
    vue.renvoi((x_arriere + 0.10, 0.88), (largeur + 1.70, 0.55),
               "BARBACANE PVC %%c100 e=2.00 m")
    vue.texte((largeur / 2.0, -ep_semelle - 1.45), "COUPE TYPE", H_SOUS_TITRE, "11_TEXTE",
              ah=1, av=1)

    # ------------------------------------------------------------ elevation
    decalage = largeur + 4.60
    longueur_aile = P.mur_aile_longueur
    hauteur_fin = 0.60
    contour = [(decalage, 0.0), (decalage, hauteur), (decalage + longueur_aile, hauteur_fin),
               (decalage + longueur_aile, 0.0)]
    vue.poly(contour, BETON, ferme=True)
    vue.hachurer([contour], 45.0, 6.0, "04_HACHURES")
    semelle_elevation = [(decalage - 0.10, -ep_semelle), (decalage + longueur_aile + 0.10, -ep_semelle),
                         (decalage + longueur_aile + 0.10, 0.0), (decalage - 0.10, 0.0)]
    vue.poly(semelle_elevation, BETON, ferme=True)
    vue.hachure_beton([semelle_elevation])

    nombre = int(longueur_aile / P.espacement_mur) + 1
    for indice in range(nombre):
        x = decalage + indice * P.espacement_mur
        if x > decalage + longueur_aile:
            break
        z = hauteur - (hauteur - hauteur_fin) * (x - decalage) / longueur_aile
        vue.ligne((x, -ep_semelle + P.enrobage_fondation), (x, z - enrobage), ACIER)
    niveau = 0.20
    while niveau < hauteur:
        x_fin = decalage + longueur_aile * min(1.0, (hauteur - niveau) / (hauteur - hauteur_fin))
        vue.ligne((decalage + enrobage, niveau), (x_fin - enrobage, niveau), ACIER)
        niveau += 0.20

    vue.cote_h(decalage, decalage + longueur_aile, -ep_semelle - 0.45, -ep_semelle)
    vue.cote_v(0.0, hauteur, decalage - 0.45, decalage)
    vue.cote_v(0.0, hauteur_fin, decalage + longueur_aile + 0.45, decalage + longueur_aile,
               a_gauche=False)
    vue.texte((decalage + longueur_aile / 2.0, -ep_semelle - 1.45),
              "ELEVATION DEVELOPPEE - ARASE SUIVANT TALUS 3/2", H_SOUS_TITRE, "11_TEXTE",
              ah=1, av=1)
    return vue


def plan_ferraillage_traverse(P, echelle=50):
    vue = Vue("plan_ferraillage", echelle, "PLAN DE FERRAILLAGE - TRAVERSE SUPERIEURE",
              "Lit superieur - Ech. 1:%d" % echelle)
    demi_ext = P.largeur_exterieure / 2.0
    demi_long = P.longueur_ouvrage / 2.0
    enrobage = P.enrobage

    vue.rectangle(-demi_ext, -demi_long, demi_ext, demi_long, BETON_FIN)
    vue.rectangle(-P.ouverture_largeur / 2.0, -demi_long, P.ouverture_largeur / 2.0, demi_long,
                  "03_BETON_CACHE")

    nombre = int(P.longueur_ouvrage / P.espacement_cadre) + 1
    for indice in range(nombre):
        y = -demi_long + enrobage + indice * P.espacement_cadre
        if y > demi_long - enrobage:
            break
        vue.ligne((-demi_ext + enrobage, y), (demi_ext - enrobage, y), ACIER)
    x = -demi_ext + enrobage
    while x <= demi_ext - enrobage:
        vue.ligne((x, -demi_long + enrobage), (x, demi_long - enrobage), ACIER)
        x += P.espacement_repartition

    vue.cote_h(-demi_ext, demi_ext, -demi_long - 0.70, -demi_long)
    vue.cote_v(-demi_long, demi_long, demi_ext + 0.70, demi_ext)
    vue.renvoi((0.60, demi_long - 0.60), (demi_ext + 2.20, demi_long + 0.40),
               "2 - %d HA%d e=%.0f" % (nombre, P.diam_cadre, P.espacement_cadre * 100))
    vue.renvoi((-0.60, -demi_long + 1.20), (-demi_ext - 2.20, -demi_long + 0.40),
               "6 - HA%d e=%.0f" % (P.diam_repartition, P.espacement_repartition * 100),
               a_gauche=True)
    vue.texte((0.0, 0.0), "LIT SUPERIEUR", H_NOTE, "11_TEXTE", rotation=90.0, ah=1, av=2)
    return vue
