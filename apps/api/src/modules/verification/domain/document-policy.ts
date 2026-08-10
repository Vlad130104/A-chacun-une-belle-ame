/**
 * Validation des pièces déposées (story D2-05).
 *
 * Le type est déterminé par la SIGNATURE BINAIRE du fichier, jamais par son extension
 * ni par l'en-tête déclaré : un exécutable renommé en `.jpg` doit être refusé
 * (SECURITY.md §4.4).
 */

export type DocumentTypeValue =
  'NATIONAL_ID' | 'PASSPORT' | 'DRIVER_LICENSE' | 'CONSULAR_CARD' | 'SELFIE' | 'LIVENESS_CAPTURE';

/** Pièces officielles acceptées — liste configurable (hypothèse H3 du cadrage). */
export const OFFICIAL_DOCUMENT_TYPES: DocumentTypeValue[] = [
  'NATIONAL_ID',
  'PASSPORT',
  'DRIVER_LICENSE',
  'CONSULAR_CARD',
];

export type DetectedFormat = 'jpeg' | 'png' | 'webp' | 'heic' | 'pdf' | 'unknown';

/** Signatures binaires (« magic bytes ») des formats acceptés. */
export function detectFormat(bytes: Buffer): DetectedFormat {
  if (bytes.length < 12) return 'unknown';

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const marque = bytes.subarray(8, 12).toString('ascii');
    if (marque.startsWith('heic') || marque.startsWith('heix') || marque.startsWith('mif1')) {
      return 'heic';
    }
  }
  if (bytes.subarray(0, 4).toString('ascii') === '%PDF') return 'pdf';

  return 'unknown';
}

export type DocumentRejection =
  'TOO_LARGE' | 'EMPTY' | 'UNSUPPORTED_FORMAT' | 'FORMAT_MISMATCH' | 'SELFIE_MUST_BE_IMAGE';

export type DocumentVerdict =
  { accepted: true; format: DetectedFormat } | { accepted: false; reason: DocumentRejection };

export interface DocumentInput {
  type: DocumentTypeValue;
  declaredContentType: string;
  bytes: Buffer;
  maxSizeBytes: number;
}

const CONTENT_TYPE_BY_FORMAT: Record<Exclude<DetectedFormat, 'unknown'>, string[]> = {
  jpeg: ['image/jpeg', 'image/jpg'],
  png: ['image/png'],
  webp: ['image/webp'],
  heic: ['image/heic', 'image/heif'],
  pdf: ['application/pdf'],
};

export function validateDocument(input: DocumentInput): DocumentVerdict {
  if (input.bytes.length === 0) return { accepted: false, reason: 'EMPTY' };
  if (input.bytes.length > input.maxSizeBytes) return { accepted: false, reason: 'TOO_LARGE' };

  const format = detectFormat(input.bytes);
  if (format === 'unknown') return { accepted: false, reason: 'UNSUPPORTED_FORMAT' };

  // Un selfie en PDF n'a pas de sens et trahit une manipulation.
  if ((input.type === 'SELFIE' || input.type === 'LIVENESS_CAPTURE') && format === 'pdf') {
    return { accepted: false, reason: 'SELFIE_MUST_BE_IMAGE' };
  }

  const attendus = CONTENT_TYPE_BY_FORMAT[format];
  if (!attendus.includes(input.declaredContentType.toLowerCase())) {
    return { accepted: false, reason: 'FORMAT_MISMATCH' };
  }

  return { accepted: true, format };
}

/**
 * Une demande n'est soumettable qu'avec au moins une pièce officielle ET un selfie :
 * c'est la comparaison des deux qui fait la vérification, pas la pièce seule.
 */
export function canSubmit(documentTypes: DocumentTypeValue[]): boolean {
  const aPieceOfficielle = documentTypes.some((type) => OFFICIAL_DOCUMENT_TYPES.includes(type));
  const aSelfie = documentTypes.some((type) => type === 'SELFIE' || type === 'LIVENESS_CAPTURE');
  return aPieceOfficielle && aSelfie;
}

/** Date de purge des documents — conservation configurable (hypothèse H6). */
export function computePurgeDate(decidedAt: Date, retentionDays: number): Date {
  return new Date(decidedAt.getTime() + retentionDays * 86_400_000);
}
