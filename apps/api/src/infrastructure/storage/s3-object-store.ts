import { Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Stockage d'objets compatible S3 (story E-06).
 *
 * **Ce fichier corrige le défaut le plus grave du projet.** Les deux adaptateurs
 * de stockage conservaient jusqu'ici les fichiers dans une `Map` en mémoire de
 * processus, alors que le registre des simulations les présentait comme réels.
 * Une pièce d'identité déposée disparaissait au redémarrage et restait
 * invisible depuis toute autre instance : la vérification d'identité, qui est la
 * promesse centrale du produit, ne pouvait pas fonctionner.
 *
 * Deux instances distinctes de cette classe cohabitent, une par bucket, avec des
 * IDENTIFIANTS DIFFÉRENTS (ADR-004). Ce n'est pas une précaution de forme : qui
 * détient les clés du bucket des photos ne doit pas pouvoir lire les pièces
 * d'identité. Un client S3 partagé annulerait la séparation que tout le reste du
 * modèle de données met en place.
 */

export interface ObjectStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface S3StoreConfig {
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Plafond de durée de vie des URL signées.
   *
   * Il est appliqué ICI, et pas seulement chez l'appelant : une URL de pièce
   * d'identité qui vivrait une journée circulerait par capture d'écran bien
   * après la fin de la consultation qui l'a justifiée. Le plafond du domaine ne
   * protège que si rien ne peut le contourner.
   */
  maxTtlSeconds: number;
}

export class S3ObjectStore implements ObjectStore {
  private readonly logger = new Logger(S3ObjectStore.name);
  private readonly client: S3Client;

  constructor(private readonly config: S3StoreConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        // Chiffrement au repos côté serveur. Redondant avec le chiffrement de
        // volume de la plupart des hébergeurs, et c'est très bien : la
        // redondance ne coûte rien et couvre le cas où l'hébergeur ne le fait
        // pas, ce qu'on ne saura pas toujours.
        ServerSideEncryption: 'AES256',
      }),
    );

    // Aucune donnée d'objet dans les journaux : ni le contenu, ni la clé
    // complète, qui identifie une personne dans le cas d'une pièce d'identité.
    this.logger.debug(`Objet écrit dans ${this.config.bucket} (${bytes.length} octets)`);
  }

  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const duree = Math.min(Math.max(Math.trunc(ttlSeconds), 1), this.config.maxTtlSeconds);

    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: duree },
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

/**
 * Stockage en mémoire — développement hors ligne et tests, jamais autre chose.
 *
 * Il est conservé, mais il ne se fait plus passer pour un stockage réel : il
 * n'est sélectionné que par `STORAGE_PROVIDER=memory`, il est signalé comme
 * simulé par `GET /health/providers`, et `NODE_ENV=production` refuse de
 * démarrer avec lui.
 *
 * Les URL qu'il produit portent le préfixe `memory://` — elles ne ressemblent
 * pas à des URL de stockage, précisément pour qu'aucune capture d'écran ni
 * aucun journal ne laisse croire à un stockage qui n'existe pas.
 */
export class InMemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();

  constructor(private readonly bucket: string) {}

  put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { bytes, contentType });
    return Promise.resolve();
  }

  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    return Promise.resolve(`memory://${this.bucket}/${key}?expires=${expiresAt}`);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}
