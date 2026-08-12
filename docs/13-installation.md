# 13 — Installation et développement local

Objectif : un nouveau développeur productif en **moins d'une heure**.

---

## 1. Prérequis

| Outil          | Version | Vérification             |
| -------------- | ------- | ------------------------ |
| Node.js        | ≥ 22    | `node -v`                |
| pnpm           | ≥ 10    | `pnpm -v`                |
| Docker         | ≥ 24    | `docker -v`              |
| Docker Compose | v2      | `docker compose version` |

pnpm s'installe via corepack : `corepack enable && corepack prepare pnpm@10.11.0 --activate`.

---

## 2. Démarrage

```bash
git clone <dépôt> && cd a-chacun-une-belle-ame

cp .env.example .env          # aucune valeur réelle dans .env.example
node scripts/generate-keys.mjs >> .env   # clés de développement uniquement

pnpm install
pnpm docker:up                # PostgreSQL, Redis, MinIO, Mailpit
pnpm db:generate
pnpm db:migrate               # crée la première migration au premier lancement
pnpm db:seed                  # référentiels, offres en Mode test, feature flags

pnpm dev
```

| Service           | Adresse                        |
| ----------------- | ------------------------------ |
| API               | http://localhost:3000/api/v1   |
| Documentation API | http://localhost:3000/api/docs |
| Web public        | http://localhost:3001          |
| Back-office       | http://localhost:3002          |
| Expo (mobile)     | http://localhost:8081          |
| MinIO (console)   | http://localhost:9001          |
| Mailpit           | http://localhost:8025          |

**Aucune clé de prestataire n'est nécessaire pour développer.** Tous les ports externes disposent d'une
implémentation simulée, et l'API journalise au démarrage la liste de ce qui est simulé.

---

## 3. Commandes courantes

| Commande                | Effet                                                 |
| ----------------------- | ----------------------------------------------------- |
| `pnpm dev`              | Lance API, web, back-office et Expo en parallèle      |
| `pnpm lint`             | ESLint sur tous les paquets                           |
| `pnpm typecheck`        | TypeScript strict sur tous les paquets                |
| `pnpm test:unit`        | Tests unitaires (rapides, sans infrastructure)        |
| `pnpm test:int`         | Tests d'intégration (nécessitent PostgreSQL et Redis) |
| `pnpm build`            | Construit les quatre applications                     |
| `pnpm format`           | Applique Prettier                                     |
| `pnpm db:validate`      | Valide le schéma Prisma                               |
| `pnpm db:studio`        | Explorateur de base                                   |
| `pnpm api:openapi:lint` | Valide la spécification OpenAPI                       |
| `pnpm docker:reset`     | **Détruit les volumes** et repart d'une base vierge   |

Avant de pousser : `pnpm lint && pnpm typecheck && pnpm test:unit`. La CI exécute exactement ces contrôles, plus le
build, les tests d'intégration, la validation des contrats et l'analyse de sécurité.

---

## 4. Structure

```
apps/
  api/        NestJS — REST, WebSocket, workers (même code, deux points d'entrée)
  web/        Next.js — vitrine et espace membre
  admin/      Next.js — back-office (domaine séparé, ADR-014)
  mobile/     Expo — application membre
packages/
  contracts/  schémas Zod, codes d'erreur, règles pures partagées
  config/     ESLint, Prettier, tsconfig et règle « TODO référencé »
prisma/       schéma, migrations, seed
docker/       Compose et initialisation PostgreSQL (schémas app et kyc)
docs/         conception
```

Dans `apps/api`, chaque module suit `domain/` → `application/` → `infrastructure/`. Le domaine ne doit importer ni
NestJS, ni Prisma, ni Express : c'est ce qui rend les règles testables en millisecondes.

---

## 5. Règles de contribution qui font échouer la CI

