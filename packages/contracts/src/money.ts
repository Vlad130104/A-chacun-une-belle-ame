/**
 * Montants monétaires.
 *
 * Règle absolue (ADR-009) : un montant est stocké et transporté en unité monétaire
 * MINIMALE, avec sa devise explicite.
 *
 * Piège spécifique aux marchés visés : le franc CFA (XAF, XOF) n'a PAS de sous-unité.
 * Son exposant est 0 — 1 000 F CFA se représente `1000`, jamais `100000`. Une erreur
 * d'exposant ici est un incident financier direct, d'où le test dédié money.spec.ts.
 */

export const CURRENCY_MINOR_UNIT_EXPONENT = {
  XAF: 0, // franc CFA BEAC — Cameroun
  XOF: 0, // franc CFA BCEAO — Bénin, Côte d'Ivoire
  EUR: 2,
  USD: 2,
} as const;

export type SupportedCurrency = keyof typeof CURRENCY_MINOR_UNIT_EXPONENT;

export const SUPPORTED_CURRENCIES = Object.keys(
  CURRENCY_MINOR_UNIT_EXPONENT,
) as SupportedCurrency[];

export interface Money {
  readonly amountMinor: number;
  readonly currency: SupportedCurrency;
}

export class CurrencyMismatchError extends Error {
  constructor(a: SupportedCurrency, b: SupportedCurrency) {
    super(`Opération impossible entre deux devises différentes : ${a} et ${b}.`);
    this.name = 'CurrencyMismatchError';
  }
}

export class InvalidAmountError extends Error {
  constructor(amountMinor: number) {
    super(`Montant invalide : ${amountMinor}. Attendu : un entier positif ou nul.`);
    this.name = 'InvalidAmountError';
  }
}

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return Object.prototype.hasOwnProperty.call(CURRENCY_MINOR_UNIT_EXPONENT, value);
}

export function minorUnitExponent(currency: SupportedCurrency): number {
  return CURRENCY_MINOR_UNIT_EXPONENT[currency];
}

export function money(amountMinor: number, currency: SupportedCurrency): Money {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new InvalidAmountError(amountMinor);
  }
  return { amountMinor, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

/**
 * Convertit un montant exprimé en unité principale (ce qu'un humain saisit au
 * back-office) vers l'unité minimale stockée.
 */
export function fromMajorUnit(amountMajor: number, currency: SupportedCurrency): Money {
  const factor = 10 ** minorUnitExponent(currency);
  return money(Math.round(amountMajor * factor), currency);
}

export function toMajorUnit(value: Money): number {
  return value.amountMinor / 10 ** minorUnitExponent(value.currency);
}

const CURRENCY_LABEL: Record<SupportedCurrency, string> = {
  XAF: 'F CFA',
  XOF: 'F CFA',
  EUR: '€',
  USD: '$',
};

/**
 * Formatage destiné à l'affichage. Espace insécable fine comme séparateur de
 * milliers, conformément à l'usage francophone.
 */
export function formatMoney(value: Money): string {
  const exponent = minorUnitExponent(value.currency);
  const major = toMajorUnit(value);
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(major);
  return `${formatted} ${CURRENCY_LABEL[value.currency]}`;
}
