# 15 — Hébergement

## 1. Pourquoi l'API ne va pas sur Vercel

Vercel exécute des fonctions sans état, arrêtées après la réponse. L'API en a besoin de deux choses qu'elles ne
peuvent pas offrir :

- **une passerelle Socket.IO** (`/ws`) qui garde des connexions ouvertes pour la messagerie temps réel ;
- **un worker BullMQ** qui consomme une file en continu.

Il ne s'agit pas d'un réglage à contourner. Une API sans état perdrait les connexions à chaque invocation, et la file
de notifications ne serait jamais consommée. La répartition est donc :

| Composant     | Hébergeur                           | Pourquoi                                                    |
| ------------- | ----------------------------------- | ----------------------------------------------------------- |
| `apps/web`    | **Vercel**                          | Next.js statique et rendu serveur — cas d'usage nominal     |
| `apps/admin`  | **Vercel**                          | Idem, projet séparé pour un domaine et un accès distincts   |
| `apps/api`    | **Render** (ou Railway, Fly)        | Conteneur qui vit : Socket.IO et worker                     |
| Worker        | **Render**, même image              | `PROCESS_ROLE=worker` — même code, sinon les deux divergent |
| PostgreSQL 16 | Géré par l'hébergeur                | Deux schémas étanches (ADR-004)                             |
| Redis         | Géré, `maxmemory-policy=noeviction` | BullMQ perd des travaux si Redis expulse des clés           |
| Objets        | **R2, B2 ou Scaleway**              | Deux buckets, deux jeux d'identifiants — voir §6, bloquant  |

---

## 2. Ce qui empêche aujourd'hui une mise en ligne utile

À lire avant de réserver quoi que ce soit.

1. **Aucune interface.** `apps/web` contient une page d'accueil dont le bouton pointe vers `/inscription`, qui
   n'existe pas. `apps/admin` affiche une coquille. L'API est complète, rien ne la consomme.
2. **Rien n'a jamais tourné contre une vraie base.** La première mise en ligne sera aussi le premier test des
   migrations, des déclencheurs d'audit et des compteurs Redis.
3. **SMS, e-mail, push et paiement sont simulés.** Aucun code OTP ne partira : sans SMS réel, **personne ne pourra
   terminer une inscription**. Voir `docs/MOCKS.md`.

Conclusion honnête : ce qui suit permet de monter un environnement de **recette**, pas d'ouvrir le service au public.

---

## 3. Les deux façades sur Vercel

Deux projets Vercel distincts sur le même dépôt — jamais un seul. Le back-office doit pouvoir recevoir son propre
domaine, sa propre politique d'accès et, à terme, une restriction réseau.

| Réglage          | Projet `web`                        | Projet `admin` |
| ---------------- | ----------------------------------- | -------------- |
| Root Directory   | `apps/web`                          | `apps/admin`   |
| Framework        | Next.js (auto)                      | Next.js (auto) |
| Build et Install | lus depuis `vercel.json` du dossier | idem           |
| Node             | 22                                  | 22             |

Les deux `vercel.json` lancent l'installation et la construction **depuis la racine** du dépôt : sans cela Turborepo
ne résout pas `@acuba/contracts` et la construction échoue.

```bash
# Depuis votre poste, une fois par projet :
npx vercel link          # dans apps/web, puis dans apps/admin
npx vercel --prod
```

Variable à poser sur les deux projets, quand les écrans consommeront l'API :

```
NEXT_PUBLIC_API_URL=https://acuba-api.onrender.com/api/v1
```

Elle n'est encore lue nulle part : aucune façade n'appelle l'API à ce jour.

---

## 4. La base de données

Render provisionne une base et **un seul** rôle. Le second schéma et son rôle étanche se créent à la main, une fois :

```bash
psql "$DATABASE_URL" -v kyc_password="'<mot-de-passe-fort>'" \
  -f scripts/sql/bootstrap-production.sql
```

Le script doit finir en listant exactement deux schémas, `app` et `kyc`. Ensuite seulement :

```bash
pnpm db:migrate:deploy     # applique les 3 migrations du dépôt
pnpm db:seed               # villes, centres d'intérêt, offres, campagne
```

`migrate deploy` n'invente jamais de migration : il applique celles du dépôt, ou échoue. C'est la commande de
production ; `db:migrate` est réservée au développement.

**`KYC_DATABASE_URL`** pointe la même base avec le rôle `acuba_kyc` et `?schema=kyc`. Utiliser la même URL pour les
deux annulerait la séparation qu'ADR-004 met en place.

---

## 5. Variables d'environnement

Le démarrage **échoue** si l'une manque ou est invalide — c'est voulu : une configuration incomplète doit échouer
bruyamment au lancement, jamais silencieusement à la première requête.

