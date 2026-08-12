# Intégrations simulées — registre permanent

> **État au terme de la tranche D9 (back-office).** La colonne « État » ne passe à « livré » qu'une fois le code
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
| `StorageProvider`           | **EN MÉMOIRE** — aucun client S3 n'est branché, MinIO n'est jamais contacté         | 🟥 simulé            | 🔴 **Oui — bloquant**                                         | E-06             |
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

### Ce que D8 lève, et ce qu'elle ne lève pas

**Levé.** La file d'envoi existe pour de bon : BullMQ sur le Redis déjà présent,
`jobId` déterministe, réessais pilotés par le domaine — un jeton push révoqué est
abandonné immédiatement au lieu d'être retenté cinq fois. L'anti-doublon repose
sur la contrainte unique `(userId, dedupeKey)`, et les préférences sont refusées
côté serveur sur les types de sécurité.

**Non levé, et il faut le dire clairement : aucun push ni aucun e-mail ne part.**
Les deux fournisseurs sont simulés — le push est journalisé, le transport SMTP
n'est pas branché (`TODO(D9-06)`). Ce que le membre reçoit réellement aujourd'hui,
c'est la notification **in-app**, écrite en base et visible dans le centre de
notifications. Ce n'est pas un repli dégradé inventé pour la circonstance : c'est
le seul canal dont la livraison ne dépend d'aucun tiers, et c'est pourquoi il est
présent dans les canaux par défaut de tous les types sauf l'OTP.

**Non levé non plus** : la clôture automatique des périodes de grâce (D7) et la
levée automatique des sanctions temporaires (D6) restent manuelles. La file est
là, les tâches planifiées qui l'utiliseraient ne le sont pas encore — elles
n'appartenaient pas au périmètre des six stories D8, et les inventer pour
« lever une réserve » aurait été un affichage, pas une livraison.

### Ce que D10 lève, et ce qu'elle ne lève pas

**Levé.** Le tunnel de migration est mesuré pour de bon, et **côté serveur**. Les
six marches — clic sur le lien, inscription commencée, numéro validé, pièce
déposée, identité approuvée, profil publié — sont émises depuis les cas d'usage
qui les franchissent réellement, jamais depuis le client. Il n'existe **aucune
route d'ingestion d'événement** : c'en serait à la fois une surface d'abus et
une source de mesures fausses, puisqu'un client peut mentir. Les comptages sont
faits en **sujets distincts**, pas en événements — sinon le taux de conversion
dépendrait du nombre de clics et ne voudrait plus rien dire.

Le pseudonyme est un HMAC avec un secret **propre à l'analytique**, distinct du
sel des empreintes recherchables ; le démarrage échoue si les deux valeurs sont
identiques (ADR-021).

**Non levé, et il faut le dire clairement : l'offre de lancement n'est pas
accordée.** Un membre qui s'inscrit avec un code de campagne est bien rattaché à
ce lien — la traçabilité fonctionne — mais **aucun abonnement promotionnel n'est
créé**. Ce n'est pas un oubli, c'est une conséquence de deux règles du produit :

1. aucun compte n'est pleinement activé sans vérification d'identité, donc rien
   de payant ne doit s'ouvrir avant elle ;
2. l'anti-abus repose sur l'empreinte de la **pièce d'identité** — le numéro seul
   se change pour quelques centaines de francs — et cette empreinte n'existe
   qu'après le dépôt du document.

Accorder l'offre à l'inscription reviendrait donc à ouvrir une fonction payante
à un compte non vérifié **et** à ne dédoublonner que sur le numéro, c'est-à-dire
à ne pas dédoublonner. Les règles anti-abus sont écrites et testées ;
`ConsumeInviteUseCase` est **délibérément non enregistré** dans le conteneur
d'injection, pour qu'aucune lecture du code ne laisse croire que l'offre
fonctionne. Le branchement est la story `D10-08`.

**Non levé non plus : la purge des événements analytiques.** Chaque ligne porte
son `purgeAt`, calculé à l'écriture depuis `ANALYTICS_RETENTION_MONTHS`. Le
travail périodique qui supprime les lignes échues n'existe pas. Tant qu'il
n'existe pas, la rétention de 14 mois est une intention, pas un fait — au même
titre que les autres purges encore manuelles (documents KYC, périodes de grâce,
sanctions temporaires).

