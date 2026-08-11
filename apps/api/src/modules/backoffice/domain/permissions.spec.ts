import { describe, expect, it } from '@jest/globals';
import {
  ALL_PERMISSIONS,
  ALL_ROLES,
  canGrantRoles,
  hasAllPermissions,
  hasPermission,
  permissionsOf,
  requiresSecondApprover,
  requiresWrittenReason,
  UnknownRoleError,
  type AdminRole,
  type Permission,
} from './permissions';

describe('catalogue', () => {
  it('compte les 23 permissions du document', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(23);
  });

  it('compte les 7 rôles du document', () => {
    expect(new Set(ALL_ROLES).size).toBe(7);
  });

  it('n’accorde aucune permission à un compte sans rôle', () => {
    // Un membre ordinaire n'a aucune ligne dans `UserRole` : l'absence de rôle
    // est l'absence totale de pouvoir back-office.
    expect(permissionsOf([]).size).toBe(0);
  });
});

describe('matrice rôles × permissions', () => {
  it('donne toutes les permissions à SUPER_ADMIN, énumérées et non implicites', () => {
    // Un rôle « joker » contournerait la table, donc les tests : la moindre
    // permission ajoutée lui serait accordée sans décision.
    expect(permissionsOf(['SUPER_ADMIN']).size).toBe(ALL_PERMISSIONS.length);
  });

  it('réserve la revue des pièces d’identité au SUPER_ADMIN et à l’agent de vérification', () => {
    const autorises = ALL_ROLES.filter((role) => hasPermission([role], 'kyc.view_document'));
    expect(autorises.sort()).toEqual(['SUPER_ADMIN', 'VERIFICATION_AGENT']);
  });

  it('n’autorise pas l’agent de vérification à sanctionner', () => {
    // Voir les pièces d'identité ET sanctionner ferait un rôle trop large.
    expect(hasPermission(['VERIFICATION_AGENT'], 'users.sanction')).toBe(false);
    expect(hasPermission(['VERIFICATION_AGENT'], 'users.ban')).toBe(false);
    expect(hasPermission(['VERIFICATION_AGENT'], 'moderation.act')).toBe(false);
  });

  it('n’autorise PAS le modérateur à bannir', () => {
    expect(hasPermission(['MODERATOR'], 'moderation.act')).toBe(true);
    expect(hasPermission(['MODERATOR'], 'users.ban')).toBe(false);
  });

  it('autorise le responsable de modération à bannir', () => {
    expect(hasPermission(['MODERATION_LEAD'], 'users.ban')).toBe(true);
  });

  it('ne donne à l’analyste aucun accès nominatif', () => {
    // Un analyste lit des agrégats, jamais un compte.
    expect(hasPermission(['ANALYST'], 'users.read')).toBe(false);
    expect(hasPermission(['ANALYST'], 'moderation.read')).toBe(false);
    expect(hasPermission(['ANALYST'], 'kyc.view_document')).toBe(false);
    expect(hasPermission(['ANALYST'], 'analytics.read')).toBe(true);
  });

  it('ne donne au support aucun pouvoir de sanction ni de remboursement', () => {
    expect(hasPermission(['SUPPORT'], 'users.sanction')).toBe(false);
    expect(hasPermission(['SUPPORT'], 'moderation.act')).toBe(false);
    expect(hasPermission(['SUPPORT'], 'billing.refund')).toBe(false);
    expect(hasPermission(['SUPPORT'], 'billing.read')).toBe(true);
  });

  it('réserve la gestion des rôles et des flags au SUPER_ADMIN', () => {
    for (const permission of ['system.roles', 'system.flags'] as Permission[]) {
      const autorises = ALL_ROLES.filter((role) => hasPermission([role], permission));
      expect({ permission, autorises }).toEqual({ permission, autorises: ['SUPER_ADMIN'] });
    }
  });

  it('cumule les permissions de plusieurs rôles', () => {
    const cumul = permissionsOf(['SUPPORT', 'ANALYST']);
    expect(cumul.has('users.read')).toBe(true);
    expect(cumul.has('analytics.export')).toBe(true);
    // Le cumul n'invente rien : ce qu'aucun des deux n'a, personne ne l'a.
    expect(cumul.has('users.ban')).toBe(false);
  });

  it('exige TOUTES les permissions demandées, pas une seule', () => {
    expect(hasAllPermissions(['MODERATOR'], ['moderation.read', 'moderation.act'])).toBe(true);
    expect(hasAllPermissions(['MODERATOR'], ['moderation.read', 'users.ban'])).toBe(false);
  });

  it('ÉCHOUE sur un rôle inconnu plutôt que de l’ignorer', () => {
    // Une valeur inattendue venue de la base ou d'un jeton signale un problème.
    // L'ignorer en silence produirait un compte aux droits inexplicables.
    const roles = ['ROLE_INEXISTANT'] as unknown as AdminRole[];
    expect(() => permissionsOf(roles)).toThrow(UnknownRoleError);
  });
});

describe('garde-fous transverses', () => {
  it('n’exige un second valideur que pour le bannissement et le remboursement', () => {
    const concernees = ALL_PERMISSIONS.filter(requiresSecondApprover);
    // Les deux seules actions qu'on ne peut pas défaire.
    expect(concernees.sort()).toEqual(['billing.refund', 'users.ban']);
  });

  it('exige un motif écrit pour ouvrir une pièce d’identité', () => {
    expect(requiresWrittenReason('kyc.view_document')).toBe(true);
    expect(requiresWrittenReason('users.edit')).toBe(true);
    expect(requiresWrittenReason('users.read')).toBe(false);
  });

  it('ne laisse que le SUPER_ADMIN distribuer des rôles', () => {
    expect(canGrantRoles(['SUPER_ADMIN'])).toBe(true);
    for (const role of ALL_ROLES.filter((candidat) => candidat !== 'SUPER_ADMIN')) {
      expect({ role, peut: canGrantRoles([role]) }).toEqual({ role, peut: false });
    }
  });
});
