# 03 — Modèle de données

Référence exécutable : [`prisma/schema.prisma`](../prisma/schema.prisma) — **validé** par `prisma validate`.

Ce document donne, pour chaque entité : rôle · champs notables · relations · index · contraintes uniques · règles de
suppression · données sensibles · conservation indicative.

---

## Conventions transverses

| Règle                   | Application                                                                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dates**               | `DateTime @db.Timestamptz(3)`, toujours en UTC. Conversion à l'affichage uniquement.                                                                                                                                         |
| **Montants**            | `amountMinor: Int` + `currency: Char(3)` + `minorUnitExponent: Int`. **XAF/XOF : exposant 0.**                                                                                                                               |
| **Identifiants**        | `cuid()`. Curseur de pagination = base64url de `(createdAt, id)`.                                                                                                                                                            |
| **Chiffré**             | AES-256-GCM applicatif, clé en environnement, rotation prévue. Concerne : `phoneE164`, `Device.pushToken`, `OtpChallenge.destination`, `Message.body`, `User.twoFactorSecret`, champs `*Encrypted` de `VerificationRequest`. |
| **Haché**               | SHA-256 + sel serveur, non réversible. Concerne : `phoneHash`, `codeHash`, `refreshTokenHash`, `documentNumberHash`, `fingerprintHash`, `subjectHash`.                                                                       |
| **IP**                  | Toujours tronquée aux 3 premiers octets avant écriture. Jamais d'IPv6 complète.                                                                                                                                              |
| **Suppression logique** | `deletedAt` là où l'audit ou la conversation d'autrui l'exige ; suppression réelle sinon.                                                                                                                                    |
| **Schémas PostgreSQL**  | `app` (produit) et `kyc` (identité) — rôles distincts, aucune jointure applicative (ADR-004).                                                                                                                                |

**Ce qui n'est volontairement pas stocké :** l'âge (calculé depuis `birthDate`), le nombre de matchs, le nombre de
messages, la distance géographique, le statut Premium (dérivé de `Subscription`), l'URL publique d'un média (toujours
signée à la demande).

---

## 1. Compte et accès — schéma `app`

### `User`

- **Rôle.** Le compte. Ne contient **aucune** donnée de profil publique — cette séparation permet d'exposer un profil sans jamais approcher les données d'authentification.
- **Champs notables.** `phoneE164` (chiffré), `phoneHash`, `email?`, `passwordHash?` (Argon2id), `birthDate` + `birthDateLock`, `gender`, `accountStatus` (9 états), `verificationStatus` (7 états), `twoFactorSecret?`, `failedLoginCount`/`lockedUntil`, `lastActiveAt`, `referralCode`, `usedInviteId`, `deletionAt`.
- **Relations.** 1-1 `Profile`, `Preference` · 1-N sessions, appareils, rôles, photos, likes, matchs, paiements, consentements… · N-1 `ReferralInvite`.
- **Index.** `(accountStatus, verificationStatus)` — filtre principal de la découverte et du back-office · `(createdAt desc, id)` — pagination · `(lastActiveAt desc)` — tri d'activité · `(deletionAt)` — worker de purge.
- **Unicité.** `phoneE164`, `phoneHash`, `email`, `referralCode`.
- **Suppression.** Jamais de `DELETE`. Anonymisation à l'issue de la grâce : numéro et e-mail remplacés par des valeurs aléatoires, `accountStatus = DELETED`, cascade sur profil/photos/préférences.
- **Sensible.** Numéro, e-mail, date de naissance, secret 2FA, IP.
- **Conservation.** Actif tant que le compte vit ; 30 jours de grâce puis anonymisation (H6).

### `UserSession`

