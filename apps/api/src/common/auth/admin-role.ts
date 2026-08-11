import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../errors/business.error';
import { auditRole } from '../../modules/backoffice/domain/permissions';
import type { AuthenticatedUser } from './auth.guard';

/**
 * Rôle inscrit au journal d'audit pour l'auteur d'une action (story E-01).
 *
 * Deux décisions tiennent dans cette fonction.
 *
 * **Le rôle le plus faible réellement détenu.** Un compte peut en porter
 * plusieurs ; le journal ne doit pas surestimer le pouvoir de l'auteur d'une
 * action. `ALL_ROLES` est ordonné du plus puissant au plus restreint.
 *
 * **Aucun rôle par défaut.** Un appelant sans rôle sur une route auditée est une
 * anomalie — le garde ne l'y aurait pas laissé entrer. Inscrire un `SUPPORT` de
 * consolation produirait une ligne d'audit FAUSSE, qui attribuerait l'action à
 * une habilitation que personne ne détient. On refuse la requête à la place :
 * une action sensible sans auteur identifiable n'a pas lieu.
 */
export function requireAuditRole(user: AuthenticatedUser): string {
  const role = auditRole(user.roles);
  if (role === null) throw BusinessError.forbidden(ErrorCode.AUTH_FORBIDDEN);
  return role;
}