1. **Une route sans politique d'autorisation.** Chaque route porte `@Auth(...)` ou `@Public()`. Une route publique
   doit en plus figurer dans la liste de référence de `route-policy.spec.ts`.
2. **Un TODO non référencé.** Écrivez `// TODO(D4-02): …` en pointant une story du backlog.
3. **`any` non justifié.**
4. **`new Date()` dans le code métier.** Injectez `ClockProvider` : les tests de conservation avancent le temps au
   lieu de l'attendre.
5. **Un secret commité.** `.env` est ignoré par Git et gitleaks analyse l'historique complet.
6. **Une liste sans pagination par curseur**, ou une requête volumineuse sans index.

---

## 6. Base de données

- **Migrations** : `pnpm db:migrate` en développement, `pnpm db:migrate:deploy` en recette et production.
- **Stratégie expand/contract** : jamais de suppression de colonne dans le même déploiement que le code qui la rend
  inutile (voir `10-plan-de-deploiement.md` §6).
- **Deux schémas** : `app` (produit) et `kyc` (identité), avec des rôles PostgreSQL distincts créés par
  `docker/postgres/init/01-schemas-et-roles.sql`. Le rôle du produit n'a aucun droit sur `kyc`.
- **Seed** : déterministe et idempotent, exécutable plusieurs fois sans effet de bord. Aucune donnée réelle.

---

## 7. Dépannage

| Symptôme                                       | Cause probable et remède                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `Environment variable not found: DATABASE_URL` | `.env` absent — copiez `.env.example`                                                      |
| `Configuration invalide : …`                   | Comportement attendu : une variable manque ou est hors bornes. Le message indique laquelle |
| `ports critiques encore simulés en production` | Garde-fou volontaire. En local, vérifiez que `NODE_ENV` n'est pas `production`             |
| Tests d'intégration ignorés                    | Attendu sans base : lancez `pnpm docker:up` et exportez `DATABASE_URL`                     |
| `expo export` échoue sur la plateforme web     | Attendu : le web public est servi par `apps/web`, la cible web d'Expo n'est pas installée  |
| Port déjà utilisé                              | `pnpm docker:down`, ou ajustez `API_PORT` dans `.env`                                      |

---

## 8. Vérifier le travail livré

Quatre niveaux, du moins coûteux au plus probant. **Chacun prouve moins que le suivant** : le tableau dit ce que
chaque niveau établit, et surtout ce qu'il n'établit pas.

| Niveau                     | Durée  | Ce qu'il prouve                                   | Ce qu'il ne prouve PAS                                    |
| -------------------------- | ------ | ------------------------------------------------- | --------------------------------------------------------- |
| 1. Lecture                 | 10 min | Ce que le projet prétend faire, et ce qu'il admet | Que le code corresponde                                   |
| 2. Chaîne locale sans base | 5 min  | Les règles, le câblage, la compilation            | Qu'une seule requête SQL fonctionne                       |
| 3. Docker et parcours réel | 30 min | Migrations, dépôts Prisma, Redis, routes vivantes | Le comportement sous charge, ni les intégrations externes |
| 4. Contrôles adverses      | 15 min | Que les affirmations de la documentation tiennent | —                                                         |

### Niveau 1 — lire ce que le projet reconnaît

```bash
cat docs/MOCKS.md                    # tout ce qui est simulé, port par port
cat docs/14-rapport-de-validation.md # les défauts trouvés en phase E, et ce qui reste
git log --oneline                    # une tranche par commit, avec ses limites en message
```

`docs/MOCKS.md` est le document à lire en premier. Il liste ce qui **ne fonctionne pas**, et c'est délibéré : un
registre de simulations qui ne servirait qu'à rassurer serait inutile.

### Niveau 2 — la chaîne locale, sans base de données

```bash
pnpm install
pnpm lint          # ESLint sur les quatre applications et les paquets
pnpm typecheck     # TypeScript strict, aucun `any` non justifié
pnpm test:unit     # règles métier, inventaire des routes, graphe d'injection
pnpm build         # les quatre applications se construisent
pnpm db:validate   # le schéma Prisma est cohérent
```

