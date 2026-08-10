import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { Env } from '../../../config/env.schema';
import type { MediaPipeline, ProcessedImage } from '../application/ports';

/**
 * Pipeline de traitement des photos de profil (story D3-04).
 *
 * Quatre garanties, dans cet ordre :
 *   1. le format réel est déterminé par le décodage, pas par l'en-tête déclaré ;
 *   2. TOUTES les métadonnées sont supprimées — un cliché pris au téléphone porte
 *      souvent les coordonnées GPS du domicile (SECURITY.md, menace M16) ;
 *   3. l'image est ré-encodée en WebP : une charge utile dissimulée dans le fichier
 *      d'origine ne survit pas au ré-encodage ;
 *   4. une miniature et une empreinte perceptuelle sont produites.
 */
@Injectable()
export class SharpMediaPipeline implements MediaPipeline {
  private static readonly MAX_DIMENSION = 1440;
  private static readonly THUMBNAIL_DIMENSION = 400;
  private static readonly MIN_DIMENSION = 320;
  private static readonly ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif', 'avif']);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async process(bytes: Buffer): Promise<ProcessedImage> {
    const maxSize = this.config.get('MAX_UPLOAD_SIZE_BYTES', { infer: true });
    if (bytes.length === 0) throw BusinessError.badRequest(ErrorCode.MEDIA_INVALID_TYPE);
    if (bytes.length > maxSize) throw BusinessError.badRequest(ErrorCode.MEDIA_TOO_LARGE);

    const metadata = await this.readMetadata(bytes);

    if (
      metadata.format === undefined ||
      !SharpMediaPipeline.ACCEPTED_FORMATS.has(metadata.format)
    ) {
      throw BusinessError.badRequest(ErrorCode.MEDIA_INVALID_TYPE, { format: metadata.format });
    }

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width < SharpMediaPipeline.MIN_DIMENSION || height < SharpMediaPipeline.MIN_DIMENSION) {
      throw BusinessError.badRequest(ErrorCode.MEDIA_INVALID_TYPE, {
        motif: 'image trop petite pour un profil',
        minimum: SharpMediaPipeline.MIN_DIMENSION,
      });
    }

    // `rotate()` sans argument applique l'orientation EXIF avant que celle-ci ne soit
    // supprimée : sans cela, une photo prise en portrait s'afficherait couchée.
    const base = sharp(bytes, { failOn: 'error' }).rotate();

    const full = await base
      .clone()
      .resize({
        width: SharpMediaPipeline.MAX_DIMENSION,
        height: SharpMediaPipeline.MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();

    const thumbnail = await base
      .clone()
      .resize({
        width: SharpMediaPipeline.THUMBNAIL_DIMENSION,
        height: SharpMediaPipeline.THUMBNAIL_DIMENSION,
        fit: 'cover',
      })
      .webp({ quality: 75 })
      .toBuffer();

    const finalMetadata = await sharp(full).metadata();

    return {
      full,
      thumbnail,
      width: finalMetadata.width ?? width,
      height: finalMetadata.height ?? height,
      contentType: 'image/webp',
      perceptualHash: await computeAverageHash(bytes),
    };
  }

  private async readMetadata(bytes: Buffer): Promise<sharp.Metadata> {
    try {
      return await sharp(bytes).metadata();
    } catch {
      // Un fichier indécodable n'est pas une image, quel que soit son nom.
      throw BusinessError.badRequest(ErrorCode.MEDIA_INVALID_TYPE);
    }
  }
}

/**
 * Empreinte perceptuelle par moyenne (aHash) sur 8×8 pixels en niveaux de gris.
 *
 * Robuste au redimensionnement et à la recompression, ce qui est exactement le cas
 * d'usage : repérer la même photo réutilisée sur plusieurs comptes (story D3-11).
 * Elle ne remplace pas un examen humain — elle le déclenche.
 */
export async function computeAverageHash(bytes: Buffer): Promise<string> {
  const pixels = await sharp(bytes).greyscale().resize(8, 8, { fit: 'fill' }).raw().toBuffer();

  const moyenne = pixels.reduce((somme, valeur) => somme + valeur, 0) / pixels.length;

  let empreinte = '';
  for (let index = 0; index < 64; index += 4) {
    let quartet = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      if ((pixels[index + bit] ?? 0) >= moyenne) quartet |= 1 << (3 - bit);
    }
    empreinte += quartet.toString(16);
  }

  return empreinte;
}
