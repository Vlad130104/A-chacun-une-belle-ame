import { describe, expect, it } from '@jest/globals';
import {
  advanceDeliveryStatus,
  canDeleteMessage,
  checkCanSendMessage,
  checkConversationAccess,
  nextUnansweredStreak,
  type MessagingContext,
  type SendMessageContext,
} from './messaging-policy';

const membreActif = (userId: string) => ({
  userId,
  accountStatus: 'ACTIVE',
  verificationStatus: 'VERIFIED',
});

const contexte = (surcharge: Partial<MessagingContext> = {}): MessagingContext => ({
  callerId: 'alice',
  conversationStatus: 'OPEN',
  matchStatus: 'ACTIVE',
  members: [membreActif('alice'), membreActif('bob')],
  blockedEitherWay: false,
  ...surcharge,
});

const contexteEnvoi = (surcharge: Partial<SendMessageContext> = {}): SendMessageContext => ({
  ...contexte(),
  unansweredStreak: 0,
  unansweredLimit: 20,
  ...surcharge,
});

describe('règle centrale — pas de messagerie sans accord mutuel actif', () => {
  it('autorise deux membres matchés, vérifiés et actifs', () => {
    expect(checkConversationAccess(contexte())).toEqual({ allowed: true });
  });

  it('refuse un appelant qui n’est pas membre de la conversation', () => {
    expect(checkConversationAccess(contexte({ callerId: 'charlie' }))).toEqual({
      allowed: false,
      reason: 'NOT_A_MEMBER',
    });
  });

  it.each([['UNMATCHED'], ['CLOSED_BY_MODERATION']])('refuse un match %s', (statut) => {
    expect(checkConversationAccess(contexte({ matchStatus: statut }))).toEqual({
      allowed: false,
      reason: 'NO_MATCH',
    });
  });

  it('refuse avant même le verrouillage si le match est rompu', () => {
    // Le verrouillage de la conversation est une conséquence, pas la condition :
    // si la propagation traîne, la règle tient quand même.
    const verdict = checkConversationAccess(
      contexte({ matchStatus: 'UNMATCHED', conversationStatus: 'OPEN' }),
    );
    expect(verdict).toEqual({ allowed: false, reason: 'NO_MATCH' });
  });

  it.each([['LOCKED_BY_BLOCK'], ['LOCKED_BY_UNMATCH'], ['LOCKED_BY_MODERATION'], ['ARCHIVED']])(
    'refuse une conversation %s',
    (statut) => {
      expect(checkConversationAccess(contexte({ conversationStatus: statut }))).toEqual({
        allowed: false,
        reason: 'CONVERSATION_LOCKED',
      });
    },
  );

  it('refuse la LECTURE aussi quand un blocage existe', () => {
    // Un membre bloqué ne doit pas continuer à relire l'historique de l'autre.
    expect(checkConversationAccess(contexte({ blockedEitherWay: true }))).toEqual({
      allowed: false,
      reason: 'BLOCKED',
    });
  });

  it.each([['PAUSED'], ['SUSPENDED'], ['BANNED'], ['RESTRICTED'], ['PENDING_DELETION']])(
    'refuse quand le compte de l’AUTRE membre est %s',
    (statut) => {
      const membres = [membreActif('alice'), { ...membreActif('bob'), accountStatus: statut }];
      expect(checkConversationAccess(contexte({ members: membres }))).toEqual({
        allowed: false,
        reason: 'ACCOUNT_NOT_ACTIVE',
      });
    },
  );

  it('refuse quand la vérification d’un membre a été révoquée', () => {
    const membres = [
      membreActif('alice'),
      { ...membreActif('bob'), verificationStatus: 'SUSPENDED' },
    ];
    expect(checkConversationAccess(contexte({ members: membres }))).toEqual({
      allowed: false,
      reason: 'NOT_VERIFIED',
    });
  });
});

describe('envoi de message', () => {
  it('autorise un envoi dans une conversation saine', () => {
    expect(checkCanSendMessage(contexteEnvoi())).toEqual({ allowed: true });
  });

  it('hérite intégralement des refus de lecture', () => {
    expect(checkCanSendMessage(contexteEnvoi({ blockedEitherWay: true }))).toEqual({
      allowed: false,
      reason: 'BLOCKED',
    });
  });

  it('refuse au-delà de la limite de messages sans réponse', () => {
    expect(checkCanSendMessage(contexteEnvoi({ unansweredStreak: 20 }))).toEqual({
      allowed: false,
      reason: 'AWAITING_REPLY',
    });
  });

  it('autorise le dernier message avant la limite', () => {
    expect(checkCanSendMessage(contexteEnvoi({ unansweredStreak: 19 }))).toEqual({ allowed: true });
  });

  it('fait primer l’absence de match sur la limite anti-spam', () => {
    // L'ordre compte : annoncer « attendez une réponse » à quelqu'un dont le match
    // est rompu lui ferait croire que la conversation existe encore.
    const verdict = checkCanSendMessage(
      contexteEnvoi({ matchStatus: 'UNMATCHED', unansweredStreak: 99 }),
    );
    expect(verdict).toEqual({ allowed: false, reason: 'NO_MATCH' });
  });
});

describe('série de messages sans réponse', () => {
  it('incrémente quand le même membre écrit à nouveau', () => {
    expect(nextUnansweredStreak(3, 'alice', 'alice')).toBe(4);
  });

  it('repart à un dès que l’autre membre répond', () => {
    expect(nextUnansweredStreak(19, 'alice', 'bob')).toBe(1);
  });

  it('vaut un pour le tout premier message', () => {
    expect(nextUnansweredStreak(0, null, 'alice')).toBe(1);
  });
});

describe('suppression d’un message', () => {
  it('autorise l’auteur', () => {
    expect(canDeleteMessage({ senderId: 'alice', deletedAt: null }, 'alice')).toBe(true);
  });

  it('refuse le destinataire', () => {
    // Supprimer le message d'autrui effacerait une preuve pour la modération.
    expect(canDeleteMessage({ senderId: 'alice', deletedAt: null }, 'bob')).toBe(false);
  });

  it('refuse une seconde suppression', () => {
    expect(canDeleteMessage({ senderId: 'alice', deletedAt: new Date() }, 'alice')).toBe(false);
  });
});

describe('statut de remise', () => {
  it('avance de SENT à DELIVERED puis READ', () => {
    expect(advanceDeliveryStatus('SENT', 'DELIVERED')).toBe('DELIVERED');
    expect(advanceDeliveryStatus('DELIVERED', 'READ')).toBe('READ');
  });

  it('ne recule jamais', () => {
    // Un accusé de réception en retard ne doit pas repasser un message lu en « livré ».
    expect(advanceDeliveryStatus('READ', 'DELIVERED')).toBe('READ');
    expect(advanceDeliveryStatus('DELIVERED', 'SENT')).toBe('DELIVERED');
  });

  it('ignore un statut inconnu plutôt que de régresser', () => {
    expect(advanceDeliveryStatus('READ', 'INCONNU')).toBe('READ');
  });
});
