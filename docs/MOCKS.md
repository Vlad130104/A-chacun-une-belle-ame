# Intégrations simulées — registre permanent

> **État au terme de la phase B (conception) : aucun code n'a encore été écrit.**
> Ce registre décrit les intégrations telles qu'elles seront livrées. Il sera mis à jour à chaque tranche de
> développement, et la colonne « État » ne passera à « implémenté » qu'une fois le code livré et testé.

**Engagement.** Aucune intégration externe ne sera jamais présentée comme fonctionnelle si elle repose encore sur une
implémentation simulée — ni dans l'interface, ni dans la documentation, ni dans une démonstration.

---

## 1. Registre

| Port | Implémentation simulée | État | Bloque l'ouverture publique ? | Question ouverte |
|---|---|---|---|---|
| `SmsProvider` | `ConsoleSmsProvider` — le code OTP est journalisé, aucun SMS n'est envoyé | ⬜ à développer (D1) | **🔴 OUI** — sans SMS réel, aucune inscription n'est possible | **Q4** |
| `KycProvider` | `MockKycProvider` — décision simulée, complétée par la revue humaine au back-office | ⬜ à développer (D2) | 🟡 Non si la revue humaine est acceptée comme mode nominal | **Q2** |
| `PaymentProvider` | `MockPaymentProvider` — toute réponse porte `testMode: true` | ⬜ à développer (D7) | 🟢 Non — ouverture possible en gratuit intégral | **Q3** |
| `PushProvider` | `MockPushProvider` — notification journalisée, non envoyée | ⬜ à développer (D8) | 🟢 Non — repli sur in-app et e-mail | — |
| `ContentModerationProvider` | `RuleBasedModerationProvider` — règles simples, pas d'analyse d'image | ⬜ à développer (D3) | 🟢 Non — revue humaine au MVP | — |
| `MailProvider` | Mailpit en local — **réel** en recette et production | ⬜ à développer (D8) | 🟢 Non | — |
| `StorageProvider` | MinIO en local — **réel** (S3 compatible) | ⬜ à développer (D3) | 🟢 Non | — |
| `ClockProvider` | `FrozenClock` **en test uniquement** ; horloge système ailleurs | ⬜ à développer (D1) | — | — |

Légende : ⬜ à développer · 🟨 simulé et livré · ✅ implémentation réelle en production.

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

Trois garde-fous seront implémentés avec les ports concernés :

1. Au démarrage, l'API journalise en `WARN` la liste des ports en mode simulé.
2. Si `NODE_ENV=production` et qu'un port critique est simulé, **le démarrage échoue** — sauf
   `ALLOW_MOCK_PROVIDERS_IN_PRODUCTION=true` posé délibérément.
3. Toute réponse d'API issue d'un port simulé porte `testMode: true`, et l'interface affiche un bandeau que le client
   ne peut pas masquer.

---

## 4. Ce qui n'est pas simulé

Pour éviter toute ambiguïté, les éléments suivants sont **réels dès le développement local** : PostgreSQL, Redis,
BullMQ, Socket.IO, le stockage S3 (via MinIO), l'envoi d'e-mails (via Mailpit), le chiffrement, le hachage des mots
de passe, la génération et la rotation des jetons, et l'ensemble de la logique métier.

**Aucune règle de sécurité n'est simulée.** Le contrôle d'âge, la vérification du match avant message, les gardes
d'autorisation et le rate limiting fonctionnent réellement en développement comme en production.
