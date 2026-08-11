import { beforeEach, describe, expect, it } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { HealthController } from './health.controller';
import type { CacheProbe } from './ports';

/**
 * Tests des sondes — story E-03.
 *
 * `GET /health/ready` renvoyait « ok » sans rien vérifier. Un répartiteur de
 * charge y aurait envoyé du trafic vers une instance incapable de joindre
 * PostgreSQL, sans jamais la retirer du service. Une sonde qui répond toujours
 * oui est pire qu'une sonde absente : elle donne une garantie qui n'existe pas.
 */

class FakePrisma {
  disponible = true;
  $queryRaw(): Promise<unknown> {
    return this.disponible
      ? Promise.resolve([{ '?column?': 1 }])
      : Promise.reject(new Error('connexion refusée'));
  }
}

class FakeCache implements CacheProbe {
  disponible = true;
  ping(): Promise<void> {
    return this.disponible ? Promise.resolve() : Promise.reject(new Error('Redis injoignable'));
  }
}

const CONFIG = {
  get: (cle: string) =>
    (
      ({
        SMS_PROVIDER: 'console',
        KYC_PROVIDER: 'mock',
        PAYMENT_PROVIDER: 'mock',
        PUSH_PROVIDER: 'mock',
        CONTENT_MODERATION_PROVIDER: 'rules',
      }) as Record<string, string>
    )[cle],
} as unknown as ConfigService<Env, true>;

let prisma: FakePrisma;
let cache: FakeCache;
let controller: HealthController;

const attendreIndisponible = async (
  promesse: Promise<unknown>,
): Promise<ServiceUnavailableException> => {
  try {
    await promesse;
  } catch (erreur) {
    if (erreur instanceof ServiceUnavailableException) return erreur;
    throw erreur;
  }
  throw new Error('Une indisponibilité était attendue.');
};

beforeEach(() => {
  prisma = new FakePrisma();
  cache = new FakeCache();
  controller = new HealthController(CONFIG, prisma as unknown as PrismaService, cache);
});

describe('sonde de vivacité', () => {
  it('répond sans interroger AUCUNE dépendance', async () => {
    // Y inclure PostgreSQL ferait redémarrer en boucle toutes les instances
    // pendant une panne de base : une tempête de démarrages ajoutée à l'incident.
    prisma.disponible = false;
    cache.disponible = false;

    expect(controller.live()).toEqual({ status: 'ok' });
    await Promise.resolve();
  });
});

describe('sonde de disponibilité', () => {
  it('répond ok quand PostgreSQL et Redis répondent', async () => {
    expect(await controller.ready()).toEqual({
      status: 'ok',
      checks: { postgres: true, redis: true },
    });
  });

  it('REFUSE le trafic quand PostgreSQL est injoignable', async () => {
    prisma.disponible = false;

    const erreur = await attendreIndisponible(controller.ready());
    expect(erreur.getStatus()).toBe(503);
    expect(erreur.getResponse()).toMatchObject({ checks: { postgres: false, redis: true } });
  });

  it('REFUSE le trafic quand Redis est injoignable', async () => {
    // Redis porte les compteurs de limitation de débit et la file de
    // notifications : servir sans lui reviendrait à servir sans protection.
    cache.disponible = false;

    const erreur = await attendreIndisponible(controller.ready());
    expect(erreur.getStatus()).toBe(503);
    expect(erreur.getResponse()).toMatchObject({ checks: { postgres: true, redis: false } });
  });

  it('nomme la dépendance en défaut sans exposer le message du moteur', async () => {
    // Le détail sert au diagnostic ; il ne révèle ni adresse, ni identifiant,
    // ni trace technique (docs/05-api.md §12).
    prisma.disponible = false;
    cache.disponible = false;

    const corps = (await attendreIndisponible(controller.ready())).getResponse();
    expect(JSON.stringify(corps)).not.toContain('connexion refusée');
    expect(corps).toMatchObject({ checks: { postgres: false, redis: false } });
  });
});
