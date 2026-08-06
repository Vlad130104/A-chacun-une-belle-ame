# Sécurité — « À Chacun Une Belle Âme »

Ce document est le référentiel de sécurité du produit : modèle de menace, actifs, mesures, procédure d'incident,
divulgation responsable et checklist avant production. Il est **contraignant** : une exigence marquée « bloquant »
empêche l'ouverture publique tant qu'elle n'est pas satisfaite.

Dernière mise à jour : phase B (conception). Statut : **non applicable en production** — le produit n'est pas encore
développé ni déployé.

---

## 1. Ce que le produit protège, et pourquoi c'est particulier

Une plateforme de rencontres concentre trois catégories de données rarement réunies : des **pièces d'identité
officielles**, des **conversations intimes**, et des **intentions relationnelles**. Une fuite ne provoque pas une
gêne administrative : elle expose des personnes à l'extorsion, à la traque et à des conséquences familiales ou
sociales durables. Sur les marchés visés, elle peut mettre une personne en danger physique.

Cette réalité justifie deux choix qui coûtent en confort de développement et sont assumés :
la **séparation physique des données KYC** et l'**absence d'accès libre aux conversations**, y compris pour un
administrateur.

---

## 2. Actifs sensibles

| # | Actif | Sensibilité | Emplacement | Protection |
|---|---|:--:|---|---|
| A1 | Pièces d'identité et selfies | **Critique** | Bucket S3 dédié, schéma `kyc` | Chiffrement, rôle distinct, URL 5 min, motif obligatoire, audit nominatif, purge automatique |
| A2 | Contenu des conversations | **Critique** | `app.Message.body` | Chiffrement applicatif, accès uniquement via un signalement, jamais journalisé |
| A3 | Numéros de téléphone | Élevée | `app.User.phoneE164` | Chiffré, masqué au back-office, jamais dans les logs |
| A4 | Dates de naissance et noms légaux | Élevée | `app.User`, `kyc.VerificationRequest` | Chiffrés, jamais exposés à un autre membre |
| A5 | Photos de profil | Élevée | Bucket média privé | EXIF supprimé, URL signée, jamais d'URL permanente |
| A6 | Secrets d'authentification | **Critique** | Base + environnement | Argon2id, hachage SHA-256 des refresh tokens, secrets hors dépôt |
| A7 | Comptes back-office | **Critique** | `app.UserRole` | 2FA obligatoire, session 8 h, moindre privilège, audit |
| A8 | Journal d'audit | Élevée | `app.AdminAuditLog` | Append-only garanti au niveau PostgreSQL |
| A9 | Données de paiement | Élevée | `app.Payment` | **Aucune donnée complète de carte n'est stockée**, jamais |
| A10 | Clés de chiffrement | **Critique** | Gestionnaire de secrets | Jamais dans le dépôt, rotation prévue, accès restreint |
| A11 | Sauvegardes | **Critique** | Stockage de sauvegarde | Chiffrées, accès séparé, restauration testée |

---

## 3. Modèle de menace

Méthode STRIDE, appliquée aux surfaces réelles du produit.

### 3.1 Acteurs de menace

| Acteur | Motivation | Capacité |
|---|---|---|
| **Escroc sentimental** | Argent | Élevée en ingénierie sociale, faible en technique. **La menace la plus probable et la plus coûteuse pour les membres.** |
| Membre malveillant | Harcèlement, extorsion | Faible technique, accès légitime au produit |
| Faux profil / usurpateur | Manipulation, arnaque | Moyenne — sait contourner une vérification faible |
| Mineur cherchant à s'inscrire | Accès au service | Faible, mais **conséquence légale majeure** |
| Attaquant externe opportuniste | Revente de données | Moyenne — scanne les vulnérabilités connues |
| Attaquant ciblé | Données d'identité en volume | Élevée |
| Administrateur négligent ou malveillant | Curiosité, revente | **Accès légitime — la menace la plus difficile à détecter** |
| Prestataire compromis (SMS, KYC, paiement) | Chaîne d'approvisionnement | Variable |

### 3.2 Menaces principales et réponses

