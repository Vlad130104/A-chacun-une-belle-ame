# 02 — Décisions techniques documentées (ADR)

Format : contexte → décision → conséquences → alternatives écartées. Une décision marquée **[Imposée]** provient du
cahier des charges ou de la commande ; elle est documentée pour mémoire, pas rediscutée.

---

## ADR-001 — Monolithe modulaire plutôt que microservices

**Statut :** acceptée · **[Imposée, confirmée]**

**Contexte.** 9 000 membres au lancement, cible x10. Équipe réduite. Douze domaines fonctionnels interdépendants
(un match crée une conversation, une sanction ferme une conversation, un paiement ouvre des droits).

**Décision.** Un seul déployable NestJS, 17 modules à frontières explicites. Communication inter-modules par service
applicatif public ou événement de domaine. Interdiction d'accès croisé aux tables, vérifiée par un test d'architecture.

**Conséquences.** Un seul pipeline, une seule base, transactions locales possibles (essentiel pour match →
conversation → notification). L'extraction future d'un module reste possible car la frontière existe déjà dans le code.
Risque assumé : la discipline de frontière repose sur la revue et le test d'architecture, pas sur le réseau.

**Alternatives écartées.** Microservices dès le départ : multiplie l'infrastructure, la latence et la complexité
transactionnelle sans bénéfice à cette échelle. Coût : +2 à 3 mois de délai, +40 % d'infrastructure.

---

## ADR-002 — Turborepo plutôt que Nx

**Statut :** acceptée · réversible

**Contexte.** Le cahier des charges laisse le choix. 8 paquets prévus.

**Décision.** Turborepo + pnpm workspaces.

**Conséquences.** Mise en place en une heure, cache distant simple, courbe d'apprentissage faible pour une équipe qui
reprendrait le projet. Pas de générateurs de code ni de graphe de dépendances riche.

**Alternatives écartées.** Nx : supérieur au-delà de ~15 paquets et en présence de multiples équipes. Migration
Turborepo → Nx possible plus tard, coût estimé 2 à 3 jours. Impact coût/délai au MVP : neutre.

---

## ADR-003 — Le numéro de téléphone est l'identifiant principal

**Statut :** acceptée · **[Imposée]**

**Contexte.** Marchés où le téléphone est universel et l'e-mail secondaire.

**Décision.** `User.phoneE164` unique et obligatoire. `User.email` facultatif, unique s'il est présent. Le mot de
passe n'est requis que si un e-mail est ajouté ; sinon, l'authentification se fait par OTP.

**Conséquences.** Un changement de numéro est une opération sensible (OTP sur l'ancien et le nouveau numéro, audit,
notification). Le numéro est une donnée personnelle : stocké chiffré, jamais journalisé en clair, affiché masqué au
back-office (`+237 6XX XXX X89`) sauf action explicite tracée.

**Alternatives écartées.** E-mail principal : inadapté au marché. Identifiant technique seul : impose une seconde
étape de contact pour l'OTP.

---

## ADR-004 — Séparation physique des données KYC

**Statut :** acceptée · **[Imposée]**

**Décision.** Deux schémas PostgreSQL dans la même base : `app` et `kyc`. Les tables `VerificationDocument` et les
champs sensibles de `VerificationRequest` vivent dans `kyc`. Deux buckets S3 distincts, politiques distinctes, clés
de chiffrement distinctes. Le rôle applicatif de lecture d'`app` n'a **aucun droit** sur `kyc` ; seul un rôle dédié,
utilisé par le module `verification`, y accède.

**Conséquences.** Une injection ou une fuite côté produit n'expose pas les pièces d'identité. Un `SELECT` joint
entre profil public et document est impossible par construction. Coût : une connexion Prisma supplémentaire et une
discipline de code.

**Alternatives écartées.** Base séparée : plus sûr encore, mais interdit toute transaction commune et complique les
sauvegardes cohérentes. Retenu comme évolution V1 si le volume ou l'exigence l'impose.

---

## ADR-005 — Refresh tokens opaques, hachés, rotatifs, par famille

**Statut :** acceptée

**Décision.** Access token JWT RS256 de 15 minutes ; refresh token opaque de 30 jours, stocké **haché en SHA-256**,
rotatif à chaque usage, appartenant à une famille par session. La réutilisation d'un token déjà consommé révoque
toute la famille, écrit un événement d'audit et notifie l'utilisateur.

**Conséquences.** Un vol de base ne donne pas de refresh token utilisable. Le vol d'un token est détecté au premier
usage concurrent. Coût : une écriture par rafraîchissement.

**Alternatives écartées.** JWT longue durée sans révocation : irrattrapable en cas de vol. Sessions serveur pures :
perd le bénéfice de la validation locale sur les routes non sensibles.

---

## ADR-006 — Le statut « vérifié » est une porte serveur, pas un badge

**Statut :** acceptée

**Décision.** `VerificationGuard` bloque **toute** route de découverte, matching, conversation et message tant que
`verificationStatus != VERIFIED`. Le garde relit le statut en base (avec cache Redis de 60 s invalidé à chaque
changement), il ne fait pas confiance au JWT.

