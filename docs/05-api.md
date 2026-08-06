# 05 — API REST et politique d'autorisation

Spécification exécutable : [`docs/api/openapi.yaml`](./api/openapi.yaml) (OpenAPI 3.1, servie par Swagger sur
`/api/docs` hors production).

**Règle absolue : aucune route sans politique d'autorisation explicite.** Un test d'inventaire parcourt les
métadonnées de tous les contrôleurs et **échoue** si une route ne déclare ni `@Auth(...)` ni `@Public()`.

---

## 1. Conventions

| Aspect | Règle |
|---|---|
| Base | `/api/v1` — le versionnement est dans le chemin, jamais dans un en-tête |
| Format | JSON uniquement ; `multipart/form-data` pour les seuls envois de fichiers |
| Authentification | `Authorization: Bearer <access token>` (15 min) |
| Rafraîchissement | Refresh token dans le corps (mobile) ou cookie `HttpOnly; Secure; SameSite=Strict` (web) |
| Pagination | `?limit=20&cursor=...` → `{ items, nextCursor, hasMore }` — **jamais d'`offset`** |
| Idempotence | En-tête `Idempotency-Key` obligatoire sur `POST /payments/*` et `POST /messages` |
| Erreurs | Enveloppe unique `{ error: { code, message, details, requestId, timestamp } }` |
| Rate limit | En-têtes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` |
| Langue | `Accept-Language: fr` (seule locale au MVP, en-tête déjà honoré) |

### Politiques d'autorisation — vocabulaire

| Politique | Signification |
|---|---|
| `PUBLIC` | Aucune authentification |
| `AUTH` | Token valide, session non révoquée, compte ni suspendu ni banni |
| `AUTH_PENDING` | Token valide mais compte non encore vérifié (parcours d'onboarding) |
| `VERIFIED` | `AUTH` + `verificationStatus = VERIFIED` — **porte serveur** (ADR-006) |
| `OWNER` | `VERIFIED` + la ressource appartient à l'appelant |
| `MEMBER` | `VERIFIED` + l'appelant est membre de la conversation, match actif, aucun blocage |
| `ADMIN:<perm>` | Rôle back-office portant la permission nommée (voir [06](./06-roles-et-permissions.md)) |

---

## 2. Authentification — `/auth`

| Méthode | Route | Politique | Rate limit | Description |
|---|---|---|---|---|
| POST | `/auth/register` | `PUBLIC` | 5/h par IP, 3/j par numéro | Inscription : numéro, date de naissance, genre, consentements, code d'invitation. **Âge calculé serveur** ; mineur → 403 `AUTH_UNDERAGE` définitif |
| POST | `/auth/otp/request` | `PUBLIC` | 3/10 min par numéro | Demande ou renvoi d'un OTP |
| POST | `/auth/otp/verify` | `PUBLIC` | 5 essais par défi | Valide l'OTP → tokens |
| POST | `/auth/login/password` | `PUBLIC` | 10/h par IP, 5 par compte | Connexion e-mail + mot de passe |
| POST | `/auth/login/phone` | `PUBLIC` | 3/10 min | Connexion par OTP |
| POST | `/auth/refresh` | `PUBLIC`* | 60/h | Rotation du refresh token. *Le token **est** l'authentification |
| POST | `/auth/logout` | `AUTH` | 30/h | Révoque la session courante |
| POST | `/auth/logout-all` | `AUTH` | 5/h | Révoque **toutes** les sessions |
| GET | `/auth/sessions` | `AUTH` | 60/h | Sessions et appareils actifs |
| DELETE | `/auth/sessions/{id}` | `OWNER` | 30/h | Déconnecte un appareil |
| POST | `/auth/recovery/request` | `PUBLIC` | 3/h | Récupération — **réponse identique que le compte existe ou non** |
| POST | `/auth/recovery/confirm` | `PUBLIC` | 5/h | Nouveau mot de passe après OTP |
| POST | `/auth/email` | `AUTH` | 5/h | Ajoute un e-mail (déclenche vérification) |
| POST | `/auth/email/verify` | `AUTH` | 10/h | Confirme l'e-mail |
| POST | `/auth/password` | `AUTH` | 5/h | Change le mot de passe — révoque les autres sessions |
| POST | `/auth/phone/change` | `AUTH` | 2/j | Change le numéro — **double OTP** ancien + nouveau, audité |
| GET | `/auth/me` | `AUTH_PENDING` | 120/h | Compte, statuts, étape d'onboarding suivante |

### Codes d'erreur

`AUTH_UNDERAGE` · `AUTH_INVALID_CREDENTIALS` · `AUTH_OTP_INVALID` · `AUTH_OTP_EXPIRED` · `AUTH_OTP_MAX_ATTEMPTS` ·
`AUTH_ACCOUNT_LOCKED` · `AUTH_ACCOUNT_SUSPENDED` · `AUTH_ACCOUNT_BANNED` · `AUTH_TOKEN_EXPIRED` ·
`AUTH_TOKEN_REUSED` (vol détecté → famille révoquée) · `AUTH_PHONE_ALREADY_USED` · `AUTH_IDENTITY_BLOCKED`
(ré-inscription refusée, message volontairement neutre).

---

## 3. Vérification d'identité — `/verification`

| Méthode | Route | Politique | Description |
|---|---|---|---|
| GET | `/verification/status` | `AUTH_PENDING` | Statut courant, motif de rejet, action attendue |
| POST | `/verification/requests` | `AUTH_PENDING` | Ouvre une demande |
| POST | `/verification/requests/{id}/documents` | `OWNER` | Envoi d'une pièce ou d'un selfie (`multipart`, ≤ 10 Mo). Écrit dans le **bucket KYC**, jamais dans le bucket média |
| POST | `/verification/requests/{id}/submit` | `OWNER` | Soumet pour revue → `PENDING` |
| GET | `/verification/requests/{id}` | `OWNER` | Statut de la demande. **Ne renvoie jamais d'URL de document** |
| POST | `/verification/webhook/{provider}` | `PUBLIC`* | *Signature vérifiée avant toute lecture. Idempotent |

**Machine à états** (transitions serveur uniquement) :

```
NOT_STARTED → PENDING → IN_REVIEW → VERIFIED
                             ├──→ REJECTED (re-soumission possible après délai)
                             └──→ ADDITIONAL_REQUIRED → PENDING