| # | Menace | STRIDE | Grav. | Réponse |
|---|---|:--:|:--:|---|
| M1 | Arnaque sentimentale | I/E | **Critique** | Catégorie de signalement dédiée en P1, détection par règles, avertissement in-app dans la conversation, KYC obligatoire |
| M2 | Inscription d'un mineur | E | **Critique** | Calcul serveur, KYC, blocage terminal, empreinte anti-recréation |
| M3 | Fuite des pièces d'identité | I | **Critique** | Séparation schéma + bucket + rôle, chiffrement, URL courte, motif, audit, purge |
| M4 | Usurpation d'identité (faux profil) | S | Élevée | Selfie comparé, empreinte perceptuelle des photos, unicité de la pièce, re-vérification aléatoire |
| M5 | Compte administrateur compromis | E | **Critique** | 2FA obligatoire, session courte, moindre privilège, alerte sur consultation en volume, quatre yeux sur l'irréversible |
| M6 | Sollicitation non désirée / harcèlement | — | Élevée | **Messagerie sur consentement mutuel** (structurel), blocage immédiat, limite anti-spam |
| M7 | Recréation d'un compte banni | S | Élevée | `BlockedIdentity` (empreintes), corrélation d'appareils, règles de détection |
| M8 | Vol de session | S | Élevée | Refresh rotatif haché, détection de réutilisation, révocation de famille, notification |
| M9 | Rejeu ou falsification de webhook | T | Élevée | Signature vérifiée avant lecture, unicité `(provider, eventId)`, traitement idempotent |
| M10 | Extorsion à partir de contenu intime | I | Élevée | Modération des pièces jointes, signalement en deux touches, procédure d'escalade |
| M11 | Énumération d'utilisateurs | I | Moyenne | Réponses et temps de réponse uniformes, 404 indistinct, rate limiting |
| M12 | Injection SQL / XSS | T/E | Élevée | Prisma paramétré, validation Zod stricte, assainissement des textes, CSP |
| M13 | Envoi de fichier hostile | E | Élevée | Signature binaire, ré-encodage systématique, taille et dimensions bornées, stockage privé sans exécution |
| M14 | Épuisement de ressources (OTP, médias) | D | Moyenne | Rate limiting multi-dimension, quotas, plafond de dépense SMS avec alerte |
| M15 | Fuite par les logs | I | Élevée | Rédaction automatique par liste noire de clés, test dédié en CI |
| M16 | Traque géographique | I | Élevée | **Aucun GPS**, granularité ville, dernière activité floutée |
| M17 | Prestataire compromis | S/T | Moyenne | Ports abstraits, signature vérifiée, aucune confiance implicite dans une réponse externe |
| M18 | Perte de données | D | **Critique** | Sauvegardes chiffrées quotidiennes, **restauration testée**, plan de reprise |

### 3.3 Ce qui n'est pas couvert (limites honnêtes)

