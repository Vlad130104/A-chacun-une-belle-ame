# 12 — Registre des risques

**Cotation.** Probabilité (P) et Impact (I) de 1 à 5 · Criticité = P × I.
**Seuils :** ≥ 16 critique (traitement immédiat, revue hebdomadaire) · 9-15 élevé (revue bimensuelle) ·
4-8 modéré (revue mensuelle) · ≤ 3 faible (surveillance).

**Statuts.** 🔴 ouvert · 🟠 atténué (mesure en place, risque résiduel) · 🟢 maîtrisé · ⚪ à réévaluer.

---

## 1. Risques critiques (≥ 16)

### R1 — Capacité de modération insuffisante à l'ouverture
**P 4 · I 5 · Criticité 20 · 🔴 ouvert · Porteur de projet**

Le SLA de 24 h est un engagement du cahier des charges et l'un des cinq indicateurs de succès. Sans équipe formée
avant l'ouverture, il est manqué dès la première semaine — et sur une plateforme de rencontres, la réputation ne se
répare pas : les premières utilisatrices qui subissent un harcèlement non traité ne reviennent pas, et le disent.

- **Déclencheurs :** question Q9 sans réponse à 4 semaines de l'ouverture · plus de 20 cas en dépassement de SLA.
- **Atténuation :** recruter et former les modérateurs **avant** l'ouverture (candidats naturels : les modérateurs du
  groupe WhatsApp) · outillage livré au MVP (file priorisée, compte à rebours, alertes) · **ouverture par vagues**
  calibrée sur la capacité réelle de traitement.
- **Plan de repli :** réduire la taille des vagues · restreindre temporairement la messagerie aux comptes vérifiés
  depuis plus de 48 h · désactiver les pièces jointes par feature flag.
- **Indicateur :** délai médian et p90 de traitement, nombre de cas en dépassement.

### R2 — Aucun prestataire SMS contractualisé
**P 4 · I 5 · Criticité 20 · 🔴 ouvert · Porteur de projet**

Sans OTP réel, **aucune inscription n'est possible**. C'est le seul point du projet qui bloque totalement l'ouverture,
et il est souvent sous-estimé parce qu'il paraît trivial.

- **Atténuation :** port `SmsProvider` livré au MVP · contractualisation à lancer **immédiatement**, en parallèle du
  développement · prévoir un second fournisseur pour le basculement.
- **Plan de repli :** aucun. Il n'existe pas de contournement acceptable.
- **Indicateur :** date de signature du contrat, coût par SMS par pays, taux de délivrance.

### R3 — Cadre juridique non arbitré
**P 4 · I 4 · Criticité 16 · 🔴 ouvert · Porteur de projet**

CGU, politique de confidentialité, durées de conservation, processus KYC et obligations de notification d'incident
non validés. Ouvrir sans cela expose à un risque réglementaire et rend impossible une réponse correcte au premier
incident.

- **Atténuation :** toutes les durées sont **configurables**, jamais codées en dur · consentements versionnés ·
  textes de substitution clairement marqués « projet — à faire valider » · mandat d'un conseil juridique à lancer
  dès maintenant.
- **Plan de repli :** aucun. La validation juridique est une condition bloquante de la checklist de lancement.
- **Indicateur :** avis juridique reçu pour chacun des trois pays.

### R4 — Pic d'inscriptions à l'ouverture
**P 4 · I 4 · Criticité 16 · 🟠 atténué · Équipe technique**

9 000 personnes alertées simultanément dans un groupe WhatsApp produisent un pic sans commune mesure avec une
croissance organique : saturation des OTP, engorgement de la file KYC, dépense SMS imprévue.

- **Atténuation :** **ouverture par vagues** via codes d'invitation à quota · tests de charge au profil de pic avant
  ouverture · plafond de dépense SMS avec alerte à 80 % · files BullMQ dimensionnées et surveillées.
