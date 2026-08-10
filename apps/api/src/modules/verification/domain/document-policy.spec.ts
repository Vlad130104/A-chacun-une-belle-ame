import { describe, expect, it } from '@jest/globals';
import {
  canSubmit,
  computePurgeDate,
  detectFormat,
  validateDocument,
  type DocumentTypeValue,
} from './document-policy';

const jpeg = (taille = 64): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(taille)]);
const png = (): Buffer =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const pdf = (): Buffer => Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(64)]);
const executable = (): Buffer =>
  Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(64)]);

describe('détection de format par signature binaire', () => {
  it.each([
    ['JPEG', jpeg(), 'jpeg'],
    ['PNG', png(), 'png'],
    ['PDF', pdf(), 'pdf'],
  ])('reconnaît un %s', (_nom, octets, attendu) => {
    expect(detectFormat(octets)).toBe(attendu);
  });

  it('ne reconnaît pas un exécutable', () => {
    expect(detectFormat(executable())).toBe('unknown');
  });

  it('ne reconnaît pas un fichier trop court pour porter une signature', () => {
    expect(detectFormat(Buffer.from([0xff, 0xd8]))).toBe('unknown');
  });
});

describe('validation d’une pièce déposée', () => {
  const base = { maxSizeBytes: 10_485_760 };

  it('accepte une pièce d’identité en JPEG', () => {
    expect(
      validateDocument({
        ...base,
        type: 'NATIONAL_ID',
        declaredContentType: 'image/jpeg',
        bytes: jpeg(),
      }),
    ).toEqual({ accepted: true, format: 'jpeg' });
  });

  it('refuse un exécutable renommé en image', () => {
    // Le cas d'attaque classique : l'extension et l'en-tête mentent, la signature non.
    expect(
      validateDocument({
        ...base,
        type: 'NATIONAL_ID',
        declaredContentType: 'image/jpeg',
        bytes: executable(),
      }),
    ).toEqual({ accepted: false, reason: 'UNSUPPORTED_FORMAT' });
  });

  it('refuse un fichier dont le type déclaré ne correspond pas au contenu réel', () => {
    expect(
      validateDocument({
        ...base,
        type: 'NATIONAL_ID',
        declaredContentType: 'image/png',
        bytes: jpeg(),
      }),
    ).toEqual({ accepted: false, reason: 'FORMAT_MISMATCH' });
  });

  it('refuse un fichier vide', () => {
    expect(
      validateDocument({
        ...base,
        type: 'NATIONAL_ID',
        declaredContentType: 'image/jpeg',
        bytes: Buffer.alloc(0),
      }),
    ).toEqual({ accepted: false, reason: 'EMPTY' });
  });

  it('refuse un fichier dépassant la taille autorisée', () => {
    expect(
      validateDocument({
        type: 'NATIONAL_ID',
        declaredContentType: 'image/jpeg',
        bytes: jpeg(2048),
        maxSizeBytes: 512,
      }),
    ).toEqual({ accepted: false, reason: 'TOO_LARGE' });
  });

  it('accepte un passeport au format PDF', () => {
    expect(
      validateDocument({
        ...base,
        type: 'PASSPORT',
        declaredContentType: 'application/pdf',
        bytes: pdf(),
      }),
    ).toMatchObject({ accepted: true, format: 'pdf' });
  });

  it('refuse un selfie au format PDF', () => {
    expect(
      validateDocument({
        ...base,
        type: 'SELFIE',
        declaredContentType: 'application/pdf',
        bytes: pdf(),
      }),
    ).toEqual({ accepted: false, reason: 'SELFIE_MUST_BE_IMAGE' });
  });
});

describe('conditions de soumission', () => {
  it('exige une pièce officielle ET un selfie', () => {
    expect(canSubmit(['NATIONAL_ID', 'SELFIE'])).toBe(true);
  });

  it('refuse une pièce officielle seule', () => {
    expect(canSubmit(['NATIONAL_ID'])).toBe(false);
  });

  it('refuse un selfie seul', () => {
    expect(canSubmit(['SELFIE'])).toBe(false);
  });

  it('accepte une capture de vivacité en lieu et place du selfie', () => {
    expect(canSubmit(['PASSPORT', 'LIVENESS_CAPTURE'])).toBe(true);
  });

  it('refuse une demande sans aucune pièce', () => {
    expect(canSubmit([] as DocumentTypeValue[])).toBe(false);
  });
});

describe('date de purge des documents', () => {
  it('applique la durée de conservation configurée', () => {
    const decision = new Date('2026-08-06T12:00:00.000Z');
    expect(computePurgeDate(decision, 90).toISOString()).toBe('2026-11-04T12:00:00.000Z');
  });

  it('permet une conservation raccourcie sans changement de code', () => {
    const decision = new Date('2026-08-06T12:00:00.000Z');
    expect(computePurgeDate(decision, 30).toISOString()).toBe('2026-09-05T12:00:00.000Z');
  });
});
