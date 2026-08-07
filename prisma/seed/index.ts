import { PrismaClient } from '@prisma/client';
import { FEATURE_FLAGS, INTERETS, PLANS, VILLES } from './referentiels';

/**
 * Seed de développement.
 *
 * Déterministe et idempotent : deux exécutions produisent le même état, ce qui rend
 * un test E2E en échec reproductible (docs/09-plan-de-tests.md §10).
 *
 * AUCUNE donnée réelle, aucun visage réel, jamais de copie de production.
 */
const prisma = new PrismaClient();

async function seedVilles(): Promise<void> {
  for (const ville of VILLES) {
    await prisma.city.upsert({
      where: { countryCode_slug: { countryCode: ville.countryCode, slug: ville.slug } },
      update: { name: ville.name, region: ville.region },
      create: ville,
    });
  }
  console.log(`  ${VILLES.length} villes`);
}

async function seedInterets(): Promise<void> {
  for (const interet of INTERETS) {
    await prisma.interest.upsert({
      where: { slug: interet.slug },
      update: { label: interet.label, category: interet.category, active: true },
      create: interet,
    });
  }
  console.log(`  ${INTERETS.length} centres d'intérêt et valeurs`);
}

async function seedPlans(): Promise<void> {
  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        description: plan.description,
        priceMinor: plan.priceMinor,
        currency: plan.currency,
        entitlements: plan.entitlements,
        sortOrder: plan.sortOrder,
        active: true,
      },
      create: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        interval: plan.interval,
        priceMinor: plan.priceMinor,
        currency: plan.currency,
        // XAF et XOF n'ont pas de sous-unité (ADR-009).
        minorUnitExponent: 0,
        countryCode: plan.countryCode,
        entitlements: plan.entitlements,
        sortOrder: plan.sortOrder,
      },
    });
  }
  console.log(`  ${PLANS.length} offres (Mode test — tarifs de démonstration)`);
}

async function seedFlags(): Promise<void> {
  for (const flag of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: { description: flag.description, payload: flag.payload ?? undefined },
      create: {
        key: flag.key,
        description: flag.description,
        enabled: flag.enabled,
        payload: flag.payload ?? undefined,
      },
    });
  }
  console.log(`  ${FEATURE_FLAGS.length} feature flags`);
}

async function seedCampagneMigration(): Promise<void> {
  await prisma.campaign.upsert({
    where: { code: 'whatsapp-lancement' },
    update: {},
    create: {
      code: 'whatsapp-lancement',
      name: 'Migration du groupe WhatsApp historique',
      source: 'whatsapp_group',
      description:
        'Campagne d’ouverture réservée aux membres historiques. Aucun import automatique : chaque inscription passe par un lien volontairement cliqué.',
      promoPlanCode: 'premium_monthly',
      promoFreeDays: 30,
      startsAt: new Date('2026-09-01T00:00:00.000Z'),
      active: true,
    },
  });
  console.log('  1 campagne de migration');
}

async function main(): Promise<void> {
  console.log('Seed de développement — aucune donnée réelle\n');

  await seedVilles();
  await seedInterets();
  await seedPlans();
  await seedFlags();
  await seedCampagneMigration();

  // TODO(D3-01): ajouter 40 profils fictifs avec photos générées, quelques matchs,
  // conversations et un cas de modération ouvert, une fois les tranches D1 à D3 livrées.

  console.log('\nSeed terminé.');
}

main()
  .catch((error: unknown) => {
    console.error('Échec du seed :', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
