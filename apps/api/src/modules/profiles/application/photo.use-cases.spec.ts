import { beforeEach, describe, expect, it } from '@jest/globals';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import { FakeClock } from '../../auth/application/test-doubles';
import {
  DeletePhotoUseCase,
  ListModerationQueueUseCase,
  ListOwnPhotosUseCase,
  ModeratePhotoUseCase,
  ReorderPhotosUseCase,
  SetPrimaryPhotoUseCase,
  UploadPhotoUseCase,
  type PhotoConfig,
} from './photo.use-cases';
import {
  FakeMediaPipeline,
  InMemoryMediaStorage,
  InMemoryPhotoRepository,
  InMemoryProfileRepository,
} from './test-doubles';

const CONFIG: PhotoConfig = { maxPhotos: 6, signedUrlTtlSeconds: 300, softDeleteDays: 7 };

const jpeg = (variante = 0): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, variante)]);

const attendreCode = async (promesse: Promise<unknown>): Promise<string> => {
  try {
    await promesse;
    throw new Error('une erreur métier était attendue');
  } catch (error) {
    if (error instanceof BusinessError) return error.code;
    throw error;
  }
};

describe('photos de profil', () => {
  let photos: InMemoryPhotoRepository;
  let profiles: InMemoryProfileRepository;
  let storage: InMemoryMediaStorage;
  let clock: FakeClock;

  let envoyer: UploadPhotoUseCase;
  let lister: ListOwnPhotosUseCase;
  let supprimer: DeletePhotoUseCase;
  let reordonner: ReorderPhotosUseCase;
  let definirPrincipale: SetPrimaryPhotoUseCase;
  let moderer: ModeratePhotoUseCase;
  let file: ListModerationQueueUseCase;

  beforeEach(async () => {
    photos = new InMemoryPhotoRepository();
    profiles = new InMemoryProfileRepository();
    storage = new InMemoryMediaStorage();
    clock = new FakeClock();

    envoyer = new UploadPhotoUseCase(photos, storage, new FakeMediaPipeline(), CONFIG);
    lister = new ListOwnPhotosUseCase(photos, storage, CONFIG);
    supprimer = new DeletePhotoUseCase(photos, profiles, clock);
    reordonner = new ReorderPhotosUseCase(photos);
    definirPrincipale = new SetPrimaryPhotoUseCase(photos, profiles);
    moderer = new ModeratePhotoUseCase(photos, profiles, clock);
    file = new ListModerationQueueUseCase(photos, storage, CONFIG);

    await profiles.create('user-1', 'Aminata', 'ville-douala');
  });

  describe('envoi', () => {
    it('place la photo en modération, jamais directement publiée', async () => {
      const resultat = await envoyer.execute('user-1', jpeg(1));
      // Garantie centrale : aucune image non modérée n'est visible d'autrui.
      expect(resultat.photo.status).toBe('PENDING_MODERATION');
    });

    it('écrit l’image traitée et sa miniature', async () => {
      await envoyer.execute('user-1', jpeg(1));
      expect(storage.objects.size).toBe(2);
      expect([...storage.objects.keys()].some((key) => key.endsWith('-thumb.webp'))).toBe(true);
    });

    it('n’écrit rien lorsque le fichier n’est pas une image exploitable', async () => {
      const code = await attendreCode(envoyer.execute('user-1', Buffer.from('pas une image')));
      expect(code).toBe(ErrorCode.MEDIA_INVALID_TYPE);
      expect(storage.objects.size).toBe(0);
      expect(photos.photos).toHaveLength(0);
    });

    it('attribue les positions dans l’ordre', async () => {
      const premiere = await envoyer.execute('user-1', jpeg(1));
      const seconde = await envoyer.execute('user-1', jpeg(2));
      expect(premiere.photo.position).toBe(0);
      expect(seconde.photo.position).toBe(1);
    });

    it('refuse au-delà du maximum de photos', async () => {
      for (let index = 0; index < 6; index += 1) {
        await envoyer.execute('user-1', jpeg(index));
      }
      const code = await attendreCode(envoyer.execute('user-1', jpeg(99)));
      expect(code).toBe(ErrorCode.MEDIA_MAX_PHOTOS);
    });

    it('libère une place après suppression', async () => {
      for (let index = 0; index < 6; index += 1) {
        await envoyer.execute('user-1', jpeg(index));
      }
      await supprimer.execute('user-1', 'photo-3');
      const resultat = await envoyer.execute('user-1', jpeg(99));
      expect(resultat.photo.position).toBe(2);
    });

    it('signale la même image déjà présente sur un autre compte', async () => {
      await profiles.create('user-2', 'Jean', 'ville-douala');
      await envoyer.execute('user-2', jpeg(7));

      const resultat = await envoyer.execute('user-1', jpeg(7));
      // Signal de faux profil transmis à la modération, sans blocage automatique.
      expect(resultat.duplicateAcrossAccounts).toBe(true);
    });

    it('ne signale pas une image propre au membre', async () => {
      await envoyer.execute('user-1', jpeg(1));
      const resultat = await envoyer.execute('user-1', jpeg(2));
      expect(resultat.duplicateAcrossAccounts).toBe(false);
    });
  });

  describe('consultation', () => {
    it('renvoie des URL signées à durée limitée', async () => {
      await envoyer.execute('user-1', jpeg(1));
      const liste = await lister.execute('user-1');

      expect(liste[0]?.url).toContain('ttl=300');
      expect(liste[0]?.thumbnailUrl).toContain('ttl=300');
    });

    it('n’expose jamais le champ brut de clé de stockage', async () => {
      await envoyer.execute('user-1', jpeg(1));
      const liste = await lister.execute('user-1');

      // L'URL signée contient le chemin de l'objet — c'est normal et sans risque,
      // puisqu'elle expire. Ce qui ne doit jamais sortir, c'est la clé nue,
      // réutilisable sans signature.
      expect(Object.keys(liste[0] ?? {})).toEqual([
        'id',
        'position',
        'status',
        'url',
        'thumbnailUrl',
        'moderationReason',
      ]);
    });

    it('exclut les photos supprimées', async () => {
      await envoyer.execute('user-1', jpeg(1));
      await envoyer.execute('user-1', jpeg(2));
      await supprimer.execute('user-1', 'photo-1');

      expect(await lister.execute('user-1')).toHaveLength(1);
    });
  });

  describe('suppression', () => {
    it('renvoie 404 sur la photo d’autrui', async () => {
      await envoyer.execute('user-1', jpeg(1));
      const code = await attendreCode(supprimer.execute('user-2', 'photo-1'));
      expect(code).toBe(ErrorCode.NOT_FOUND);
    });

    it('remplace la photo principale supprimée par une autre approuvée', async () => {
      await envoyer.execute('user-1', jpeg(1));
      await envoyer.execute('user-1', jpeg(2));
      await moderer.execute({ photoId: 'photo-1', moderatorId: 'mod-1', decision: 'APPROVE' });
      await moderer.execute({ photoId: 'photo-2', moderatorId: 'mod-1', decision: 'APPROVE' });
      await definirPrincipale.execute('user-1', 'photo-1');

      await supprimer.execute('user-1', 'photo-1');

      expect(profiles.profiles.get('profile-1')?.primaryPhotoId).toBe('photo-2');
    });

    it('laisse le profil sans photo principale s’il n’en reste aucune', async () => {
      await envoyer.execute('user-1', jpeg(1));
      await moderer.execute({ photoId: 'photo-1', moderatorId: 'mod-1', decision: 'APPROVE' });
      await definirPrincipale.execute('user-1', 'photo-1');

      await supprimer.execute('user-1', 'photo-1');

      expect(profiles.profiles.get('profile-1')?.primaryPhotoId).toBeNull();
    });
  });

  describe('réordonnancement', () => {
    it('applique le nouvel ordre', async () => {
      await envoyer.execute('user-1', jpeg(1));
      await envoyer.execute('user-1', jpeg(2));
      await envoyer.execute('user-1', jpeg(3));

      await reordonner.execute('user-1', ['photo-3', 'photo-1', 'photo-2']);

      const parId = new Map(photos.photos.map((photo) => [photo.id, photo.position]));
      expect(parId.get('photo-3')).toBe(0);
      expect(parId.get('photo-1')).toBe(1);
    });

    it('refuse un ordre incomplet', async () => {
      await envoyer.execute('user-1', jpeg(1));
      await envoyer.execute('user-1', jpeg(2));

      const code = await attendreCode(reordonner.execute('user-1', ['photo-1']));
      expect(code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  describe('photo principale', () => {
    it('refuse une photo encore en modération', async () => {
      await envoyer.execute('user-1', jpeg(1));
      const code = await attendreCode(definirPrincipale.execute('user-1', 'photo-1'));
      expect(code).toBe(ErrorCode.MEDIA_NOT_APPROVED);
    });

    it('accepte une photo approuvée', async () => {
      await envoyer.execute('user-1', jpeg(1));
      await moderer.execute({ photoId: 'photo-1', moderatorId: 'mod-1', decision: 'APPROVE' });

      await definirPrincipale.execute('user-1', 'photo-1');
      expect(profiles.profiles.get('profile-1')?.primaryPhotoId).toBe('photo-1');
    });
  });

  describe('modération', () => {
    it('approuve une photo', async () => {
      await envoyer.execute('user-1', jpeg(1));
      const resultat = await moderer.execute({
        photoId: 'photo-1',
        moderatorId: 'mod-1',
        decision: 'APPROVE',
      });
      expect(resultat.status).toBe('APPROVED');
    });

    it('exige un motif communicable pour un refus', async () => {
      await envoyer.execute('user-1', jpeg(1));
      const code = await attendreCode(
        moderer.execute({ photoId: 'photo-1', moderatorId: 'mod-1', decision: 'REJECT' }),
      );
      expect(code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('conserve le motif de refus pour l’afficher au membre', async () => {
      await envoyer.execute('user-1', jpeg(1));
      await moderer.execute({
        photoId: 'photo-1',
        moderatorId: 'mod-1',
        decision: 'REJECT',
        reason: 'Le visage n’est pas visible.',
      });

      const liste = await lister.execute('user-1');
      expect(liste[0]?.moderationReason).toBe('Le visage n’est pas visible.');
    });

    it('retire une photo masquée du rôle de photo principale', async () => {
      await envoyer.execute('user-1', jpeg(1));
      await moderer.execute({ photoId: 'photo-1', moderatorId: 'mod-1', decision: 'APPROVE' });
      await definirPrincipale.execute('user-1', 'photo-1');

      await moderer.execute({
        photoId: 'photo-1',
        moderatorId: 'mod-1',
        decision: 'HIDE',
        reason: 'Contenu inapproprié',
      });

      expect(profiles.profiles.get('profile-1')?.primaryPhotoId).toBeNull();
    });

    it('alimente la file de modération par ancienneté', async () => {
      await envoyer.execute('user-1', jpeg(1));
      await envoyer.execute('user-1', jpeg(2));

      const enAttente = await file.execute(10);
      expect(enAttente).toHaveLength(2);
      expect(enAttente[0]?.status).toBe('PENDING_MODERATION');
    });

    it('retire de la file une photo déjà traitée', async () => {
      await envoyer.execute('user-1', jpeg(1));
      await moderer.execute({ photoId: 'photo-1', moderatorId: 'mod-1', decision: 'APPROVE' });

      expect(await file.execute(10)).toHaveLength(0);
    });
  });
});
