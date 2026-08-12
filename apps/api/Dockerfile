# Image de production de l'API.
#
# Multi-étapes : les dépendances de construction (TypeScript, Nest CLI, Prisma CLI)
# ne se retrouvent pas dans l'image finale. Le même artefact sert à l'API et au
# worker — seul `PROCESS_ROLE` les distingue, ce qui garantit qu'ils exécutent
# exactement le même code.

# ── Base commune ────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV CI=true

# ── Dépendances ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY scripts scripts
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
# `--ignore-scripts` neutralise le hook `prepare` du dépôt, qui contrôle la
# présence d'un `.env` : dans un conteneur la configuration vient de
# l'environnement, pas d'un fichier.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Construction ────────────────────────────────────────────────────────────
FROM deps AS build
COPY prisma prisma
COPY packages packages
COPY apps/api apps/api
RUN pnpm db:generate \
 && pnpm --filter @acuba/contracts build \
 && pnpm --filter @acuba/api build \
 && pnpm prune --prod

# ── Image finale ────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production

# Utilisateur non privilégié. Une faille d'exécution de code ne doit pas donner
# `root` dans le conteneur.
RUN addgroup -S acuba && adduser -S acuba -G acuba

COPY --from=build --chown=acuba:acuba /app/node_modules ./node_modules
COPY --from=build --chown=acuba:acuba /app/packages ./packages
COPY --from=build --chown=acuba:acuba /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=acuba:acuba /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=acuba:acuba /app/apps/api/package.json ./apps/api/
# Le schéma et les migrations voyagent avec l'image : `prisma migrate deploy`
# doit pouvoir tourner depuis le conteneur, sans rapatrier le dépôt.
COPY --from=build --chown=acuba:acuba /app/prisma ./prisma
COPY --from=build --chown=acuba:acuba /app/package.json ./

USER acuba
EXPOSE 3000

# La sonde interroge PostgreSQL et Redis (story E-03) : un conteneur qui ne les
# joint plus sort du service au lieu de recevoir du trafic qu'il ne peut pas
# servir.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/'+(process.env.API_GLOBAL_PREFIX||'api/v1')+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/main.js"]
