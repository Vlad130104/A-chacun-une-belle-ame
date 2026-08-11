import { createHmac } from 'node:crypto';

/**
 * TOTP — RFC 6238, pour la double authentification du back-office (story D9-01).
 *
 * Implémenté ici plutôt qu'ajouté en dépendance : l'algorithme tient en trente
 * lignes, il est figé depuis 2011, et les vecteurs de test de la RFC permettent
 * de prouver qu'il est juste. Une dépendance de plus sur un chemin
 * d'authentification est une surface de plus à surveiller.
 *
 * Le secret n'est jamais journalisé, jamais rendu par une route après
 * l'enrôlement initial.
 */

const ALPHABET_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface TotpConfig {
  /** Durée d'un pas, en secondes. 30 s est la valeur universellement admise. */
  stepSeconds: number;
  digits: number;
  /**
   * Nombre de pas acceptés de part et d'autre.
   *
   * 1 tolère une horloge décalée d'une demi-minute — courant sur un téléphone
   * mal synchronisé. Au-delà, la fenêtre d'un code valide s'allonge d'autant, ce
   * qui affaiblit la protection contre le rejeu.
   */
  window: number;
}

export const DEFAULT_TOTP: TotpConfig = { stepSeconds: 30, digits: 6, window: 1 };

/** Décodage base32 (RFC 4648, sans remplissage) — format des secrets TOTP. */
export function decodeBase32(secret: string): Buffer {
  const nettoye = secret.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let valeur = 0;
  const octets: number[] = [];

  for (const caractere of nettoye) {
    const index = ALPHABET_BASE32.indexOf(caractere);
    if (index === -1) throw new Error(`Secret TOTP invalide : caractère « ${caractere} ».`);

    valeur = (valeur << 5) | index;
    bits += 5;

    if (bits >= 8) {
      octets.push((valeur >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(octets);
}

/** Code attendu pour un compteur donné (HOTP, RFC 4226). */
export function hotp(secret: Buffer, counter: number, digits: number): string {
  const compteur = Buffer.alloc(8);
  // Écriture 64 bits big-endian : `writeBigUInt64BE` évite la perte de
  // précision au-delà de 2^53, même si le compteur n'y arrivera jamais.
  compteur.writeBigUInt64BE(BigInt(counter));

  const empreinte = createHmac('sha1', secret).update(compteur).digest();
  const decalage = empreinte[empreinte.length - 1]! & 0x0f;

  const tronque =
    ((empreinte[decalage]! & 0x7f) << 24) |
    ((empreinte[decalage + 1]! & 0xff) << 16) |
    ((empreinte[decalage + 2]! & 0xff) << 8) |
    (empreinte[decalage + 3]! & 0xff);

  return String(tronque % 10 ** digits).padStart(digits, '0');
}

export function totpAt(secret: string, at: Date, config: TotpConfig = DEFAULT_TOTP): string {
  const compteur = Math.floor(at.getTime() / 1000 / config.stepSeconds);
  return hotp(decodeBase32(secret), compteur, config.digits);
}

/**
 * Vérifie un code, avec tolérance d'horloge.
 *
 * La comparaison porte sur des chaînes de longueur fixe issues d'un calcul
 * local ; il n'y a pas de secret à extraire par mesure de temps. Le point qui
 * compte réellement contre la force brute est ailleurs : la limitation du nombre
 * de tentatives, appliquée par l'appelant.
 */
export function verifyTotp(
  secret: string,
  code: string,
  at: Date,
  config: TotpConfig = DEFAULT_TOTP,
): boolean {
  const propose = code.trim();
  if (propose.length !== config.digits || !/^\d+$/.test(propose)) return false;

  const cle = decodeBase32(secret);
  const compteur = Math.floor(at.getTime() / 1000 / config.stepSeconds);

  for (let decalage = -config.window; decalage <= config.window; decalage += 1) {
    if (hotp(cle, compteur + decalage, config.digits) === propose) return true;
  }

  return false;
}

/**
 * URI d'enrôlement, au format attendu par les applications d'authentification.
 *
 * L'émetteur est répété dans le libellé ET dans le paramètre : les deux formes
 * cohabitent selon les applications, et l'omettre affiche un compte anonyme dans
 * la liste de l'utilisateur.
 */
export function enrollmentUri(secret: string, accountLabel: string, issuer: string): string {
  const libelle = encodeURIComponent(`${issuer}:${accountLabel}`);
  const parametres = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_TOTP.digits),
    period: String(DEFAULT_TOTP.stepSeconds),
  });

  return `otpauth://totp/${libelle}?${parametres.toString()}`;
}
