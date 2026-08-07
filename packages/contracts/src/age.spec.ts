import { describe, expect, it } from '@jest/globals';
import { calculateAge, isOfLegalAge, isPlausibleBirthDate } from './age';

const utc = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe('calcul d’âge', () => {
  it('retourne l’âge révolu après l’anniversaire', () => {
    expect(calculateAge(utc('2000-01-15'), utc('2026-08-06'))).toBe(26);
  });

  it('retourne l’âge non révolu avant l’anniversaire dans l’année', () => {
    expect(calculateAge(utc('2000-12-15'), utc('2026-08-06'))).toBe(25);
  });

  it('bascule le jour exact de l’anniversaire, pas la veille', () => {
    const birth = utc('2008-08-06');
    expect(calculateAge(birth, utc('2026-08-05'))).toBe(17);
    expect(calculateAge(birth, utc('2026-08-06'))).toBe(18);
  });

  it('gère le 29 février d’une année bissextile', () => {
    const birth = utc('2008-02-29');
    // 2026 n'est pas bissextile : la majorité est atteinte au 1er mars.
    expect(calculateAge(birth, utc('2026-02-28'))).toBe(17);
    expect(calculateAge(birth, utc('2026-03-01'))).toBe(18);
  });
});

describe('contrôle de majorité', () => {
  it('refuse une personne mineure la veille de ses 18 ans', () => {
    expect(isOfLegalAge(utc('2008-08-07'), utc('2026-08-06'))).toBe(false);
  });

  it('accepte une personne le jour de ses 18 ans', () => {
    expect(isOfLegalAge(utc('2008-08-06'), utc('2026-08-06'))).toBe(true);
  });

  it('respecte un âge minimum configuré différemment', () => {
    expect(isOfLegalAge(utc('2005-08-06'), utc('2026-08-06'), 21)).toBe(true);
    expect(isOfLegalAge(utc('2007-08-06'), utc('2026-08-06'), 21)).toBe(false);
  });

  it('calcule en UTC, sans dépendre du fuseau du client', () => {
    // 23 h à UTC-1 le 5 août = 6 août 00 h UTC : la bascule suit l'UTC.
    const birth = new Date('2008-08-06T00:00:00.000Z');
    expect(isOfLegalAge(birth, new Date('2026-08-05T23:59:59.000Z'))).toBe(false);
    expect(isOfLegalAge(birth, new Date('2026-08-06T00:00:00.000Z'))).toBe(true);
  });
});

describe('plausibilité de la date de naissance', () => {
  it('refuse une date future', () => {
    expect(isPlausibleBirthDate(utc('2027-01-01'), utc('2026-08-06'))).toBe(false);
  });

  it('refuse une date antérieure à 1900', () => {
    expect(isPlausibleBirthDate(utc('1899-12-31'), utc('2026-08-06'))).toBe(false);
  });

  it('refuse une date invalide', () => {
    expect(isPlausibleBirthDate(new Date('pas-une-date'), utc('2026-08-06'))).toBe(false);
  });

  it('accepte une date plausible', () => {
    expect(isPlausibleBirthDate(utc('1985-06-12'), utc('2026-08-06'))).toBe(true);
  });
});
