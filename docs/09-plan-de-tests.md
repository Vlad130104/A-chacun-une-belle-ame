# 09 — Plan de tests et de qualité

**Règle d'engagement.** Une tâche n'est terminée que lorsque le lint, le typage et les tests passent. Aucune exception,
aucune fusion sur la branche principale avec une CI rouge.

---

## 1. Pyramide et cibles

| Niveau        | Outil                                     | Portée                                                            | Volume visé  | Durée cible  |
| ------------- | ----------------------------------------- | ----------------------------------------------------------------- | ------------ | ------------ |
| Unitaire      | Jest                                      | `domain/` et `application/` — fonctions pures, règles, invariants | ~600 tests   | < 30 s       |
| Intégration   | Jest + Testcontainers (PostgreSQL, Redis) | Cas d'usage, repositories, transactions, gardes                   | ~250 tests   | < 5 min      |
| Contrat       | Jest + schémas Zod partagés               | Conformité des réponses à `openapi.yaml`                          | 1 par route  | < 1 min      |
| Composant web | Testing Library                           | Écrans, états vides, erreurs, accessibilité                       | ~120 tests   | < 2 min      |
| E2E           | Playwright                                | **18 parcours obligatoires**                                      | 18 scénarios | < 15 min     |
| Charge        | k6                                        | Tenue au pic d'ouverture                                          | 4 scénarios  | à la demande |

### Couverture

Seuil bloquant : **80 % de branches sur `domain/` et `application/`** — là où sont les règles. Pas de seuil global :
un pourcentage moyen récompenserait les tests d'infrastructure sans valeur et masquerait une règle métier non testée.

Modules à **95 %** de branches, sans exception possible :
`verification` (majorité) · `matching` (éligibilité) · `conversations` (règle du match) · `payments` (idempotence,
montants) · le garde d'autorisation.

---

## 2. Les tests systématiques (générés, pas écrits à la main)

Trois familles de tests sont produites **par parcours des métadonnées de l'application**, ce qui les rend impossibles
à oublier lors de l'ajout d'une route :

### 2.1 Inventaire des routes

Échoue si une route ne déclare ni `@Auth(...)` ni `@Public()`. Garantit qu'aucune route ne peut naître sans politique.

### 2.2 Inventaire des routes publiques

Compare l'ensemble des `@Public()` à une liste de référence versionnée. Ajouter une route publique exige de modifier
cette liste — ce qui force une décision consciente en revue de code plutôt qu'un oubli.

### 2.3 Matrice d'autorisation

Pour **chaque** route protégée, quatre appels automatiques attendant un refus :

| Cas                                                           | Attendu                          |
| ------------------------------------------------------------- | -------------------------------- |
| Sans token                                                    | 401                              |
| Token valide, compte non vérifié (sur route `VERIFIED`)       | 403 `AUTH_VERIFICATION_REQUIRED` |
| Token valide, ressource d'autrui (sur route `OWNER`/`MEMBER`) | 403 ou 404                       |
| Rôle insuffisant (sur route `ADMIN:*`)                        | 403                              |

C'est le filet le plus rentable du projet : il attrape la classe de bugs la plus dangereuse — une route sensible
livrée sans garde — sans coût d'écriture par route.

---

## 3. Tests unitaires — les règles à couvrir absolument

| Domaine                  | Cas de test (extrait)                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Majorité**             | âge exact la veille de l'anniversaire · le jour même · en UTC avec un client dans un autre fuseau · année bissextile (29 février) · date future rejetée · date absurde (1900) rejetée |
| **Machine à états KYC**  | les 7 statuts, transitions valides et **transitions interdites** (`REJECTED → VERIFIED` sans nouvelle demande) · verrouillage de la date de naissance                                 |
| **Score de matching**    | les 8 composantes isolément · le cas de référence calculé de [04](./04-algorithme-de-matching.md) (0,782) · bornes 0 et 1 · somme des poids ≠ 1 rejetée · ensembles d'intérêts vides  |
| **Éligibilité**          | les **13 exclusions**, une par test                                                                                                                                                   |
| **Règle du match**       | les 6 conditions de `MEMBER`, chacune invalidée isolément                                                                                                                             |
| **Money**                | XAF exposant 0 · addition de devises différentes → erreur · formatage `5000 XAF` → « 5 000 F CFA » · montant négatif rejeté                                                           |
| **Complétion de profil** | la grille de 100 points, chaque palier                                                                                                                                                |
| **Détection**            | les 9 règles, avec cas positif, cas négatif et cas limite au seuil                                                                                                                    |
| **Rate limiting**        | fenêtre glissante, réinitialisation, verrouillage progressif                                                                                                                          |
| **Curseur**              | encodage/décodage, curseur falsifié rejeté, stabilité en cas d'égalité de `createdAt`                                                                                                 |

