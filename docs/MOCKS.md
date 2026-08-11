# Intégrations simulées — registre permanent

> **État au terme de la tranche D7 (abonnements et paiements).** La colonne « État » ne passe à « livré » qu'une fois le code
> écrit **et** testé. Les ports encore marqués « à développer » n'existent qu'à l'état d'interface : ils ne sont
> ni simulés ni approximatifs, ils ne sont pas écrits.

**Engagement.** Aucune intégration externe ne sera jamais présentée comme fonctionnelle si elle repose encore sur une
implémentation simulée — ni dans l'interface, ni dans la documentation, ni dans une démonstration.

---

## 1. Registre

| Port                        | Implémentation simulée                                                              | État                 | Bloque l'ouverture publique ?                                 | Question ouverte |
| --------------------------- | ----------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------- | ---------------- |
| `SmsProvider`               | `ConsoleSmsProvider` — le code OTP est journalisé, aucun SMS n'est envoyé           | 🟨 simulé, livré     | **🔴 OUI** — sans SMS réel, aucune inscription n'est possible | **Q4**           |
| `KycProvider`               | `MockKycProvider` — aucune décision automatique, revue humaine au back-office       | 🟨 simulé, livré     | 🟡 Non si la revue humaine est acceptée comme mode nominal    | **Q2**           |
| `PaymentProvider`           | `MockPaymentProvider` — `testMode: true`, **signature de webhook toujours refusée** | 🟨 simulé, livré     | 🟡 Non pour ouvrir en gratuit ; **🔴 OUI pour encaisser**     | **Q3**           |
| `PushProvider`              | `MockPushProvider` — notification journalisée, non envoyée                          | ⬜ à développer (D8) | 🟢 Non — repli sur in-app et e-mail                           | —                |
| `ContentModerationProvider` | `RuleBasedModerationProvider` — règles simples, pas d'analyse d'image               | ⬜ à développer (D6) | 🟢 Non — revue humaine au MVP                                 | —                |
| `MailProvider`              | Mailpit en local — **réel** en recette et production                                | ⬜ à développer (D8) | 🟢 Non                                                        | —                |
| `StorageProvider`           | MinIO en local — **réel** (S3 compatible)                                           | 🟨 livré             | 🟢 Non                                                        | —                |
| `ClockProvider`             | `FrozenClock` **en test uniquement** ; horloge système ailleurs                     | 🟨 livré             | —                                                             | —                |

Légende : ⬜ à développer (interface non encore écrite) · 🟨 simulé et livré · ✅ implémentation réelle en production.

Les interfaces des huit ports sont définies dès la phase C dans `apps/api/src/providers/ports.ts` ; seules les
implémentations restent à écrire, tranche par tranche.

---

## 2. Détail par port

### `SmsProvider` — le seul bloquant absolu

- **Simulé :** le code OTP est écrit dans les logs de développement et affiché dans l'interface sous un bandeau
  « Mode test ». Aucun message n'est envoyé.
- **Ce qui casse en production sans implémentation réelle :** **tout**. Aucune inscription, aucune connexion par
  téléphone, aucune récupération de compte.
- **À prévoir avec le prestataire :** couverture des opérateurs du Cameroun, du Bénin et de la Côte d'Ivoire · coût
  par message et par pays · taux et délai de délivrance · identifiant d'expéditeur alphanumérique autorisé
  localement · quota et plafond de dépense.
- **Effort d'intégration estimé :** 3 jours de code, le reste étant contractuel.

### `KycProvider`

- **Simulé :** la soumission passe en `PENDING` ; la décision est prise par un agent au back-office. Les scores de
  vivacité et de correspondance faciale restent nuls.
- **Ce qui casse sans implémentation réelle :** rien fonctionnellement — mais la charge humaine est intégrale.
  Environ 5 minutes par dossier, soit **une personne à plein temps pour 100 vérifications par jour**.