- **Rôle.** Une session = un refresh token. Support de la rotation, de la révocation ciblée et de la détection de vol.
- **Champs.** `refreshTokenHash`, `familyId`, `deviceId?`, `ipV4`, `userAgent`, `expiresAt`, `revokedAt`/`revokedReason`, `lastUsedAt`.
- **Relations.** N-1 `User`, N-1 `Device`.
- **Index.** `(userId, revokedAt)` — « déconnecter tous les appareils » · `(familyId)` — révocation de famille · `(expiresAt)` — purge.
- **Unicité.** `refreshTokenHash`.
- **Suppression.** Cascade avec `User`. Purge des sessions expirées depuis plus de 90 jours.
- **Sensible.** Empreinte de token, IP, agent utilisateur.
- **Conservation.** 30 jours après expiration (utile à une enquête de sécurité), puis suppression.

### `Device`

- **Rôle.** Appareil connu : notifications push, détection de changement fréquent d'appareil (signal de fraude), affichage « vos appareils » dans les paramètres.
- **Champs.** `fingerprintHash`, `type`, `model`, `osVersion`, `appVersion`, `pushToken` (chiffré), `trusted`, `lastSeenAt`.
- **Index.** `(fingerprintHash)` — corrélation de comptes liés.
- **Unicité.** `(userId, fingerprintHash)`.
- **Suppression.** Cascade avec `User`. `pushToken` effacé dès la déconnexion de l'appareil.
- **Sensible.** Empreinte d'appareil, jeton push.
- **Conservation.** 12 mois après la dernière utilisation.

### `UserRole`

- **Rôle.** Rôle back-office. Un membre ordinaire n'a **aucune ligne** ici — l'absence de ligne est l'absence de privilège.
- **Champs.** `role` (7 valeurs), `grantedBy`, `grantedAt`, `revokedAt?`.
- **Index.** `(role, revokedAt)` — lister les administrateurs actifs.
- **Unicité.** `(userId, role)`.
- **Suppression.** Jamais supprimé : `revokedAt` renseigné, ce qui préserve l'historique des privilèges.
- **Sensible.** Oui — un changement de rôle produit toujours un `AdminAuditLog`.
- **Conservation.** Permanente (traçabilité des privilèges).

### `OtpChallenge`

- **Rôle.** Défi OTP pour l'inscription, la connexion, le changement de numéro, la récupération et les actions sensibles.
- **Champs.** `purpose`, `codeHash`, `destination` (chiffrée), `attemptCount`/`maxAttempts`, `expiresAt`, `consumedAt`.
- **Index.** `(userId, purpose, consumedAt)` — anti-renvoi abusif · `(expiresAt)` — purge.
- **Suppression.** Purge après 24 h. Aucune valeur au-delà.
- **Sensible.** Empreinte du code, destination.
- **Conservation.** 24 h.

### `BlockedIdentity`

- **Rôle.** Empêcher la ré-inscription d'un compte banni ou refusé pour minorité, **sans conserver l'identité** (ADR-013).
- **Champs.** `phoneHash?`, `documentNumberHash?`, `deviceFingerprint?`, `reason`, `expiresAt?` (null = permanent).
- **Index.** `(documentNumberHash)`, `(deviceFingerprint)`. **Unicité** : `phoneHash`.
- **Suppression.** Jamais pour `UNDERAGE` et `BANNED`. Les entrées `SELF_DELETED` expirent.
- **Sensible.** Empreintes uniquement — aucune donnée en clair, aucun profil, aucune photo.
- **Conservation.** Permanente pour minorité et bannissement ; à valider juridiquement.

---

## 2. Profil — schéma `app`

### `City`

- **Rôle.** Référentiel fermé (ADR-011). Évite la saisie libre incohérente et supprime le besoin de GPS.
- **Champs.** `countryCode`, `name`, `region`, `slug`. **Unicité** `(countryCode, slug)`. **Index** `(countryCode, name)`.
- **Suppression.** `Restrict` depuis `Profile` — on ne supprime pas une ville utilisée.
- **Sensible.** Non. **Conservation** permanente.

### `Profile`

