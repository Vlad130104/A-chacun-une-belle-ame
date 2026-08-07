import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from '@jest/globals';

/**
 * Test d'intégration — séparation physique des données d'identité (ADR-004).
 *
 * Ce test vérifie une garantie posée AU NIVEAU DE LA BASE, pas au niveau du code :
 * le rôle applicatif du produit ne doit pas pouvoir lire les pièces d'identité.
 * Une faille côté produit ne doit pas exposer le schéma `kyc`.
 *
 * Il ne s'exécute que lorsqu'une base est disponible (CI, ou `pnpm docker:up` en
 * local) : sans base, il est ignoré plutôt que faussement vert.
 */
const databaseUrl = process.env.DATABASE_URL;
const decrire = databaseUrl ? describe : describe.skip;

const prisma = databaseUrl ? new PrismaClient() : null;

afterAll(async () => {
  await prisma?.$disconnect();
});

decrire('séparation des schémas app et kyc', () => {
  it('crée bien les deux schémas', async () => {
    const rows = await prisma!.$queryRawUnsafe<Array<{ nspname: string }>>(
      "SELECT nspname FROM pg_namespace WHERE nspname IN ('app', 'kyc') ORDER BY nspname",
    );
    expect(rows.map((row) => row.nspname)).toEqual(['app', 'kyc']);
  });

  it('place les tables de vérification dans le schéma kyc', async () => {
    const rows = await prisma!.$queryRawUnsafe<Array<{ tablename: string }>>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'kyc' ORDER BY tablename",
    );
    const tables = rows.map((row) => row.tablename);
    expect(tables).toEqual(
      expect.arrayContaining([
        'VerificationRequest',
        'VerificationDocument',
        'VerificationDecision',
      ]),
    );
  });

  it('ne place aucune table de vérification dans le schéma app', async () => {
    const rows = await prisma!.$queryRawUnsafe<Array<{ tablename: string }>>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'app' AND tablename LIKE 'Verification%'",
    );
    expect(rows).toHaveLength(0);
  });

  // TODO(D2-05): compléter par le test de refus effectif — se connecter avec le rôle
  // `acuba_app` et vérifier qu'un SELECT sur kyc."VerificationDocument" est refusé.
  // Nécessite que les migrations aient été appliquées et les droits posés (tranche D2).
});
