import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { BusinessError } from '../../../common/errors/business.error';
import type { AuditWriter } from '../../moderation/application/ports';
import { totpAt } from '../domain/totp';
import {
  AdminTwoFactorUseCase,
  GetUserDetailUseCase,
  ManageFeatureFlagsUseCase,
  ManageRolesUseCase,
  ReadAuditLogUseCase,
  SearchUsersUseCase,
} from './backoffice.use-cases';
import type {
  AdminAuditReader,
  AdminQueryRepository,
  AdminUserDetail,
  FeatureFlagRecord,
  FeatureFlagRepository,
  RoleRepository,
  TwoFactorRepository,
} from './ports';
import type { AdminRole } from '../domain/permissions';

const MAINTENANT = new Date('2026-03-15T12:00:00.000Z');

class FakeAudit implements AuditWriter {
  entries: Parameters<AuditWriter['record']>[0][] = [];

  record(input: Parameters<AuditWriter['record']>[0]): Promise<void> {
    this.entries.push(input);
    return Promise.resolve();
  }
}

class FakeQueries implements AdminQueryRepository {
  searches: Parameters<AdminQueryRepository['searchUsers']>[0][] = [];
  detail: AdminUserDetail | null = null;

  dashboard(): ReturnType<AdminQueryRepository['dashboard']> {
    return Promise.resolve({
      membresActifs: 0,
      inscriptions7j: 0,
      verificationsEnAttente: 0,
      tauxVerification: 0,
      matchs7j: 0,
      conversationsActives7j: 0,
      casModerationOuverts: 0,
      casModerationEnRetard: 0,
      abonnementsActifs: 0,
      revenuMinor30j: { amountMinor: 0, currency: 'XAF' },
    });
  }

  searchUsers(
    input: Parameters<AdminQueryRepository['searchUsers']>[0],
  ): ReturnType<AdminQueryRepository['searchUsers']> {
    this.searches.push(input);
    return Promise.resolve({ items: [], nextCursor: null, hasMore: false });
  }

  userDetail(): Promise<AdminUserDetail | null> {
    return Promise.resolve(this.detail);
  }
}

class FakeRoles implements RoleRepository {
  granted: { userId: string; role: AdminRole }[] = [];
  revoked: { userId: string; role: AdminRole }[] = [];
  superAdmins = 2;

  listRoles(): Promise<AdminRole[]> {
    return Promise.resolve([]);
  }

  grant(userId: string, role: AdminRole): Promise<void> {
    this.granted.push({ userId, role });
    return Promise.resolve();
  }

  revoke(userId: string, role: AdminRole): Promise<void> {
    this.revoked.push({ userId, role });
    return Promise.resolve();
  }

  listAdmins(): Promise<{ userId: string; roles: AdminRole[] }[]> {
    return Promise.resolve([]);
  }

  countSuperAdmins(): Promise<number> {
    return Promise.resolve(this.superAdmins);
  }
}

class FakeFlags implements FeatureFlagRepository {
  flags: FeatureFlagRecord[] = [
    {
      key: 'payments.enabled',
      description: 'Souscription payante',
      enabled: false,
      rolloutPercentage: 0,
      payload: null,
      updatedAt: MAINTENANT,
    },
  ];

  list(): Promise<FeatureFlagRecord[]> {
    return Promise.resolve(this.flags);
  }

  update(input: Parameters<FeatureFlagRepository['update']>[0]): Promise<FeatureFlagRecord | null> {
    const flag = this.flags.find((candidat) => candidat.key === input.key);
    if (flag === undefined) return Promise.resolve(null);
    if (input.enabled !== undefined) flag.enabled = input.enabled;
    if (input.rolloutPercentage !== undefined) flag.rolloutPercentage = input.rolloutPercentage;
    return Promise.resolve(flag);
  }
}

class FakeAuditReader implements AdminAuditReader {
  calls: Parameters<AdminAuditReader['list']>[0][] = [];

  list(input: Parameters<AdminAuditReader['list']>[0]): ReturnType<AdminAuditReader['list']> {
    this.calls.push(input);
    return Promise.resolve({ items: [], nextCursor: null, hasMore: false });
  }
}

class FakeTwoFactor implements TwoFactorRepository {
  secret: string | null = null;
  enabled = false;

  getSecret(): Promise<{ secret: string | null; enabled: boolean } | null> {
    return Promise.resolve({ secret: this.secret, enabled: this.enabled });
  }

  setSecret(_userId: string, secret: string): Promise<void> {
    this.secret = secret;
    return Promise.resolve();
  }

  enable(): Promise<void> {
    this.enabled = true;
    return Promise.resolve();
  }

  disable(): Promise<void> {
    this.enabled = false;
    return Promise.resolve();
  }
}

class FixedClock {
  now(): Date {
    return new Date(MAINTENANT.getTime());
  }
}

