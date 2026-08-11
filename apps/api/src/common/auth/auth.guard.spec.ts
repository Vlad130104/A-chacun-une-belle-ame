import 'reflect-metadata';
import { beforeEach, describe, expect, it } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { BusinessError } from '../errors/business.error';
import type {
  AccessTokenClaims,
  RoleReader,
  TokenService,
  UserRecord,
  UserRepository,
} from '../../modules/auth/application/ports';
import { AuthGuard } from './auth.guard';
import type { AuthPolicy } from './auth.decorator';

/**
 * Tests du garde d'autorisation — story E-01.
 *
 * Ce fichier existe parce que son absence a coûté cher. Le garde comparait les
 * permissions exigées par une route aux **rôles portés par le jeton** ; or le
 * jeton était émis avec `roles: []`, systématiquement. Conséquence : les
 * quarante-cinq routes d'administration étaient définitivement inaccessibles,
 * y compris pour un super-administrateur.
 *
 * Mille quatorze tests unitaires étaient verts. Aucun ne traversait le garde :
 * ils vérifiaient des règles de domaine, pas la chaîne d'autorisation. La leçon
 * tient en une phrase — **le point le plus critique du système était le seul
 * sans test**.
 */

const MEMBRE: UserRecord = {
  id: 'user-1',
  phoneE164: '+237690000000',
  phoneHash: 'empreinte',
  phoneVerified: true,
  email: null,
  passwordHash: null,
  birthDate: new Date('1990-05-20T00:00:00.000Z'),
  accountStatus: 'ACTIVE',
  verificationStatus: 'VERIFIED',
  failedLoginCount: 0,
  lockedUntil: null,
  usedInviteId: null,
};

class FakeUsers implements UserRepository {
  user: UserRecord | null = MEMBRE;

  findByPhoneHash(): Promise<UserRecord | null> {
    return Promise.resolve(null);
  }
  findById(): Promise<UserRecord | null> {
    return Promise.resolve(this.user);
  }
  create(): Promise<UserRecord> {
    return Promise.reject(new Error('non utilisé'));
  }
  markPhoneVerified(): Promise<void> {
    return Promise.resolve();
  }
  updateAccountStatus(): Promise<void> {
    return Promise.resolve();
  }
  touchLastActive(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeRoles implements RoleReader {
  roles: string[] = [];
  /** Nombre d'appels : sert à prouver qu'une route sans permission n'interroge pas la base. */
  lectures = 0;

  activeRoles(): Promise<string[]> {
    this.lectures += 1;
    return Promise.resolve(this.roles);
  }
}

class FakeTokens implements TokenService {
  claims: AccessTokenClaims = {
    sub: 'user-1',
    sid: 'session-1',
    accountStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
  };
  valide = true;

  signAccessToken(): Promise<string> {
    return Promise.resolve('jeton');
  }
  verifyAccessToken(): Promise<AccessTokenClaims> {
    return this.valide ? Promise.resolve(this.claims) : Promise.reject(new Error('jeton invalide'));
  }
  generateRefreshToken(): string {
    return 'refresh';
  }
  generateOtpCode(): string {
    return '123456';
  }
  newId(): string {
    return 'id';
  }
}

let users: FakeUsers;
let roles: FakeRoles;
let tokens: FakeTokens;
let requete: Request;

function contexte(policy: AuthPolicy | undefined): {
  guard: AuthGuard;
  execution: ExecutionContext;
} {
  const reflector = {
    getAllAndOverride: () => policy,
  } as unknown as Reflector;

  const execution = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => requete }),
  } as unknown as ExecutionContext;

  return { guard: new AuthGuard(reflector, tokens, users, roles), execution };
}

const attendreErreur = async (promesse: Promise<unknown>): Promise<BusinessError> => {
  try {
    await promesse;
  } catch (erreur) {
    if (erreur instanceof BusinessError) return erreur;
    throw erreur;
  }
  throw new Error('Une BusinessError était attendue.');
};

beforeEach(() => {
  users = new FakeUsers();
  roles = new FakeRoles();
  tokens = new FakeTokens();
  requete = { headers: { authorization: 'Bearer jeton' } } as unknown as Request;
});

describe('garde d’autorisation — fondamentaux', () => {
  it('REFUSE une route sans politique déclarée', async () => {
    // Le défaut est le refus. Une route qui oublierait `@Auth` n'est pas ouverte.
    const { guard, execution } = contexte(undefined);
    expect((await attendreErreur(guard.canActivate(execution))).httpStatus).toBe(403);
  });

  it('laisse passer une route publique sans lire aucun jeton', async () => {
    const { guard, execution } = contexte({ level: 'public' });
    requete = { headers: {} } as unknown as Request;

    expect(await guard.canActivate(execution)).toBe(true);
  });

  it('refuse une requête sans en-tête d’autorisation', async () => {
    const { guard, execution } = contexte({ level: 'auth' });
    requete = { headers: {} } as unknown as Request;

    expect((await attendreErreur(guard.canActivate(execution))).httpStatus).toBe(401);
  });

  it('refuse un jeton invalide sans distinguer la cause', async () => {
    tokens.valide = false;
    const { guard, execution } = contexte({ level: 'auth' });

    expect((await attendreErreur(guard.canActivate(execution))).httpStatus).toBe(401);
  });
});

