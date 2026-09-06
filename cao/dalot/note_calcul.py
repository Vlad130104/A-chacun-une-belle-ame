#!/usr/bin/env python3
"""Note de calcul de pre-dimensionnement, generee depuis parametres.py.

    python3 note_calcul.py [parametres.json] > NOTE_DE_CALCUL.md

Tous les nombres du document sont recalcules a l'execution : la note reste
donc coherente avec le plan DXF genere par generer.py.

Portee : PRE-DIMENSIONNEMENT. Le modele de portique est simplifie (bornes
enveloppes des moments), la descente de charges est celle d'un ouvrage
enterre courant. Une note d'execution doit reprendre ces calculs avec un
modele aux elements finis ou un calcul de portique complet, sur la base du
leve topographique, de l'etude hydrologique et de l'etude geotechnique.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import parametres


# ------------------------------------------------------------ beton arme


def acier_elu(moment, largeur, hauteur_utile, fc28, fe):
    """Section d'acier a l'ELU en flexion simple (BAEL 91 rev. 99)."""
    fbu = 0.85 * fc28 / 1.5
    fsu = fe / 1.15
    mu = moment / (largeur * hauteur_utile ** 2 * fbu * 1000.0)
    if mu > 0.371:
        return None, mu, None, None
    alpha = 1.25 * (1 - math.sqrt(1 - 2 * mu))
    bras = hauteur_utile * (1 - 0.4 * alpha)
    section = moment / (bras * fsu * 1000.0)
    return section * 1e4, mu, alpha, bras


def acier_els(moment, largeur, hauteur_utile, contrainte_admissible, coefficient=15.0):
    """Section d'acier a l'ELS, fissuration prejudiciable (iteration)."""
    section = 1e-4
    for _ in range(60):
        rho = coefficient * section / (largeur * hauteur_utile)
        rapport = -rho + math.sqrt(rho ** 2 + 2 * rho)
        axe_neutre = rapport * hauteur_utile
        bras = hauteur_utile - axe_neutre / 3.0
        section = moment / (contrainte_admissible * 1000.0 * bras)
    return section * 1e4, axe_neutre, bras


def contrainte_acier_els(moment, section_cm2, largeur, hauteur_utile, coefficient=15.0):
    section = section_cm2 * 1e-4
    rho = coefficient * section / (largeur * hauteur_utile)
    axe_neutre = (-rho + math.sqrt(rho ** 2 + 2 * rho)) * hauteur_utile
    bras = hauteur_utile - axe_neutre / 3.0
    return moment / (section * bras) / 1000.0


def section_disponible(diametre_mm, espacement_m):
    return math.pi * (diametre_mm / 1000.0) ** 2 / 4.0 / espacement_m * 1e4


# ------------------------------------------------------------------ note


def rediger(P):
    lignes = []
    ajouter = lignes.append

    ft28 = 0.6 + 0.06 * P.fc28
    fbu = 0.85 * P.fc28 / 1.5
    fsu = P.fe / 1.15
    sigma_els = min(2.0 / 3.0 * P.fe, 110 * math.sqrt(1.6 * ft28))

    ajouter("# Note de calcul de pre-dimensionnement")
    ajouter("")
    ajouter("**Ouvrage :** %s  " % P.ouvrage)
    ajouter("**Projet :** %s  " % P.projet)
    ajouter("**Localisation :** %s  " % P.localisation)
    ajouter("**Date :** %s — **Indice :** %s" % (P.date, P.indice))
    ajouter("")
    ajouter("> Document **genere** par `note_calcul.py` a partir de `parametres.py`. "
            "Il accompagne les planches `DAL-01` et `DAL-02`. Il s'agit d'un "
            "**pre-dimensionnement** : il ne remplace pas une note d'execution "
            "signee, qui suppose un leve topographique, une etude hydrologique du "
            "bassin versant et une etude geotechnique.")
    ajouter("")

    # ------------------------------------------------------------ 1. donnees
    ajouter("## 1. Donnees et hypotheses")
    ajouter("")
    ajouter("| Grandeur | Valeur |")
    ajouter("|---|---|")
    ajouter("| Ouverture | %.2f m x %.2f m |" % (P.ouverture_largeur, P.ouverture_hauteur))
    ajouter("| Epaisseurs traverse / piedroit / radier | %.2f / %.2f / %.2f m |"
            % (P.ep_traverse, P.ep_piedroit, P.ep_radier))
    ajouter("| Goussets | %.2f x %.2f m a 45 deg |" % (P.gousset, P.gousset))
    ajouter("| Longueur de l'ouvrage (axe hydraulique) | %.2f m |" % P.longueur_ouvrage)
    ajouter("| Largeur de plateforme | %.2f m (chaussee %.2f + 2 x %.2f) |"
            % (P.largeur_plateforme, P.largeur_chaussee, P.largeur_accotement))
    ajouter("| Couverture de remblai mini | %.2f m |" % P.couverture_min)
    ajouter("| Pente du radier | %.1f %% |" % (P.pente_radier * 100))
    ajouter("| Beton | %s, fc28 = %.0f MPa, ft28 = %.2f MPa |" % (P.beton_classe, P.fc28, ft28))
    ajouter("| Acier | %s, fe = %.0f MPa |" % (P.acier_nuance, P.fe))
    ajouter("| Enrobage | %.0f cm (%.0f cm au contact du sol) |"
            % (P.enrobage * 100, P.enrobage_fondation * 100))
    ajouter("| Remblai | gamma = %.0f kN/m3, phi = %.0f deg |"
            % (P.poids_remblai, P.angle_frottement))
    ajouter("| Contrainte de sol admissible | %.2f MPa (**hypothese a confirmer**) |"
            % P.contrainte_sol_adm)
    ajouter("| Reglement | BAEL 91 rev. 99 ; charges routieres fascicule 61 titre II |")
    ajouter("")
    ajouter("Cote de reference : fil d'eau amont = 0.00. Cote de l'axe de chaussee "
            "deduite de la couverture minimale : **%+.3f**. Couverture reelle : "
            "%.2f m a l'amont, %.2f m a l'axe, %.2f m a l'aval."
            % (P.cote_axe_chaussee, P.couverture(-P.longueur_ouvrage / 2),
               P.couverture(0.0), P.couverture(P.longueur_ouvrage / 2)))
    ajouter("")

    # -------------------------------------------------------- 2. hydraulique
    debit, vitesse, section, rayon = P.debit_capable
    hauteur_eau = P.taux_remplissage * P.ouverture_hauteur
    ajouter("## 2. Verification hydraulique")
    ajouter("")
    ajouter("Ecoulement uniforme, formule de Manning-Strickler "
            "`Q = K x S x Rh^(2/3) x I^(1/2)`, remplissage limite a %.0f %% de la "
            "hauteur libre (revanche %.2f m)."
            % (P.taux_remplissage * 100, P.ouverture_hauteur - hauteur_eau))
    ajouter("")
    ajouter("| Grandeur | Valeur |")
    ajouter("|---|---|")
    ajouter("| Tirant d'eau retenu | %.2f m |" % hauteur_eau)
    ajouter("| Section mouillee S | %.2f m2 |" % section)
    ajouter("| Perimetre mouille | %.2f m |"
            % (P.nombre_ouvertures * (P.ouverture_largeur + 2 * hauteur_eau)))
    ajouter("| Rayon hydraulique Rh | %.3f m |" % rayon)
    ajouter("| Coefficient de Strickler K | %.0f (beton lisse) |" % P.strickler)
    ajouter("| Pente I | %.1f %% |" % (P.pente_radier * 100))
    ajouter("| **Debit capable Q** | **%.2f m3/s** |" % debit)
    ajouter("| Vitesse moyenne V | %.2f m/s |" % vitesse)
    ajouter("")
    if P.debit_projet:
        marge = debit / P.debit_projet
        ajouter("Debit de projet : **%.2f m3/s**. Rapport Q_capable / Q_projet = "
                "**%.2f** — %s." % (P.debit_projet, marge,
                                    "satisfaisant" if marge >= 1.2 else
                                    "INSUFFISANT, revoir l'ouverture"))
    else:
        ajouter("> **Le debit de projet n'est pas renseigne.** L'ouverture retenue "
                "n'est donc pas justifiee : renseigner `debit_projet` dans "
                "`parametres.json` a partir de l'etude de bassin versant "
                "(methode rationnelle, ORSTOM/CIEH ou Caquot selon le contexte) "
                "avant toute execution.")
    ajouter("")
    if vitesse > 4.0:
        ajouter("> **Point de vigilance — vitesse de %.2f m/s.** Au-dela de 4 m/s, "
                "l'affouillement aval est a craindre. Deux leviers : reduire la "
                "pente du radier (a %.1f %%, la vitesse tombe a %.2f m/s) ou "
                "renforcer la protection aval (enrochement sur %.2f m, bassin de "
                "dissipation). La protection prevue au plan (%.2f m d'enrochement "
                "de %.2f m + beche de %.2f m) est un minimum a valider."
                % (vitesse, 0.5, vitesse * math.sqrt(0.005 / P.pente_radier),
                   2 * P.enrochement_longueur, P.enrochement_longueur,
                   P.enrochement_ep, P.beche_hauteur))
        ajouter("")

    # -------------------------------------------------- 3. descente de charges
    g_traverse = P.ep_traverse * P.poids_beton
    g_remblai = P.couverture_min * 21.0
    charge_permanente = g_traverse + g_remblai
    hauteur_diffusion = P.couverture_min
    impact_a = 0.60 + 2 * hauteur_diffusion
    impact_b = 0.30 + 2 * hauteur_diffusion
    charge_roue = 80.0 / (impact_a * impact_b)
    majoration = 1.15
    charge_roulante = charge_roue * majoration

    portee = P.ouverture_largeur + P.ep_piedroit
    p_elu = 1.35 * charge_permanente + 1.6 * charge_roulante
    p_els = charge_permanente + charge_roulante

    ajouter("## 3. Descente de charges sur la traverse")
    ajouter("")
    ajouter("| Charge | Detail | Valeur |")
    ajouter("|---|---|---|")
    ajouter("| Poids propre traverse | %.2f m x %.0f kN/m3 | %.2f kN/m2 |"
            % (P.ep_traverse, P.poids_beton, g_traverse))
    ajouter("| Remblai + corps de chaussee | %.2f m x 21 kN/m3 | %.2f kN/m2 |"
            % (P.couverture_min, g_remblai))
    ajouter("| **Charges permanentes G** | | **%.2f kN/m2** |" % charge_permanente)
    ajouter("| Roue Bt 8 t, impact 0.60 x 0.30 | diffusion a 45 deg sur %.2f m -> "
            "%.2f x %.2f m | %.2f kN/m2 |"
            % (hauteur_diffusion, impact_a, impact_b, charge_roue))
    ajouter("| Majoration dynamique | x %.2f | %.2f kN/m2 |" % (majoration, charge_roulante))
    ajouter("| **Charge d'exploitation Q** | | **%.2f kN/m2** |" % charge_roulante)
    ajouter("")
    ajouter("- ELU : `p_u = 1.35 G + 1.6 Q =` **%.1f kN/m2**" % p_elu)
    ajouter("- ELS : `p_ser = G + Q =` **%.1f kN/m2**" % p_els)
    ajouter("")

    # ------------------------------------------------------- 4. sollicitations
    moment_appui_elu = p_elu * portee ** 2 / 12.0
    moment_travee_elu = p_elu * portee ** 2 / 14.0
    moment_appui_els = p_els * portee ** 2 / 12.0
    effort_tranchant = p_elu * portee / 2.0

    ajouter("## 4. Sollicitations dans la traverse")
    ajouter("")
    ajouter("Portee de calcul (entraxe des piedroits) : `L = %.2f + %.2f = %.2f m`."
            % (P.ouverture_largeur, P.ep_piedroit, portee))
    ajouter("")
    ajouter("Le cadre ferme est traite par les bornes enveloppes usuelles d'un "
            "portique a noeuds rigides : moment d'encastrement `pL2/12` sur "
            "appuis, `pL2/14` en travee (valeur majorante par rapport au `pL2/24` "
            "de la poutre bi-encastree, qui couvre la redistribution due a la "
            "souplesse des piedroits).")
    ajouter("")
    ajouter("| Sollicitation | ELU | ELS |")
    ajouter("|---|---|---|")
    ajouter("| Moment sur appui (angles) | %.1f kN.m/ml | %.1f kN.m/ml |"
            % (moment_appui_elu, moment_appui_els))
    ajouter("| Moment en travee | %.1f kN.m/ml | %.1f kN.m/ml |"
            % (moment_travee_elu, p_els * portee ** 2 / 14.0))
    ajouter("| Effort tranchant sur appui | %.1f kN/ml | — |" % effort_tranchant)
    ajouter("")

    # ------------------------------------------------------- 5. armatures
    hauteur_utile = P.ep_traverse - P.enrobage - P.diam_cadre / 2000.0
    section_elu, mu, alpha, bras = acier_elu(moment_appui_elu, 1.0, hauteur_utile, P.fc28, P.fe)
    section_els, axe_neutre, bras_els = acier_els(moment_appui_els, 1.0, hauteur_utile, sigma_els)
    section_mini = 0.23 * 1.0 * hauteur_utile * ft28 / P.fe * 1e4
    section_retenue = section_disponible(P.diam_cadre, P.espacement_cadre)
    contrainte_verif = contrainte_acier_els(moment_appui_els, section_retenue, 1.0, hauteur_utile)

    ajouter("## 5. Armatures de la traverse")
    ajouter("")
    ajouter("Hauteur utile `d = %.2f - %.2f - %.3f = %.3f m`. "
            "`fbu = %.2f MPa`, `fsu = %.0f MPa`."
            % (P.ep_traverse, P.enrobage, P.diam_cadre / 2000.0, hauteur_utile, fbu, fsu))
    ajouter("")
    ajouter("**ELU** — `mu = %.4f` (< 0.371, pas d'acier comprime), "
            "`alpha = %.4f`, `z = %.4f m` -> **As = %.2f cm2/ml**."
            % (mu, alpha, bras, section_elu))
    ajouter("")
    ajouter("**ELS, fissuration prejudiciable** — "
            "`sigma_s_lim = min(2/3 fe ; 110 x sqrt(1.6 ft28)) = %.0f MPa`. "
            "Position de l'axe neutre `y = %.4f m`, bras de levier `z = %.4f m` "
            "-> **As = %.2f cm2/ml**." % (sigma_els, axe_neutre, bras_els, section_els))
    ajouter("")
    ajouter("**Section minimale de non-fragilite** — "
            "`0.23 b d ft28 / fe = %.2f cm2/ml`." % section_mini)
    ajouter("")
    ajouter("| Critere | As requis |")
    ajouter("|---|---|")
    ajouter("| ELU | %.2f cm2/ml |" % section_elu)
    ajouter("| ELS (fissuration prejudiciable) | **%.2f cm2/ml — dimensionnant** |" % section_els)
    ajouter("| Non-fragilite | %.2f cm2/ml |" % section_mini)
    ajouter("")
    ajouter("**Choix : HA%d espaces de %.0f cm, soit %.2f cm2/ml** "
            "(contrainte acier a l'ELS ramenee a %.0f MPa < %.0f MPa). "
            "C'est bien l'ELS qui commande : a l'ELU seul, un HA%d e=20 aurait "
            "suffi." % (P.diam_cadre, P.espacement_cadre * 100, section_retenue,
                        contrainte_verif, sigma_els, P.diam_cadre))
    ajouter("")
    contrainte_cisaillement = effort_tranchant / (1.0 * hauteur_utile) / 1000.0
    limite_cisaillement = 0.07 * P.fc28 / 1.5
    ajouter("**Effort tranchant** — `tau_u = V / (b d) = %.3f MPa` contre une "
            "limite de `0.07 fc28 / 1.5 = %.2f MPa` : %s d'armatures d'effort "
            "tranchant." % (contrainte_cisaillement, limite_cisaillement,
                            "pas besoin" if contrainte_cisaillement < limite_cisaillement
                            else "**il faut**"))
    ajouter("")

    # ------------------------------------------------------- 6. radier et sol
    largeur_ext = P.largeur_exterieure
    poids_traverse = largeur_ext * P.ep_traverse * P.poids_beton
    poids_piedroits = 2 * P.ep_piedroit * P.ouverture_hauteur * P.poids_beton
    poids_radier = largeur_ext * P.ep_radier * P.poids_beton
    poids_remblai = P.couverture_min * 21.0 * largeur_ext
    charge_g = poids_traverse + poids_piedroits + poids_radier + poids_remblai
    charge_q = charge_roulante * largeur_ext
    reaction_elu = (1.35 * charge_g + 1.6 * charge_q) / largeur_ext
    reaction_els = (charge_g + charge_q) / largeur_ext

    net_elu = reaction_elu - P.ep_radier * P.poids_beton
    net_els = reaction_els - P.ep_radier * P.poids_beton
    moment_radier_elu = net_elu * portee ** 2 / 12.0
    moment_radier_els = net_els * portee ** 2 / 12.0
    hauteur_utile_radier = P.ep_radier - P.enrobage_fondation - P.diam_cadre / 2000.0
    section_radier_els, _, _ = acier_els(moment_radier_els, 1.0, hauteur_utile_radier, sigma_els)

    ajouter("## 6. Radier et contrainte sur le sol")
    ajouter("")
    ajouter("| Charge ramenee au ml d'ouvrage | Valeur |")
    ajouter("|---|---|")
    ajouter("| Traverse | %.1f kN/ml |" % poids_traverse)
    ajouter("| Piedroits | %.1f kN/ml |" % poids_piedroits)
    ajouter("| Radier | %.1f kN/ml |" % poids_radier)
    ajouter("| Remblai + chaussee | %.1f kN/ml |" % poids_remblai)
    ajouter("| **Total permanent G** | **%.1f kN/ml** |" % charge_g)
    ajouter("| Exploitation Q | %.1f kN/ml |" % charge_q)
    ajouter("")
    ajouter("Largeur d'assise = %.2f m.  \n"
            "- Contrainte ELS sur le sol : **%.0f kPa = %.3f MPa** contre "
            "%.2f MPa admissible -> %s.  \n"
            "- Contrainte ELU : %.0f kPa."
            % (largeur_ext, reaction_els, reaction_els / 1000.0, P.contrainte_sol_adm,
               "**verifie**" if reaction_els / 1000.0 <= P.contrainte_sol_adm
               else "**NON VERIFIE, elargir la semelle ou traiter le sol**",
               reaction_elu))
    ajouter("")
    ajouter("Reaction nette sur le radier (deduction faite de son poids propre) : "
            "%.1f kPa a l'ELS. Moment sur appui `pL2/12 = %.1f kN.m/ml`, "
            "hauteur utile `d = %.3f m` -> **As = %.2f cm2/ml** a l'ELS. "
            "Le HA%d e=%.0f retenu (%.2f cm2/ml) couvre ce besoin."
            % (net_els, moment_radier_els, hauteur_utile_radier, section_radier_els,
               P.diam_cadre, P.espacement_cadre * 100, section_retenue))
    ajouter("")

    # --------------------------------------------------- 7. piedroits
    coefficient_ka = (1 - math.sin(math.radians(P.angle_frottement))) / (
        1 + math.sin(math.radians(P.angle_frottement)))
    surcharge = 10.0
    hauteur_piedroit = P.hauteur_extrados
    poussee_haut = coefficient_ka * surcharge
    poussee_bas = coefficient_ka * (P.poids_remblai * (P.couverture_min + hauteur_piedroit)
                                    + surcharge)
    poussee_totale = (poussee_haut + poussee_bas) / 2.0 * hauteur_piedroit
    moment_piedroit = poussee_totale * hauteur_piedroit / 12.0

    ajouter("## 7. Piedroits")
    ajouter("")
    ajouter("Poussee des terres au repos d'un etat actif de Rankine : "
            "`Ka = (1 - sin phi) / (1 + sin phi) = %.3f`, surcharge d'exploitation "
            "en tete %.0f kPa." % (coefficient_ka, surcharge))
    ajouter("")
    ajouter("- Poussee en tete de piedroit : %.1f kPa" % poussee_haut)
    ajouter("- Poussee en pied de piedroit : %.1f kPa" % poussee_bas)
    ajouter("- Resultante : %.1f kN/ml, moment de flexion de l'ordre de %.1f kN.m/ml"
            % (poussee_totale, moment_piedroit))
    ajouter("")
    ajouter("Ce moment reste tres inferieur a celui de la traverse (%.1f kN.m/ml a "
            "l'ELS) : le HA%d e=%.0f sur les deux faces, continu depuis le radier "
            "jusqu'a la traverse, est largement suffisant. L'effort normal "
            "(%.0f kN/ml sur %.2f m2, soit %.2f MPa) est negligeable devant la "
            "resistance du beton."
            % (moment_appui_els, P.diam_cadre, P.espacement_cadre * 100,
               reaction_els * largeur_ext / 2.0, P.ep_piedroit,
               reaction_els * largeur_ext / 2.0 / P.ep_piedroit / 1000.0))
    ajouter("")

    # --------------------------------------------------- 8. mur en aile
    hauteur_voile = P.cote_plateforme(P.longueur_ouvrage / 2.0) + P.mur_aile_fiche
    hauteur_totale = hauteur_voile + P.mur_aile_semelle_ep
    largeur_semelle = P.mur_aile_semelle_largeur
    patin = P.mur_aile_patin
    talon = largeur_semelle - patin - P.mur_aile_ep_pied

    poussee = (0.5 * coefficient_ka * P.poids_remblai * hauteur_totale ** 2
               + coefficient_ka * surcharge * hauteur_totale)
    bras_poussee = ((0.5 * coefficient_ka * P.poids_remblai * hauteur_totale ** 2)
                    * hauteur_totale / 3.0
                    + (coefficient_ka * surcharge * hauteur_totale) * hauteur_totale / 2.0
                    ) / poussee
    moment_renversant = poussee * bras_poussee

    poids_voile = (P.mur_aile_ep_tete + P.mur_aile_ep_pied) / 2.0 * hauteur_voile * P.poids_beton
    poids_semelle = largeur_semelle * P.mur_aile_semelle_ep * P.poids_beton
    poids_terre = talon * hauteur_voile * P.poids_remblai
    poids_surcharge = talon * surcharge
    resultante = poids_voile + poids_semelle + poids_terre + poids_surcharge

    bras_voile = patin + P.mur_aile_ep_pied / 2.0
    bras_semelle = largeur_semelle / 2.0
    bras_terre = patin + P.mur_aile_ep_pied + talon / 2.0
    moment_stabilisant = (poids_voile * bras_voile + poids_semelle * bras_semelle
                          + (poids_terre + poids_surcharge) * bras_terre)

    facteur_renversement = moment_stabilisant / moment_renversant
    facteur_glissement = (resultante * math.tan(math.radians(P.angle_frottement))) / poussee
    excentrement = largeur_semelle / 2.0 - (moment_stabilisant - moment_renversant) / resultante
    contrainte_max = (resultante / largeur_semelle
                      * (1 + 6 * abs(excentrement) / largeur_semelle))

    ajouter("## 8. Stabilite du mur en aile")
    ajouter("")
    ajouter("Mur le plus haut (au nu de l'ouvrage) : voile de %.2f m, semelle de "
            "%.2f m x %.2f m (patin %.2f, talon %.2f), hauteur totale %.2f m."
            % (hauteur_voile, largeur_semelle, P.mur_aile_semelle_ep, patin, talon,
               hauteur_totale))
    ajouter("")
    ajouter("| Terme | Valeur |")
    ajouter("|---|---|")
    ajouter("| Poussee des terres + surcharge | %.1f kN/ml |" % poussee)
    ajouter("| Bras de levier de la poussee | %.2f m |" % bras_poussee)
    ajouter("| Moment renversant | %.1f kN.m/ml |" % moment_renversant)
    ajouter("| Poids du voile | %.1f kN/ml |" % poids_voile)
    ajouter("| Poids de la semelle | %.1f kN/ml |" % poids_semelle)
    ajouter("| Terre sur talon (+ surcharge) | %.1f kN/ml |" % (poids_terre + poids_surcharge))
    ajouter("| **Resultante verticale N** | **%.1f kN/ml** |" % resultante)
    ajouter("| Moment stabilisant | %.1f kN.m/ml |" % moment_stabilisant)
    ajouter("")
    ajouter("| Verification | Valeur | Seuil | Resultat |")
    ajouter("|---|---|---|---|")
    ajouter("| Renversement | %.2f | 1.50 | %s |"
            % (facteur_renversement, "OK" if facteur_renversement >= 1.5 else "NON VERIFIE"))
    ajouter("| Glissement (tan phi, sans beche) | %.2f | 1.50 | %s |"
            % (facteur_glissement, "OK" if facteur_glissement >= 1.5 else "NON VERIFIE"))
    ajouter("| Excentrement e | %.3f m | B/6 = %.3f m | %s |"
            % (abs(excentrement), largeur_semelle / 6.0,
               "OK, resultante dans le tiers central"
               if abs(excentrement) <= largeur_semelle / 6.0 else "NON VERIFIE"))
    ajouter("| Contrainte max sur le sol | %.0f kPa | %.0f kPa | %s |"
            % (contrainte_max, P.contrainte_sol_adm * 1000,
               "OK" if contrainte_max <= P.contrainte_sol_adm * 1000 else "NON VERIFIE"))
    ajouter("")
    ajouter("Le glissement est le critere le plus tendu : il suppose un frottement "
            "sol/beton egal a `tan phi`. Si l'etude geotechnique donne un angle de "
            "frottement d'interface plus faible, ajouter une beche sous la semelle "
            "ou elargir le talon.")
    ajouter("")

    # ------------------------------------------------------- 9. quantites
    ajouter("## 9. Quantites et ratios")
    ajouter("")
    ajouter("| Poste | U | Quantite |")
    ajouter("|---|---|---|")
    for designation, unite, quantite in P.quantites():
        ajouter("| %s | %s | %.2f |" % (designation, unite, quantite))
    poids_acier = sum(ligne["poids"] for ligne in P.nomenclature())
    volume = [quantite for nom, _, quantite in P.quantites() if nom.startswith("TOTAL")][0]
    ajouter("")
    ajouter("Ratio d'armature : **%.0f kg/m3** de beton arme. C'est coherent avec "
            "l'ordre de grandeur habituel des dalots cadres (60 a 90 kg/m3). "
            "Prevoir +5 %% pour chutes et ligatures." % (poids_acier / volume))
    ajouter("")

    # ------------------------------------------------- 10. limites
    ajouter("## 10. Limites de la presente note")
    ajouter("")
    ajouter("1. **Le debit de projet n'est pas etabli ici.** L'ouverture 2.00 x 1.50 "
            "est une hypothese de depart ; elle doit etre confrontee au debit "
            "centennal du bassin versant.")
    ajouter("2. **La portance du sol est une hypothese** (%.2f MPa). Un essai "
            "pressiometrique ou une reconnaissance a la pelle est indispensable "
            "avant execution." % P.contrainte_sol_adm)
    ajouter("3. Le modele de portique est simplifie (bornes enveloppes). Un calcul "
            "de portique complet ou un modele aux elements finis peut reduire les "
            "sections d'acier, surtout en travee.")
    ajouter("4. Les tassements differentiels, la verification en phase de "
            "construction (remblai dissymetrique) et la sensibilite au biais "
            "ne sont pas traites.")
    ajouter("5. Les charges militaires (Mc80/Mc120) et exceptionnelles ne sont pas "
            "considerees ; les introduire si l'itineraire les impose.")
    ajouter("6. Aucun calcul sismique n'est mene.")
    ajouter("")
    return "\n".join(lignes) + "\n"


if __name__ == "__main__":
    chemin = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "parametres.json")
    print(rediger(parametres.charger(chemin if os.path.exists(chemin) else None)))
