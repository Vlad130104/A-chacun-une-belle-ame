import { describe, expect, it } from '@jest/globals';
import {
  classifyFailure,
  decideRetry,
  DEFAULT_RETRY,
  isRetryable,
  nextDelayMs,
} from './retry-policy';

describe('classification des échecs', () => {
  it.each([
    ['Device not registered'],
    ['invalid token'],
    ['Recipient unregistered'],
    ['Mailbox not found'],
    ['invalid number for this operator'],
  ])('classe « %s » comme permanent', (message) => {
    // Insister sur un jeton révoqué consomme la file et retarde les envois
    // légitimes.
    expect(classifyFailure(new Error(message))).toBe('PERMANENT');
  });

  it.each([['Rate limit exceeded'], ['429 Too Many Requests']])(
    'classe « %s » comme limitation de débit',
    (message) => {
      expect(classifyFailure(new Error(message))).toBe('RATE_LIMITED');
    },
  );

  it.each([['socket hang up'], ['ETIMEDOUT'], ['503 Service Unavailable']])(
    'classe « %s » comme transitoire',
    (message) => {
      expect(classifyFailure(new Error(message))).toBe('TRANSIENT');
    },
  );

  it('retombe sur transitoire face à une erreur inconnue', () => {
    // En cas de doute, mieux vaut réessayer une notification que la perdre :
    // le plafond de tentatives borne le coût de cette prudence.
    expect(classifyFailure(new Error('quelque chose d’inattendu'))).toBe('TRANSIENT');
    expect(classifyFailure('pas une erreur')).toBe('TRANSIENT');
  });

  it('ne réessaie que ce qui peut aboutir', () => {
    expect(isRetryable('PERMANENT')).toBe(false);
    expect(isRetryable('TRANSIENT')).toBe(true);
    expect(isRetryable('RATE_LIMITED')).toBe(true);
  });
});

describe('délai avant nouvelle tentative', () => {
  it('croît de façon exponentielle et déterministe', () => {
    // Aucun aléa : le calcul reste testable exactement.
    expect(nextDelayMs(1, 'TRANSIENT', DEFAULT_RETRY)).toBe(30_000);
    expect(nextDelayMs(2, 'TRANSIENT', DEFAULT_RETRY)).toBe(60_000);
    expect(nextDelayMs(3, 'TRANSIENT', DEFAULT_RETRY)).toBe(120_000);
    expect(nextDelayMs(4, 'TRANSIENT', DEFAULT_RETRY)).toBe(240_000);
  });

  it('attend deux fois plus après une limitation de débit', () => {
    // Quand un fournisseur nous dit d'attendre, le minimum est de ne pas
    // revenir aussitôt.
    expect(nextDelayMs(1, 'RATE_LIMITED', DEFAULT_RETRY)).toBe(60_000);
  });

  it('plafonne le délai', () => {
    expect(nextDelayMs(20, 'TRANSIENT', DEFAULT_RETRY)).toBe(DEFAULT_RETRY.maxDelayMs);
  });

  it('reste stable au premier essai', () => {
    expect(nextDelayMs(0, 'TRANSIENT', DEFAULT_RETRY)).toBe(30_000);
  });
});

describe('décision de réessai', () => {
  it('réessaie un échec transitoire', () => {
    expect(decideRetry(1, 'TRANSIENT', DEFAULT_RETRY)).toEqual({
      action: 'RETRY',
      delayMs: 30_000,
      attempt: 2,
    });
  });

  it('abandonne immédiatement un échec permanent', () => {
    expect(decideRetry(1, 'PERMANENT', DEFAULT_RETRY)).toEqual({
      action: 'GIVE_UP',
      reason: 'PERMANENT',
    });
  });

  it('abandonne au plafond de tentatives', () => {
    expect(decideRetry(5, 'TRANSIENT', DEFAULT_RETRY)).toEqual({
      action: 'GIVE_UP',
      reason: 'MAX_ATTEMPTS',
    });
  });

  it('accepte la dernière tentative avant le plafond', () => {
    expect(decideRetry(4, 'TRANSIENT', DEFAULT_RETRY)).toMatchObject({ action: 'RETRY' });
  });

  it('fait primer le caractère permanent sur le compteur', () => {
    // Inutile d'épuiser cinq tentatives sur un jeton révoqué.
    const decision = decideRetry(1, 'PERMANENT', DEFAULT_RETRY);
    expect(decision).toMatchObject({ action: 'GIVE_UP', reason: 'PERMANENT' });
  });
});
