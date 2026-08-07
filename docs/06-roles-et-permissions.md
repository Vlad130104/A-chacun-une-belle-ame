# 06 — Rôles, permissions et autorisation

L'autorisation est **centralisée** : une seule chaîne de gardes, une politique déclarée par route, aucune décision
dispersée dans les contrôleurs et **aucune décision côté client**.

---

## 1. Deux populations distinctes

|                  | Membres                 | Back-office                         |
| ---------------- | ----------------------- | ----------------------------------- |
| Identifiant      | Numéro de téléphone     | E-mail professionnel                |
| Authentification | OTP ou mot de passe     | Mot de passe + **2FA obligatoire**  |
| Durée de session | 30 jours (refresh)      | **8 heures**, non prolongeable      |
| Domaine          | `app.<domaine>`         | `admin.<domaine>` (séparé, ADR-014) |
| Rôle             | Aucune ligne `UserRole` | Une ou plusieurs lignes `UserRole`  |

Un compte back-office **n'est pas** un compte membre : il ne possède ni profil, ni suggestions, ni conversations.
Si une personne de l'équipe souhaite aussi utiliser le service, elle crée un compte membre distinct — un
administrateur ne doit jamais pouvoir se suggérer lui-même ni s'auto-vérifier.

---

## 2. Niveaux d'autorisation côté membre

```
PUBLIC
  └─ AUTH_PENDING    token valide — onboarding uniquement
       └─ AUTH        compte actif, non suspendu, non banni
            └─ VERIFIED  identité vérifiée — découverte, matching, messagerie
                 ├─ OWNER   propriétaire de la ressource
                 └─ MEMBER  membre d'une conversation avec match actif et sans blocage
```

### Ce que chaque niveau ouvre

| Niveau         | Accès                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC`       | Vitrine, CGU, confidentialité, validation d'un code d'invitation, inscription, OTP, récupération                                       |
| `AUTH_PENDING` | `/auth/me`, dépôt KYC, création et complétion du profil, photos, préférences, consentements                                            |
| `AUTH`         | Paramètres, sessions, appareils, notifications, blocage, signalement, confidentialité, export, suppression, abonnements (consultation) |
| `VERIFIED`     | **Suggestions, profils d'autrui, intérêts, matchs, conversations, messages, achat**                                                    |
| `OWNER`        | Modification et suppression de ses propres ressources                                                                                  |
| `MEMBER`       | Lecture et écriture dans une conversation                                                                                              |

**Le franchissement `AUTH → VERIFIED` est le cœur de la promesse produit.** Il est vérifié en base à chaque requête
sensible (cache Redis 60 s, invalidé à tout changement de statut), jamais sur la seule foi du JWT (ADR-006).

### La règle `MEMBER`, en toutes lettres

```
autorisé ⟺
      conversation existe
  ET  appelant ∈ ConversationMember(conversation)
  ET  conversation.status = OPEN
  ET  match.status = ACTIVE
  ET  aucun Block entre les deux membres, dans un sens ou dans l'autre
  ET  les deux comptes ont accountStatus = ACTIVE
  ET  les deux comptes ont verificationStatus = VERIFIED
