import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { Env } from '../../../config/env.schema';
import type { AccessTokenClaims, Hasher, PasswordHasher, TokenService } from '../application/ports';

/**
 * Hachage non réversible et déterministe (SHA-256 + sel serveur).
 *
 * Sert aux empreintes qu'on doit pouvoir RECHERCHER : numéro de téléphone, code OTP,
 * refresh token, empreinte d'appareil. Le sel est commun et vient de l'environnement —
 * un sel par valeur rendrait la recherche impossible.
 *
 * À ne pas confondre avec le hachage de mot de passe, qui utilise Argon2id.
 */
@Injectable()
export class SaltedHasher implements Hasher {
  private readonly salt: string;

  constructor(config: ConfigService<Env, true>) {
    this.salt = config.get('HASH_SALT', { infer: true });
  }

  hash(value: string): string {
    return createHash('sha256').update(`${this.salt}:${value}`).digest('hex');
  }

  equals(hash: string, value: string): boolean {
    const expected = Buffer.from(this.hash(value), 'hex');
    const actual = Buffer.from(hash, 'hex');
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }
}

/**
 * Mots de passe : Argon2id, paramètres à réévaluer annuellement (SECURITY.md §4.1).
 * Le mot de passe n'est requis que si un e-mail est ajouté au compte (ADR-003).
 */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private static readonly OPTIONS = {
    memoryCost: 19_456, // 19 Mio
    timeCost: 2,
    parallelism: 1,
  };

  hash(plain: string): Promise<string> {
    return argonHash(plain, Argon2PasswordHasher.OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argonVerify(hash, plain, Argon2PasswordHasher.OPTIONS);
    } catch {
      // Une empreinte corrompue ne doit pas révéler d'information : on répond « non ».
      return false;
    }
  }
}

@Injectable()
export class JwtTokenService implements TokenService {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      expiresIn: this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
    });
  }

  verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwt.verifyAsync<AccessTokenClaims>(token);
  }

  /** Opaque et aléatoire : un refresh token n'est jamais un JWT (ADR-005). */
  generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  /** `randomInt` plutôt que `Math.random` : la prédictibilité serait une faille. */
  generateOtpCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  newId(): string {
    return randomUUID();
  }
}
