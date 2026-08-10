import { describe, expect, it } from '@jest/globals';
import { remainingAttempts, verifyOtpChallenge, type OtpChallengeState } from './otp-challenge';

const MAINTENANT = new Date('2026-08-06T12:00:00.000Z');

const defi = (surcharge: Partial<OtpChallengeState> = {}): OtpChallengeState => ({
  codeHash: 'empreinte-du-bon-code',
  attemptCount: 0,
  maxAttempts: 5,
  expiresAt: new Date('2026-08-06T12:05:00.000Z'),
  consumedAt: null,
  ...surcharge,
});

describe('vérification du défi OTP', () => {
  it('accepte le bon code avant expiration', () => {
    expect(verifyOtpChallenge(defi(), 'empreinte-du-bon-code', MAINTENANT)).toEqual({
      valid: true,
    });
  });

  it('refuse un code incorrect', () => {
    expect(verifyOtpChallenge(defi(), 'autre-empreinte', MAINTENANT)).toEqual({
      valid: false,
      reason: 'MISMATCH',
    });
  });

  it('refuse un défi déjà consommé, même avec le bon code', () => {
    const consomme = defi({ consumedAt: new Date('2026-08-06T11:59:00.000Z') });
    expect(verifyOtpChallenge(consomme, 'empreinte-du-bon-code', MAINTENANT)).toEqual({
      valid: false,
      reason: 'CONSUMED',
    });
  });

  it('refuse un défi expiré', () => {
    const expire = defi({ expiresAt: new Date('2026-08-06T11:59:59.000Z') });
    expect(verifyOtpChallenge(expire, 'empreinte-du-bon-code', MAINTENANT)).toEqual({
      valid: false,
      reason: 'EXPIRED',
    });
  });

  it('considère la seconde exacte d’expiration comme expirée', () => {
    const limite = defi({ expiresAt: MAINTENANT });
    expect(verifyOtpChallenge(limite, 'empreinte-du-bon-code', MAINTENANT)).toMatchObject({
      reason: 'EXPIRED',
    });
  });

  it('refuse au-delà du nombre maximal d’essais', () => {
    const epuise = defi({ attemptCount: 5 });
    expect(verifyOtpChallenge(epuise, 'empreinte-du-bon-code', MAINTENANT)).toEqual({
      valid: false,
      reason: 'MAX_ATTEMPTS',
    });
  });

  it('vérifie la consommation avant l’expiration', () => {
    // Un défi à la fois consommé et expiré est signalé comme consommé : c'est
    // l'information utile pour diagnostiquer un rejeu.
    const deux = defi({
      consumedAt: new Date('2026-08-06T11:00:00.000Z'),
      expiresAt: new Date('2026-08-06T11:30:00.000Z'),
    });
    expect(verifyOtpChallenge(deux, 'empreinte-du-bon-code', MAINTENANT)).toMatchObject({
      reason: 'CONSUMED',
    });
  });
});

describe('essais restants', () => {
  it('décompte les essais consommés', () => {
    expect(remainingAttempts(defi({ attemptCount: 2 }))).toBe(3);
  });

  it('ne descend jamais sous zéro', () => {
    expect(remainingAttempts(defi({ attemptCount: 9 }))).toBe(0);
  });
});
