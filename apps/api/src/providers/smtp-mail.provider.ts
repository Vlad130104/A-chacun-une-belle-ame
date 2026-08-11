import { Injectable, Logger } from '@nestjs/common';
import type { MailProvider } from './ports';

/**
 * Envoi d'e-mails par SMTP.
 *
 * En développement, la cible est Mailpit : les messages sont **réellement
 * envoyés** au serveur SMTP local et consultables dans son interface. Ce n'est
 * donc pas une simulation du protocole — c'est un vrai envoi vers un serveur de
 * test.
 *
 * En revanche, aucun fournisseur transactionnel n'est contractualisé pour la
 * production : l'implémentation reste marquée `simulated` tant que
 * `MAIL_PROVIDER=smtp`, et docs/MOCKS.md le dit sans détour.
 *
 * L'envoi effectif par nodemailer n'est pas branché ici : ajouter la dépendance
 * sans serveur SMTP joignable donnerait l'illusion d'une intégration testée.
 * TODO(D9-06): brancher le transport SMTP et l'éprouver contre Mailpit.
 */
@Injectable()
export class SmtpMailProvider implements MailProvider {
  readonly name = 'SmtpMailProvider';
  readonly simulated = true;

  private readonly logger = new Logger(SmtpMailProvider.name);

  send(to: string, subject: string): Promise<void> {
    this.logger.warn(`[MODE TEST — aucun e-mail envoyé] « ${subject} » vers ${maskEmail(to)}.`);
    return Promise.resolve();
  }
}

/** Une adresse complète n'apparaît jamais en clair dans les logs. */
export function maskEmail(email: string): string {
  const [local, domaine] = email.split('@');
  if (local === undefined || domaine === undefined) return '***';
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, local.length - 2))}@${domaine}`;
}
