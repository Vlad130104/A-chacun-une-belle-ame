/**
 * La règle centrale du produit (story D5-02).
 *
 * « La messagerie ne s'ouvre qu'après accord mutuel. » Tout le reste du produit
 * peut évoluer ; cette règle, non. Elle est écrite ici, en fonction pure, pour une
 * raison précise : elle doit être appliquée à l'identique par la route HTTP et par
 * l'événement Socket.IO. Deux implémentations, ce serait deux comportements, donc
 * un jour une faille sur le canal qu'on aura oublié de relire.
 *
 * Voir docs/05-api.md §6 pour la formulation contractuelle.
 */

export type MessagingDenial =
  /** Aucun match, ou match rompu : il n'y a pas d'accord mutuel actif. */
  | 'NO_MATCH'
  /** L'appelant n'est pas membre de cette conversation. */
  | 'NOT_A_MEMBER'
  /** Conversation verrouillée : blocage, unmatch ou décision de modération. */
  | 'CONVERSATION_LOCKED'
  /** Un blocage existe, dans un sens ou dans l'autre. */
  | 'BLOCKED'
  /** L'un des deux comptes n'est plus actif. */
  | 'ACCOUNT_NOT_ACTIVE'
  /** L'un des deux comptes n'est plus vérifié. */
  | 'NOT_VERIFIED'
  /** Trop de messages consécutifs sans réponse (story D5-07). */
  | 'AWAITING_REPLY';

export type MessagingVerdict = { allowed: true } | { allowed: false; reason: MessagingDenial };

export interface ConversationMemberState {
  userId: string;
  accountStatus: string;
  verificationStatus: string;
}

/**
 * Tout ce dont la règle a besoin, et rien d'autre. Le dépôt charge exactement ces
 * champs en une requête : la règle ne déclenche jamais de lecture supplémentaire.
 */
export interface MessagingContext {
  callerId: string;
  conversationStatus: string;
  matchStatus: string;
  members: ConversationMemberState[];
  blockedEitherWay: boolean;
}

/**
 * Accès en LECTURE à une conversation.
 *
 * Volontairement aussi strict que l'écriture sur tout sauf la limite anti-spam :
 * un membre bloqué ne doit pas continuer à relire l'historique de l'autre.
 */
export function checkConversationAccess(context: MessagingContext): MessagingVerdict {
  const caller = context.members.find((member) => member.userId === context.callerId);
  if (caller === undefined) return refuse('NOT_A_MEMBER');

  // Une conversation n'existe que par un match ; un match rompu ferme la porte,
  // même si le verrouillage de la conversation n'a pas encore été propagé.
  if (context.matchStatus !== 'ACTIVE') return refuse('NO_MATCH');
  if (context.conversationStatus !== 'OPEN') return refuse('CONVERSATION_LOCKED');
  if (context.blockedEitherWay) return refuse('BLOCKED');

  // Les DEUX comptes, pas seulement l'appelant : écrire à quelqu'un qui vient
  // d'être suspendu n'a pas de sens, et le lui laisser croire encore moins.
  for (const member of context.members) {
    if (member.accountStatus !== 'ACTIVE') return refuse('ACCOUNT_NOT_ACTIVE');
    if (member.verificationStatus !== 'VERIFIED') return refuse('NOT_VERIFIED');
  }

  return { allowed: true };
}

export interface SendMessageContext extends MessagingContext {
  /** Messages consécutifs déjà envoyés par l'appelant sans réponse de l'autre. */
  unansweredStreak: number;
  unansweredLimit: number;
}

/**
 * Accès en ÉCRITURE. Ajoute la seule règle propre à l'envoi : la limite de messages
 * consécutifs sans réponse, qui protège du harcèlement par volume sans exiger que
 * la victime signale quoi que ce soit.
 */
export function checkCanSendMessage(context: SendMessageContext): MessagingVerdict {
  const acces = checkConversationAccess(context);
  if (!acces.allowed) return acces;

  if (context.unansweredStreak >= context.unansweredLimit) return refuse('AWAITING_REPLY');

  return { allowed: true };
}

function refuse(reason: MessagingDenial): MessagingVerdict {
  return { allowed: false, reason };
}

export interface DeletableMessage {
  senderId: string;
  deletedAt: Date | null;
}

/**
 * Suppression logique par l'auteur (story D5-08).
 *
 * Aucune fenêtre de temps : un membre qui regrette un message doit pouvoir le
 * retirer, même tardivement. La ligne survit pour la modération, seul le corps
 * est effacé — c'est ce que la vue rendue au destinataire reflète.
 */
export function canDeleteMessage(message: DeletableMessage, callerId: string): boolean {
  return message.senderId === callerId && message.deletedAt === null;
}

/**
 * Nouvelle valeur de la série de messages sans réponse.
 *
 * Elle se remet à zéro dès que l'autre membre écrit : c'est bien une série
 * consécutive, pas un total. Deux personnes qui s'écrivent beaucoup ne sont jamais
 * pénalisées ; une personne qui écrit seule vingt fois l'est.
 */
export function nextUnansweredStreak(
  currentStreak: number,
  lastSenderId: string | null,
  senderId: string,
): number {
  return lastSenderId === senderId ? currentStreak + 1 : 1;
}

/** Le statut de remise ne recule jamais : SENT → DELIVERED → READ (story D5-03). */
const RANG_STATUT: Record<string, number> = { SENT: 0, DELIVERED: 1, READ: 2 };

export function advanceDeliveryStatus(current: string, candidate: string): string {
  const rangActuel = RANG_STATUT[current] ?? 0;
  const rangCandidat = RANG_STATUT[candidate] ?? 0;
  return rangCandidat > rangActuel ? candidate : current;
}
