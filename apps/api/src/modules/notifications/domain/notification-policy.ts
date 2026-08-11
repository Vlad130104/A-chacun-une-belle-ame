/**
 * Règles de notification (stories D8-02, D8-03, D8-04, D8-06).
 *
 * Le principe qui commande tout le fichier : **une notification de sécurité ne
 * se désactive pas**. L'interface les affichera verrouillées, mais l'interface
 * n'est pas le contrôle — un appel direct à l'API est refusé de la même façon,
 * et c'est cela qui est testé.
 */

export type NotificationType =
  | 'OTP_CODE'
  | 'VERIFICATION_APPROVED'
  | 'VERIFICATION_REJECTED'
  | 'VERIFICATION_ADDITIONAL'
  | 'NEW_MATCH'
  | 'NEW_MESSAGE'
  | 'NEW_INTEREST'
  | 'PROFILE_INCOMPLETE'
  | 'PHOTO_APPROVED'
  | 'PHOTO_REJECTED'
  | 'REPORT_UPDATED'
  | 'MODERATION_ACTION'
  | 'SUBSCRIPTION_RENEWED'
  | 'SUBSCRIPTION_FAILED'
  | 'SUBSCRIPTION_EXPIRING'
  | 'SECURITY_ALERT'
  | 'ACCOUNT_DELETION_REMINDER';

export type NotificationChannel = 'IN_APP' | 'PUSH' | 'EMAIL' | 'SMS';

export const ALL_CHANNELS: NotificationChannel[] = ['IN_APP', 'PUSH', 'EMAIL', 'SMS'];

/**
 * Types que le membre ne peut pas désactiver (story D8-04).
 *
 * Le critère est simple : la notification protège le membre ou l'informe d'une
 * décision qui le concerne. La couper reviendrait à laisser quelqu'un ignorer
 * qu'on a tenté d'entrer dans son compte, ou qu'il a été sanctionné.
 */
const TYPES_OBLIGATOIRES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'OTP_CODE',
  'SECURITY_ALERT',
  'VERIFICATION_APPROVED',
  'VERIFICATION_REJECTED',
  'VERIFICATION_ADDITIONAL',
  'MODERATION_ACTION',
]);

export function isMandatory(type: NotificationType): boolean {
  return TYPES_OBLIGATOIRES.has(type);
}

export function mandatoryTypes(): NotificationType[] {
  return [...TYPES_OBLIGATOIRES];
}

/**
 * Les 8 déclencheurs du MVP (story D8-02).
 *
 * Volontairement peu nombreux : une plateforme qui notifie tout n'est plus
 * consultée, et le membre finit par tout couper — y compris ce qui compte.
 */
export const MVP_TRIGGERS: NotificationType[] = [
  'NEW_MATCH',
  'NEW_INTEREST',
  'NEW_MESSAGE',
  'VERIFICATION_APPROVED',
  'VERIFICATION_REJECTED',
  'MODERATION_ACTION',
  'SUBSCRIPTION_FAILED',
  'SECURITY_ALERT',
];

export const MVP_TRIGGER_COUNT = 8;

/**
 * Canaux par défaut d'un type.
 *
 * `IN_APP` est toujours présent : c'est le seul canal dont la livraison ne
 * dépend d'aucun tiers, et le centre de notifications doit rester un historique
 * complet même si un push a échoué.
 *
 * `SMS` n'est réservé qu'à l'OTP : c'est un canal coûteux, et sur les marchés
 * visés, en abuser reviendrait à faire payer l'utilisateur pour du marketing.
 */
