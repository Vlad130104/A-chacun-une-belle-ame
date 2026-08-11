import { describe, expect, it } from '@jest/globals';
import { decodeBase32, enrollmentUri, hotp, totpAt, verifyTotp } from './totp';

/**
 * Vecteurs de test de la RFC 4226 (HOTP), annexe D.
 *
 * Secret « 12345678901234567890 », qui s'écrit `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`
 * en base32. Ces valeurs sont normatives : si l'implémentation les reproduit,
 * elle est juste — et un code produit ici sera accepté par n'importe quelle
 * application d'authentification.
 */
const SECRET_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('décodage base32', () => {
  it('décode le secret de référence de la RFC', () => {
    expect(decodeBase32(SECRET_RFC).toString('utf8')).toBe('12345678901234567890');
  });

  it('ignore le remplissage et les espaces', () => {
    expect(decodeBase32('GEZDGNBV GY3TQOJQ==').toString('utf8')).toBe('1234567890');
  });

  it('refuse un caractère hors alphabet', () => {
    expect(() => decodeBase32('GEZD1NBV')).toThrow(/invalide/);
  });
});

describe('HOTP — vecteurs normatifs RFC 4226', () => {
  it.each([
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [3, '969429'],
    [4, '338314'],
    [5, '254676'],
    [6, '287922'],
    [7, '162583'],
    [8, '399871'],
    [9, '520489'],
  ])('produit pour le compteur %i le code %s', (compteur, attendu) => {
    expect(hotp(decodeBase32(SECRET_RFC), compteur, 6)).toBe(attendu);
  });
});

describe('TOTP', () => {
  it('produit le même code pendant tout un pas de trente secondes', () => {
    const debut = new Date('2026-03-15T12:00:00.000Z');
    const fin = new Date('2026-03-15T12:00:29.000Z');
    expect(totpAt(SECRET_RFC, debut)).toBe(totpAt(SECRET_RFC, fin));
  });

  it('change de code au pas suivant', () => {
    const avant = new Date('2026-03-15T12:00:29.000Z');
    const apres = new Date('2026-03-15T12:00:30.000Z');
    expect(totpAt(SECRET_RFC, avant)).not.toBe(totpAt(SECRET_RFC, apres));
  });

  it('accepte le code courant', () => {
    const instant = new Date('2026-03-15T12:00:00.000Z');
    expect(verifyTotp(SECRET_RFC, totpAt(SECRET_RFC, instant), instant)).toBe(true);
  });

  it('tolère une horloge décalée d’un pas', () => {
    // Un téléphone mal synchronisé est le cas courant, pas l'exception.
    const instant = new Date('2026-03-15T12:00:00.000Z');
    const precedent = totpAt(SECRET_RFC, new Date(instant.getTime() - 30_000));
    const suivant = totpAt(SECRET_RFC, new Date(instant.getTime() + 30_000));

    expect(verifyTotp(SECRET_RFC, precedent, instant)).toBe(true);
    expect(verifyTotp(SECRET_RFC, suivant, instant)).toBe(true);
  });

  it('REFUSE un code trop ancien', () => {
    // Au-delà de la fenêtre, la durée de validité d'un code s'allonge et la
    // protection contre le rejeu s'affaiblit.
    const instant = new Date('2026-03-15T12:00:00.000Z');
    const vieux = totpAt(SECRET_RFC, new Date(instant.getTime() - 120_000));
    expect(verifyTotp(SECRET_RFC, vieux, instant)).toBe(false);
  });

  it.each([['12345'], ['1234567'], ['abcdef'], [''], ['12 45 6']])(
    'refuse le code mal formé « %s »',
    (code) => {
      expect(verifyTotp(SECRET_RFC, code, new Date('2026-03-15T12:00:00.000Z'))).toBe(false);
    },
  );

  it('refuse un code correct pour un AUTRE secret', () => {
    const instant = new Date('2026-03-15T12:00:00.000Z');
    const autreSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    expect(verifyTotp(SECRET_RFC, totpAt(autreSecret, instant), instant)).toBe(false);
  });

  it('accepte les espaces autour du code saisi', () => {
    const instant = new Date('2026-03-15T12:00:00.000Z');
    expect(verifyTotp(SECRET_RFC, ` ${totpAt(SECRET_RFC, instant)} `, instant)).toBe(true);
  });
});

describe('URI d’enrôlement', () => {
  it('compose une URI exploitable par une application d’authentification', () => {
    const uri = enrollmentUri(SECRET_RFC, 'admin@acuba.test', 'À Chacun Une Belle Âme');

    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain(`secret=${SECRET_RFC}`);
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('répète l’émetteur dans le libellé et le paramètre', () => {
    // Les deux formes cohabitent selon les applications ; omettre l'une affiche
    // un compte anonyme dans la liste de l'utilisateur.
    const uri = enrollmentUri(SECRET_RFC, 'admin', 'ACUBA');
    expect(uri).toContain('ACUBA%3Aadmin');
    expect(uri).toContain('issuer=ACUBA');
  });
});
