/**
 * Contenu d'un message : normalisation, limites, et détection de signaux à risque.
 *
 * Deux principes qui ne se confondent pas :
 *  - ce qui est INVALIDE est refusé (vide, trop long) ;
 *  - ce qui est SUSPECT est accepté puis signalé à la modération (story D6-08).
 *
 * Bloquer un message parce qu'il contient un numéro de téléphone punirait deux
 * personnes qui veulent légitimement se parler ailleurs. Le laisser passer sans le
 * marquer laisserait l'arnaque sentimentale prospérer. On fait donc les deux :
 * on transmet, et on marque.
 */

export const MAX_MESSAGE_LENGTH = 4000;

export type ContentValidationError = 'EMPTY' | 'TOO_LONG';

export type ContentValidation =
  { valid: true; body: string } | { valid: false; error: ContentValidationError };

/**
 * Normalise avant de mesurer.
 *
 * Les caractères de contrôle sont retirés : ils ne s'affichent pas, servent à
 * masquer du texte dans une interface, et n'ont aucun usage légitime ici.
 * Les espaces de fin sont coupés, les sauts de ligne multiples ramenés à deux —
 * un mur de retours à la ligne est une manière connue de saturer un écran.
 */
export function normalizeMessageBody(raw: string): string {
  return (
    raw
      // Tabulation et saut de ligne conservés : ils portent du sens dans un message.
      // eslint-disable-next-line no-control-regex -- Retrait explicite des caractères de contrôle : ils ne s'affichent pas et servent à masquer du texte.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{4,}/g, '   ')
      .trim()
  );
}

export function validateMessageBody(raw: string): ContentValidation {
  const body = normalizeMessageBody(raw);

  if (body.length === 0) return { valid: false, error: 'EMPTY' };
  // La mesure se fait APRÈS normalisation : sinon mille caractères invisibles
  // suffiraient à faire refuser un message parfaitement anodin.
  if (body.length > MAX_MESSAGE_LENGTH) return { valid: false, error: 'TOO_LONG' };

  return { valid: true, body };
}

export type ContentSignal =
  /** Numéro de téléphone ou identifiant de messagerie tierce. */
  | 'CONTACT_SHARING'
  /** Lien sortant. */
  | 'EXTERNAL_LINK'
  /** Vocabulaire de demande d'argent — premier signal d'arnaque sentimentale. */
  | 'MONEY_REQUEST';

const MOTIFS_CONTACT: RegExp[] = [
  /(?:\+?\d[\s.-]?){8,}/,
  /\b(?:whats?app|telegram|signal|snap(?:chat)?|insta(?:gram)?|viber|imo)\b/i,
  /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i,
];

const MOTIF_LIEN = /\b(?:https?:\/\/|www\.)\S+/i;

const MOTIFS_ARGENT: RegExp[] = [
  /\b(?:western\s?union|moneygram|orange\s?money|mtn\s?money|mobile\s?money|momo)\b/i,
  /\b(?:envoie|envoyer|virement|transf[ée]r|pr[êe]te?r?|d[ée]pann|avance)\w*\b.{0,40}\b(?:argent|fcfa|f\s?cfa|xaf|xof|euros?|dollars?)\b/i,
  // Les deux ordres : « payer les frais » comme « les frais à payer ». Une seule
  // direction laisserait passer la moitié des formulations réelles.
  /\b(?:frais|caution|douane|visa|billet)\b.{0,40}\b(?:payer|r[ée]gler|envoyer)\b/i,
  /\b(?:payer|r[ée]gler|envoyer)\b.{0,40}\b(?:frais|caution|douane|visa|billet)\b/i,
];

/**
 * Signaux détectés, sans jamais bloquer l'envoi.
 *
 * La liste est volontairement lisible et modifiable : elle sera enrichie par les
 * cas réels remontés par la modération (story D6-08). Aucun de ces motifs ne
 * prétend être une preuve — ce sont des raisons de regarder.
 */
export function detectContentSignals(body: string): ContentSignal[] {
  const signaux: ContentSignal[] = [];

  if (MOTIFS_CONTACT.some((motif) => motif.test(body))) signaux.push('CONTACT_SHARING');
  if (MOTIF_LIEN.test(body)) signaux.push('EXTERNAL_LINK');
  if (MOTIFS_ARGENT.some((motif) => motif.test(body))) signaux.push('MONEY_REQUEST');

  return signaux;
}

/** Aperçu stocké sur la conversation pour trier la liste sans lire les messages. */
export const PREVIEW_LENGTH = 140;

export function buildPreview(body: string, type: string): string {
  if (type === 'IMAGE') return '📷 Photo';
  const ligne = body.replace(/\s+/g, ' ').trim();
  return ligne.length <= PREVIEW_LENGTH ? ligne : `${ligne.slice(0, PREVIEW_LENGTH - 1)}…`;
}
