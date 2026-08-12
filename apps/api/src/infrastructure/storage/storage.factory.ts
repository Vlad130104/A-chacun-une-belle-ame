import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { InMemoryObjectStore, S3ObjectStore, type ObjectStore } from './s3-object-store';

/**
 * Construction des deux stockages (story E-06).
 *
 * Le point à ne pas perdre de vue : **deux jeux d'identifiants distincts**. La
 * fabrique est le seul endroit du code où ils se croisent, et elle ne les
 * mélange pas. Le module `profiles` ne reçoit jamais les clés du bucket KYC ; le
 * module `verification` ne reçoit jamais celles du bucket média.
 */

export function createMediaStore(config: ConfigService<Env, true>): ObjectStore {
  const bucket = config.get('S3_MEDIA_BUCKET', { infer: true });

  if (config.get('STORAGE_PROVIDER', { infer: true }) === 'memory') {
    return new InMemoryObjectStore(bucket);
  }

  return new S3ObjectStore({
    endpoint: config.get('S3_ENDPOINT', { infer: true }),
    region: config.get('S3_REGION', { infer: true }),
    forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
    bucket,
    accessKeyId: config.get('S3_MEDIA_ACCESS_KEY', { infer: true }),
    secretAccessKey: config.get('S3_MEDIA_SECRET_KEY', { infer: true }),
    maxTtlSeconds: config.get('SIGNED_URL_TTL_SECONDS', { infer: true }),
  });
}

export function createKycStore(config: ConfigService<Env, true>): ObjectStore {
  const bucket = config.get('S3_KYC_BUCKET', { infer: true });

  if (config.get('STORAGE_PROVIDER', { infer: true }) === 'memory') {
    return new InMemoryObjectStore(bucket);
  }

  return new S3ObjectStore({
    endpoint: config.get('S3_ENDPOINT', { infer: true }),
    region: config.get('S3_REGION', { infer: true }),
    forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
    bucket,
    accessKeyId: config.get('S3_KYC_ACCESS_KEY', { infer: true }),
    secretAccessKey: config.get('S3_KYC_SECRET_KEY', { infer: true }),
    // Plafond PROPRE aux pièces d'identité, plus court que celui des photos.
    // Une URL de pièce d'identité qui survivrait à la consultation qui l'a
    // justifiée circulerait par capture d'écran.
    maxTtlSeconds: config.get('KYC_SIGNED_URL_TTL_SECONDS', { infer: true }),
  });
}
