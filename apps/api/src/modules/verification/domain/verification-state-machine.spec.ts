import { describe, expect, it } from '@jest/globals';
import {
  canResubmit,
  grantsProductAccess,
  locksBirthDate,
  transition,
  type VerificationEvent,
  type VerificationStatusValue,
} from './verification-state-machine';

describe('machine à états de la vérification', () => {
  describe('transitions autorisées', () => {
    it.each<[VerificationStatusValue, VerificationEvent, VerificationStatusValue]>([
      ['NOT_STARTED', 'SUBMIT', 'PENDING'],
      ['PENDING', 'START_REVIEW', 'IN_REVIEW'],
      ['IN_REVIEW', 'APPROVE', 'VERIFIED'],
      ['IN_REVIEW', 'REJECT', 'REJECTED'],
      ['IN_REVIEW', 'REQUEST_ADDITIONAL', 'ADDITIONAL_REQUIRED'],
      ['ADDITIONAL_REQUIRED', 'RESUBMIT', 'PENDING'],
      ['REJECTED', 'RESUBMIT', 'PENDING'],
      ['VERIFIED', 'SUSPEND', 'SUSPENDED'],
      ['SUSPENDED', 'RESUBMIT', 'PENDING'],
    ])('%s + %s → %s', (depart, evenement, arrivee) => {
      expect(transition(depart, evenement)).toEqual({ allowed: true, next: arrivee });
    });
  });

  describe('transitions interdites — la garantie du badge', () => {
    it('interdit de passer de REJECTED à VERIFIED sans nouvelle demande', () => {
      expect(transition('REJECTED', 'APPROVE')).toEqual({
        allowed: false,
        reason: 'FORBIDDEN_TRANSITION',
      });
    });

    it('interdit d’accorder le badge sans revue préalable', () => {
      expect(transition('PENDING', 'APPROVE').allowed).toBe(false);
      expect(transition('NOT_STARTED', 'APPROVE').allowed).toBe(false);
    });

    it('interdit de re-soumettre une demande déjà en cours de revue', () => {
      expect(transition('IN_REVIEW', 'RESUBMIT').allowed).toBe(false);
      expect(transition('PENDING', 'RESUBMIT').allowed).toBe(false);
    });

    it('interdit de suspendre un compte qui n’a jamais été vérifié', () => {
      expect(transition('NOT_STARTED', 'SUSPEND').allowed).toBe(false);
      expect(transition('REJECTED', 'SUSPEND').allowed).toBe(false);
    });

    it('interdit de soumettre deux fois depuis NOT_STARTED', () => {
      const premiere = transition('NOT_STARTED', 'SUBMIT');
      expect(premiere.allowed).toBe(true);
      expect(transition('PENDING', 'SUBMIT').allowed).toBe(false);
    });
  });

  describe('accès au produit', () => {
    it('n’est ouvert que par le statut VERIFIED', () => {
      expect(grantsProductAccess('VERIFIED')).toBe(true);
    });

    it.each<[VerificationStatusValue]>([
      ['NOT_STARTED'],
      ['PENDING'],
      ['IN_REVIEW'],
      ['REJECTED'],
      ['ADDITIONAL_REQUIRED'],
      ['SUSPENDED'],
    ])('reste fermé au statut %s', (statut) => {
      expect(grantsProductAccess(statut)).toBe(false);
    });
  });

  describe('verrouillage de la date de naissance', () => {
    it('se déclenche à l’approbation', () => {
      expect(locksBirthDate('APPROVE')).toBe(true);
    });

    it('ne se déclenche sur aucun autre événement', () => {
      for (const evenement of [
        'SUBMIT',
        'START_REVIEW',
        'REJECT',
        'REQUEST_ADDITIONAL',
        'SUSPEND',
        'RESUBMIT',
      ] as VerificationEvent[]) {
        expect(locksBirthDate(evenement)).toBe(false);
      }
    });
  });

  describe('délai avant re-soumission après rejet', () => {
    const decision = new Date('2026-08-06T12:00:00.000Z');

    it('refuse une re-soumission immédiate', () => {
      const maintenant = new Date('2026-08-06T13:00:00.000Z');
      expect(canResubmit('REJECTED', decision, maintenant, 24)).toBe(false);
    });

    it('autorise après le délai configuré', () => {
      const maintenant = new Date('2026-08-07T12:00:00.000Z');
      expect(canResubmit('REJECTED', decision, maintenant, 24)).toBe(true);
    });

    it('n’impose aucun délai après une demande de complément', () => {
      const maintenant = new Date('2026-08-06T12:01:00.000Z');
      expect(canResubmit('ADDITIONAL_REQUIRED', decision, maintenant, 24)).toBe(true);
    });

    it('refuse toute re-soumission depuis un statut qui ne l’autorise pas', () => {
      expect(canResubmit('VERIFIED', decision, new Date('2027-01-01T00:00:00.000Z'), 24)).toBe(
        false,
      );
    });
  });
});