- **Ce qui n'est pas simulable :** la détection de vivacité et l'OCR. Un agent humain compare une photo et un selfie ;
  il ne détecte pas un masque ni une photo d'écran de manière fiable.
- **Effort d'intégration estimé :** 3 semaines, dominées par les tests et la certification du prestataire.

### `PaymentProvider`

- **Simulé :** création d'un paiement en `PENDING`, transition automatique vers `SUCCEEDED` après un délai
  configurable, webhook simulé émis avec une signature de test. **Toutes les réponses portent `testMode: true` et
  l'interface affiche un bandeau non désactivable.**
- **Ce qui casse sans implémentation réelle :** aucun revenu. Les droits Premium sont accordés sans encaissement —
  raison pour laquelle le flag `payments.enabled` est **désactivé par défaut**.
- **Ce qui est déjà correct dans le simulé :** l'idempotence des webhooks, la gestion des montants en unité minimale
  et le cycle de vie complet de l'abonnement sont testés de bout en bout avec le simulateur. L'intégration réelle
  n'aura à fournir que le transport.
- **Effort d'intégration estimé :** 3 semaines par fournisseur.

### `PushProvider`

- **Simulé :** la notification est journalisée, aucun envoi. Les canaux in-app et e-mail fonctionnent réellement.
- **Ce qui casse sans implémentation réelle :** la rétention. La notification push est le principal levier de retour
  sur une application de rencontres.

### `ContentModerationProvider`

- **Simulé :** règles textuelles (motifs de sollicitation financière, liens suspects) et contrôles techniques
  d'image (dimensions, poids, format). **Aucune détection de contenu explicite.**
- **Ce qui casse sans implémentation réelle :** toute photo doit être vue par un humain avant publication. Tenable
  à 9 000 membres, intenable à 90 000.

---

## 3. Vérification automatique

L'état réel — et non l'état documenté — est exposé par `GET /health/providers`, réservé au rôle
`ADMIN:system.read`. **Cette route est la source de vérité de ce document** : en cas de divergence, c'est elle qui
fait foi et ce fichier doit être corrigé.

Trois garde-fous, dont deux sont **déjà actifs depuis la phase C** :

1. ✅ Au démarrage, l'API journalise en `WARN` la liste des ports en mode simulé (`ProvidersModule`).
2. ✅ Si `NODE_ENV=production` et qu'un port critique est simulé, **le démarrage échoue** — sauf
   `ALLOW_MOCK_PROVIDERS_IN_PRODUCTION=true` posé délibérément. Comportement couvert par
   `apps/api/src/config/env.schema.spec.ts`.
3. ⬜ Toute réponse d'API issue d'un port simulé portera `testMode: true`, et l'interface affichera un bandeau que le
   client ne peut pas masquer — à livrer avec les tranches concernées (D2, D7).

---

## 4. Ce qui n'est pas simulé

Ces éléments sont **réels dès le développement local**, jamais simulés :

| Élément                                     | État à la phase C                                           |
| ------------------------------------------- | ----------------------------------------------------------- |
| PostgreSQL, Redis, MinIO, Mailpit           | ✅ réels (Docker Compose)                                   |
| Traitement d'image (EXIF, miniatures, WebP) | ✅ réel — sharp, vérifié sur une vraie image                |
| Calcul d'âge et contrôle de majorité        | ✅ implémenté et testé (`packages/contracts/src/age.ts`)    |
| Validation de configuration au démarrage    | ✅ implémentée et testée                                    |
| Pagination par curseur                      | ✅ implémentée et testée                                    |
| Inventaire des politiques d'autorisation    | ✅ test actif                                               |
| Hachage (Argon2id), jetons JWT, rotation    | ✅ réels — livrés en D1                                     |
| Gardes d'autorisation, rate limiting Redis  | ✅ réels — livrés en D1                                     |
| Socket.IO — messagerie temps réel           | ✅ réel — livré en D5, jeton vérifié à la connexion         |
| Règle « pas de message sans match mutuel »  | ✅ réelle — appliquée identiquement en HTTP et en Socket.IO |
| Résolution du graphe d'injection            | ✅ test actif (`app.module.spec.ts`)                        |
| BullMQ — files de tâches asynchrones        | ⬜ à livrer avec la tranche D8 — **pas encore écrit**       |