- **Un appareil compromis** (logiciel espion sur le téléphone d'un membre) : hors de portée du produit.
- **Une capture d'écran** d'une conversation par le destinataire : techniquement impossible à empêcher de manière
  fiable. Traité par la charte et le signalement, pas par la technique.
- **Un membre banni changeant de numéro, de pièce et d'appareil** : peut revenir. Aucune plateforme du marché ne
  résout ce cas ; les règles de détection prennent le relais.
- **La sincérité d'une personne vérifiée.** Le KYC prouve une identité, pas une intention. C'est la modération qui
  porte cette promesse, et elle est faillible — le produit doit le dire aux membres plutôt que de laisser croire
  qu'un badge garantit la bonne foi.

---

## 4. Mesures de protection

### 4.1 Authentification et sessions
Argon2id (paramètres à réévaluer annuellement) · access token 15 min RS256 · refresh token opaque 30 j **haché**,
rotatif, par famille · détection de réutilisation → révocation totale + audit + notification · verrouillage
progressif · 2FA prête côté membre, **obligatoire** côté back-office · révocation individuelle et globale.

### 4.2 Autorisation
Chaîne de gardes centralisée · **politique obligatoire déclarée sur chaque route** (test d'inventaire) · statut de
vérification relu en base avec cache 60 s · matrice rôles × permissions testée automatiquement · quatre yeux sur
bannissement, remboursement, modification de date de naissance vérifiée, attribution de rôle.

### 4.3 Données
TLS 1.3 en transit · chiffrement disque et chiffrement applicatif AES-256-GCM des champs sensibles · rotation de clé
prévue · **schéma `kyc` séparé avec rôle PostgreSQL distinct** · buckets séparés · URLs signées de courte durée ·
minimisation (rien de calculable n'est stocké) · conservation configurable et purges automatiques.

### 4.4 Entrées
Validation Zod stricte sur **toute** donnée client, `additionalProperties: false` · type de fichier par signature
binaire · ré-encodage des images · suppression EXIF · assainissement des textes affichés · aucune requête SQL
concaténée.

### 4.5 Bordure
CORS restrictif par origine explicite · CSP stricte · HSTS · `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy` · CSRF sur les flux à cookie du back-office · rate limiting par IP, utilisateur, appareil et
action · plafond de dépense SMS avec alerte.

### 4.6 Journalisation et détection
Logs structurés avec **rédaction automatique** (mots de passe, tokens, OTP, corps de messages, clés de documents,
numéros) · `requestId` de corrélation · audit administratif append-only garanti par les droits PostgreSQL ·
alertes : dépassement de SLA de modération, consultation en volume de documents KYC, taux d'échec OTP anormal,
dead-letter non vide, pic d'inscriptions depuis une même empreinte.

### 4.7 Ce qui n'est pas fait, et pourquoi
- **Pas de chiffrement de bout en bout** (ADR-008). La modération et la lutte contre l'arnaque sentimentale exigent
  que le serveur puisse lire un message signalé. **Il ne sera jamais affirmé le contraire aux utilisateurs**, ni dans
  l'interface, ni dans la communication.
- **Pas de biométrie propriétaire.** La comparaison visage/pièce relève d'un prestataire spécialisé ; en attendant,
  elle est faite par un agent humain.

---

## 5. Gestion des incidents

### 5.1 Niveaux

| Niveau | Définition | Délai de prise en charge |
|:--:|---|---|
| **S1** | Fuite avérée de données personnelles, accès non autorisé à des pièces d'identité, compromission d'un compte administrateur, mineur avéré sur la plateforme | **Immédiat, 24 h/24** |
| **S2** | Vulnérabilité exploitable non exploitée, indisponibilité totale, échec de la modération sur un cas P0 | < 4 h |
| **S3** | Vulnérabilité sans exploitation possible immédiate, dégradation partielle | < 24 h |
| **S4** | Anomalie mineure, dette de sécurité | Prochain sprint |

### 5.2 Procédure S1/S2

1. **Détecter et qualifier** — un responsable d'incident nommé, un canal dédié, une horloge démarrée.
2. **Contenir** — révoquer les sessions concernées, désactiver la fonction par feature flag, isoler la clé ou le
   compte compromis. *La contention prime sur l'investigation.*
3. **Préserver les preuves** — instantané des logs et de la base avant toute correction. Ne jamais nettoyer d'abord.
4. **Évaluer la portée** — quelles personnes, quelles données, quelle période, quel volume.
5. **Corriger** — déployer, vérifier, confirmer la fin de l'exposition.
6. **Notifier** — informer le porteur de projet immédiatement ; **saisir le conseil juridique dans les 24 h** pour
   déterminer les obligations de notification aux autorités et aux personnes concernées, pays par pays. *Le délai
   applicable dépend du cadre local et n'est pas tranché dans ce document.*
7. **Communiquer aux membres** — message factuel : ce qui s'est passé, quelles données, quoi faire. Jamais de
   minimisation.
8. **Analyser** — post-mortem écrit sous 5 jours ouvrés, **sans recherche de faute individuelle**, avec actions
   correctives datées et responsables nommés.

### 5.3 Cas particuliers

- **Suspicion de mineur sur la plateforme** → traitement immédiat P0, suspension conservatoire du compte, revue
  humaine, conservation des preuves, saisine du conseil juridique sur les obligations de signalement.
- **Menace physique signalée entre membres** → P0, suspension conservatoire, conservation des échanges concernés,
  procédure d'escalade vers le responsable et, selon l'avis juridique, vers les autorités compétentes.
- **Compromission d'un prestataire** → basculer le port vers l'implémentation de secours ou le mode simulé,
  révoquer les clés, examiner les événements reçus sur la période.

---

## 6. Divulgation responsable

Nous accueillons favorablement les signalements de vulnérabilités.

**Contact :** `securite@<domaine-à-définir>` — *adresse à créer avant l'ouverture publique (checklist §7).*

**Engagements.** Accusé de réception sous 72 h · évaluation sous 7 jours · information sur la correction ·
remerciement public si souhaité · **aucune poursuite** contre un chercheur respectant les règles ci-dessous.

**Règles.** Ne pas accéder, modifier, exfiltrer ni conserver de données appartenant à des tiers · ne pas dégrader le
service · utiliser exclusivement des comptes de test créés par vos soins · ne pas divulguer publiquement avant
correction ou 90 jours · pas d'ingénierie sociale envers l'équipe ou les membres.

**Hors périmètre.** Absence de bonnes pratiques sans impact démontré · déni de service par volume · vulnérabilités
de services tiers · rapports d'analyse automatique sans preuve d'exploitabilité.

**Pas de programme de récompense monétaire au lancement.** Le dire clairement vaut mieux que de le laisser supposer.

---

## 7. Checklist avant production

Aucune ouverture publique tant que chaque ligne « bloquant » n'est pas cochée et datée.

### Secrets et configuration
- [ ] **Bloquant.** Aucun secret dans le dépôt ni dans l'historique Git (gitleaks sur l'historique complet)
- [ ] **Bloquant.** Tous les secrets dans un gestionnaire dédié, distincts par environnement
- [ ] **Bloquant.** `.env.example` sans aucune valeur réelle
- [ ] Rotation des clés documentée et testée au moins une fois

### Authentification et autorisation
- [ ] **Bloquant.** Test d'inventaire des routes vert — aucune route sans politique
- [ ] **Bloquant.** Matrice d'autorisation verte sur toutes les routes
- [ ] **Bloquant.** 2FA effective et obligatoire sur tous les comptes back-office
- [ ] **Bloquant.** Aucun compte administrateur par défaut, aucun mot de passe de démonstration en production
- [ ] Rotation et révocation de tokens vérifiées en recette

### Données
- [ ] **Bloquant.** Schéma `kyc` séparé, rôle PostgreSQL distinct, test d'accès croisé refusé
- [ ] **Bloquant.** Chiffrement applicatif actif sur tous les champs listés au §2
- [ ] **Bloquant.** Aucune donnée sensible dans les logs (test de fuite vert)
- [ ] **Bloquant.** Purges de conservation actives et vérifiées sur données réelles de recette
- [ ] Durées de conservation **validées par le conseil juridique**

### Infrastructure
- [ ] **Bloquant.** TLS 1.3, HSTS, en-têtes de sécurité vérifiés sur les trois façades
- [ ] **Bloquant.** CORS restreint aux origines réelles
- [ ] **Bloquant.** Buckets média et KYC **non publics** — vérifié depuis l'extérieur
- [ ] **Bloquant.** Sauvegardes chiffrées automatiques **et restauration réellement testée**
- [ ] Plan de reprise d'activité écrit, avec objectifs de temps et de perte de données chiffrés
- [ ] Alertes en place et testées (dépassement SLA, consultation KYC en volume, dead-letter)

### Application
- [ ] **Bloquant.** Les 18 parcours E2E verts, dont les n° 3, 9, 14 et 18
- [ ] **Bloquant.** Aucune vulnérabilité critique ou élevée dans les dépendances
- [ ] **Bloquant.** Test d'intrusion externe réalisé, aucune vulnérabilité critique ouverte
- [ ] **Bloquant.** Aucun port critique en mode simulé (vérifié par `/health/providers`)
- [ ] Tests de charge passés au profil de pic d'ouverture

### Modération et conformité
- [ ] **Bloquant.** Équipe de modération recrutée, formée, et opérationnelle **avant** l'ouverture
- [ ] **Bloquant.** Procédure d'escalade documentée pour les cas P0
- [ ] **Bloquant.** CGU, politique de confidentialité, charte de bonne conduite **validées par un conseil juridique**
- [ ] **Bloquant.** Politique de conservation et processus KYC validés juridiquement pour le Cameroun, le Bénin et la Côte d'Ivoire
- [ ] Adresse `securite@` créée et surveillée
- [ ] Procédure de gestion d'incident répétée au moins une fois à blanc

---

## 8. Avertissement juridique

Ce document décrit des **mesures techniques**. Il ne constitue **pas** un avis juridique et ne se substitue pas à
l'analyse de conformité applicable au Cameroun, au Bénin, en Côte d'Ivoire, ni au RGPD en cas d'ouverture européenne.

Les conditions générales d'utilisation, la politique de confidentialité, la politique de conservation, le processus
KYC, les règles de modération et les obligations de notification d'incident **doivent être validés par un conseil
juridique compétent avant le lancement public**.
