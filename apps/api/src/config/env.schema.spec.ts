import { describe, expect, it } from '@jest/globals';
import { EnvValidationError, listSimulatedProviders, validateEnv } from './env.schema';

const baseEnv = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=app',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validation de la configuration', () => {
  it('applique les valeurs par défaut documentées', () => {
    const env = validateEnv(baseEnv);
    expect(env.MINIMUM_AGE).toBe(18);
    expect(env.PROCESS_ROLE).toBe('all');
    expect(env.MATCHING_POLICY).toBe('HETERO');
    expect(env.KYC_DOCUMENT_RETENTION_DAYS).toBe(90);
  });

  it('refuse une URL de base de données absente', () => {
    expect(() => validateEnv({ REDIS_URL: 'redis://localhost:6379' })).toThrow(EnvValidationError);
  });

  it('refuse un âge minimum inférieur à 18 ans', () => {
    expect(() => validateEnv({ ...baseEnv, MINIMUM_AGE: '16' })).toThrow(EnvValidationError);
  });

  it('refuse un seuil de photos incohérent', () => {
    expect(() => validateEnv({ ...baseEnv, MAX_PHOTOS: '2', MIN_PHOTOS_TO_PUBLISH: '3' })).toThrow(
      /MIN_PHOTOS_TO_PUBLISH/,
    );
  });

  describe('séparation des stockages', () => {
    it('refuse un bucket unique pour les médias et les pièces d’identité', () => {
      expect(() =>
        validateEnv({ ...baseEnv, S3_MEDIA_BUCKET: 'acuba', S3_KYC_BUCKET: 'acuba' }),
      ).toThrow(/buckets distincts/);
    });

    it('accepte deux buckets distincts', () => {
      const env = validateEnv({
        ...baseEnv,
        S3_MEDIA_BUCKET: 'medias',
        S3_KYC_BUCKET: 'identites',
      });
      expect(env.S3_KYC_BUCKET).toBe('identites');
    });
  });

  describe('garde-fou des intégrations simulées', () => {
    it('empêche le démarrage en production avec un port critique simulé', () => {
      expect(() =>
        validateEnv({ ...baseEnv, NODE_ENV: 'production', SMS_PROVIDER: 'console' }),
      ).toThrow(/ports critiques encore simulés/);
    });

    it('autorise le démarrage si la dérogation est posée explicitement', () => {
      const env = validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        SMS_PROVIDER: 'console',
        ALLOW_MOCK_PROVIDERS_IN_PRODUCTION: 'true',
      });
      expect(env.NODE_ENV).toBe('production');
    });

    it('laisse passer les ports simulés hors production', () => {
      expect(() => validateEnv({ ...baseEnv, NODE_ENV: 'development' })).not.toThrow();
    });

    it('énumère les ports encore simulés', () => {
      // `StorageProvider` figure ici depuis la story E-06 : il était auparavant
      // absent de cette liste ALORS QUE son implémentation était en mémoire.
      // C'est ce silence qui a permis au registre des simulations d'affirmer
      // pendant dix tranches qu'il était réel.
      const env = validateEnv(baseEnv);
      expect(listSimulatedProviders(env)).toEqual([
        'SmsProvider',
        'KycProvider',
        'PaymentProvider',
        'PushProvider',
        'ContentModerationProvider',
        'StorageProvider',
      ]);
    });

    it('REFUSE de démarrer en production avec un stockage en mémoire', () => {
      // Un stockage en mémoire perd toute pièce d'identité au redémarrage : la
      // vérification d'identité, promesse centrale du produit, ne peut pas
      // fonctionner. Le démarrage doit échouer bruyamment.
      expect(() =>
        validateEnv({ ...baseEnv, NODE_ENV: 'production', STORAGE_PROVIDER: 'memory' }),
      ).toThrow(/STORAGE_PROVIDER/);
    });

    it('refuse deux buckets servis par les MÊMES identifiants', () => {
      // ADR-004 : qui détient les clés des photos de profil ne doit pas pouvoir
      // lire les pièces d'identité.
      expect(() =>
        validateEnv({
          ...baseEnv,
          STORAGE_PROVIDER: 's3',
          S3_MEDIA_ACCESS_KEY: 'meme-cle',
          S3_MEDIA_SECRET_KEY: 'secret-a',
          S3_KYC_ACCESS_KEY: 'meme-cle',
          S3_KYC_SECRET_KEY: 'secret-b',
        }),
      ).toThrow(/distincts/);
    });

    it('refuse un stockage S3 sans identifiants', () => {
      expect(() => validateEnv({ ...baseEnv, STORAGE_PROVIDER: 's3' })).toThrow(/identifiants/);
    });
  });
});