Trois tests méritent d'être regardés en particulier, parce qu'ils attrapent les défauts que les autres laissent
passer :

- `src/common/auth/route-policy.spec.ts` — **aucune route ne peut exister sans politique d'autorisation**, et toute
  route publique doit figurer dans une liste de référence justifiée ;
- `src/common/auth/auth.guard.spec.ts` — la chaîne d'autorisation elle-même. Elle était le seul composant sans test,
  et elle était cassée (voir le rapport de validation) ;
- `src/app.module.spec.ts` — construit le conteneur d'injection entier. Il a détecté trois pannes de démarrage que
  les tests de règles ne pouvaient pas voir.

### Niveau 3 — Docker, et un parcours réellement exécuté

C'est le seul niveau qui prouve que la persistance fonctionne. **Il n'a jamais été exécuté** : l'environnement de
génération ne dispose pas de Docker.

```bash
cp .env.example .env               # renseigner au minimum HASH_SALT et ANALYTICS_HMAC_SECRET
pnpm docker:up                     # PostgreSQL, Redis, MinIO, Mailpit
pnpm db:generate && pnpm db:migrate
pnpm db:seed                       # villes, centres d'intérêt, offres, campagne de migration
pnpm test:int                      # à ce jour : la séparation des schémas KYC, et elle seule
pnpm dev
```

Puis, API lancée :

```bash
# La sonde doit interroger PostgreSQL et Redis — arrêtez Redis, elle doit répondre 503.
curl -i localhost:3000/api/v1/health/live
curl -i localhost:3000/api/v1/health/ready

# Le lien d'invitation semé : valide, et ne révèle jamais qui l'a émis.
curl -s localhost:3000/api/v1/invites/BELLEAME2026
# Un code inexistant doit rendre EXACTEMENT la même forme de réponse.
curl -s localhost:3000/api/v1/invites/CODEBIDON

# Toute route d'administration sans jeton : 401, jamais 200.
curl -i localhost:3000/api/v1/admin/dashboard
```

Le code OTP n'est envoyé par aucun SMS : il est **journalisé par la console**, fournisseur simulé. C'est là qu'il
faut le lire pour terminer une inscription.

### Niveau 4 — contrôles adverses

Ceux qui exposeraient une documentation flatteuse. Ils doivent tous donner le résultat annoncé.

```bash
# Aucun secret dans le dépôt : les seules valeurs par défaut se nomment elles-mêmes.
grep -rn "developpement-non-secret\|local_dev" --include=*.ts --include=*.yml .

# Le fournisseur de paiement refuse TOUTE signature. Doit afficher `return false`.
grep -n -A 3 "verifyWebhookSignature" apps/api/src/providers/mock-payment.provider.ts

# Chaque TODO référence une story du backlog — une règle ESLint dédiée l'impose.
grep -rn "TODO(" apps/api/src prisma

# État RÉEL des intégrations, rendu par le serveur et non par la documentation.
# En cas de divergence avec MOCKS.md, c'est cette route qui fait foi.
curl -s localhost:3000/api/v1/health/providers   # exige un jeton et system.read
```

### Ce qui n'existe pas, et qu'aucune commande ne montrera

- **`e2e/` est vide.** Aucun test Playwright n'a été écrit, alors que le plan de tests en prévoit 18. Les parcours
  n'ont donc jamais été traversés de bout en bout, par personne.
- **Un seul test d'intégration** (`apps/api/test/kyc-separation.int-spec.ts`). `pnpm test:int` ne vérifie que la
  séparation des schémas.
- **Rien n'a tourné contre un vrai PostgreSQL ni un vrai Redis.** Les 3 migrations, les déclencheurs d'audit en ajout
  seul et les compteurs Redis n'ont jamais été appliqués. C'est le premier travail à faire.