- **Rôle.** Toutes les données publiques du membre.
- **Champs.** `firstName`, `cityId`, `profession?`, `educationLevel?`, `relationship?`, `hasChildren?`, `bio`, `lookingFor`, `personalValues`, `status` (5 états), `completionRate`, `primaryPhotoId`, `publishedAt`.
- **Relations.** 1-1 `User` · N-1 `City` · N-N `Interest` via `ProfileInterest`.
- **Index.** `(status, cityId)` — pré-filtre de la découverte · `(completionRate)`.
- **Unicité.** `userId`, `primaryPhotoId`.
- **Suppression.** Cascade avec `User` ; `deletedAt` pour la désactivation réversible.
- **Sensible.** Modérément — texte libre visible d'autrui, soumis à modération.
- **Conservation.** Vie du compte.

### `Interest` / `ProfileInterest`

- **Rôle.** Référentiel fermé de centres d'intérêt et de valeurs (`category`), et son association aux profils. Le référentiel fermé est ce qui rend le score de compatibilité calculable et le contenu modérable.
- **Index.** `(category, active)` ; `(interestId)` sur la table de liaison. **Clé primaire** composite `(profileId, interestId)`.
- **Suppression.** Cascade des deux côtés de la liaison ; un `Interest` est désactivé (`active=false`), jamais supprimé.
- **Sensible.** Certains intérêts peuvent révéler une conviction — n'entrent dans le score que par déclaration explicite du membre.
- **Conservation.** Permanente pour le référentiel.

### `Preference`

- **Rôle.** Critères de recherche déclarés. Alimente directement le filtre et le score.
- **Champs.** `seekingGender`, `minAge`/`maxAge`, `sameCountryOnly`, `acceptedRelationshipStatuses[]`, `acceptsChildren?`, `minEducationLevel?` _(Premium)_, `requiredInterestIds[]` _(Premium)_, `dailySuggestionLimit`.
- **Relations.** 1-1 `User` · N-N `City` via `PreferenceCity`.
- **Unicité.** `userId`. **Suppression.** Cascade.
- **Conservation.** Vie du compte.

### `Photo`

- **Rôle.** Photo de profil. Stockage **privé**, servie uniquement par URL signée de courte durée.
- **Champs.** `storageKey`, `thumbnailStorageKey`, `position`, `status` (6 états), dimensions, `sizeBytes`, `contentType`, `perceptualHash`, champs de modération.
- **Index.** `(status, createdAt)` — file de modération · `(perceptualHash)` — détecte la même photo réutilisée sur plusieurs comptes, signal de faux profil.
- **Unicité.** `storageKey`, `(userId, position)`.
- **Suppression.** `deletedAt` puis suppression réelle de l'objet S3 sous 7 jours (le délai permet de traiter un signalement portant sur une photo supprimée).
- **Sensible.** Oui — image de personne.
- **Conservation.** Vie du profil ; 7 jours après suppression ; une photo rejetée est purgée sous 30 jours (motif conservé).

---

## 3. Vérification d'identité — schéma `kyc` (séparé)

### `VerificationRequest`

- **Rôle.** Une demande de vérification et son état. Pivot de la machine à états à 7 statuts.
- **Champs.** `status`, `providerName?`/`providerReference?`, `documentNumberHash`, `legalNameEncrypted`, `birthDateEncrypted`, `livenessScore?`, `faceMatchScore?`, `submittedAt`, `decidedAt`, `purgeAt`.
- **Index.** `(status, submittedAt)` — file de vérification, tri par ancienneté · `(userId, submittedAt desc)` · `(documentNumberHash)` — **une même pièce ne peut vérifier deux comptes** · `(purgeAt)` — worker de purge.
- **Suppression.** Cascade avec `User`. Les documents sont purgés bien avant la requête, qui conserve la trace de la décision.
- **Sensible.** **Maximal.** Nom légal, date de naissance officielle, scores biométriques.
- **Conservation.** Documents 90 jours après décision (H6) ; trace de décision 5 ans (à valider juridiquement).

### `VerificationDocument`