const CANAUX_PAR_DEFAUT: Record<NotificationType, NotificationChannel[]> = {
  OTP_CODE: ['SMS'],
  SECURITY_ALERT: ['IN_APP', 'PUSH', 'EMAIL'],
  VERIFICATION_APPROVED: ['IN_APP', 'PUSH'],
  VERIFICATION_REJECTED: ['IN_APP', 'PUSH'],
  VERIFICATION_ADDITIONAL: ['IN_APP', 'PUSH'],
  MODERATION_ACTION: ['IN_APP', 'PUSH'],
  NEW_MATCH: ['IN_APP', 'PUSH'],
  NEW_INTEREST: ['IN_APP', 'PUSH'],
  NEW_MESSAGE: ['IN_APP', 'PUSH'],
  PROFILE_INCOMPLETE: ['IN_APP'],
  PHOTO_APPROVED: ['IN_APP'],
  PHOTO_REJECTED: ['IN_APP', 'PUSH'],
  REPORT_UPDATED: ['IN_APP'],
  SUBSCRIPTION_RENEWED: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_FAILED: ['IN_APP', 'PUSH', 'EMAIL'],
  SUBSCRIPTION_EXPIRING: ['IN_APP', 'EMAIL'],
  ACCOUNT_DELETION_REMINDER: ['IN_APP', 'EMAIL'],
};

export function defaultChannels(type: NotificationType): NotificationChannel[] {
  return CANAUX_PAR_DEFAUT[type];
}

export interface PreferenceEntry {
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface DeliveryContext {
  hasPushToken: boolean;
  hasVerifiedEmail: boolean;
  hasPhone: boolean;
}

/**
 * Canaux réellement utilisables pour une notification donnée.
 *
 * Trois filtres se composent, dans cet ordre :
 *  1. les canaux prévus pour ce type ;
 *  2. ceux que le membre n'a pas désactivés — sauf si le type est obligatoire,
 *     auquel cas la préférence est ignorée ;
 *  3. ceux dont le moyen technique existe (jeton push enregistré, e-mail
 *     vérifié, numéro connu).
 *
 * Le troisième filtre est le plus souvent oublié : envoyer un push à un membre
 * sans jeton produit un échec permanent que la file réessaiera indéfiniment.
 */
export function resolveChannels(
  type: NotificationType,
  preferences: PreferenceEntry[],
  context: DeliveryContext,
): NotificationChannel[] {
  const obligatoire = isMandatory(type);

  return defaultChannels(type).filter((canal) => {
    if (!obligatoire) {
      const preference = preferences.find(
        (entree) => entree.type === type && entree.channel === canal,
      );
      if (preference !== undefined && !preference.enabled) return false;
    }

    switch (canal) {
      case 'PUSH':
        return context.hasPushToken;
      case 'EMAIL':
        return context.hasVerifiedEmail;
      case 'SMS':
        return context.hasPhone;
      case 'IN_APP':
        return true;
    }
  });
}

export type PreferenceRefusal = 'MANDATORY_TYPE';

export type PreferenceVerdict = { allowed: true } | { allowed: false; reason: PreferenceRefusal };

/**
 * Un membre peut-il modifier cette préférence ?
 *
 * ACTIVER reste toujours possible : la restriction ne porte que sur la
 * désactivation d'un type obligatoire. Refuser aussi l'activation serait absurde
 * et empêcherait de revenir en arrière après une désactivation antérieure.
 */
export function checkPreferenceUpdate(type: NotificationType, enabled: boolean): PreferenceVerdict {
  if (!enabled && isMandatory(type)) return { allowed: false, reason: 'MANDATORY_TYPE' };
  return { allowed: true };
}

/**
 * Clé d'anti-doublon (story D8-06).
 *
 * Elle décrit **l'événement**, pas l'instant : deux tentatives d'envoi du même
 * fait produisent la même clé, et la contrainte unique `(userId, dedupeKey)`
 * fait le reste. Une clé qui contiendrait l'horodatage ne dédupliquerait rien.
 */
export function dedupeKey(type: NotificationType, subjectId: string): string {
  return `${type.toLowerCase()}:${subjectId}`;
}

/**
 * Fenêtre de regroupement des messages.
 *
 * Recevoir une notification par message d'une conversation active est
 * insupportable et fait couper le canal. On regroupe donc par conversation et
 * par tranche horaire : un membre reçoit au plus une notification par
 * conversation et par heure.
 */
export function messageDedupeKey(conversationId: string, now: Date): string {
  const tranche = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate(),
  ).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}`;
  return `new_message:${conversationId}:${tranche}`;
}

/** Rétention d'une notification lue ou non : purge automatique après N jours. */
export function purgeAt(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() + retentionDays * 86_400_000);
}
