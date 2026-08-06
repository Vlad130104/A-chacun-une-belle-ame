# Documentation — « À Chacun Une Belle Âme »

Plateforme SaaS de rencontres sérieuses, réservée aux personnes majeures, pour le Cameroun, le Bénin et la Côte
d'Ivoire.

**État du projet : phase B (conception) terminée. Aucun code applicatif n'a encore été écrit.**

---

## Par où commencer

| Vous êtes… | Lisez dans cet ordre |
|---|---|
| **Porteur de projet** | [00 — Cadrage](./00-phase-a-audit-cadrage.md) → [12 — Risques](./12-registre-des-risques.md) → [11 — Roadmap](./11-roadmap-v1-v2.md) → [08 — Backlog](./08-backlog-mvp.md) |
| **Développeur qui rejoint** | [01 — Architecture](./01-architecture.md) → [02 — Décisions](./02-decisions-techniques.md) → [03 — Modèle de données](./03-modele-de-donnees.md) → [05 — API](./05-api.md) |
| **Designer** | [07 — Parcours UX](./07-parcours-ux.md) → [00 — Cadrage §2](./00-phase-a-audit-cadrage.md) |
| **Responsable sécurité** | [SECURITY.md](../SECURITY.md) → [06 — Rôles](./06-roles-et-permissions.md) → [MOCKS.md](./MOCKS.md) |
| **Modérateur ou agent** | [06 — Rôles](./06-roles-et-permissions.md) → [07 — Écrans 23 et 24](./07-parcours-ux.md) |

---

## Sommaire

### Phase A — Cadrage
- [00 — Audit et cadrage](./00-phase-a-audit-cadrage.md) — périmètre, hypothèses, 12 questions bloquantes, plan par lots

### Phase B — Conception
- [01 — Architecture générale](./01-architecture.md) — monolithe modulaire, 17 modules, ports, flux, monorepo
- [02 — Décisions techniques](./02-decisions-techniques.md) — 20 ADR
- [03 — Modèle de données](./03-modele-de-donnees.md) — 43 entités, index, conservation · schéma : [`prisma/schema.prisma`](../prisma/schema.prisma)
- [04 — Algorithme de matching](./04-algorithme-de-matching.md) — filtres, formule du score, non-discrimination
- [05 — API REST](./05-api.md) — routes et politiques d'autorisation · spécification : [`api/openapi.yaml`](./api/openapi.yaml)
- [06 — Rôles et permissions](./06-roles-et-permissions.md) — matrice, quatre yeux, audit
- [07 — Parcours UX](./07-parcours-ux.md) — 24 écrans détaillés
- [08 — Backlog MVP](./08-backlog-mvp.md) — 74 user stories et critères d'acceptation
- [09 — Plan de tests](./09-plan-de-tests.md) — pyramide, 18 parcours E2E, CI
- [10 — Plan de déploiement](./10-plan-de-deploiement.md) — environnements, migrations, rollback, sauvegardes
- [11 — Roadmap V1 et V2](./11-roadmap-v1-v2.md)
- [12 — Registre des risques](./12-registre-des-risques.md)

### Transverse
- [SECURITY.md](../SECURITY.md) — modèle de menace, mesures, incidents, checklist avant production
- [MOCKS.md](./MOCKS.md) — intégrations encore simulées

---

## Les quatre règles qui priment sur tout

1. **Aucun mineur.** Âge calculé côté serveur, refus définitif, ré-inscription empêchée.
2. **Aucun accès produit sans vérification d'identité.** Porte serveur, pas un badge d'interface.
3. **Aucun message sans accord mutuel.** Vérifié en HTTP et en WebSocket par le même code.
4. **Les données d'identité sont séparées de tout le reste.** Schéma, bucket, rôle et clés distincts.

---

## Avertissement juridique

Les conditions générales d'utilisation, la politique de confidentialité, la politique de conservation, le processus
KYC, les règles de modération et la conformité applicable au Cameroun, au Bénin, en Côte d'Ivoire — ainsi que le RGPD
en cas d'ouverture européenne — **doivent être validés par un conseil juridique compétent avant le lancement
public**. Aucun document de ce dépôt ne constitue un avis juridique.

## Transparence sur les intégrations

Certaines intégrations externes (SMS, KYC, paiement, notifications push) seront livrées avec une implémentation
**simulée** tant qu'aucun contrat prestataire n'existe. Leur état réel est consultable dans [MOCKS.md](./MOCKS.md) et,
une fois le produit déployé, via `GET /health/providers`. Elles ne seront jamais présentées comme fonctionnelles.
