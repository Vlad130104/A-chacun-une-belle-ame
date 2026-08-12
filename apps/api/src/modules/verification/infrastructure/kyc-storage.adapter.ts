import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import { createKycStore } from '../../../infrastructure/storage/storage.factory';
import type { ObjectStore } from '../../../infrastructure/storage/s3-object-store';
import type { KycDocumentStorage } from '../application/ports';

/**
 * Stockage des pièces d'identité (story E-06).
 *
 * Bucket dédié, distinct du bucket média, avec **ses propres identifiants**
 * (ADR-004). Aucune URL permanente n'est jamais émise : l'accès agent passe par
 * une URL signée de très courte durée — plafonnée par
 * `KYC_SIGNED_URL_TTL_SECONDS`, plus court que le plafond des photos — et chaque
 * émission produit un événement d'audit côté appelant.
 *
 * Cet adaptateur ne fait que déléguer, comme celui des médias. Ils partagent la
 * même implémentation S3 mais **jamais le même client** : deux jeux
 * d'identifiants, construits séparément. Qui détient les clés des photos de
 * profil ne peut pas lire ce bucket.
 */
@Injectable()
export class KycDocumentStorageAdapter implements KycDocumentStorage {
  private readonly store: ObjectStore;

  constructor(config: ConfigService<Env, true>) {
    this.store = createKycStore(config);
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