**Aucun export analytique, aucun connecteur, aucun tableau de bord externe.**
Les seules lectures sont les routes `/admin/analytics/*`, qui ne rendent que des
agrégats.

### Trois réserves nommées, tranche D6

1. **La notification d'une décision est écrite, pas envoyée.** La ligne `Notification` existe en base et sera lue
   par le centre in-app. Aucun push ni e-mail ne part : la file d'envoi multi-canal est la tranche D8. Rien dans
   l'interface ne doit laisser croire qu'un message a été poussé au membre.
2. ~~Le journal d'audit est en ajout seul par convention applicative.~~ **Levé en D9.** La migration
   `20260920000000_audit_append_only` pose un déclencheur PostgreSQL qui refuse `UPDATE` et `DELETE`, et retire
   ces droits au rôle applicatif. Réserve résiduelle honnête : un super-utilisateur PostgreSQL peut désactiver un
   déclencheur. La protection vise l'erreur et l'abus ordinaire ; contre un administrateur de base malveillant, le
   rempart est l'export vers un stockage externe, prévu en V1.
3. **Une sanction temporaire ne se lève pas toute seule.** L'échéance est enregistrée sur l'action de modération,
   mais aucune tâche planifiée ne rétablit le compte : la levée passe aujourd'hui par
   `POST /admin/moderation/actions/{id}/revert`. La tâche automatique est en D8.

### Ce que la phase E corrige, et ce qu'elle laisse ouvert

**Corrigé.** Trois défauts trouvés en relecture transverse, tous invisibles pour les tests d'alors — le détail est
dans `docs/14-rapport-de-validation.md` :

1. **Aucune route d'administration n'était accessible.** Le garde comparait les permissions exigées aux rôles portés
   par le jeton, lequel était toujours émis vide. Les rôles sont désormais relus en base à chaque requête, et un rôle
   retiré cesse d'agir immédiatement.
2. **La limitation de débit était déclarative.** Quinze routes portaient une clé que personne ne lisait. Un garde
   l'applique maintenant, avec un barème testé et un inventaire qui refuse les clés orphelines.
3. **La sonde de disponibilité répondait « ok » sans rien vérifier.** Elle interroge PostgreSQL et Redis, et renvoie
   503 quand l'un manque.

**Toujours ouvert.** La 2FA n'est pas encore **exigée** à l'ouverture d'une session d'administration : l'enrôlement
et la vérification fonctionnent, le contrôle manque dans le parcours de connexion. Et **aucune tâche planifiée
n'existe** : les purges, les fins de période de grâce et les levées de sanction temporaire restent manuelles.

### Correction : le stockage était présenté comme réel, il ne l'est pas

Ce registre a affirmé jusqu'ici que `StorageProvider` était **réel**, adossé à MinIO. **C'était faux.** Les deux
adaptateurs — photos de profil et pièces d'identité — conservent les objets dans une `Map` en mémoire de processus :

```ts
private readonly objects = new Map<string, Buffer>();
```

Aucun client S3 n'existe dans le dépôt ; `@aws-sdk/client-s3` n'est même pas une dépendance. `S3_ENDPOINT` et
`S3_MEDIA_BUCKET` ne servent qu'à composer une URL d'affichage, signée par une clé **tirée au hasard au démarrage** —
donc invalide après le moindre redémarrage.

**Conséquences concrètes, à connaître avant toute mise en ligne :**

- une photo de profil et une pièce d'identité déposées sont **perdues au redémarrage** du processus ;
- avec plus d'une instance, un dépôt fait sur l'instance A est **introuvable** depuis l'instance B ;
- la vérification d'identité ne peut donc pas fonctionner en production, puisque l'agent ne retrouvera pas le
  document déposé.

C'est la seule fois où ce registre a présenté comme fonctionnelle une intégration qui ne l'était pas — exactement ce
que le cahier des charges interdit. La ligne est corrigée en tête de document, et le branchement d'un client S3 réel
devient la story **E-06**, bloquante pour la mise en ligne.

**Réserve valable pour toutes les tranches livrées à ce jour.** Aucun de ces composants n'a encore été exécuté
contre une vraie base PostgreSQL ni un vrai Redis : l'environnement de développement utilisé pour la génération
ne dispose pas de Docker. Les règles sont couvertes par des tests unitaires et par la résolution complète du
conteneur d'injection ; les dépôts Prisma et les compteurs Redis, eux, ne seront confirmés qu'au premier
`docker compose up`.
