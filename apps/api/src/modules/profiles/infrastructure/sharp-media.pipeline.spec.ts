import { beforeAll, describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import type { ConfigService } from '@nestjs/config';
import { BusinessError } from '../../../common/errors/business.error';
import type { Env } from '../../../config/env.schema';
import { computeAverageHash, SharpMediaPipeline } from './sharp-media.pipeline';
import { looksLikeSameImage } from '../domain/photo-policy';

/**
 * Ces tests exercent le vrai traitement d'image : sharp fonctionne en mémoire, sans
 * base ni réseau, donc le pipeline peut être vérifié au niveau unitaire.
 */
const config = {
  get: (key: string) => (key === 'MAX_UPLOAD_SIZE_BYTES' ? 8_388_608 : undefined),
} as unknown as ConfigService<Env, true>;

const pipeline = new SharpMediaPipeline(config);

/** Photo de test avec métadonnées EXIF, dont une position GPS. */
async function photoAvecExif(largeur = 900, hauteur = 1200): Promise<Buffer> {
  return sharp({
    create: {
      width: largeur,
      height: hauteur,
      channels: 3,
      background: { r: 180, g: 120, b: 90 },
    },
  })
    .withExif({
      IFD0: { Copyright: 'Test', Model: 'Téléphone de test' },
      IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
    })
    .jpeg()
    .toBuffer();
}

describe('pipeline de traitement des photos', () => {
  let source: Buffer;

  beforeAll(async () => {
    source = await photoAvecExif();
  });

  describe('suppression des métadonnées', () => {
    it('produit une image sans aucune métadonnée EXIF', async () => {
      const avant = await sharp(source).metadata();
      expect(avant.exif).toBeDefined();

      const traitee = await pipeline.process(source);
      const apres = await sharp(traitee.full).metadata();

      // Une photo prise au téléphone porte souvent les coordonnées du domicile :
      // les conserver exposerait les membres à une traque (SECURITY.md, menace M16).
      expect(apres.exif).toBeUndefined();
    });

    it('supprime aussi les métadonnées de la miniature', async () => {
      const traitee = await pipeline.process(source);
      const miniature = await sharp(traitee.thumbnail).metadata();
      expect(miniature.exif).toBeUndefined();
    });
  });

  describe('ré-encodage et redimensionnement', () => {
    it('convertit systématiquement en WebP', async () => {
      const traitee = await pipeline.process(source);
      expect(traitee.contentType).toBe('image/webp');
      expect((await sharp(traitee.full).metadata()).format).toBe('webp');
    });

    it('borne la plus grande dimension', async () => {
      const grande = await sharp({
        create: { width: 4000, height: 3000, channels: 3, background: { r: 10, g: 20, b: 30 } },
      })
        .jpeg()
        .toBuffer();

      const traitee = await pipeline.process(grande);
      expect(Math.max(traitee.width, traitee.height)).toBeLessThanOrEqual(1440);
    });

    it('n’agrandit pas une image déjà petite', async () => {
      const traitee = await pipeline.process(source);
      expect(traitee.width).toBeLessThanOrEqual(900);
    });

    it('produit une miniature carrée nettement plus légère', async () => {
      const traitee = await pipeline.process(source);
      const miniature = await sharp(traitee.thumbnail).metadata();

      expect(miniature.width).toBe(400);
      expect(miniature.height).toBe(400);
      expect(traitee.thumbnail.length).toBeLessThan(traitee.full.length);
    });
  });

  describe('refus', () => {
    it('refuse un fichier qui n’est pas une image', async () => {
      await expect(pipeline.process(Buffer.from('ceci est du texte'))).rejects.toBeInstanceOf(
        BusinessError,
      );
    });

    it('refuse un fichier vide', async () => {
      await expect(pipeline.process(Buffer.alloc(0))).rejects.toBeInstanceOf(BusinessError);
    });

    it('refuse une image trop petite pour un profil', async () => {
      const minuscule = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .jpeg()
        .toBuffer();

      await expect(pipeline.process(minuscule)).rejects.toBeInstanceOf(BusinessError);
    });
  });

  describe('empreinte perceptuelle', () => {
    it('est déterministe', async () => {
      expect(await computeAverageHash(source)).toBe(await computeAverageHash(source));
    });

    it('fait 16 caractères hexadécimaux', async () => {
      expect(await computeAverageHash(source)).toMatch(/^[0-9a-f]{16}$/);
    });

    it('reconnaît la même photo après recompression et redimensionnement', async () => {
      const degradee = await sharp(source).resize(450).jpeg({ quality: 40 }).toBuffer();

      // C'est précisément le cas d'usage : un faux profil réutilise une photo trouvée
      // ailleurs, souvent recompressée en chemin (story D3-11).
      expect(
        looksLikeSameImage(await computeAverageHash(source), await computeAverageHash(degradee)),
      ).toBe(true);
    });

    it('distingue deux photos différentes', async () => {
      const autre = await sharp({
        create: { width: 900, height: 1200, channels: 3, background: { r: 5, g: 5, b: 5 } },
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: 450,
                height: 600,
                channels: 3,
                background: { r: 250, g: 250, b: 250 },
              },
            })
              .png()
              .toBuffer(),
            top: 0,
            left: 0,
          },
        ])
        .jpeg()
        .toBuffer();

      expect(
        looksLikeSameImage(await computeAverageHash(source), await computeAverageHash(autre)),
      ).toBe(false);
    });
  });
});
