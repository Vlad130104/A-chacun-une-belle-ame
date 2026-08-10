import { describe, expect, it } from '@jest/globals';
import { decideRegistration } from './registration-policy';

const MAINTENANT = new Date('2026-08-06T12:00:00.000Z');

const decider = (
  birthDate: string,
  options: Partial<{ identityBlocked: boolean; minimumAge: number }> = {},
) =>
  decideRegistration({
    birthDate: new Date(`${birthDate}T00:00:00.000Z`),
    now: MAINTENANT,
    minimumAge: options.minimumAge ?? 18,
    identityBlocked: options.identityBlocked ?? false,
  });

describe("éligibilité à l'inscription", () => {
  describe('contrôle de majorité — règle non négociable', () => {
    it('refuse une personne mineure', () => {
      expect(decider('2010-01-01')).toEqual({
        eligible: false,
        reason: 'UNDERAGE',
        age: 16,
      });
    });

    it('refuse la veille des 18 ans', () => {
      expect(decider('2008-08-07')).toMatchObject({ eligible: false, reason: 'UNDERAGE' });
    });

    it('accepte le jour exact des 18 ans', () => {
      expect(decider('2008-08-06')).toEqual({ eligible: true, age: 18 });
    });

    it('accepte une personne largement majeure', () => {
      expect(decider('1985-06-12')).toEqual({ eligible: true, age: 41 });
    });

    it('respecte un âge minimum relevé par configuration', () => {
      expect(decider('2007-01-01', { minimumAge: 21 })).toMatchObject({
        eligible: false,
        reason: 'UNDERAGE',
      });
    });
  });

  describe('plausibilité de la date', () => {
    it('refuse une date future', () => {
      expect(decider('2030-01-01')).toEqual({
        eligible: false,
        reason: 'IMPLAUSIBLE_BIRTHDATE',
      });
    });

    it('refuse une date antérieure à 1900', () => {
      expect(decider('1899-12-31')).toEqual({
        eligible: false,
        reason: 'IMPLAUSIBLE_BIRTHDATE',
      });
    });
  });

  describe('liste noire des identités', () => {
    it('refuse une identité bloquée, même majeure', () => {
      expect(decider('1990-01-01', { identityBlocked: true })).toEqual({
        eligible: false,
        reason: 'BLOCKED_IDENTITY',
      });
    });

    it('donne priorité au motif de minorité sur la liste noire', () => {
      // Un mineur doit être refusé et enregistré comme mineur, pas comme « déjà bloqué » :
      // le motif conditionne le caractère définitif du refus.
      expect(decider('2015-01-01', { identityBlocked: true })).toMatchObject({
        reason: 'UNDERAGE',
      });
    });
  });
});