VERIFIED → SUSPENDED (décision de modération) → PENDING (re-vérification)
```

`birthDateLock = true` dès `VERIFIED` : toute tentative de modification de la date de naissance renvoie
`KYC_BIRTHDATE_LOCKED`. Seul un `SUPER_ADMIN` peut la corriger, avec motif obligatoire et audit.

Codes : `KYC_ALREADY_VERIFIED` · `KYC_DOCUMENT_TOO_LARGE` · `KYC_DOCUMENT_INVALID_TYPE` · `KYC_DUPLICATE_DOCUMENT`
(pièce déjà utilisée par un autre compte) · `KYC_BIRTHDATE_LOCKED` · `KYC_REVIEW_PENDING`.

---

## 4. Profil et médias — `/profile`, `/media`

| Méthode | Route | Politique | Description |
|---|---|---|---|
| GET | `/profile/me` | `AUTH_PENDING` | Mon profil, complétion, éléments manquants |
| PATCH | `/profile/me` | `AUTH_PENDING` | Mise à jour partielle (Zod strict, texte assaini) |
| POST | `/profile/me/publish` | `AUTH_PENDING` | Publication — exige `VERIFIED`, complétion ≥ 60, ≥ 1 photo approuvée |
| PATCH | `/profile/me/status` | `AUTH` | `ACTIVE` / `PAUSED` / `DEACTIVATED` |
| GET | `/profile/me/preferences` | `AUTH_PENDING` | Préférences |
| PUT | `/profile/me/preferences` | `AUTH_PENDING` | Remplace les préférences (filtres Premium refusés sans droit) |
| GET | `/profiles/{userId}` | `VERIFIED` | Profil public d'autrui. Écrit un `ProfileView`. 404 si bloqué, suspendu ou non éligible — **jamais 403** (ne pas confirmer l'existence) |
| POST | `/media/photos` | `AUTH_PENDING` | Envoi d'une photo (≤ 8 Mo). Retourne `PENDING_MODERATION` |
| DELETE | `/media/photos/{id}` | `OWNER` | Suppression logique |
| PATCH | `/media/photos/{id}/position` | `OWNER` | Réordonne |
| POST | `/media/photos/{id}/primary` | `OWNER` | Photo principale (doit être `APPROVED`) |
| GET | `/media/{storageKey}/url` | `AUTH` | **URL signée, 5 min.** Vérifie que l'appelant a le droit de voir ce média |
| GET | `/interests` | `AUTH_PENDING` | Référentiel des intérêts et valeurs |
| GET | `/cities?country=CM` | `PUBLIC` | Référentiel des villes |

**Pipeline média** (asynchrone, file `media`) : signature binaire réelle → refus si type déclaré ≠ type réel →
dimensions et poids → **suppression EXIF** → ré-encodage → miniatures 200/600/1200 → empreinte perceptuelle →
pré-modération automatique → `PENDING_MODERATION` ou `REJECTED`.

Codes : `MEDIA_TOO_LARGE` · `MEDIA_INVALID_TYPE` · `MEDIA_MAX_PHOTOS` (6) · `MEDIA_NOT_APPROVED` ·
`PROFILE_INCOMPLETE` · `PROFILE_NOT_VERIFIED`.

---

## 5. Découverte et matching — `/discovery`, `/likes`, `/matches`

| Méthode | Route | Politique | Rate limit | Description |
|---|---|---|---|---|
| GET | `/discovery/suggestions` | `VERIFIED` | 120/h | Lot du jour, paginé. Renvoie le quota restant |
| POST | `/discovery/suggestions/{userId}/view` | `VERIFIED` | 600/h | Marque comme vu |
| POST | `/likes` | `VERIFIED` | quota quotidien | `{ targetUserId, type: INTEREST \| PASS }`. Un `INTEREST` réciproque crée **atomiquement** Match + Conversation + notifications |
| DELETE | `/likes/{targetUserId}` | `VERIFIED` | 30/h | Retire un intérêt non encore réciproque |
| GET | `/likes/sent` | `VERIFIED` | 60/h | Intérêts envoyés |
| GET | `/likes/received` | `VERIFIED` | 60/h | Intérêts reçus. **Gratuit : profils floutés et compteur ; Premium : profils visibles** (feature flag `premium.seeLikes`) |
| GET | `/matches` | `VERIFIED` | 60/h | Matchs actifs, paginés |
| DELETE | `/matches/{id}` | `MEMBER` | 20/h | Annule le match → conversation `LOCKED_BY_UNMATCH` |
| POST | `/blocks` | `AUTH` | 30/h | Bloque un membre — **effet immédiat des deux côtés** |
| DELETE | `/blocks/{userId}` | `AUTH` | 30/h | Débloque |
| GET | `/blocks` | `AUTH` | 60/h | Membres bloqués |

**Transaction du match** (une seule transaction PostgreSQL) : créer le `Like` → détecter la réciprocité →
créer le `Match` (ordre `userAId < userBId`) → créer `Conversation` + 2 `ConversationMember` → message système →
émettre `match.created`. En cas d'échec, tout est annulé : **il ne peut exister ni match sans conversation, ni
conversation sans match**.

Codes : `DISCOVERY_QUOTA_EXCEEDED` · `MATCH_ALREADY_DECIDED` · `MATCH_TARGET_NOT_ELIGIBLE` · `MATCH_SELF` ·
`MATCH_BLOCKED`.

---

## 6. Conversations et messages — `/conversations`

| Méthode | Route | Politique | Rate limit | Description |
|---|---|---|---|---|
| GET | `/conversations` | `VERIFIED` | 120/h | Liste triée par `lastMessageAt`, avec non-lus |
| GET | `/conversations/{id}` | `MEMBER` | 120/h | Détail |
| GET | `/conversations/{id}/messages` | `MEMBER` | 300/h | Historique paginé (curseur descendant) |
| POST | `/conversations/{id}/messages` | `MEMBER` | 60/min, 20 sans réponse | Envoi. **`Idempotency-Key` obligatoire** |
| POST | `/conversations/{id}/attachments` | `MEMBER` | 20/h | Image jointe (≤ 8 Mo), modérée avant affichage |
| POST | `/conversations/{id}/read` | `MEMBER` | 300/h | Marque comme lu jusqu'à un message |
| DELETE | `/messages/{id}` | `OWNER` | 60/h | Suppression logique (corps vidé, ligne conservée) |
| PATCH | `/conversations/{id}/mute` | `MEMBER` | 30/h | Silence temporaire |
| PATCH | `/conversations/{id}/archive` | `MEMBER` | 30/h | Archive |

**La règle centrale du produit**, appliquée par `ConversationMemberGuard` sur **chaque** route ci-dessus, et
identiquement sur l'événement Socket.IO `message:send` :

```
match existe ET match.status = ACTIVE
  ET conversation.status = OPEN
  ET appelant ∈ membres de la conversation
  ET aucun Block entre les deux membres
  ET les deux comptes sont ACTIVE et VERIFIED