---

## 4. Tests d'intégration — points sensibles

| Sujet                    | Ce qui est vérifié                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Transaction du match** | Injection d'une erreur après création de la conversation → **aucun** match orphelin, aucune conversation orpheline |
| **Idempotence webhook**  | Le même événement rejoué 10 fois → 1 seul abonnement crédité, 9 marqués `IGNORED_DUPLICATE`                        |
| **Idempotence message**  | Même `clientIdempotencyKey` envoyée 5 fois → 1 seul message                                                        |
| **Rotation de token**    | Réutilisation d'un refresh consommé → toute la famille révoquée, audit écrit                                       |
| **Séparation KYC**       | Le rôle PostgreSQL applicatif tente de lire `kyc.VerificationDocument` → **refus attendu**                         |
| **Audit inaltérable**    | Tentative d'`UPDATE` et de `DELETE` sur `AdminAuditLog` → refus au niveau base                                     |
| **Audit transactionnel** | Échec forcé de l'écriture d'audit → l'action métier est annulée                                                    |
| **Purges**               | Documents KYC, messages, comptes en grâce, analytics : le worker supprime exactement ce qui est dû et rien d'autre |
| **Cache d'autorisation** | Suspension d'un compte → refus effectif en moins de 60 s                                                           |
| **Index**                | `EXPLAIN` sur les 6 requêtes les plus chaudes → aucun `Seq Scan` sur table volumineuse                             |

---

## 5. Les 18 parcours E2E obligatoires

Exécutés à chaque fusion sur la branche principale, avec fournisseurs simulés et horloge contrôlable.

| #   | Parcours                                          | Assertion clé                                                                                                                               |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Inscription par téléphone                         | Compte créé, défi OTP émis, aucun accès produit avant validation                                                                            |
| 2   | Validation OTP                                    | Tokens émis, session et appareil créés, étape suivante = vérification                                                                       |
| 3   | **Rejet d'une inscription non éligible**          | 403 `AUTH_UNDERAGE`, statut `BLOCKED_UNDERAGE`, `BlockedIdentity` écrit, **seconde tentative avec le même numéro refusée**                  |
| 4   | Vérification d'identité simulée                   | Dépôt pièce + selfie → file → décision agent → `VERIFIED` → badge visible                                                                   |
| 5   | Création et complétion du profil                  | Complétion ≥ 60 %, publication acceptée, profil visible en découverte                                                                       |
| 6   | Modération d'une photo                            | Photo en `PENDING_MODERATION` invisible d'autrui ; après refus, motif notifié et photo jamais servie                                        |
| 7   | Intérêt réciproque et création du match           | Match créé, conversation créée, notification et événement WS reçus par les deux                                                             |
| 8   | Ouverture de la conversation                      | Message envoyé, reçu en temps réel par l'autre, statuts envoyé → livré → lu                                                                 |
| 9   | **Impossibilité d'envoyer un message sans match** | Appel direct à l'API et émission WS forcée → **403 `MSG_NO_MATCH` dans les deux cas**                                                       |
| 10  | Blocage d'un membre                               | Disparition réciproque des suggestions, conversation verrouillée en < 1 s, événement `conversation:locked` reçu                             |
| 11  | Signalement d'un message                          | Signalement créé, cas ouvert avec priorité et échéance calculées                                                                            |
| 12  | Traitement du signalement par un modérateur       | Attribution, consultation de la preuve, action appliquée, membre notifié, audit écrit                                                       |
| 13  | Souscription en mode test                         | Paiement simulé, abonnement actif, droits Premium ouverts, **bandeau « Mode test » présent**                                                |
| 14  | **Traitement idempotent d'un webhook**            | Même événement rejoué 10 fois → 1 crédit, 9 doublons ignorés                                                                                |
| 15  | Suspension d'un compte                            | Sessions révoquées, disparition des suggestions, messagerie fermée, connexion refusée                                                       |
| 16  | Export des données                                | Archive générée, chiffrée, URL signée valable 72 h, **aucun document d'identité dans l'archive**                                            |
| 17  | Demande de suppression du compte                  | Profil immédiatement invisible, grâce de 30 j, annulation possible, purge effective après échéance (horloge avancée)                        |
| 18  | **Contrôle des permissions administratives**      | Un modérateur ne peut ni bannir seul, ni ouvrir un document KYC, ni accéder au commercial ; un analyste n'accède à aucune donnée nominative |

**Les parcours 3, 9, 14 et 18 sont non négociables.** Ils correspondent aux quatre garanties dont dépend la crédibilité
du produit : pas de mineurs, pas de sollicitation sans consentement, pas de double débit, pas d'abus de privilège.

