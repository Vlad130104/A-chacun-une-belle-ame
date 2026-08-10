import { describe, expect, it } from '@jest/globals';
import {
  checkAccountAccess,
  requiresFamilyRevocation,
  verifySession,
  type AccountStatusValue,
  type SessionState,
} from './session-policy';

const MAINTENANT = new Date('2026-08-06T12:00:00.000Z');

const session = (surcharge: Partial<SessionState> = {}): SessionState => ({
  familyId: 'famille-1',
  expiresAt: new Date('2026-09-05T12:00:00.000Z'),
  revokedAt: null,
  rotatedAt: null,
  ...surcharge,
});

describe('validation de session', () => {
  it('accepte une session vivante et jamais utilisée', () => {
    expect(verifySession(session(), MAINTENANT)).toEqual({ valid: true });
  });

  it('refuse une session expirée', () => {
    const expiree = session({ expiresAt: new Date('2026-08-06T11:59:59.000Z') });
    expect(verifySession(expiree, MAINTENANT)).toEqual({ valid: false, reason: 'EXPIRED' });
  });

  it('refuse une session révoquée', () => {
    const revoquee = session({ revokedAt: new Date('2026-08-05T00:00:00.000Z') });
    expect(verifySession(revoquee, MAINTENANT)).toEqual({ valid: false, reason: 'REVOKED' });
  });

  describe('détection de vol par réutilisation', () => {
    it('refuse un token déjà utilisé pour une rotation', () => {
      const rejoue = session({ rotatedAt: new Date('2026-08-06T11:00:00.000Z') });
      expect(verifySession(rejoue, MAINTENANT)).toEqual({ valid: false, reason: 'REUSED' });
    });

    it('signale la réutilisation avant la révocation', () => {
      // Une famille déjà révoquée dont un ancien token resurgit reste une réutilisation :
      // c'est ce motif qui doit remonter dans l'audit et la notification de sécurité.
      const deux = session({
        rotatedAt: new Date('2026-08-06T10:00:00.000Z'),
        revokedAt: new Date('2026-08-06T10:30:00.000Z'),
      });
      expect(verifySession(deux, MAINTENANT)).toMatchObject({ reason: 'REUSED' });
    });

    it('exige la révocation de toute la famille', () => {
      const rejoue = session({ rotatedAt: new Date('2026-08-06T11:00:00.000Z') });
      expect(requiresFamilyRevocation(verifySession(rejoue, MAINTENANT))).toBe(true);
    });

    it('n’exige pas de révocation de famille pour une simple expiration', () => {
      const expiree = session({ expiresAt: new Date('2026-08-01T00:00:00.000Z') });
      expect(requiresFamilyRevocation(verifySession(expiree, MAINTENANT))).toBe(false);
    });
  });
});

describe('accès selon le statut du compte', () => {
  it.each<[AccountStatusValue]>([['ACTIVE'], ['PAUSED'], ['RESTRICTED'], ['PENDING_DELETION']])(
    'autorise la connexion pour un compte %s',
    (statut) => {
      expect(checkAccountAccess(statut)).toEqual({ allowed: true });
    },
  );

  it.each<[AccountStatusValue, string]>([
    ['SUSPENDED', 'SUSPENDED'],
    ['BANNED', 'BANNED'],
    ['BLOCKED_UNDERAGE', 'UNDERAGE'],
    ['DELETED', 'DELETED'],
    ['PENDING_OTP', 'PENDING_OTP'],
  ])('refuse la connexion pour un compte %s', (statut, motif) => {
    expect(checkAccountAccess(statut)).toEqual({ allowed: false, reason: motif });
  });
});
