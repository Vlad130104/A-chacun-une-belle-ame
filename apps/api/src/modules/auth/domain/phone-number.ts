import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';

/**
 * Numéro de téléphone au format E.164 — l'identifiant principal du compte (ADR-003).
 *
 * Objet de valeur : une instance existe uniquement si le numéro est valide. Le reste
 * du code n'a donc jamais à revérifier un format.
 */
export class PhoneNumber {
  private constructor(readonly value: string) {}

  /** Indicatifs des marchés de lancement (docs/00-phase-a-audit-cadrage.md §1.2). */
  static readonly LAUNCH_COUNTRY_CODES = ['+237', '+229', '+225'] as const;

  static create(raw: string): PhoneNumber {
    const normalized = PhoneNumber.normalize(raw);

    if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
      throw BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, { field: 'phoneE164' });
    }

    return new PhoneNumber(normalized);
  }

  /** Retire espaces, points, tirets et parenthèses ; convertit un préfixe 00 en +. */
  private static normalize(raw: string): string {
    const cleaned = raw.replace(/[\s.\-()]/g, '');
    return cleaned.startsWith('00') ? `+${cleaned.slice(2)}` : cleaned;
  }

  get countryCode(): string | null {
    return PhoneNumber.LAUNCH_COUNTRY_CODES.find((code) => this.value.startsWith(code)) ?? null;
  }

  /** Masquage pour les logs et le back-office : jamais de numéro complet en clair. */
  get masked(): string {
    return `${this.value.slice(0, 4)}${'*'.repeat(this.value.length - 6)}${this.value.slice(-2)}`;
  }

  equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