- **Plan de repli :** fermer temporairement les inscriptions par feature flag, avec message d'attente honnête.
- **Indicateur :** inscriptions par heure, âge du plus vieux job OTP, taille de la file de vérification.

---

## 2. Risques élevés (9 à 15)

### R5 — Aucun agrégateur mobile money contractualisé
**P 4 · I 3 · Criticité 12 · 🟠 atténué**
Pas de revenu au lancement. Atténuation : abstraction `PaymentProvider` + fournisseur simulé « Mode test » ; le MVP
peut ouvrir en **gratuit intégral** et activer le paiement par feature flag le jour de la signature. Repli assumé :
lancement gratuit, monétisation en V1. Indicateur : date de signature, taux d'échec de paiement en recette.

### R6 — Abandon massif à l'étape de vérification d'identité
**P 3 · I 4 · Criticité 12 · 🟠 atténué**
L'objectif de 90 % de profils vérifiés repose entièrement sur cet écran. Chaque reprise de photo est un abandon
potentiel. Atténuation : gabarit de cadrage, contrôle de netteté **avant** envoi, exemples visuels, reprise après
coupure, complétion du profil possible pendant l'attente, relance à J+1 et J+3. Indicateur : taux de complétion de
l'étape 6, nombre moyen de tentatives, délai médian de vérification.

### R7 — Fraude à l'offre de lancement
**P 4 · I 3 · Criticité 12 · 🟠 atténué**
Multi-comptes pour cumuler la période Premium offerte. Atténuation : un bénéfice par numéro vérifié **et** par
empreinte de pièce d'identité · quota par code · détection des comptes liés par empreinte d'appareil · retrait
automatique du bénéfice en cas de bannissement. Indicateur : ratio bénéfices accordés / identités vérifiées uniques.

### R8 — Arnaque sentimentale non détectée
**P 4 · I 3 · Criticité 12 · 🟠 atténué**
C'est la menace la plus probable pour les membres, et celle qui détruit le plus vite la confiance. Atténuation :
catégorie de signalement dédiée en priorité P1 · 9 règles de détection · avertissement in-app au premier message ·
KYC obligatoire. Limite honnête : **aucune règle ne détecte un escroc patient**. Indicateur : signalements
`FINANCIAL_SOLICITATION` par 1 000 membres actifs, délai de traitement.

### R9 — Rétention à 30 jours inférieure à l'objectif de 35 %
**P 3 · I 4 · Criticité 12 · 🔴 ouvert**
Un objectif ambitieux pour une plateforme de rencontres. Le pic de migration peut masquer une rétention faible
pendant les premières semaines. Atténuation : quota quotidien créant une habitude · notifications utiles et non
intrusives · facteur « nouveauté » dans le score · mesure par cohorte dès J1 · relances de complétion de profil.
Indicateur : rétention J7 et J30 par cohorte hebdomadaire.

### R10 — Dérive de périmètre vers les groupes, événements et appels vidéo
**P 4 · I 3 · Criticité 12 · 🟠 atténué**
Ces trois fonctions figurent au cahier des charges et seront réclamées. Atténuation : périmètre gelé, roadmap V1/V2
écrite avec dépendances, toute demande passe par le backlog. Indicateur : nombre de stories hors périmètre entrées
en sprint.

### R11 — Compte administrateur compromis
**P 2 · I 5 · Criticité 10 · 🟠 atténué**
Donne accès aux pièces d'identité. Atténuation : 2FA obligatoire · session 8 h · moindre privilège · séparation du
rôle de vérification · audit append-only · alerte sur consultation en volume · quatre yeux sur l'irréversible.
Indicateur : consultations KYC par compte et par semaine, revue mensuelle.

### R12 — Délai de développement dépassé
**P 3 · I 3 · Criticité 9 · 🟠 atténué**
412 points de backlog contre un calendrier annoncé de 3 à 4 mois : cohérent seulement avec 4 développeurs ou un
périmètre réduit. Atténuation : ordre de sacrifice défini (D10 → D7 → filtres Premium → pièces jointes) ·
tranches verticales livrant de la valeur à chaque étape. Indicateur : vélocité réelle sur les trois premiers sprints.