```

Évaluée par `ConversationMemberGuard`, appliquée **à l'identique** sur les routes HTTP et sur les événements
Socket.IO. Un seul et même code : il ne peut pas y avoir de divergence entre les deux canaux.

---

## 3. Rôles back-office et permissions

### 3.1 Catalogue des permissions

| Permission            | Autorise                                                                        |
| --------------------- | ------------------------------------------------------------------------------- |
| `users.read`          | Consulter un compte, son profil, son historique                                 |
| `users.contact`       | Contacter un membre depuis le support                                           |
| `users.sanction`      | Restriction temporaire, suspension, levée de sanction                           |
| `users.ban`           | Bannissement définitif — **second valideur obligatoire**                        |
| `users.edit`          | Corriger une donnée de compte (motif obligatoire)                               |
| `kyc.review`          | Traiter la file de vérification, décider                                        |
| `kyc.view_document`   | **Ouvrir une pièce d'identité** — motif obligatoire, URL 5 min, audit nominatif |
| `moderation.read`     | Consulter la file et les cas                                                    |
| `moderation.act`      | Appliquer une action de modération                                              |
| `moderation.content`  | Approuver ou masquer une photo, un texte de profil                              |
| `moderation.escalate` | Escalader vers un responsable                                                   |
| `moderation.assign`   | Attribuer un cas à un modérateur                                                |
| `content.manage`      | CGU, charte, confidentialité, modèles de notification                           |
| `billing.read`        | Abonnements et transactions                                                     |
| `billing.manage`      | Créer et modifier offres et prix                                                |
| `billing.refund`      | Rembourser — **second valideur obligatoire**                                    |
| `campaign.manage`     | Campagnes de migration, codes d'invitation, offre de lancement                  |
| `analytics.read`      | Tableaux de bord agrégés                                                        |
| `analytics.export`    | Exporter des données agrégées                                                   |
| `audit.read`          | Consulter le journal d'audit                                                    |
| `system.flags`        | Modifier les feature flags                                                      |
| `system.roles`        | Attribuer ou retirer un rôle                                                    |
| `system.read`         | État des services et des intégrations                                           |

### 3.2 Matrice rôles × permissions

| Permission            | SUPER_ADMIN | ADMIN | MODERATION_LEAD | MODERATOR | VERIFICATION_AGENT | SUPPORT | ANALYST |
| --------------------- | :---------: | :---: | :-------------: | :-------: | :----------------: | :-----: | :-----: |
| `users.read`          |     ✅      |  ✅   |       ✅        |    ✅     |        ✅¹         |   ✅    |   ❌    |
| `users.contact`       |     ✅      |  ✅   |       ✅        |    ✅     |         ❌         |   ✅    |   ❌    |
| `users.sanction`      |     ✅      |  ✅   |       ✅        |    ✅     |         ❌         |   ❌    |   ❌    |
| `users.ban`           |     ✅      |  ✅   |       ✅        |    ❌²    |         ❌         |   ❌    |   ❌    |
| `users.edit`          |     ✅      |  ✅   |       ❌        |    ❌     |         ❌         |   ❌    |   ❌    |
| `kyc.review`          |     ✅      |  ❌   |       ❌        |    ❌     |         ✅         |   ❌    |   ❌    |
| `kyc.view_document`   |     ✅³     |  ❌   |       ❌        |    ❌     |         ✅         |   ❌    |   ❌    |
| `moderation.read`     |     ✅      |  ✅   |       ✅        |    ✅     |         ❌         |   ✅    |   ❌    |
| `moderation.act`      |     ✅      |  ✅   |       ✅        |    ✅     |         ❌         |   ❌    |   ❌    |
| `moderation.content`  |     ✅      |  ✅   |       ✅        |    ✅     |         ❌         |   ❌    |   ❌    |
| `moderation.escalate` |     ✅      |  ✅   |       ✅        |    ✅     |         ❌         |   ✅    |   ❌    |
| `moderation.assign`   |     ✅      |  ✅   |       ✅        |    ❌     |         ❌         |   ❌    |   ❌    |
| `content.manage`      |     ✅      |  ✅   |       ❌        |    ❌     |         ❌         |   ❌    |   ❌    |
| `billing.read`        |     ✅      |  ✅   |       ❌        |    ❌     |         ❌         |   ✅    |   ✅⁴   |
| `billing.manage`      |     ✅      |  ✅   |       ❌        |    ❌     |         ❌         |   ❌    |   ❌    |
| `billing.refund`      |     ✅      |  ✅   |       ❌        |    ❌     |         ❌         |   ❌    |   ❌    |
| `campaign.manage`     |     ✅      |  ✅   |       ❌        |    ❌     |         ❌         |   ❌    |   ❌    |
| `analytics.read`      |     ✅      |  ✅   |       ✅        |    ❌     |         ❌         |   ❌    |   ✅    |
| `analytics.export`    |     ✅      |  ✅   |       ❌        |    ❌     |         ❌         |   ❌    |   ✅⁴   |
| `audit.read`          |     ✅      |  ✅   |       ✅⁵       |    ❌     |         ❌         |   ❌    |   ❌    |
| `system.flags`        |     ✅      |  ❌   |       ❌        |    ❌     |         ❌         |   ❌    |   ❌    |
| `system.roles`        |     ✅      |  ❌   |       ❌        |    ❌     |         ❌         |   ❌    |   ❌    |
| `system.read`         |     ✅      |  ✅   |       ❌        |    ❌     |         ❌         |   ❌    |   ❌    |

**Notes.**
¹ L'agent de vérification voit **uniquement** l'identité déclarée du membre en cours de traitement — pas ses
conversations, pas ses matchs, pas ses paiements.
² Un modérateur **propose** un bannissement ; le responsable de modération ou un administrateur le valide.
³ Le `SUPER_ADMIN` conserve l'accès pour les cas de dernier recours, mais chaque consultation est auditée et fait
l'objet d'une revue mensuelle — l'accès technique n'est pas une autorisation d'usage.
⁴ L'analyste n'accède **qu'à des données agrégées**. Aucune route nominative ne lui est ouverte, et l'export ne
produit que des agrégats.
⁵ Le responsable de modération lit l'audit **restreint à son périmètre** (actions de modération), pas l'audit
commercial ni système.

### 3.3 Ce que personne ne peut faire

- **Lire une conversation en dehors d'un signalement.** Il n'existe aucune route « voir les messages de X ». Un
  modérateur accède aux messages **rattachés à un cas de modération ouvert**, et rien d'autre.
- **Supprimer ou modifier une entrée du journal d'audit.** Aucune route n'existe, et le rôle PostgreSQL applicatif
  n'a ni `UPDATE` ni `DELETE` sur cette table — la garantie est au niveau de la base.
- **Voir un mot de passe, un refresh token, un code OTP ou un secret 2FA.** Ils ne sont stockés que hachés ou
  chiffrés, et ne figurent dans aucune réponse d'API.
- **Débloquer un compte `BLOCKED_UNDERAGE`.** Ce statut est terminal, y compris pour le `SUPER_ADMIN`. Une erreur
  de saisie de date de naissance se traite par une procédure de support documentée avec preuve d'identité, pas par
  un bouton.
- **S'auto-attribuer un rôle.** `system.roles` refuse toute action sur son propre compte.

---

## 4. Opérations exigeant deux personnes

| Opération                                         | Proposé par    | Validé par                    | Motivation                        |
| ------------------------------------------------- | -------------- | ----------------------------- | --------------------------------- |
| Bannissement définitif                            | Modérateur     | Responsable ou administrateur | Irréversible pour le membre       |
| Remboursement                                     | Administrateur | Second administrateur         | Impact financier direct           |
| Modification d'une date de naissance vérifiée     | Support        | `SUPER_ADMIN`                 | Contourne le contrôle de majorité |
| Attribution d'un rôle back-office                 | —              | `SUPER_ADMIN` uniquement      | Élévation de privilège            |
| Suppression manuelle d'un document KYC hors purge | Agent          | `SUPER_ADMIN`                 | Destruction de preuve             |

Techniquement : `ModerationAction.approvedByUserId` doit être renseigné et **différent** de `performedByUserId`,
sinon l'API renvoie 422 `MOD_SECOND_APPROVER_REQUIRED`.

---

## 5. Journalisation obligatoire

Toute action de cette liste écrit un `AdminAuditLog` **dans la même transaction** que l'action elle-même. Si
l'écriture d'audit échoue, l'action est annulée — un acte non tracé ne doit pas exister.

| Action journalisée                                   | Contexte enregistré                             |
| ---------------------------------------------------- | ----------------------------------------------- |
| `admin.login` / `admin.login_failed`                 | IP tronquée, agent, résultat 2FA                |
| `admin.user.viewed`                                  | Identifiant consulté                            |
| `kyc.document.viewed`                                | **Motif obligatoire**, document, durée de l'URL |
| `kyc.decision`                                       | Résultat, code de motif                         |
| `user.suspended` / `user.banned` / `user.reinstated` | Motif, durée, second valideur                   |
| `user.edited`                                        | Valeurs avant/après (hors secrets)              |
| `moderation.action`                                  | Type, cas, motif                                |
| `role.granted` / `role.revoked`                      | Rôle, bénéficiaire                              |
| `billing.refund`                                     | Montant, devise, paiement, second valideur      |
| `content.updated`                                    | Clé, version                                    |
| `flag.updated`                                       | Clé, valeur avant/après                         |
| `data.exported`                                      | Périmètre, nombre d'enregistrements             |
| `campaign.created` / `campaign.updated`              | Code, offre                                     |

**Alerte automatique** si un même compte consulte plus de 20 documents KYC en une heure, ou effectue plus de
50 consultations de comptes en une heure. Un accès légitime en volume existe (traitement de file) ; l'alerte
n'interrompt pas, elle notifie et laisse une trace revue chaque semaine.

---

## 6. Mise en œuvre

```ts
// Déclaration : chaque route porte sa politique, sans exception.
@Auth({ verified: true, rateLimit: 'message.send' })
@Post(':conversationId/messages')
sendMessage(...) {}

@Auth({ permissions: ['kyc.view_document'], audit: 'kyc.document.viewed', requireReason: true })
@Get('verification/:id/documents/:docId/url')
getDocumentUrl(...) {}

@Public()
@Get('cities')
listCities(...) {}
```

**Trois tests garantissent que ce mécanisme ne se dégrade pas :**

1. **Inventaire des routes** — parcourt les métadonnées de tous les contrôleurs ; échoue si une route ne déclare ni
   `@Auth` ni `@Public`.
2. **Inventaire des routes publiques** — compare la liste des `@Public()` à une liste de référence versionnée ; toute
   nouvelle route publique doit être ajoutée explicitement à cette liste, ce qui force une décision consciente en revue.
3. **Matrice d'autorisation** — pour chaque route protégée, vérifie automatiquement le refus : sans token, avec un
   compte non vérifié, avec un compte non propriétaire, avec un rôle insuffisant.