| Variable                             | Obligatoire | Note                                                                                          |
| ------------------------------------ | :---------: | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                       |     oui     | Rôle `acuba_app`, `?schema=app`                                                               |
| `KYC_DATABASE_URL`                   |     oui     | Rôle `acuba_kyc`, `?schema=kyc` — **jamais la même qu'au-dessus**                             |
| `REDIS_URL`                          |     oui     | `noeviction`                                                                                  |
| `HASH_SALT`                          |     oui     | ≥ 16 caractères, aléatoire                                                                    |
| `ANALYTICS_HMAC_SECRET`              |     oui     | **Différent de `HASH_SALT`** — le démarrage le vérifie (ADR-021)                              |
| `ENCRYPTION_KEY`                     |     oui     | 32 octets en base64                                                                           |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` |     oui     | RS256. Sans elles, repli HS256 de développement                                               |
| `S3_MEDIA_BUCKET` / `S3_KYC_BUCKET`  |     oui     | **Deux buckets distincts** — le démarrage le vérifie                                          |
| `CORS_ALLOWED_ORIGINS`               |     oui     | Les domaines Vercel, séparés par des virgules                                                 |
| `PROCESS_ROLE`                       |     oui     | `api` sur le service web, `worker` sur le worker                                              |
| `ALLOW_MOCK_PROVIDERS_IN_PRODUCTION` |   recette   | Sans elle, `NODE_ENV=production` **refuse de démarrer** tant que SMS et paiement sont simulés |

Génération des secrets :

```bash
openssl rand -base64 32                      # HASH_SALT, ANALYTICS_HMAC_SECRET, ENCRYPTION_KEY
openssl genpkey -algorithm RSA -out jwt.key -pkeyopt rsa_keygen_bits:2048
openssl rsa -in jwt.key -pubout -out jwt.pub
```

Le dernier garde-fou mérite d'être compris : en production, un port critique encore simulé **empêche le démarrage**.
Poser `ALLOW_MOCK_PROVIDERS_IN_PRODUCTION=true` lève l'interdiction — c'est acceptable en recette, et c'est une
décision à prendre les yeux ouverts. En ligne pour de vrai, cela signifierait un service qui n'envoie aucun SMS et
n'encaisse aucun paiement.

---

## 6. Le stockage d'objets — story E-06, bloquante

Deux buckets, **deux jeux d'identifiants distincts** : le porteur des clés du bucket média ne doit pas pouvoir lire
les pièces d'identité. Cloudflare R2, Backblaze B2 et Scaleway conviennent ; le code parle S3.

**Livré (story E-06).** Posez `STORAGE_PROVIDER=s3` et les six variables associées :

```
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://<compte>.r2.cloudflarestorage.com
S3_REGION=auto
S3_FORCE_PATH_STYLE=false          # true pour MinIO et Backblaze
S3_MEDIA_BUCKET=acuba-media
S3_MEDIA_ACCESS_KEY=…              # compte de service n°1
S3_MEDIA_SECRET_KEY=…
S3_KYC_BUCKET=acuba-kyc
S3_KYC_ACCESS_KEY=…                # compte de service n°2, DIFFÉRENT
S3_KYC_SECRET_KEY=…
```

Le démarrage **échoue** si les deux clés d'accès sont identiques, si l'une manque, ou si `NODE_ENV=production` est
posé avec `STORAGE_PROVIDER=memory`.

Les deux buckets doivent être **privés** : aucun accès public en lecture. Toute lecture passe par une URL signée à
durée limitée — 5 minutes pour les photos, 2 minutes pour les pièces d'identité par défaut.

**Réserve :** rien n'a jamais été déposé sur un vrai serveur d'objets depuis ce code. Éprouvez-le contre MinIO en
local avant la première mise en ligne.

---

## 7. Ordre de mise en ligne

1. Réserver PostgreSQL et Redis, exécuter `bootstrap-production.sql`, puis `db:migrate:deploy` et `db:seed`.
2. Déployer l'API et le worker depuis `render.yaml`, avec `ALLOW_MOCK_PROVIDERS_IN_PRODUCTION=true`.
3. **Vérifier `GET /api/v1/health/ready`.** Il doit répondre 200 ; toute autre réponse signale une dépendance
   injoignable et il faut s'arrêter là.
4. Créer le premier administrateur — aucune route ne le fait, il faut insérer la ligne `UserRole` à la main.
5. Déployer les deux projets Vercel.
6. Reprendre le niveau 3 de `docs/13-installation.md` §8 contre l'environnement en ligne.

**Aucune de ces étapes n'a été exécutée.** Le `Dockerfile` et `render.yaml` n'ont jamais été construits : Docker
n'est pas disponible dans l'environnement de génération. Attendez-vous à corriger deux ou trois détails au premier
essai — c'est normal pour un premier déploiement, et cela ne se saura qu'en le tentant.
