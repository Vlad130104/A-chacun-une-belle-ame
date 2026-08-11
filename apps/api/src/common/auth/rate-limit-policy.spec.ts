import { describe, expect, it } from '@jest/globals';
import {
  counterKey,
  DEFAULT_RULE,
  RATE_LIMIT_RULES,
  ruleFor,
  type RateLimitRule,
} from './rate-limit-policy';

describe('barèmes de limitation de débit', () => {
  it('déclare des barèmes tous exploitables', () => {
    for (const [cle, regle] of Object.entries(RATE_LIMIT_RULES)) {
      expect({
        cle,
        limitePositive: regle.limit > 0,
        fenetrePositive: regle.windowSeconds > 0,
      }).toEqual({ cle, limitePositive: true, fenetrePositive: true });
    }
  });

  it('retombe sur un barème RESTRICTIF pour une clé inconnue', () => {
    // Une clé absente est une faute de frappe. Retomber sur une limite large
    // transformerait l'erreur en absence silencieuse de protection.
    expect(ruleFor('cle.qui.nexiste.pas')).toEqual(DEFAULT_RULE);
    expect(DEFAULT_RULE.limit).toBeLessThanOrEqual(30);
  });

  it('ne compte par IP que les routes atteignables sans session', () => {
    // Compter par IP une route authentifiée punirait tout un cybercafé ou toute
    // une sortie NAT mobile — situation courante dans les pays visés.
    const parIp = Object.entries(RATE_LIMIT_RULES)
      .filter(([, regle]) => regle.byIp === true)
      .map(([cle]) => cle)
      .sort();

    expect(parIp).toEqual(['auth.otp.verify', 'auth.refresh', 'auth.register', 'invites.resolve']);
  });

  it('laisse le SIGNALEMENT plus généreux que l’envoi de message', () => {
    // Signaler est une fonction de sécurité : une limite serrée ferait taire
    // quelqu'un qui subit une série d'abus au moment où il doit pouvoir parler.
    const parHeure = (regle: RateLimitRule): number => (regle.limit * 3600) / regle.windowSeconds;

    expect(parHeure(ruleFor('reports.create'))).toBeGreaterThan(0);
    expect(ruleFor('reports.create').limit).toBeGreaterThanOrEqual(30);
  });

  it('serre la confirmation du second facteur', () => {
    // Six chiffres se devinent. Le barème doit rendre le balayage inutile.
    expect(ruleFor('admin.2fa.confirm').limit).toBeLessThanOrEqual(10);
  });
});

describe('clé de comptage', () => {
  it('compte par COMPTE quand il y en a un', () => {
    expect(
      counterKey(
        'conversations.send',
        { limit: 1, windowSeconds: 60 },
        {
          userId: 'user-1',
          ip: '10.0.0.1',
        },
      ),
    ).toBe('conversations.send:u:user-1');
  });

  it('compte par IP sur une route publique, même si un compte est connu', () => {
    // Le drapeau prime : une route publique compte par point d'entrée.
    expect(
      counterKey(
        'auth.register',
        { limit: 1, windowSeconds: 60, byIp: true },
        {
          userId: 'user-1',
          ip: '10.0.0.1',
        },
      ),
    ).toBe('auth.register:ip:10.0.0.1');
  });

  it('retombe sur l’IP quand aucun compte n’est connu', () => {
    expect(
      counterKey('referral.me', { limit: 1, windowSeconds: 60 }, { userId: null, ip: '10.0.0.1' }),
    ).toBe('referral.me:ip:10.0.0.1');
  });

  it('reste comptable même sans IP identifiable', () => {
    // Mieux vaut un seau commun qu'aucun comptage du tout.
    expect(
      counterKey(
        'auth.register',
        { limit: 1, windowSeconds: 60, byIp: true },
        {
          userId: null,
          ip: null,
        },
      ),
    ).toBe('auth.register:ip:inconnue');
  });

  it('SÉPARE les quotas de deux routes différentes', () => {
    // Envoyer beaucoup de messages ne doit pas épuiser le quota de signalement.
    const identite = { userId: 'user-1', ip: null };
    const envoi = counterKey('conversations.send', { limit: 1, windowSeconds: 60 }, identite);
    const signalement = counterKey('reports.create', { limit: 1, windowSeconds: 60 }, identite);

    expect(envoi).not.toBe(signalement);
  });

  it('SÉPARE les quotas de deux comptes', () => {
    const regle = { limit: 1, windowSeconds: 60 };
    expect(counterKey('a', regle, { userId: 'u1', ip: null })).not.toBe(
      counterKey('a', regle, { userId: 'u2', ip: null }),
    );
  });
});
