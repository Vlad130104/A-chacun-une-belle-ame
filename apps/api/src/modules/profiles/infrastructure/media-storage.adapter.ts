import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import { createMediaStore } from '../../../infrastructure/storage/storage.factory';
import type { ObjectStore } from '../../../infrastructure/storage/s3-object-store';
import type { MediaStorage } from '../application/ports';

/**
 * Stockage des photos de profil (story E-06).
 *
 * Bucket distinct de celui des pièces d'identité, avec des identifiants
 * distincts — la séparation est vérifiée au démarrage par la validation de
 * configuration (ADR-004). Aucune URL permanente n'est émise : chaque accès
 * passe par une signature à durée limitée, plafonnée par le stockage lui-même.
 *
 * Cet adaptateur ne fait plus que déléguer. Toute la logique S3 vit dans
 * `S3ObjectStore`, partagée avec le stockage KYC : deux implémentations
 * parallèles auraient fini par diverger sur la signature ou le chiffrement.
 */
@Injectable()
export class MediaStorageAdapter implements MediaStorage {
  private readonly store: ObjectStore;

  constructor(config: ConfigService<Env, true>) {
    this.store = createMediaStore(config);
  }

  put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    return this.store.put(key, bytes, contentType);
  }

  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    return this.store.signedUrl(key, ttlSeconds);
  }

  delete(key: string): Promise<void> {
    return this.store.delete(key);
  }
}
