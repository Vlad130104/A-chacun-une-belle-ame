# À Chacun Une Belle Âme

Plateforme SaaS de rencontres sérieuses, sécurisée et modérée, **exclusivement réservée aux personnes majeures**.
Conçue pour le Cameroun, le Bénin et la Côte d'Ivoire, à partir d'une communauté WhatsApp existante de plus de
9 000 membres.

> **État : conception (phase B) terminée. Le développement n'a pas encore commencé.**
> Ce dépôt contient pour l'instant la documentation de conception et le schéma de données.

## Documentation

Tout se trouve dans **[`docs/`](./docs/README.md)** — commencez par le sommaire.

| Document | Contenu |
|---|---|
| [Cadrage](./docs/00-phase-a-audit-cadrage.md) | Périmètre MVP, hypothèses, risques, 12 questions bloquantes |
| [Architecture](./docs/01-architecture.md) | Monolithe modulaire NestJS, 17 modules, ports et adaptateurs |
| [Décisions techniques](./docs/02-decisions-techniques.md) | 20 ADR |
| [Modèle de données](./docs/03-modele-de-donnees.md) | 43 entités · [`prisma/schema.prisma`](./prisma/schema.prisma) |
| [Matching](./docs/04-algorithme-de-matching.md) | Formule du score, documentée et testable |
| [API](./docs/05-api.md) | Routes et autorisations · [`openapi.yaml`](./docs/api/openapi.yaml) |
| [Backlog](./docs/08-backlog-mvp.md) | 74 user stories, critères d'acceptation |
| [Sécurité](./SECURITY.md) | Modèle de menace, incidents, checklist avant production |
| [Intégrations simulées](./docs/MOCKS.md) | Ce qui est simulé, et ce qui casse sans le vrai |

## Stack

Monorepo TypeScript (pnpm + Turborepo) · NestJS · PostgreSQL + Prisma · Redis + BullMQ · Socket.IO ·
Next.js (web et back-office) · React Native / Expo · stockage compatible S3 · Docker · GitHub Actions.

## Les quatre règles non négociables

1. **Aucun mineur** — âge calculé côté serveur, refus définitif, ré-inscription empêchée.
2. **Aucun accès produit sans vérification d'identité** — contrôle serveur, pas un badge d'interface.
3. **Aucun message sans accord mutuel** — même règle appliquée en HTTP et en WebSocket.
4. **Les données d'identité sont isolées** — schéma, bucket, rôle et clés de chiffrement distincts.

## Avertissement

Les CGU, la politique de confidentialité, la politique de conservation, le processus KYC, les règles de modération et
la conformité applicable dans chaque pays doivent être **validés par un conseil juridique compétent avant le lancement
public**. Aucun document de ce dépôt ne constitue un avis juridique.
