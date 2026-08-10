import { beforeEach, describe, expect, it } from '@jest/globals';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import { FakeClock } from '../../auth/application/test-doubles';
import {
  BlockUserUseCase,
  DEFAULT_DISCOVERY_CONFIG,
  GetSuggestionsUseCase,
  ListInterestsUseCase,
  RevokeLikeUseCase,
  SendLikeUseCase,
  UnmatchUseCase,
} from './discovery.use-cases';
import {
  InMemoryConversationGateway,
  InMemoryDiscoveryRepository,
  InMemoryMatchingRepository,
  InMemoryQuotaCounter,
  makeCandidate,
  makeSeeker,
} from './test-doubles';

const attendreCode = async (promesse: Promise<unknown>): Promise<string> => {
  try {
    await promesse;
    throw new Error('une erreur métier était attendue');
  } catch (error) {
    if (error instanceof BusinessError) return error.code;
    throw error;
  }
};

describe('découverte et matching', () => {
  let discovery: InMemoryDiscoveryRepository;
  let matching: InMemoryMatchingRepository;
  let conversations: InMemoryConversationGateway;
  let quotas: InMemoryQuotaCounter;
  let clock: FakeClock;

  let suggestions: GetSuggestionsUseCase;
  let envoyerInteret: SendLikeUseCase;
  let retirerInteret: RevokeLikeUseCase;
  let listerInterets: ListInterestsUseCase;
  let annulerMatch: UnmatchUseCase;
  let bloquer: BlockUserUseCase;

  beforeEach(() => {
    discovery = new InMemoryDiscoveryRepository();
    matching = new InMemoryMatchingRepository();
    conversations = new InMemoryConversationGateway();
    quotas = new InMemoryQuotaCounter();
    clock = new FakeClock();

    discovery.seekers.set('user-1', makeSeeker('user-1'));
    discovery.seekers.set(
      'user-2',
      makeSeeker('user-2', { gender: 'MALE', seekingGender: 'FEMALE' }),
    );

    suggestions = new GetSuggestionsUseCase(discovery, quotas, clock, DEFAULT_DISCOVERY_CONFIG);
    envoyerInteret = new SendLikeUseCase(
      discovery,
      matching,
      conversations,
      quotas,
      clock,
      DEFAULT_DISCOVERY_CONFIG,
    );
    retirerInteret = new RevokeLikeUseCase(matching, clock);
    listerInterets = new ListInterestsUseCase(matching);
    annulerMatch = new UnmatchUseCase(matching, conversations, clock);
    bloquer = new BlockUserUseCase(matching, conversations, clock);
  });

  describe('suggestions du jour', () => {
    it('renvoie les candidats éligibles, triés par score décroissant', async () => {
      discovery.candidates = [
        makeCandidate('proche', { scoring: { cityId: 'douala' } as never }),
        makeCandidate('lointain', {
          cityId: 'cotonou',
          countryCode: 'BJ',
          scoring: { cityId: 'cotonou', regionCode: 'ouemé', countryCode: 'BJ' } as never,
        }),
      ];

      const resultat = await suggestions.execute('user-1');

      expect(resultat.items).toHaveLength(2);
      expect(resultat.items[0]?.userId).toBe('proche');
    });

    it('exclut tout candidat non éligible', async () => {
      discovery.candidates = [
        makeCandidate('non-verifie', { verificationStatus: 'PENDING' }),
        makeCandidate('suspendu', { accountStatus: 'SUSPENDED' }),
        makeCandidate('sans-photo', { hasApprovedPhoto: false }),
        makeCandidate('incomplet', { completionRate: 30 }),
        makeCandidate('valide'),
      ];

      const resultat = await suggestions.execute('user-1');

      expect(resultat.items.map((item) => item.userId)).toEqual(['valide']);
    });

    it('exclut les profils déjà vus, décidés, en match ou bloqués', async () => {
      discovery.candidates = [
        makeCandidate('vu'),
        makeCandidate('decide'),
        makeCandidate('matche'),
        makeCandidate('bloque'),
        makeCandidate('nouveau'),
      ];
      discovery.exclusions = {
        seenUserIds: ['vu'],
        decidedUserIds: ['decide'],
        matchedUserIds: ['matche'],
        blockedUserIds: ['bloque'],
      };

      const resultat = await suggestions.execute('user-1');
      expect(resultat.items.map((item) => item.userId)).toEqual(['nouveau']);
    });

    it('trace chaque suggestion servie avec son score, pour audit ultérieur', async () => {
      discovery.candidates = [makeCandidate('candidat')];
      await suggestions.execute('user-1');

      expect(discovery.views).toHaveLength(1);
      expect(discovery.views[0]?.score).toBeGreaterThan(0);
    });

    it('respecte le quota gratuit', async () => {
      discovery.candidates = Array.from({ length: 30 }, (_, index) =>
        makeCandidate(`candidat-${index}`),
      );

      const resultat = await suggestions.execute('user-1');
      expect(resultat.items.length).toBeLessThanOrEqual(10);
    });

    it('accorde un quota élargi à un membre Premium', async () => {
      discovery.seekers.set('premium', makeSeeker('premium', { isPremium: true }));
      discovery.candidates = Array.from({ length: 40 }, (_, index) =>
        makeCandidate(`candidat-${index}`),
      );

      const resultat = await suggestions.execute('premium');
      expect(resultat.items.length).toBeGreaterThan(10);
    });

    it('refuse une fois le quota épuisé', async () => {
      quotas.setConsumed('suggestions:user-1', 10);
      discovery.candidates = [makeCandidate('candidat')];

      const code = await attendreCode(suggestions.execute('user-1'));
      expect(code).toBe(ErrorCode.DISCOVERY_QUOTA_EXCEEDED);
    });

    it('ne consomme pas de quota pour une liste vide', async () => {
      discovery.candidates = [];
      const resultat = await suggestions.execute('user-1');

      // Entamer un quota pour ne rien renvoyer serait doublement pénalisant.
      expect(resultat.items).toHaveLength(0);
      expect(quotas.consumed.get('suggestions:user-1')).toBeUndefined();
    });
  });

  describe('intérêt et refus', () => {
    it('enregistre un intérêt sans créer de match unilatéral', async () => {
      const resultat = await envoyerInteret.execute('user-1', 'user-2', 'INTEREST');

      expect(resultat.matched).toBe(false);
      expect(matching.matches).toHaveLength(0);
    });

    it('refuse un second avis sur le même profil', async () => {
      await envoyerInteret.execute('user-1', 'user-2', 'PASS');
      const code = await attendreCode(envoyerInteret.execute('user-1', 'user-2', 'INTEREST'));
      expect(code).toBe(ErrorCode.MATCH_ALREADY_DECIDED);
    });

    it('refuse un intérêt envers soi-même', async () => {
      const code = await attendreCode(envoyerInteret.execute('user-1', 'user-1', 'INTEREST'));
      expect(code).toBe(ErrorCode.MATCH_SELF);
    });

    it('masque un blocage derrière un profil indisponible', async () => {
      await bloquer.execute('user-2', 'user-1', null);
      const code = await attendreCode(envoyerInteret.execute('user-1', 'user-2', 'INTEREST'));
      // Révéler le blocage renseignerait la personne bloquée.
      expect(code).toBe(ErrorCode.MATCH_BLOCKED);
    });

    it('n’impute pas de quota à un refus', async () => {
      await envoyerInteret.execute('user-1', 'user-2', 'PASS');
      // Faire payer un refus pousserait à accepter par économie.
      expect(quotas.consumed.get('likes:user-1')).toBeUndefined();
    });

    it('refuse un intérêt une fois le quota quotidien atteint', async () => {
      quotas.setConsumed('likes:user-1', 10);
      const code = await attendreCode(envoyerInteret.execute('user-1', 'user-2', 'INTEREST'));
      expect(code).toBe(ErrorCode.DISCOVERY_QUOTA_EXCEEDED);
    });
  });

  describe('création du match', () => {
    const rendreReciproque = async () => {
      await envoyerInteret.execute('user-2', 'user-1', 'INTEREST');
      return envoyerInteret.execute('user-1', 'user-2', 'INTEREST');
    };

    it('crée le match sur réciprocité', async () => {
      const resultat = await rendreReciproque();
      expect(resultat.matched).toBe(true);
      expect(resultat.match?.status).toBe('ACTIVE');
    });

    it('crée systématiquement la conversation associée', async () => {
      const resultat = await rendreReciproque();
      // Il ne peut exister ni match sans conversation, ni conversation sans match.
      expect(conversations.created).toHaveLength(1);
      expect(conversations.created[0]?.matchId).toBe(resultat.match?.id);
    });

    it('range les membres dans un ordre stable, indépendant de qui a agi en premier', async () => {
      const resultat = await rendreReciproque();
      expect(resultat.match?.userAId).toBe('user-1');
      expect(resultat.match?.userBId).toBe('user-2');
    });

    it('ne crée pas de match sur un refus réciproque', async () => {
      await envoyerInteret.execute('user-2', 'user-1', 'PASS');
      const resultat = await envoyerInteret.execute('user-1', 'user-2', 'PASS');
      expect(resultat.matched).toBe(false);
    });

    it('ne crée pas de match si l’un a refusé et l’autre accepté', async () => {
      await envoyerInteret.execute('user-2', 'user-1', 'PASS');
      const resultat = await envoyerInteret.execute('user-1', 'user-2', 'INTEREST');
      expect(resultat.matched).toBe(false);
      expect(conversations.created).toHaveLength(0);
    });
  });

  describe('retrait d’un intérêt', () => {
    it('retire un intérêt non encore réciproque', async () => {
      await envoyerInteret.execute('user-1', 'user-2', 'INTEREST');
      await retirerInteret.execute('user-1', 'user-2');
      expect(matching.likes).toHaveLength(0);
    });

    it('refuse de retirer discrètement un intérêt déjà transformé en match', async () => {
      await envoyerInteret.execute('user-2', 'user-1', 'INTEREST');
      await envoyerInteret.execute('user-1', 'user-2', 'INTEREST');

      const code = await attendreCode(retirerInteret.execute('user-1', 'user-2'));
      expect(code).toBe(ErrorCode.MATCH_ALREADY_DECIDED);
    });
  });

  describe('intérêts reçus', () => {
    it('floute l’identité en offre gratuite, en omettant la donnée', async () => {
      await envoyerInteret.execute('user-2', 'user-1', 'INTEREST');
      const recus = await listerInterets.received('user-1', 20, false);

      // Le floutage est une omission de données, pas un filtre CSS contournable.
      expect(recus.items[0]).toMatchObject({ blurred: true });
      expect(JSON.stringify(recus.items)).not.toContain('user-2');
      expect(recus.totalCount).toBe(1);
    });

    it('révèle l’identité en offre Premium', async () => {
      await envoyerInteret.execute('user-2', 'user-1', 'INTEREST');
      const recus = await listerInterets.received('user-1', 20, true);

      expect(recus.items[0]).toMatchObject({ blurred: false, senderId: 'user-2' });
    });
  });

  describe('annulation du match', () => {
    it('ferme le match et verrouille la conversation', async () => {
      await envoyerInteret.execute('user-2', 'user-1', 'INTEREST');
      const resultat = await envoyerInteret.execute('user-1', 'user-2', 'INTEREST');

      await annulerMatch.execute('user-1', resultat.match!.id, 'plus intéressée');

      expect(matching.matches[0]?.status).toBe('UNMATCHED');
      expect(conversations.lockedByUnmatch).toContain(resultat.match!.id);
    });

    it('refuse l’annulation d’un match qui n’est pas le sien', async () => {
      await envoyerInteret.execute('user-2', 'user-1', 'INTEREST');
      const resultat = await envoyerInteret.execute('user-1', 'user-2', 'INTEREST');

      const code = await attendreCode(annulerMatch.execute('user-3', resultat.match!.id, 'x'));
      expect(code).toBe(ErrorCode.NOT_FOUND);
    });
  });

  describe('blocage', () => {
    it('verrouille immédiatement la conversation éventuelle', async () => {
      await bloquer.execute('user-1', 'user-2', 'comportement déplacé');
      expect(conversations.lockedByBlock).toContainEqual(['user-1', 'user-2']);
    });

    it('n’exige aucun motif', async () => {
      await bloquer.execute('user-1', 'user-2', null);
      expect(matching.blocks).toHaveLength(1);
    });

    it('refuse de se bloquer soi-même', async () => {
      const code = await attendreCode(bloquer.execute('user-1', 'user-1', null));
      expect(code).toBe(ErrorCode.MATCH_SELF);
    });
  });
});