```

Toute violation → `MSG_NO_MATCH` (403). Il n'existe **aucune** route permettant d'écrire à quelqu'un par son
identifiant : la seule porte d'entrée est une conversation, et une conversation n'existe que par un match.

**Anti-spam** : au-delà de `MSG_UNANSWERED_LIMIT` (défaut 20) messages consécutifs sans réponse dans une même
conversation, l'envoi est bloqué (`MSG_AWAITING_REPLY`). Protège contre le harcèlement par volume.

### Socket.IO — namespace `/ws`

| Sens | Événement | Charge utile |
|---|---|---|
| → | `conversation:join` | `{ conversationId }` — **adhésion revalidée en base** |
| → | `message:send` | `{ conversationId, body, clientIdempotencyKey }` |
| → | `typing:start` / `typing:stop` | `{ conversationId }` |
| → | `message:read` | `{ conversationId, messageId }` |
| ← | `message:new` | message sérialisé |
| ← | `message:status` | `{ messageId, status }` |
| ← | `match:new` | `{ matchId, conversationId, profile }` |
| ← | `notification:new` | notification in-app |
| ← | `conversation:locked` | `{ conversationId, reason }` — blocage, unmatch ou modération |

---

## 7. Signalement — `/reports`

| Méthode | Route | Politique | Rate limit | Description |
|---|---|---|---|---|
| POST | `/reports` | `AUTH` | 10/j | Signale un profil, une photo, un message ou un comportement |
| POST | `/reports/{id}/evidence` | `OWNER` | 20/j | Capture jointe (bucket privé) |
| GET | `/reports/mine` | `AUTH` | 60/h | Mes signalements et leur avancement |

Un signalement crée ou enrichit un `ModerationCase`. **Priorité automatique** :
`UNDERAGE_SUSPICION` → P0 (SLA 2 h) · `IDENTITY_THEFT`, `FINANCIAL_SOLICITATION`, `SCAM_SUSPICION`, `HARASSMENT`,
`HATE_SPEECH` → P1 (6 h) · `SEXUAL_CONTENT`, `INAPPROPRIATE_PHOTO`, `FAKE_PROFILE` → P2 (24 h) · `SPAM`, `OTHER` → P3 (72 h).

Un signalement est **toujours** accepté, même sur un membre déjà signalé — la déduplication se fait au niveau du cas,
jamais à celui du signalant.

---

## 8. Abonnements et paiements — `/subscriptions`, `/payments`

| Méthode | Route | Politique | Description |
|---|---|---|---|
| GET | `/subscriptions/plans` | `AUTH` | Plans actifs du pays, prix en unité minimale + devise + libellé formaté |
| GET | `/subscriptions/me` | `AUTH` | Abonnement courant et droits ouverts |
| POST | `/subscriptions` | `VERIFIED` | Souscrit → crée un `Payment` et retourne l'instruction de paiement |
| POST | `/subscriptions/me/cancel` | `OWNER` | Annule en fin de période (`cancelAtPeriodEnd`) |
| POST | `/payments/checkout` | `VERIFIED` | Démarre un paiement. **`Idempotency-Key` obligatoire** |
| GET | `/payments` | `AUTH` | Historique paginé |
| GET | `/payments/{id}/receipt` | `OWNER` | Reçu PDF |
| POST | `/payments/webhook/{provider}` | `PUBLIC`* | *Signature vérifiée **avant** lecture du corps. Persistance immédiate, 200 immédiat, traitement asynchrone idempotent |
| POST | `/boosts` | `VERIFIED` | Achète un boost (flag `boost.enabled`) |
| GET | `/boosts/me` | `AUTH` | Boosts actifs et passés |

**Tant que `PAYMENT_PROVIDER=mock`**, toutes les réponses portent `"testMode": true` et l'interface affiche un
bandeau « Mode test — aucun paiement réel ». Non désactivable côté client.

Codes : `SUB_ALREADY_ACTIVE` · `SUB_PLAN_UNAVAILABLE` · `PAY_PROVIDER_ERROR` · `PAY_DUPLICATE_IDEMPOTENCY_KEY` ·
`PAY_AMOUNT_MISMATCH` · `PAY_CURRENCY_UNSUPPORTED` · `PAY_REFUND_NOT_ALLOWED`.

---

## 9. Notifications, confidentialité, migration

| Méthode | Route | Politique | Description |
|---|---|---|---|
| GET | `/notifications` | `AUTH` | Centre in-app, paginé |
| POST | `/notifications/{id}/read` | `OWNER` | Marque comme lue |
| POST | `/notifications/read-all` | `AUTH` | Tout marquer comme lu |
| GET | `/notifications/preferences` | `AUTH` | Préférences par type et canal |
| PUT | `/notifications/preferences` | `AUTH` | Met à jour — **les types de sécurité sont rejetés côté serveur** (`NOTIF_MANDATORY_TYPE`) |
| POST | `/devices` | `AUTH` | Enregistre un appareil et son jeton push |
| DELETE | `/devices/{id}` | `OWNER` | Retire un appareil |
| GET | `/privacy/consents` | `AUTH` | Historique des consentements et versions |
| POST | `/privacy/consents` | `AUTH_PENDING` | Enregistre un consentement versionné |
| POST | `/privacy/export` | `AUTH` | Demande d'export (1 par 30 j) |
| GET | `/privacy/export/{id}` | `OWNER` | Statut ; URL signée 72 h quand prêt |
| POST | `/privacy/delete` | `AUTH` | Suppression avec 30 j de grâce |
| DELETE | `/privacy/delete` | `AUTH` | **Annule** la suppression pendant la grâce |
| GET | `/invites/{code}` | `PUBLIC` | Valide un code, incrémente les clics, retourne l'offre — **ne révèle jamais l'identité de l'invitant** |
| GET | `/me/referral` | `VERIFIED` | Mon code de parrainage et ses statistiques |

---

## 10. Back-office — `/admin`

Toutes les routes : rôle requis, **2FA obligatoire**, session 8 h, `AdminAuditLog` systématique.

| Domaine | Routes | Permission |
|---|---|---|
| Tableau de bord | `GET /admin/dashboard`, `/admin/metrics` | `analytics.read` |
| Utilisateurs | `GET /admin/users`, `GET /admin/users/{id}`, `GET /admin/users/{id}/sessions`, `GET /admin/users/{id}/sanctions` | `users.read` |
| Sanctions | `POST /admin/users/{id}/suspend`, `/ban`, `/restrict`, `/reinstate`, `/require-reverification` | `users.sanction` — `BAN` exige `users.ban` **et** un second valideur |
| Vérification | `GET /admin/verification/queue`, `GET /admin/verification/{id}`, `POST /admin/verification/{id}/decision` | `kyc.review` |
| Documents KYC | `GET /admin/verification/{id}/documents/{docId}/url` | `kyc.view_document` — **motif obligatoire, URL 5 min, audit nominatif** |
| Modération | `GET /admin/moderation/cases`, `POST /admin/moderation/cases/{id}/assign`, `/action`, `/escalate`, `/resolve` | `moderation.*` |
| Photos | `GET /admin/moderation/photos`, `POST /admin/moderation/photos/{id}/decision` | `moderation.content` |
| Contenus | `GET/PUT /admin/content/{key}` (CGU, charte, confidentialité, modèles) | `content.manage` |
| Commercial | `GET/POST/PATCH /admin/plans`, `GET /admin/subscriptions`, `/transactions`, `POST /admin/payments/{id}/refund` | `billing.*` — remboursement à quatre yeux |
| Campagnes | `GET/POST /admin/campaigns`, `POST /admin/campaigns/{id}/invites` | `campaign.manage` |
| Feature flags | `GET/PATCH /admin/feature-flags` | `system.flags` |
| Audit | `GET /admin/audit-logs` | `audit.read` — **lecture seule, aucune route d'écriture ou de suppression n'existe** |
| Rôles | `GET/POST/DELETE /admin/users/{id}/roles` | `system.roles` (`SUPER_ADMIN` uniquement) |

---

## 11. Santé et exploitation

| Route | Politique | Usage |
|---|---|---|
| `GET /health/live` | `PUBLIC` | Le process répond |
| `GET /health/ready` | `PUBLIC` | PostgreSQL, Redis, stockage joignables |
| `GET /health/providers` | `ADMIN:system.read` | **État réel/simulé de chaque port** — la source de vérité de `MOCKS.md` |
| `GET /metrics` | réseau interne | Métriques |

---

## 12. Ce que l'API ne fait jamais

1. Renvoyer un numéro de téléphone, un e-mail ou une date de naissance d'un **autre** membre.
2. Renvoyer une URL de document d'identité en dehors de `/admin/verification/.../url`, avec motif et audit.
3. Renvoyer une position géographique plus précise que la ville.
4. Renvoyer un horodatage d'activité plus précis que « aujourd'hui / cette semaine / ce mois-ci ».
5. Distinguer « ce membre n'existe pas » de « ce membre vous a bloqué » — les deux renvoient 404.
6. Accepter une valeur d'âge, de statut de vérification ou de droit Premium venant du client.
7. Exposer une trace technique, un nom de table ou une requête dans une réponse d'erreur.