/**
 * Hachage de test RÉEL.
 *
 * Une doublure qui renverrait `sha256:${valeur}` contiendrait le numéro en
 * clair, et l'assertion « le numéro ne transite pas jusqu'au SQL » ne
 * prouverait rien.
 */
const hacheur = {
  hash: (valeur: string): string => createHash('sha256').update(valeur).digest('hex'),
};

let audit: FakeAudit;
let queries: FakeQueries;
let roles: FakeRoles;
let flags: FakeFlags;
let auditReader: FakeAuditReader;
let twoFactor: FakeTwoFactor;
let clock: FixedClock;

beforeEach(() => {
  audit = new FakeAudit();
  queries = new FakeQueries();
  roles = new FakeRoles();
  flags = new FakeFlags();
  auditReader = new FakeAuditReader();
  twoFactor = new FakeTwoFactor();
  clock = new FixedClock();
});

const attendreErreur = async (promesse: Promise<unknown>): Promise<BusinessError> => {
  try {
    await promesse;
  } catch (erreur) {
    if (erreur instanceof BusinessError) return erreur;
    throw erreur;
  }
  throw new Error('Une BusinessError était attendue.');
};

describe('recherche de compte', () => {
  const chercher = () => new SearchUsersUseCase(queries, audit, hacheur, clock);

  it('hache le numéro AVANT la requête', async () => {
    // Le numéro en clair ne transite jamais jusqu'au SQL : la colonne indexée
    // est une empreinte salée.
    await chercher().execute({
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
      phone: '+237699001122',
      limit: 20,
    });

    expect(queries.searches[0]?.phoneHash).toBe(hacheur.hash('+237699001122'));
    expect(JSON.stringify(queries.searches[0])).not.toContain('699001122');
  });

  it('audite la recherche SANS journaliser le critère en clair', async () => {
    // Consigner un numéro dans le journal le rendrait lisible à quiconque a
    // `audit.read`, ce qui annulerait le hachage.
    await chercher().execute({
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
      phone: '+237699001122',
      limit: 20,
    });

    expect(audit.entries[0]?.action).toBe('admin.user.searched');
    expect(JSON.stringify(audit.entries[0]?.context)).not.toContain('699001122');
    expect(audit.entries[0]?.context).toEqual({ critere: 'phone' });
  });

  it('audite la consultation d’un compte', async () => {
    // Un back-office donne accès aux données de milliers de personnes : la
    // seule façon de détecter une curiosité déplacée est d'en garder la trace.
    queries.detail = {
      id: 'membre-1',
      accountStatus: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      createdAt: MAINTENANT,
      lastActiveAt: null,
      firstName: 'Awa',
      cityName: 'Douala',
      phoneMasked: '+237***22',
      roles: [],
      sanctions: [],
      reportsAgainst: 0,
      reportsFiled: 0,
      subscription: null,
      sessionsActives: 1,
      photosCount: 3,
    };

    await new GetUserDetailUseCase(queries, audit, clock).execute({
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
      userId: 'membre-1',
    });

    expect(audit.entries[0]).toMatchObject({
      action: 'admin.user.viewed',
      targetId: 'membre-1',
    });
  });

  it('répond 404 sur un compte inexistant', async () => {
    const erreur = await attendreErreur(
      new GetUserDetailUseCase(queries, audit, clock).execute({
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
        userId: 'inconnu',
      }),
    );
    expect(erreur.httpStatus).toBe(404);
  });
});

describe('journal d’audit', () => {
  it('audite la consultation du journal lui-même', async () => {
    // Cela paraît circulaire ; c'est ce qui permet de savoir qui est allé
    // regarder qui.
    await new ReadAuditLogUseCase(auditReader, audit, clock).execute({
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
      targetId: 'membre-9',
      limit: 20,
    });

    expect(audit.entries[0]?.action).toBe('admin.audit.read');
    expect(auditReader.calls[0]?.targetId).toBe('membre-9');
  });
});