---

## 6. Tests de sécurité

| Test                          | Fréquence                    | Attendu                                                                                         |
| ----------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Analyse de secrets (gitleaks) | Chaque commit                | Aucun secret                                                                                    |
| Audit de dépendances          | Quotidien                    | Aucune vulnérabilité critique ou élevée                                                         |
| Analyse statique (CodeQL)     | Chaque PR                    | Aucune alerte nouvelle                                                                          |
| En-têtes de sécurité          | Chaque déploiement           | CSP, HSTS, X-Content-Type-Options, Referrer-Policy présents                                     |
| Fuite dans les logs           | Chaque PR                    | Aucun mot de passe, token, OTP, corps de message ou clé de document dans la sortie              |
| Chargement de fichier hostile | Chaque PR                    | Fichier renommé, EXIF GPS, image polyglotte, SVG avec script → tous rejetés                     |
| Injection                     | Chaque PR                    | Charges SQL et XSS sur tous les champs texte → aucune exécution, aucune erreur exposant la base |
| Test d'intrusion externe      | **Avant ouverture publique** | Rapport traité, aucune vulnérabilité critique ouverte                                           |

---

## 7. Tests de charge (avant ouverture — risque R4)

| Scénario            | Profil                               | Critère de réussite                              |
| ------------------- | ------------------------------------ | ------------------------------------------------ |
| Pic d'ouverture     | 500 inscriptions/min pendant 10 min  | p95 < 800 ms, 0 erreur 5xx, file OTP sans retard |
| Découverte          | 2 000 utilisateurs actifs simultanés | p95 < 500 ms sur `/discovery/suggestions`        |
| Messagerie          | 1 000 conversations, 50 msg/s        | Latence WS p95 < 300 ms                          |
| Génération nocturne | 90 000 utilisateurs (cible x10)      | Traitement complet en < 60 min                   |

---

## 8. Qualité de code

| Contrôle              | Outil                                                                               | Bloquant |
| --------------------- | ----------------------------------------------------------------------------------- | -------- |
| Lint                  | ESLint (`@typescript-eslint`, règles d'import, règle « TODO référencé »)            | ✅       |
| Formatage             | Prettier                                                                            | ✅       |
| Typage                | `tsc --noEmit`, mode **strict**, `noUncheckedIndexedAccess`                         | ✅       |
| `any`                 | Interdit sauf commentaire justificatif `// eslint-disable-next-line ... -- raison`  | ✅       |
| Frontières de modules | Test d'architecture : aucun import croisé vers l'`infrastructure` d'un autre module | ✅       |
| Migrations            | Vérification que le schéma correspond aux migrations (`prisma migrate diff`)        | ✅       |
| OpenAPI               | `redocly lint`                                                                      | ✅       |
| Budget de performance | Lighthouse CI sur 4 parcours                                                        | ✅       |

---

## 9. Pipeline CI (GitHub Actions)

```yaml
# Séquence logique — les jobs indépendants s'exécutent en parallèle
lint          → eslint + prettier + typecheck            (~2 min)
test:unit     → jest domain + application                 (~1 min)
test:int      → jest + services PostgreSQL/Redis          (~5 min)
test:contract → conformité des réponses à openapi.yaml    (~1 min)
test:web      → Testing Library (web, admin)              (~2 min)
build         → api, web, admin, mobile (export Expo)     (~4 min)
test:e2e      → Playwright, 18 parcours, sur le build     (~15 min)
security      → gitleaks + audit + CodeQL                 (~3 min)
perf          → Lighthouse CI                             (~3 min)
```

- **Sur chaque PR** : tous les jobs. Fusion bloquée si l'un échoue.
- **Sur la branche principale** : mêmes jobs + déploiement automatique en recette.
- **Quotidien** : audit de dépendances, tests de charge légers, vérification des purges de conservation.
- **Aucun contournement** : ni `--no-verify`, ni test ignoré sans référence de story, ni seuil abaissé pour faire
  passer une livraison.

---

## 10. Données de test

- **Seed déterministe** avec graine fixe : les mêmes profils, les mêmes matchs, les mêmes cas à chaque exécution —
  un test E2E qui échoue est reproductible.
- **Horloge injectable** (`ClockProvider`) : les tests de conservation, de grâce et d'expiration avancent le temps
  plutôt que d'attendre.
- **Aucune donnée réelle**, jamais. Numéros du bloc de test `+237 6 00 00 00 XX`, visages générés, aucune pièce
  d'identité réelle même en développement — une pièce de test est un fichier factice clairement marqué.
- **La recette n'est jamais alimentée par une copie de production.** Si un jeu réaliste est nécessaire, il est
  produit par anonymisation irréversible, jamais par restauration directe.