describe('garde d’autorisation — statut relu en base', () => {
  it('refuse un compte banni MALGRÉ un jeton valide', async () => {
    // Le jeton dit `ACTIVE` ; la base dit `BANNED`. C'est la base qui tranche.
    users.user = { ...MEMBRE, accountStatus: 'BANNED' };
    const { guard, execution } = contexte({ level: 'auth' });

    expect((await attendreErreur(guard.canActivate(execution))).httpStatus).toBe(403);
  });

  it('refuse un compte suspendu', async () => {
    users.user = { ...MEMBRE, accountStatus: 'SUSPENDED' };
    const { guard, execution } = contexte({ level: 'auth' });

    expect((await attendreErreur(guard.canActivate(execution))).httpStatus).toBe(403);
  });

  it('refuse un compte non vérifié sur une route « verified »', async () => {
    users.user = { ...MEMBRE, verificationStatus: 'PENDING' };
    const { guard, execution } = contexte({ level: 'verified' });

    expect((await attendreErreur(guard.canActivate(execution))).httpStatus).toBe(403);
  });

  it('accepte un compte non vérifié sur une route « auth »', async () => {
    // Signaler et bloquer restent ouverts aux comptes non vérifiés : ce sont des
    // fonctions de sécurité.
    users.user = { ...MEMBRE, verificationStatus: 'NOT_STARTED' };
    const { guard, execution } = contexte({ level: 'auth' });

    expect(await guard.canActivate(execution)).toBe(true);
  });
});

describe('garde d’autorisation — permissions back-office', () => {
  it('REFUSE une route à permission quand le compte n’a aucun rôle', async () => {
    roles.roles = [];
    const { guard, execution } = contexte({ level: 'auth', permissions: ['users.read'] });

    expect((await attendreErreur(guard.canActivate(execution))).httpStatus).toBe(403);
  });

  it('accepte quand un rôle détenu accorde la permission', async () => {
    roles.roles = ['SUPPORT'];
    const { guard, execution } = contexte({ level: 'auth', permissions: ['users.read'] });

    expect(await guard.canActivate(execution)).toBe(true);
  });

  it('refuse quand le rôle détenu n’accorde PAS la permission demandée', async () => {
    // Un analyste lit des agrégats ; il ne voit aucun compte nominatif.
    roles.roles = ['ANALYST'];
    const { guard, execution } = contexte({ level: 'auth', permissions: ['users.read'] });

    expect((await attendreErreur(guard.canActivate(execution))).httpStatus).toBe(403);
  });

  it('exige TOUTES les permissions déclarées, pas une seule', async () => {
    roles.roles = ['MODERATOR'];
    const { guard, execution } = contexte({
      level: 'auth',
      permissions: ['moderation.act', 'users.ban'],
    });

    expect((await attendreErreur(guard.canActivate(execution))).httpStatus).toBe(403);
  });

  it('applique IMMÉDIATEMENT un rôle retiré, sans attendre l’expiration du jeton', async () => {
    // La régression que ce fichier existe pour empêcher. Les rôles ne sont pas
    // dans le jeton : un rôle retiré à 10 h cesse d'agir à 10 h, pas à 10 h 15.
    roles.roles = ['ADMIN'];
    const avant = contexte({ level: 'auth', permissions: ['users.read'] });
    expect(await avant.guard.canActivate(avant.execution)).toBe(true);

    roles.roles = [];
    const apres = contexte({ level: 'auth', permissions: ['users.read'] });
    expect((await attendreErreur(apres.guard.canActivate(apres.execution))).httpStatus).toBe(403);
  });

  it('n’interroge PAS la base des rôles sur une route sans permission', async () => {
    // Une route de membre ordinaire ne doit pas payer une requête supplémentaire.
    const { guard, execution } = contexte({ level: 'verified' });
    await guard.canActivate(execution);

    expect(roles.lectures).toBe(0);
  });

  it('ÉCARTE une valeur de rôle inconnue au lieu de la convertir', async () => {
    // Une migration future pourrait ajouter une valeur à l'énumération
    // PostgreSQL. La convertir en rôle accorderait des droits qu'aucune table ne
    // décrit ; l'écarter ferme la route, ce qui est le bon défaut.
    roles.roles = ['ROLE_VENU_DU_FUTUR'];
    const { guard, execution } = contexte({ level: 'auth', permissions: ['users.read'] });

    expect((await attendreErreur(guard.canActivate(execution))).httpStatus).toBe(403);
  });

  it('expose à la route les rôles ET les permissions réellement détenus', async () => {
    roles.roles = ['VERIFICATION_AGENT'];
    const { guard, execution } = contexte({ level: 'auth', permissions: ['kyc.review'] });

    await guard.canActivate(execution);

    expect(requete.user?.roles).toEqual(['VERIFICATION_AGENT']);
    expect(requete.user?.permissions).toEqual(
      expect.arrayContaining(['users.read', 'kyc.review', 'kyc.view_document']),
    );
  });

  it('n’expose AUCUNE permission sur une route qui n’en demande pas', async () => {
    // Un contrôleur ne doit pas pouvoir décider d'une élévation à partir d'un
    // champ que le garde n'a pas vérifié.
    roles.roles = ['SUPER_ADMIN'];
    const { guard, execution } = contexte({ level: 'auth' });

    await guard.canActivate(execution);

    expect(requete.user?.permissions).toEqual([]);
    expect(requete.user?.roles).toEqual([]);
  });
});