- **Rôle.** Le fichier lui-même : pièce, selfie, capture de vivacité. **La donnée la plus sensible de la plateforme.**
- **Champs.** `type`, `storageKey` (bucket KYC dédié), `contentType`, `sizeBytes`, `checksum`, `uploadedAt`, `purgedAt`.
- **Index.** `(requestId)`, `(checksum)` — détecte le renvoi d'un document déjà refusé, `(purgedAt)`.
- **Unicité.** `storageKey`.
- **Suppression.** **Purge réelle obligatoire** (objet S3 supprimé, `purgedAt` renseigné, ligne conservée sans clé). Aucune URL publique n'existe jamais ; l'accès agent passe par une URL signée de 5 minutes, journalisée nominativement.
- **Conservation.** 90 jours après décision, configurable — **la valeur définitive relève du conseil juridique**.

### `VerificationDecision`

- **Rôle.** Décision **immuable**. Une correction crée une nouvelle décision, elle n'écrase jamais la précédente.
- **Champs.** `outcome`, `reasonCode` (catalogue normalisé), `reasonNote?`, `decidedByUserId?`, `decidedBySystem`.
- **Index.** `(requestId, createdAt)`, `(decidedByUserId)` — audit par agent.
- **Suppression.** Aucune, hors purge de la requête parente.
- **Conservation.** 5 ans (indicatif, à valider).

---

## 4. Découverte et matching — schéma `app`

### `ProfileView`

- **Rôle.** Profils déjà vus (exclusion des suggestions) et taux d'intérêt. `score` conservé pour **auditer une recommandation a posteriori** — indispensable si un membre conteste une suggestion.
- **Index.** `(viewedId, createdAt desc)`, `(viewerId, createdAt desc)`. **Unicité** `(viewerId, viewedId)`.
- **Suppression.** Cascade. Purge après 12 mois.
- **Conservation.** 12 mois.

### `Like`

