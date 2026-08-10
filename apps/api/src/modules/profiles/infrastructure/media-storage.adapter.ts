import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import type { MediaStorage } from '../application/ports';

/**
 * Stockage des photos de profil.
 *
 * Bucket distinct de celui des pièces d'identité — la séparation est vérifiée au
 * démarrage par la validation de configuration (ADR-004). Aucune URL permanente n'est
 * émise : chaque accès passe par une signature à durée limitée.
 *
 * Implémentation en mémoire tant que le client S3 n'est pas branché ; l'interface est
 * définitive et le remplacement ne touchera ni le domaine ni l'application.
 */
@Injectable()
export class MediaStorageAdapter implements MediaStorage {
  private readonly logger = new Logger(MediaStorageAdapter.name);
  private readonly signingKey = randomBytes(32);
  private readonly objects = new Map<string, Buffer>();

  constructor(private readonly config: ConfigService<Env, true>) {}

  put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    this.logger.debug(`Écriture média : ${key} (${bytes.length} octets, ${contentType})`);
    this.objects.set(key, bytes);
    return Promise.resolve();
  }

  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = createHmac('sha256', this.signingKey)
      .update(`${key}:${expiresAt}`)
      .digest('hex');

    const endpoint = this.config.get('S3_ENDPOINT', { infer: true });
    const bucket = this.config.get('S3_MEDIA_BUCKET', { infer: true });

    return Promise.resolve(
      `${endpoint}/${bucket}/${key}?expires=${expiresAt}&signature=${signature}`,
    );
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}