**Aucune règle de sécurité n'est simulée.** Le contrôle d'âge, la vérification du match avant message, les gardes
d'autorisation et le rate limiting fonctionnent réellement, en développement comme en production. Ce qui n'est pas
coché ci-dessus n'existe simplement pas encore — il ne s'agit ni d'une simulation ni d'une approximation.

### La réserve la plus importante du registre : le paiement

**Aucun argent ne peut circuler aujourd'hui.** Tout le produit payant est écrit,
testé et vérifiable — plans, souscription, période de grâce, reçus,
remboursements à quatre yeux, idempotence des webhooks — mais le fournisseur est
simulé, et il l'est de façon volontairement stricte :

- `verifyWebhookSignature()` renvoie **toujours `false`**. Sans secret partagé
  avec un prestataire, aucune signature n'est vérifiable ; renvoyer `true`
  reviendrait à offrir un crédit d'abonnement gratuit à qui connaît l'URL du
  webhook. **Conséquence directe : en mode simulé, aucun webhook n'est traité.**
- Le crédit d'un abonnement passe donc par `POST /admin/payments/{id}/confirm`,
  route de régularisation soumise à `billing.manage` et auditée nominativement.
- Chaque réponse porte `testMode: true`, produit **par le serveur**. L'interface
  doit afficher un bandeau « Mode test — aucun paiement réel » que le client ne
  peut pas désactiver.
- Le drapeau `payments.enabled` est à `false` dans le seed : la souscription
  payante reste fermée tant qu'aucun agrégateur n'est contractualisé.

**Ce qu'il faudra faire le jour où les identifiants du prestataire arriveront :**
écrire une classe à côté de `MockPaymentProvider`, l'enregistrer dans
`providers.module.ts`, poser `PAYMENT_PROVIDER=live`. Rien dans `domain/` ni dans
`application/` ne bouge — c'est précisément ce que cette architecture achète.
Aucune référence de fournisseur n'a été inventée : celles produites en mode
simulé portent le préfixe `mock_` et ne peuvent pas être confondues avec de
vraies transactions dans un export comptable.

### Trois réserves nommées, tranche D6

1. **La notification d'une décision est écrite, pas envoyée.** La ligne `Notification` existe en base et sera lue
   par le centre in-app. Aucun push ni e-mail ne part : la file d'envoi multi-canal est la tranche D8. Rien dans
   l'interface ne doit laisser croire qu'un message a été poussé au membre.
2. **Le journal d'audit est en ajout seul par convention applicative, pas encore par contrainte.** Aucun service
   n'expose de mise à jour ni de suppression, et aucune route d'écriture n'existe. Le verrou définitif — un
   déclencheur PostgreSQL interdisant `UPDATE` et `DELETE`, plus des droits de rôle restreints — est suivi en
   `TODO(D9-07)`. Tant qu'il n'est pas posé, un accès direct à la base pourrait réécrire une ligne.
3. **Une sanction temporaire ne se lève pas toute seule.** L'échéance est enregistrée sur l'action de modération,
   mais aucune tâche planifiée ne rétablit le compte : la levée passe aujourd'hui par
   `POST /admin/moderation/actions/{id}/revert`. La tâche automatique est en D8.

**Réserve valable pour toutes les tranches livrées à ce jour.** Aucun de ces composants n'a encore été exécuté
contre une vraie base PostgreSQL ni un vrai Redis : l'environnement de développement utilisé pour la génération
ne dispose pas de Docker. Les règles sont couvertes par des tests unitaires et par la résolution complète du
conteneur d'injection ; les dépôts Prisma et les compteurs Redis, eux, ne seront confirmés qu'au premier
`docker compose up`.