describe('gestion des rôles', () => {
  const gerer = () => new ManageRolesUseCase(roles, audit, clock);

  it('attribue un rôle et l’audite', async () => {
    await gerer().grant({
      actorUserId: 'super-1',
      actorRoles: ['SUPER_ADMIN'],
      targetUserId: 'membre-1',
      role: 'MODERATOR',
    });

    expect(roles.granted).toEqual([{ userId: 'membre-1', role: 'MODERATOR' }]);
    expect(audit.entries[0]?.action).toBe('admin.role.granted');
  });

  it('refuse à un ADMIN de distribuer des rôles', async () => {
    const erreur = await attendreErreur(
      gerer().grant({
        actorUserId: 'admin-1',
        actorRoles: ['ADMIN'],
        targetUserId: 'membre-1',
        role: 'MODERATOR',
      }),
    );

    expect(erreur.httpStatus).toBe(403);
    expect(roles.granted).toEqual([]);
  });

  it('refuse de modifier ses PROPRES rôles', async () => {
    // Sinon un super-administrateur pourrait s'attribuer discrètement un
    // pouvoir puis le retirer.
    const erreur = await attendreErreur(
      gerer().grant({
        actorUserId: 'super-1',
        actorRoles: ['SUPER_ADMIN'],
        targetUserId: 'super-1',
        role: 'ADMIN',
      }),
    );

    expect(erreur.httpStatus).toBe(403);
  });

  it('refuse de retirer le DERNIER super-administrateur', async () => {
    // La plateforme deviendrait ingérable, sans recours par l'API.
    roles.superAdmins = 1;

    const erreur = await attendreErreur(
      gerer().revoke({
        actorUserId: 'super-1',
        actorRoles: ['SUPER_ADMIN'],
        targetUserId: 'super-2',
        role: 'SUPER_ADMIN',
      }),
    );

    expect(erreur.httpStatus).toBe(409);
    expect(roles.revoked).toEqual([]);
  });

  it('accepte de retirer un super-administrateur quand il en reste d’autres', async () => {
    roles.superAdmins = 3;
    await expect(
      gerer().revoke({
        actorUserId: 'super-1',
        actorRoles: ['SUPER_ADMIN'],
        targetUserId: 'super-2',
        role: 'SUPER_ADMIN',
      }),
    ).resolves.toEqual({ revoked: true });
  });
});

describe('feature flags', () => {
  const gerer = () => new ManageFeatureFlagsUseCase(flags, audit, clock);

  it('active un flag et trace le changement', async () => {
    // Un flag change le comportement du produit pour tout le monde.
    await gerer().update({
      actorUserId: 'super-1',
      actorRole: 'SUPER_ADMIN',
      key: 'payments.enabled',
      enabled: true,
    });

    expect(flags.flags[0]?.enabled).toBe(true);
    expect(audit.entries[0]).toMatchObject({
      action: 'admin.flag.updated',
      targetId: 'payments.enabled',
    });
  });

  it('répond 404 sur un flag inconnu', async () => {
    const erreur = await attendreErreur(
      gerer().update({
        actorUserId: 'super-1',
        actorRole: 'SUPER_ADMIN',
        key: 'inexistant',
        enabled: true,
      }),
    );
    expect(erreur.httpStatus).toBe(404);
  });
});

describe('double authentification du back-office', () => {
  const deuxFacteurs = () =>
    new AdminTwoFactorUseCase(twoFactor, audit, clock, 'À Chacun Une Belle Âme');

  it('produit un secret et une URI d’enrôlement', async () => {
    const resultat = await deuxFacteurs().startEnrollment('admin-1', 'admin@acuba.test');

    expect(resultat.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(resultat.uri.startsWith('otpauth://totp/')).toBe(true);
    expect(twoFactor.enabled).toBe(false);
  });

  it('n’active PAS la double authentification avant confirmation', async () => {
    // Activer d'office enfermerait dehors un administrateur qui aurait mal
    // recopié le secret.
    await deuxFacteurs().startEnrollment('admin-1', 'admin@acuba.test');
    expect(twoFactor.enabled).toBe(false);
  });

  it('active après un code valide', async () => {
    const cas = deuxFacteurs();
    const { secret } = await cas.startEnrollment('admin-1', 'admin@acuba.test');

    await cas.confirmEnrollment({
      userId: 'admin-1',
      actorRole: 'ADMIN',
      code: totpAt(secret, MAINTENANT),
    });

    expect(twoFactor.enabled).toBe(true);
    expect(audit.entries[0]?.action).toBe('admin.2fa.enabled');
  });

  it('refuse un code erroné et n’active rien', async () => {
    const cas = deuxFacteurs();
    await cas.startEnrollment('admin-1', 'admin@acuba.test');

    const erreur = await attendreErreur(
      cas.confirmEnrollment({ userId: 'admin-1', actorRole: 'ADMIN', code: '000000' }),
    );

    expect(erreur.httpStatus).toBe(401);
    expect(twoFactor.enabled).toBe(false);
  });

  it('refuse de réenrôler un compte déjà protégé', async () => {
    // Sinon le facteur d'un administrateur dont on aurait volé la session
    // serait remplaçable.
    twoFactor.secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    twoFactor.enabled = true;

    const erreur = await attendreErreur(
      deuxFacteurs().startEnrollment('admin-1', 'admin@acuba.test'),
    );
    expect(erreur.httpStatus).toBe(409);
  });

  it('vérifie un code de session', async () => {
    twoFactor.secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    twoFactor.enabled = true;

    const cas = deuxFacteurs();
    expect(await cas.verify('admin-1', totpAt(twoFactor.secret, MAINTENANT))).toBe(true);
    expect(await cas.verify('admin-1', '000000')).toBe(false);
  });

  it('refuse tout code tant que la double authentification n’est pas active', async () => {
    twoFactor.secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    twoFactor.enabled = false;

    expect(await deuxFacteurs().verify('admin-1', totpAt(twoFactor.secret, MAINTENANT))).toBe(
      false,
    );
  });
});