**Conséquences.** Une suspension prend effet en moins d'une minute, pas au bout de 15. Un compte non vérifié est
invisible et muet. Coût : une lecture cache par requête sensible.

**Alternatives écartées.** Se fier au claim JWT : simple, mais une suspension mettrait 15 minutes à s'appliquer —
inacceptable sur un signalement de harcèlement.

---

## ADR-007 — Score de compatibilité déterministe, documenté, configurable

**Statut :** acceptée · s'écarte du cahier des charges §5.4 (signaux comportementaux)

**Contexte.** Le cahier des charges évoque des signaux comportementaux dès le MVP.

**Décision.** MVP = score pondéré déterministe, entièrement documenté, pondérations en base
(`MatchingWeightsConfig` via feature flag), reproductible pour un couple donné à un instant donné. Les événements
comportementaux sont **collectés** dès maintenant, mais n'entrent pas dans le score.

**Conséquences.** Testable unitairement, explicable à un utilisateur qui conteste, non discriminatoire par
construction (aucun critère sensible non déclaré n'entre dans la formule). Perte : pertinence potentiellement
inférieure à un modèle appris — acceptable au lancement, quand il n'existe de toute façon aucune donnée
comportementale.

**Alternatives écartées.** Modèle appris dès le MVP : pas de données d'entraînement au jour 1, impossible à tester,
difficile à défendre.

---

## ADR-008 — Pas de chiffrement de bout en bout dans la messagerie

**Statut :** acceptée · précise le cahier des charges §5.5

**Décision.** Chiffrement **en transit** (TLS 1.3) et **au repos** (chiffrement disque + chiffrement applicatif des
champs sensibles). Pas de bout-en-bout. La documentation, les CGU et l'interface l'énoncent explicitement.

**Justification.** La modération, le traitement des signalements et la détection d'arnaque sentimentale exigent que
le serveur puisse lire un message signalé. Annoncer du bout-en-bout tout en modérant serait une déclaration fausse
aux utilisateurs.

**Conséquences.** Accès aux contenus strictement limité au traitement d'un signalement, journalisé nominativement,
et jamais en consultation libre. Un modérateur ne peut ouvrir que les messages rattachés à un signalement.

**Alternatives écartées.** Bout-en-bout réel : rendrait la modération impossible, donc le produit incompatible avec
sa promesse de sécurité.

---

## ADR-009 — Montants en unité minimale, devise explicite, XAF/XOF sans sous-unité

**Statut :** acceptée

**Décision.** `amountMinor: Int` + `currency: String(3)` + `minorUnitExponent: Int`. Pour **XAF et XOF, l'exposant
est 0** : 1 000 F CFA se stocke `amountMinor = 1000`. Un objet de valeur `Money` centralise le formatage et interdit
toute addition entre devises différentes.

**Conséquences.** Aucun flottant, aucune ambiguïté. Test unitaire dédié sur l'exposant par devise — une erreur ici
serait un incident financier direct.

---

## ADR-010 — Webhooks vérifiés, idempotents, rejouables

**Statut :** acceptée

**Décision.** Tout webhook (paiement, KYC) : (1) vérification de signature avant toute lecture du corps ;
(2) persistance immédiate dans `PaymentWebhookEvent` avec contrainte unique `(provider, providerEventId)` ;
(3) réponse 200 immédiate ; (4) traitement asynchrone par BullMQ avec `jobId` déterministe ; (5) rejeu manuel
possible depuis le back-office. Un événement déjà traité est ignoré silencieusement et compté.

**Conséquences.** Un rejeu du fournisseur ne crée jamais de double crédit d'abonnement. Test E2E dédié (parcours 14).

---

## ADR-011 — Localisation déclarative, pas de GPS au MVP

**Statut :** acceptée · **HYPOTHÈSE À VALIDER** (H10 de la Phase A)

**Décision.** Pays et ville choisis dans un référentiel fermé (`City`), pas de coordonnées, pas de distance en km.
Le critère géographique du score est : même ville > même région > même pays > pays différent.

**Justification.** Une position précise sur une plateforme de rencontres est un risque de traque physique. Le
référentiel fermé évite aussi la saisie libre incohérente (« Douala », « douala », « Douala 5 »).

**Conséquences.** Pas de « à 3 km de vous ». Ajout ultérieur possible : colonne géographique optionnelle et
arrondi volontaire à ~5 km, jamais de position exacte.

---

## ADR-012 — Modération : aucune sanction lourde automatique

**Statut :** acceptée · **[Imposée]**

**Décision.** Les règles de détection produisent des **signaux** et créent ou priorisent un `ModerationCase`. Elles
peuvent appliquer seules des mesures **réversibles** (masquer une photo, limiter le débit d'envoi, exiger une
re-vérification). Suspension et bannissement exigent une décision humaine ; le bannissement définitif exige un
second valideur (principe des quatre yeux).

**Conséquences.** Pas de bannissement de masse par faux positif. Coût : charge humaine, d'où l'importance de la
question Q9 (effectifs de modération).

---

## ADR-013 — Empêcher la recréation d'un compte banni sans conserver de données inutiles

**Statut :** acceptée

**Décision.** À la suppression ou au bannissement, on conserve un enregistrement `BlockedIdentity` contenant
uniquement des **empreintes salées** : hash du numéro E.164, hash du numéro de pièce d'identité (si vérifié), hash
d'empreinte d'appareil. Aucune donnée en clair, aucun profil, aucune photo.

**Conséquences.** Un banni qui revient avec le même numéro ou la même pièce est refusé à l'inscription, sans que la
plateforme conserve son identité. Limite honnête : un banni changeant de numéro **et** de pièce **et** d'appareil
peut revenir — c'est le cas de tous les acteurs du marché ; les règles de détection prennent alors le relais.

---

## ADR-014 — Le back-office est une application distincte, sur un domaine distinct

**Statut :** acceptée

**Décision.** `apps/admin` séparé de `apps/web` : autre domaine, autres cookies, CSP plus stricte, 2FA obligatoire,
sessions courtes (8 h), routes API préfixées `/admin`, CORS n'autorisant que l'origine du back-office.

**Conséquences.** Une XSS sur le site public ne peut pas atteindre une session administrateur. Coût : un déployable
de plus.

---

## ADR-015 — Espace membre web livré au MVP

**Statut :** acceptée · s'ajoute au cahier des charges

**Décision.** `apps/web` couvre la vitrine **et** le parcours membre complet, en plus du mobile.

**Justification.** La conversion vient d'un lien cliqué dans WhatsApp. Conditionner cette conversion au
téléchargement d'une application sur un forfait data limité coûterait plusieurs points sur l'objectif de 15 %.

**Conséquences.** Coût marginal faible (mêmes API, mêmes contrats, design system partagé), bénéfice direct sur le
seul indicateur qui compte au lancement. La publication sur les magasins d'applications cesse d'être bloquante.

---

## ADR-016 — Consentements versionnés et horodatés

**Statut :** acceptée

**Décision.** Chaque acceptation (CGU, politique de confidentialité, charte de bonne conduite, traitement KYC,
notifications marketing) crée un `ConsentRecord` immuable : type, version du document, date UTC, adresse IP
tronquée, canal. Une nouvelle version d'un document déclenche une redemande au prochain accès.

**Conséquences.** On peut prouver qui a accepté quoi et dans quelle version. Coût : quelques lignes par utilisateur.

---

## ADR-017 — Suppression de compte avec période de grâce

**Statut :** acceptée · **HYPOTHÈSE À VALIDER** (H6)

**Décision.** Demande de suppression → compte immédiatement invisible et déconnecté → **30 jours de grâce**
annulables par l'utilisateur → purge : anonymisation du `User`, suppression des photos, du profil, des documents ;
conservation d'un `BlockedIdentity` (empreintes) et des enregistrements financiers légalement nécessaires
(montants, dates, sans donnée de profil).

**Conséquences.** Réversible pendant 30 jours, définitif ensuite. Les messages envoyés à d'autres membres sont
conservés côté destinataire avec l'expéditeur anonymisé — la conversation d'autrui n'est pas détruite.

---

## ADR-018 — Feature flags comme mécanisme de mise en production

**Statut :** acceptée

**Décision.** Tout ce qui n'est pas encore contractualisé ou stabilisé est derrière un flag :
`payments.enabled`, `premium.filters`, `boost.enabled`, `kyc.autoProvider`, `push.enabled`,
`migration.launchOffer`, `moderation.autoRules`. Évaluation serveur, exposition au client limitée aux flags
d'interface.

**Conséquences.** Le MVP peut ouvrir en gratuit intégral et activer le paiement le jour de la signature du contrat,
sans redéploiement.

---

## ADR-019 — Politique de mise en relation configurable

**Statut :** acceptée · dépend de la question Q7

**Contexte.** Le cahier des charges §3.4 prévoit une mise en relation organisée entre hommes et femmes.

**Décision.** Implémentée comme **politique de matching configurable** (`matching.policy = HETERO | OPEN`), et non
comme une hypothèse figée dans le code. Le modèle de données porte `gender` et `seekingGender` ; la politique
détermine les couples éligibles.

**Justification.** Une règle produit peut évoluer, être contestée, ou devoir être ajustée selon les règles d'une
place de marché applicative. La coder en dur imposerait une refonte du matching ; la configurer coûte une ligne.

---

## ADR-020 — Tests : la pyramide, avec un plancher non négociable

**Statut :** acceptée

**Décision.** Unitaires sur le domaine (rapides, sans infrastructure) ; intégration sur les cas d'usage avec
PostgreSQL et Redis éphémères (Testcontainers) ; E2E Playwright sur les 18 parcours obligatoires. **Un jeu de tests
d'autorisation systématique** : pour chaque route, un test vérifie le refus non authentifié, non vérifié, non
propriétaire, rôle insuffisant.

**Conséquences.** Le seuil de couverture est fixé à 80 % de branches sur `domain/` et `application/` (là où sont les
règles), et non à un pourcentage global qui récompenserait les tests d'infrastructure sans valeur.
