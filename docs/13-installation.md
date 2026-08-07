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

## 8. Ce qui n'existe pas encore

À l'issue de la phase C, le dépôt contient le **socle** : configuration validée, gestion d'erreurs, pagination,
ports externes, santé, inventaire des autorisations, et une application par façade.

**Aucune fonctionnalité produit n'est implémentée** : ni inscription, ni vérification, ni profil, ni matching, ni
messagerie. Elles arrivent avec les tranches D1 à D10 du [backlog](./08-backlog-mvp.md), dans cet ordre.
