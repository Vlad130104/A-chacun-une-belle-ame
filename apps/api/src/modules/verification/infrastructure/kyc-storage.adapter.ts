import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import type { KycDocumentStorage } from '../application/ports';

/**
 * Stockage des pièces d'identité.
 *
 * Bucket dédié, distinct du bucket média, avec ses propres identifiants (ADR-004).
 * Aucune URL permanente n'est jamais émise : l'accès agent passe par une URL signée
 * de très courte durée, et chaque émission produit un événement d'audit côté appelant.
 *
 * Implémentation en mémoire tant que le client S3 n'est pas branché — l'interface,
 * elle, est définitive.
 */
@Injectable()
export class KycDocumentStorageAdapter implements KycDocumentStorage {
  private readonly logger = new Logger(KycDocumentStorageAdapter.name);
  private readonly signingKey = randomBytes(32);
  private readonly objects = new Map<string, Buffer>();

  constructor(private readonly config: ConfigService<Env, true>) {}

  put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    // Le contenu n'est jamais journalisé, seulement sa taille et son type.
    this.logger.debug(`Écriture KYC : ${key} (${bytes.length} octets, ${contentType})`);
    this.objects.set(key, bytes);
    return Promise.resolve();
  }

  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = createHmac('sha256', this.signingKey)
      .update(`${key}:${expiresAt}`)
      .digest('hex');

    const endpoint = this.config.get('S3_ENDPOINT', { infer: true });
    const bucket = this.config.get('S3_KYC_BUCKET', { infer: true });

    return Promise.resolve(
      `${endpoint}/${bucket}/${key}?expires=${expiresAt}&signature=${signature}`,
    );
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    this.logger.debug(`Suppression KYC : ${key}`);
    return Promise.resolve();
  }
}
