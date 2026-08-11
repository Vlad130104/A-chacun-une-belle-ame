import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { ModerationActionType } from '../domain/case-policy';
import type { DecisionNotifier } from '../application/ports';

/**
 * Information du membre concerné par une décision (story D6-09).
 *
 * **Ce qui est réel ici :** la notification in-app est écrite en base et sera
 * lue par le centre de notifications. **Ce qui ne l'est pas encore :** aucun
 * envoi push ni e-mail n'a lieu — la file d'envoi multi-canal est la tranche D8.
 * L'écart est consigné dans docs/MOCKS.md ; rien dans l'interface ne doit
 * laisser croire qu'un message a été poussé.
 *
 * Règle de contenu : le membre apprend CE QUI LE CONCERNE — la mesure, le motif,
 * l'échéance — jamais qui l'a signalé, ni combien de fois. Révéler le signalant
 * exposerait une victime de harcèlement à des représailles.
 */
@Injectable()
export class PrismaDecisionNotifier implements DecisionNotifier {
  constructor(private readonly prisma: PrismaService) {}

  async notifyModerationDecision(input: {
    userId: string;
    action: ModerationActionType;
    reasonCode: string;
    effectiveUntil: Date | null;
    caseId: string;
    now: Date;
  }): Promise<void> {
    const { title, body } = compose(input.action, input.effectiveUntil);

    await this.prisma.notification.upsert({
      // Une décision par cas et par type : rejouer l'opération n'envoie pas deux
      // fois le même message au membre.
      where: {
        userId_dedupeKey: {
          userId: input.userId,
          dedupeKey: `moderation:${input.caseId}:${input.action}`,
        },
      },
      create: {
        userId: input.userId,
        type: 'MODERATION_ACTION',
        channel: 'IN_APP',
        title,
        body,
        // Le corps ne contient ni identifiant de signalant ni nombre de
        // signalements : seulement la mesure et son motif normalisé.
        data: { reasonCode: input.reasonCode, action: input.action },
        dedupeKey: `moderation:${input.caseId}:${input.action}`,
        createdAt: input.now,
      },
      update: {},
    });
  }

  async notifyReportAcknowledged(input: {
    reporterId: string;
    reportId: string;
    now: Date;
  }): Promise<void> {
    await this.prisma.notification.upsert({
      where: {
        userId_dedupeKey: {
          userId: input.reporterId,
          dedupeKey: `report-ack:${input.reportId}`,
        },
      },
      create: {
        userId: input.reporterId,
        type: 'REPORT_UPDATED',
        channel: 'IN_APP',
        title: 'Signalement bien reçu',
        body: 'Notre équipe examine votre signalement. Vous serez informé de son traitement.',
        dedupeKey: `report-ack:${input.reportId}`,
        createdAt: input.now,
      },
      update: {},
    });
  }
}

/**
 * Formulation destinée au membre.
 *
 * Ton neutre et factuel, sans jugement moral : le membre doit comprendre ce qui
 * s'applique et pendant combien de temps. Le détail des faits reste au dossier.
 */
function compose(
  action: ModerationActionType,
  effectiveUntil: Date | null,
): { title: string; body: string } {
  const echeance =
    effectiveUntil === null
      ? ''
      : ` Cette mesure s’applique jusqu’au ${effectiveUntil.toISOString().slice(0, 10)}.`;

  switch (action) {
    case 'WARNING':
      return {
        title: 'Avertissement',
        body: 'Un contenu ou un comportement signalé sur votre compte ne respecte pas nos règles de communauté.',
      };
    case 'TEMPORARY_RESTRICTION':
      return {
        title: 'Compte temporairement limité',
        body: `Certaines fonctionnalités de votre compte sont suspendues.${echeance}`,
      };
    case 'SUSPENSION':
      return {
        title: 'Compte suspendu',
        body: `Votre compte est suspendu à la suite d’un examen de nos équipes.${echeance}`,
      };
    case 'BAN':
      return {
        title: 'Compte fermé',
        body: 'Votre compte a été fermé définitivement pour non-respect de nos règles de communauté.',
      };
    case 'REVERIFICATION_REQUIRED':
      return {
        title: 'Nouvelle vérification requise',
        body: 'Pour continuer à utiliser la plateforme, vous devez vérifier à nouveau votre identité.',
      };
    case 'PHOTO_HIDDEN':
      return {
        title: 'Photo retirée',
        body: 'Une de vos photos ne respecte pas nos règles et n’est plus visible.',
      };
    case 'CONTENT_REMOVED':
      return {
        title: 'Message retiré',
        body: 'Un de vos messages a été retiré car il ne respecte pas nos règles.',
      };
    case 'INFORMATION_REQUEST':
      return {
        title: 'Information demandée',
        body: 'Notre équipe a besoin d’un complément d’information au sujet de votre compte.',
      };
    // Un classement sans suite et une escalade interne ne concernent pas le
    // membre : ces branches ne sont pas atteintes, le cas d'usage ne notifie que
    // les décisions qui produisent un effet visible.
    case 'DISMISSED':
    case 'ESCALATED':
      return {
        title: 'Mise à jour de votre compte',
        body: 'Aucune action n’est requise de votre part.',
      };
  }
}
