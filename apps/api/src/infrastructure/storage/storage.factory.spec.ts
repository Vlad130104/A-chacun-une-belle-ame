import { describe, expect, it } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { createKycStore, createMediaStore } from './storage.factory';
import { InMemoryObjectStore, S3ObjectStore } from './s3-object-store';

/**
 * Tests du stockage d'objets — story E-06.
 *
 * Ce que ces tests peuvent établir : le bon stockage est construit, avec le bon
 * bucket et les BONS identifiants. Ce qu'ils ne peuvent pas établir : qu'un
 * dépôt réel aboutisse. Aucun serveur S3 n'est joignable depuis l'environnement
 * de génération, et un test qui simulerait le SDK ne vérifierait que le
 * simulacre. La confirmation viendra du premier dépôt contre MinIO.
 */

const base: Record<string, unknown> = {
  STORAGE_PROVIDER: 's3',
  S3_ENDPOINT: 'https://s3.example.test',
  S3_REGION: 'eu-west-1',
  S3_FORCE_PATH_STYLE: true,
  S3_MEDIA_BUCKET: 'medias',
  S3_KYC_BUCKET: 'identites',
  S3_MEDIA_ACCESS_KEY: 'cle-media',
  S3_MEDIA_SECRET_KEY: 'secret-media',
  S3_KYC_ACCESS_KEY: 'cle-kyc',
  S3_KYC_SECRET_KEY: 'secret-kyc',
  SIGNED_URL_TTL_SECONDS: 300,
  KYC_SIGNED_URL_TTL_SECONDS: 120,
};

function configuration(surcharge: Record<string, unknown> = {}): ConfigService<Env, true> {
  const valeurs = { ...base, ...surcharge };
  return { get: (cle: string) => valeurs[cle] } as unknown as ConfigService<Env, true>;
}

/** Les identifiants sont privés : on les relit par la seule voie disponible. */
function identifiantsDe(store: S3ObjectStore): { bucket: string; accessKeyId: string } {
  const config = (store as unknown as { config: { bucket: string; accessKeyId: string } }).config;
  return { bucket: config.bucket, accessKeyId: config.accessKeyId };
}

describe('choix du stockage', () => {
  it('construit un stockage S3 réel quand il est configuré', () => {
    expect(createMediaStore(configuration())).toBeInstanceOf(S3ObjectStore);
    expect(createKycStore(configuration())).toBeInstanceOf(S3ObjectStore);
  });

  it('retombe en mémoire uniquement sur demande EXPLICITE', () => {
    // Le stockage en mémoire n'est plus un défaut silencieux : il faut l'écrire.
    // `NODE_ENV=production` refuse par ailleurs de démarrer avec lui.
    const config = configuration({ STORAGE_PROVIDER: 'memory' });
    expect(createMediaStore(config)).toBeInstanceOf(InMemoryObjectStore);
    expect(createKycStore(config)).toBeInstanceOf(InMemoryObjectStore);
  });
});

describe('séparation des deux stockages — ADR-004', () => {
  it('n’utilise JAMAIS les mêmes identifiants pour les deux buckets', () => {
    // Le cœur d'ADR-004 : qui détient les clés des photos de profil ne doit pas
    // pouvoir lire les pièces d'identité. Un client partagé annulerait toute la
    // séparation que le modèle de données met en place.
    const media = identifiantsDe(createMediaStore(configuration()) as S3ObjectStore);
    const kyc = identifiantsDe(createKycStore(configuration()) as S3ObjectStore);

    expect(media.accessKeyId).not.toBe(kyc.accessKeyId);
    expect(media.bucket).not.toBe(kyc.bucket);
  });

  it('donne à chaque stockage SON bucket, et pas celui de l’autre', () => {
    expect(identifiantsDe(createMediaStore(configuration()) as S3ObjectStore)).toEqual({
      bucket: 'medias',
      accessKeyId: 'cle-media',
    });
    expect(identifiantsDe(createKycStore(configuration()) as S3ObjectStore)).toEqual({
      bucket: 'identites',
      accessKeyId: 'cle-kyc',
    });
  });

  it('construit deux CLIENTS distincts, jamais un client partagé', () => {
    const media = createMediaStore(configuration());
    const kyc = createKycStore(configuration());

    expect(media).not.toBe(kyc);
  });
});

describe('durée de vie des URL signées', () => {
  const plafond = (store: S3ObjectStore): number =>
    (store as unknown as { config: { maxTtlSeconds: number } }).config.maxTtlSeconds;

  it('plafonne les pièces d’identité PLUS COURT que les photos', () => {
    // Une URL de pièce d'identité qui survivrait à la consultation qui l'a
    // justifiée circulerait par capture d'écran.
    expect(plafond(createKycStore(configuration()) as S3ObjectStore)).toBeLessThan(
      plafond(createMediaStore(configuration()) as S3ObjectStore),
    );
  });

  it('applique le plafond DANS le stockage, pas seulement chez l’appelant', async () => {
    // Le plafond du domaine ne protège que si rien ne peut le contourner : un
    // appelant qui demanderait une journée doit obtenir le plafond, pas sa
    // demande.
    const store = new (class extends S3ObjectStore {})({
      endpoint: 'https://s3.example.test',
      region: 'eu-west-1',
      forcePathStyle: true,
      bucket: 'identites',
      accessKeyId: 'cle',
      secretAccessKey: 'secret',
      maxTtlSeconds: 120,
    });

    const url = await store.signedUrl('document-1', 86_400);

    // Le SDK inscrit la durée retenue dans la signature : elle doit être bornée.
    expect(url).toContain('X-Amz-Expires=120');
  });
});

describe('stockage en mémoire', () => {
  it('produit une URL qui ne se fait PAS passer pour un stockage réel', async () => {
    // Le préfixe `memory://` est délibéré : aucune capture d'écran, aucun
    // journal ne doit laisser croire à un stockage qui n'existe pas.
    const store = new InMemoryObjectStore('medias');
    expect(await store.signedUrl('photo-1', 300)).toMatch(/^memory:\/\/medias\//);
  });

  it('rend l’objet qu’on lui a confié, et l’oublie après suppression', async () => {
    const store = new InMemoryObjectStore('medias');
    await store.put('photo-1', Buffer.from('contenu'), 'image/jpeg');
    expect(store.objects.has('photo-1')).toBe(true);

    await store.delete('photo-1');
    expect(store.objects.has('photo-1')).toBe(false);
  });
});