### R13 — Coût des SMS supérieur aux prévisions
**P 3 · I 3 · Criticité 9 · 🔴 ouvert**
Le coût par inscription peut dépasser le revenu moyen par membre pendant plusieurs mois. Atténuation : limitation
stricte des renvois · plafond avec alerte · suivi du coût par inscription dès le premier jour · repli WhatsApp ou
voix étudié en V1. Indicateur : coût SMS par inscription vérifiée.

---

## 3. Risques modérés (4 à 8)

| # | Risque | P·I | Statut | Atténuation |
|---|---|:--:|:--:|---|
| R14 | Fuite de données par les logs | 2·4=8 | 🟢 | Rédaction automatique par liste noire + test de fuite bloquant en CI |
| R15 | Dépendance à un fournisseur unique | 2·4=8 | 🟠 | Ports abstraits permettant deux implémentations et un basculement par flag |
| R16 | Perte de données sans restauration éprouvée | 2·4=8 | 🟠 | Sauvegardes chiffrées + **exercice de restauration trimestriel obligatoire** |
| R17 | Recréation de comptes bannis | 3·2=6 | 🟠 | `BlockedIdentity` par empreintes + corrélation d'appareils. Limite assumée : changement complet d'identité possible |
| R18 | Photos réutilisées entre comptes (faux profils) | 3·2=6 | 🟠 | Empreinte perceptuelle et signal de modération |
| R19 | Contestation de la politique de mise en relation (Q7) | 2·3=6 | 🔴 | Politique **configurable** (ADR-019), pas figée dans le code · validation juridique demandée |
| R20 | Rejet ou retard de publication en magasin d'applications | 2·3=6 | 🟠 | Espace membre **web** livré au MVP : la conversion ne dépend pas du magasin |
| R21 | Performance de la génération de suggestions à x10 | 2·3=6 | 🟢 | Plafond de candidats, pré-filtre indexé, traitement nocturne, réplica de lecture |
| R22 | Signalements abusifs en série | 3·2=6 | 🟠 | Index sur le signalant, détection de signalement en série, quota quotidien |
| R23 | Incohérence de montants entre devises | 1·5=5 | 🟢 | Objet `Money`, exposant explicite, test unitaire dédié XAF/XOF |
| R24 | Départ d'un développeur clé | 2·2=4 | 🟠 | Documentation exhaustive, ADR, aucune connaissance implicite, revue croisée |

---

## 4. Suivi

| Rythme | Contenu | Participants |
|---|---|---|
| Hebdomadaire | Risques critiques (R1-R4) : évolution, déclencheurs, décisions | Équipe + porteur de projet |
| Bimensuel | Risques élevés | Équipe technique |
| Mensuel | Registre complet, re-cotation, nouveaux risques | Équipe + porteur de projet |
| À chaque fin de lot | Risques propres à la tranche livrée | Équipe technique |

**Un risque ne se ferme pas parce qu'il n'est pas survenu.** Il se ferme quand sa cause est traitée : contrat signé,
équipe recrutée, avis juridique reçu, restauration testée.

---

## 5. Les trois risques qui déterminent l'ouverture

Si un seul de ces trois points n'est pas résolu, la plateforme ne peut pas ouvrir au public — quel que soit
l'avancement du code :

1. **R2 — contrat SMS** : sans OTP réel, personne ne peut s'inscrire.
2. **R3 — validation juridique** : sans CGU ni politique validées, l'ouverture est irrégulière.
3. **R1 — équipe de modération** : sans modération opérationnelle, la promesse centrale du produit est vide.

Ces trois éléments **ne dépendent pas de l'équipe technique**. Ils doivent être lancés dès maintenant, en parallèle
du développement, parce que ce sont eux — et non le code — qui constituent le chemin critique du projet.