- **Rôle.** Intérêt (`INTEREST`) ou refus (`PASS`). Deux `INTEREST` réciproques créent un `Match`.
- **Champs.** `type`, `revokedAt?` (retrait d'un intérêt avant match).
- **Index.** `(receiverId, type, createdAt desc)` — « intérêts reçus » · `(senderId, type, createdAt desc)` — « intérêts envoyés » et quota quotidien.
- **Unicité.** `(senderId, receiverId)` — **c'est cette contrainte qui rend le double-like impossible et le match déterministe**.
- **Suppression.** Cascade. Un `PASS` est conservé (sinon le profil refusé reviendrait).
- **Conservation.** Vie du compte.

### `Match`

- **Rôle.** Accord mutuel. Convention `userAId < userBId` : garantit l'unicité du couple quel que soit l'ordre.
- **Champs.** `status` (3 états), `score`, `matchedAt`, `unmatchedAt`/`unmatchedById`/`unmatchedReason`.
- **Relations.** 1-1 `Conversation`.
- **Index.** `(userAId, status, matchedAt desc)`, `(userBId, status, matchedAt desc)`. **Unicité** `(userAId, userBId)`.
- **Suppression.** Jamais : `status = UNMATCHED`. Un match annulé doit rester traçable pour la modération.
- **Conservation.** Vie du compte.

### `Block`

- **Rôle.** Blocage : invisibilité réciproque et verrouillage de la conversation.
- **Index.** `(blockedId)` — filtre de découverte dans les deux sens. **Unicité** `(blockerId, blockedId)`.
- **Suppression.** Réelle au déblocage (le blocage n'a pas de valeur historique propre ; un signalement en a une).
- **Conservation.** Tant que le blocage est actif.

---

## 5. Conversations et messages — schéma `app`

### `Conversation`

- **Rôle.** Créée **uniquement** depuis un `Match` — la relation obligatoire `matchId` rend structurellement impossible une conversation sans match.
- **Champs.** `status` (5 états), `lastMessageAt` et `lastMessagePreview` (dénormalisés pour trier la liste sans jointure lourde), `lockedAt`/`lockedReason`.
- **Index.** `(status, lastMessageAt desc)`. **Unicité** `matchId`.
- **Suppression.** Jamais : verrouillage. **Conservation** : vie du match.
- **Sensible.** L'aperçu du dernier message est un extrait de contenu privé — jamais journalisé.

### `ConversationMember`

- **Rôle.** État par participant : lecture, non-lus, silence, archivage.
- **Index.** `(userId, archivedAt)`. **Unicité** `(conversationId, userId)`.
- **Suppression.** Cascade. **Conservation** vie de la conversation.

### `Message`

- **Rôle.** Message. `body` chiffré au repos, **lisible par le serveur** (ADR-008 : ce n'est pas du bout-en-bout).
- **Champs.** `type`, `body?`, `deliveryStatus`, `deliveredAt`/`readAt`, `clientIdempotencyKey`, `deletedAt`/`deletedByUserId`, `hiddenByModeration`, `purgeAt`.
- **Index.** `(conversationId, createdAt desc, id)` — **l'index de pagination le plus sollicité de la plateforme** · `(senderId, createdAt desc)` — anti-spam et détection de messages en masse · `(purgeAt)`.
- **Unicité.** `(senderId, clientIdempotencyKey)` — un envoi rejoué sur réseau instable ne crée pas de doublon.
- **Suppression.** Logique : `body` vidé, ligne conservée pour l'audit de modération. Purge réelle à `purgeAt`.
- **Sensible.** **Élevé.** Jamais dans les logs, jamais dans un export analytique, accessible à un modérateur uniquement via un signalement.
- **Conservation.** 24 mois (H6) ; un message rattaché à un cas de modération ouvert est retenu jusqu'à clôture.

### `MessageAttachment`

- **Rôle.** Image jointe (MVP : images uniquement, H14), modérée avant affichage.
- **Index.** `(messageId)`, `(status, createdAt)` — file de modération.
- **Suppression.** `deletedAt` + suppression de l'objet S3 sous 7 jours.
- **Conservation.** Alignée sur le message.

---

## 6. Signalement et modération — schéma `app`

### `Report`

- **Rôle.** Signalement individuel. Plusieurs signalements visant le même membre alimentent un seul `ModerationCase`.
- **Champs.** `targetType` (4), `targetId?`, `category` (11), `description?`, `evidenceKeys[]`.
- **Index.** `(reportedUserId, createdAt desc)` — historique d'un membre · `(reporterId, createdAt desc)` — détecte le signalement abusif en série · `(category, createdAt desc)` · `(caseId)`.
- **Suppression.** Jamais (valeur probatoire). **Conservation** 24 mois après clôture du cas.
- **Sensible.** Description et preuves — accès restreint aux rôles de modération, chaque consultation auditée.

### `ModerationCase`

- **Rôle.** Le dossier de travail. Porte le SLA, l'assignation et la décision.
- **Champs.** `priority` (P0 2 h → P3 72 h), `status` (6), `assignedToUserId`, `slaDueAt`, `resolvedAt`, `internalNotes`, `reportCount`.
- **Index.** `(status, priority, slaDueAt)` — **c'est l'index qui fait fonctionner la file de modération et l'indicateur « < 24 h »** · `(assignedToUserId, status)` · `(subjectId, createdAt desc)`.
- **Suppression.** Jamais. **Conservation** 24 mois après résolution.

### `ModerationAction`

- **Rôle.** Historique **immuable** des actions (10 types). On n'édite jamais, on ajoute.
- **Champs.** `type`, `reasonCode`, `note`, `performedByUserId?`/`performedBySystem`, `approvedByUserId?` (obligatoire pour `BAN` — quatre yeux), `effectiveUntil?`, `revertedAt?`.
- **Index.** `(caseId, createdAt)`, `(performedByUserId, createdAt desc)` — audit par modérateur.
- **Conservation.** 5 ans (indicatif).

### `ModerationSignal`

- **Rôle.** Sortie d'une règle de détection (9 types). Ne déclenche **jamais seul** une sanction lourde (ADR-012).
- **Champs.** `type`, `severity` (1-5), `evidence` (Json non nominatif : compteurs, fenêtre, seuil).
- **Index.** `(userId, type, createdAt desc)`, `(caseId)`.
- **Conservation.** 12 mois.

---

## 7. Abonnements et paiements — schéma `app`

### `SubscriptionPlan`

- **Rôle.** Offre commerciale. `entitlements` (Json) porte les droits : quotas, filtres, boosts inclus — ce qui permet de créer une offre sans redéployer.
- **Champs.** `code`, `interval` (4), `priceMinor`/`currency`/`minorUnitExponent`, `countryCode?`, `entitlements`, `active`.
- **Index.** `(active, countryCode)`. **Unicité** `code`.
- **Suppression.** Jamais : `active = false`. Un plan référencé par un abonnement passé doit rester lisible.
- **Conservation.** Permanente.

### `Subscription`

- **Rôle.** Abonnement d'un membre et son cycle de vie (6 états).
- **Champs.** `startedAt`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `gracePeriodEnd`, `isPromotional`/`promotionCode` (période offerte de migration), `providerSubscriptionRef?`.
- **Index.** `(userId, status)` — résolution des droits Premium à chaque requête · `(status, currentPeriodEnd)` — renouvellements et expirations · `(providerSubscriptionRef)`.
- **Suppression.** Jamais. **Conservation** 10 ans (indicatif, obligations comptables — à valider).

### `Payment`

- **Rôle.** Transaction. **Aucune donnée complète de carte n'est jamais stockée** : au plus `methodLast4` et un libellé d'opérateur.
- **Champs.** `amountMinor`/`currency`/`minorUnitExponent`, `status` (7), `methodType`, `providerPaymentRef?`, `idempotencyKey`, `failureCode`/`failureReason`, `refundedAmountMinor`/`refundedByUserId`, `receiptNumber`.
- **Index.** `(userId, createdAt desc)`, `(status, createdAt desc)` — indicateur de taux d'échec · `(providerName, providerPaymentRef)` — réconciliation.
- **Unicité.** `idempotencyKey`, `receiptNumber`.
- **Suppression.** Jamais — `onDelete: Restrict` depuis `User` : **un compte ayant payé ne peut pas être effacé sans traiter ses paiements**. L'anonymisation dissocie le paiement de l'identité sans détruire l'écriture.
- **Conservation.** 10 ans (indicatif, à valider).

### `PaymentWebhookEvent`

- **Rôle.** Journal des webhooks entrants. **La contrainte unique `(provider, providerEventId)` est la garantie d'idempotence** (ADR-010).
- **Champs.** `signatureValid`, `payload` (Json brut), `payloadHash`, `status` (4), `attemptCount`, `lastError`, `purgeAt`.
- **Index.** `(status, createdAt)` — rejeu des échecs · `(relatedPaymentId)` · `(purgeAt)`.
- **Suppression.** Purge à 90 jours.
- **Sensible.** La charge utile peut contenir des identifiants fournisseur — accès restreint, jamais journalisée.

### `Boost`

- **Rôle.** Mise en avant temporaire : `multiplier` appliqué au score dans la découverte.
- **Champs.** `startsAt`/`endsAt`, `multiplier`, `grantedByPlan`, `impressionsGained`.
- **Index.** `(userId, endsAt desc)`, `(startsAt, endsAt)` — boosts actifs à un instant donné. **Unicité** `paymentId`.
- **Conservation.** 24 mois.

---

## 8. Notifications — schéma `app`

### `Notification`

- **Rôle.** Notification émise, tous canaux. Trace d'envoi et centre de notifications in-app.
- **Champs.** `type` (17), `channel` (4), `title`, `body`, `data` (lien profond), `dedupeKey`, horodatages d'envoi/livraison/lecture/échec.
- **Index.** `(userId, readAt, createdAt desc)` — badge de non-lus · `(purgeAt)`.
- **Unicité.** `(userId, dedupeKey)` — **empêche de relancer deux fois le même membre pour le même motif**.
- **Suppression.** Purge à 90 jours.
- **Sensible.** Le corps peut contenir un prénom ; jamais de contenu de message.

### `NotificationPreference`

- **Rôle.** Préférence par type et par canal. Les types de sécurité (`OTP_CODE`, `SECURITY_ALERT`, `MODERATION_ACTION`, `VERIFICATION_*`) **ne sont pas désactivables — contrôle applicatif, pas seulement d'interface**.
- **Unicité.** `(userId, type, channel)`. **Suppression.** Cascade. **Conservation.** Vie du compte.

---

## 9. Migration et analytics — schéma `app`

### `Campaign`

- **Rôle.** Campagne de migration WhatsApp. Porte l'offre de lancement (`promoPlanCode`, `promoFreeDays`) et le compteur de clics.
- **Index.** `(active, startsAt)`. **Unicité** `code`. **Conservation** permanente (analyse historique).

### `ReferralInvite`

- **Rôle.** Lien ou code traçable, à quota (`maxUses`, `useCount`) — **le quota est le principal garde-fou anti-abus de l'offre de lancement**.
- **Index.** `(code, revokedAt)`, `(campaignId)`, `(inviterId)`. **Unicité** `code`.
- **Suppression.** Jamais : `revokedAt`. **Conservation** permanente.
- **Rappel de principe.** Aucun import automatique de membres ni de données depuis WhatsApp. L'invitation est le **seul** chemin, et elle exige une action volontaire du membre.

### `AnalyticsEvent`

- **Rôle.** Événement produit **pseudonymisé**. `subjectHash` (HMAC de l'userId) permet les cohortes sans identifier.
- **Champs.** `name`, `campaignCode?`, `properties` (Json validé par schéma à l'écriture — **une propriété non déclarée est rejetée**, ce qui empêche une donnée nominative d'entrer par inadvertance).
- **Index.** `(name, occurredAt desc)`, `(subjectHash, occurredAt desc)`, `(campaignCode, name)`, `(purgeAt)`.
- **Suppression.** `userId` passe à null (`SetNull`) à la suppression du compte ; l'événement pseudonymisé survit pour les statistiques agrégées.
- **Conservation.** 14 mois (permet une comparaison annuelle).

---

## 10. Gouvernance — schéma `app`

### `AdminAuditLog`

- **Rôle.** Journal **append-only** de toute action administrative sensible : connexion, consultation d'une pièce d'identité, modification de compte, décision de modération, changement de rôle, export.
- **Champs.** `actorUserId`, `actorRole`, `action`, `targetType`/`targetId`, `context` (avant/après ou motif), `ipV4`, `requestId`.
- **Index.** `(actorUserId, createdAt desc)`, `(action, createdAt desc)`, `(targetType, targetId, createdAt desc)`.
- **Suppression.** **Aucune.** Les droits PostgreSQL du rôle applicatif n'autorisent ni `UPDATE` ni `DELETE` sur cette table — la garantie est au niveau de la base, pas au niveau du code.
- **Conservation.** 5 ans (indicatif).

### `FeatureFlag`

- **Rôle.** Activation par environnement, rôle, pourcentage ou liste d'utilisateurs. `payload` (Json) porte aussi les **pondérations du score de matching** — modifiables sans redéploiement.
- **Unicité.** `key`. **Suppression.** Manuelle, tracée. **Conservation.** Permanente.

### `ConsentRecord`

- **Rôle.** Consentement horodaté et **versionné** (ADR-016) : on peut prouver qui a accepté quoi, dans quelle version.
- **Champs.** `type` (5), `documentVersion`, `granted`, `revokedAt?`, `ipV4`, `channel`.
- **Index.** `(userId, type, createdAt desc)`.
- **Suppression.** Jamais avant la purge du compte. **Conservation** 5 ans après la fin de la relation (indicatif).

### `DataExportRequest`

- **Rôle.** Demande d'accès et d'export des données personnelles.
- **Champs.** `status`, `storageKey?` (archive **chiffrée**, bucket privé), `expiresAt`, `downloadCount`.
- **Index.** `(userId, requestedAt desc)` — limite d'une demande par période, anti-abus · `(status, requestedAt)`.
- **Suppression.** L'archive est supprimée à `expiresAt` (72 h) ; la trace de la demande est conservée.
- **Conservation.** Archive 72 h ; trace 24 mois.

### `AccountDeletionRequest`

- **Rôle.** Demande de suppression avec période de grâce (ADR-017).
- **Champs.** `status`, `reason?`, `executeAt` (H6 : +30 jours), `cancelledAt?`, `executedAt?`.
- **Index.** `(status, executeAt)` — worker de purge quotidien · `(userId, requestedAt desc)`.
- **Conservation.** Trace conservée 24 mois après exécution (preuve du traitement de la demande).

---

## 11. Matrice de conservation (récapitulatif)

| Donnée                           | Durée indicative      | Configurable                     | Décision juridique requise |
| -------------------------------- | --------------------- | -------------------------------- | -------------------------- |
| Documents d'identité             | 90 j après décision   | ✅ `KYC_DOCUMENT_RETENTION_DAYS` | ✅                         |
| Décisions de vérification        | 5 ans                 | ✅                               | ✅                         |
| Messages                         | 24 mois               | ✅ `MESSAGE_RETENTION_MONTHS`    | ✅                         |
| Photos supprimées                | 7 j                   | ✅                               | —                          |
| Compte supprimé (grâce)          | 30 j                  | ✅ `ACCOUNT_DELETION_GRACE_DAYS` | ✅                         |
| Signalements et cas              | 24 mois après clôture | ✅                               | ✅                         |
| Actions de modération            | 5 ans                 | ✅                               | ✅                         |
| Paiements et abonnements         | 10 ans                | ✅                               | ✅ (comptable)             |
| Webhooks                         | 90 j                  | ✅                               | —                          |
| Événements analytics             | 14 mois               | ✅                               | ✅                         |
| Journal d'audit admin            | 5 ans                 | ✅                               | ✅                         |
| Sessions expirées                | 30 j                  | ✅                               | —                          |
| OTP                              | 24 h                  | ✅                               | —                          |
| `BlockedIdentity` (banni/mineur) | permanent             | ⚠️                               | ✅                         |

> **Toutes ces durées sont des valeurs par défaut techniques, pas des conclusions juridiques.** Elles sont portées par
> des variables d'environnement précisément pour être ajustées après l'avis du conseil juridique, pays par pays, sans
> modification de code.

---

## 12. Migrations et seed

- **Migrations versionnées** (`prisma migrate`), une par tranche verticale, nommées `NNNN_<tranche>_<objet>`.
- **Réversibilité** : chaque migration est accompagnée d'un `down.sql` manuel lorsque c'est raisonnablement possible.
  Les cas non réversibles (suppression de colonne contenant des données) sont signalés dans l'en-tête du fichier et
  précédés d'une migration d'expansion — jamais de suppression et d'ajout dans la même migration.
- **Stratégie expand/contract** pour tout renommage : ajouter → double écriture → migrer → lire la nouvelle → supprimer
  l'ancienne. Permet un déploiement sans interruption.
- **Seed de développement** (`prisma/seed/`) : référentiels (pays, ~60 villes des 3 pays, ~80 centres d'intérêt), plans
  d'abonnement en « Mode test », feature flags, comptes back-office de démonstration, 40 profils fictifs avec photos
  générées, quelques matchs, conversations, signalements et un cas de modération ouvert. **Aucune donnée réelle,
  aucun visage réel, jamais de copie de production.**
