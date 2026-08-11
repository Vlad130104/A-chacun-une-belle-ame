/**
 * Barèmes de limitation de débit, par clé de route (story E-02).
 *
 * Jusqu'à la phase E, `@Auth({ rateLimit: '…' })` était une **déclaration sans
 * effet** : la métadonnée était posée sur quinze routes et lue par personne. La
 * documentation annonçait des routes protégées ; elles ne l'étaient pas. C'est
 * la deuxième leçon de cette phase — une intention déclarée dans un décorateur
 * n'est une protection que si quelque chose la lit.
 *
 * Le barème vit dans une table pure, séparée du garde, pour trois raisons :
 * il se teste sans Redis, il se relit d'un coup d'œil en revue de sécurité, et
 * un test d'inventaire peut vérifier que toute clé déclarée sur une route y
 * figure — une faute de frappe ne peut donc pas faire retomber une route
 * sensible sur le barème par défaut.
 */

export interface RateLimitRule {
  /** Nombre de requêtes autorisées dans la fenêtre. */
  limit: number;
  windowSeconds: number;
  /**
   * Compter par adresse IP plutôt que par compte.
   *
   * Réservé aux routes atteignables sans session : il n'y a alors pas de compte
   * à qui imputer les appels. Partout ailleurs, compter par IP punirait tout un
   * cybercafé ou tout un réseau mobile partageant une sortie NAT — situation
   * courante dans les pays visés.
   */
  byIp?: boolean;
}

const MINUTE = 60;
const HEURE = 3600;
const JOUR = 86_400;

export const RATE_LIMIT_RULES: Record<string, RateLimitRule> = {
  // ── Écritures fréquentes et peu coûteuses ────────────────────────────────
  'conversations.list': { limit: 60, windowSeconds: MINUTE },
  'conversations.messages': { limit: 120, windowSeconds: MINUTE },
  'conversations.read': { limit: 120, windowSeconds: MINUTE },
  'notifications.list': { limit: 60, windowSeconds: MINUTE },

  // ── Écritures qui coûtent à quelqu'un d'autre ────────────────────────────
  //
  // Un message envoyé arrive chez une personne réelle : la limite protège la
  // destinataire du harcèlement en rafale, pas seulement le serveur.
  'conversations.send': { limit: 30, windowSeconds: MINUTE },
  'conversations.attachment': { limit: 10, windowSeconds: MINUTE },
  'discovery.like': { limit: 60, windowSeconds: HEURE },

  // ── Lectures coûteuses ──────────────────────────────────────────────────
  'discovery.suggestions': { limit: 60, windowSeconds: HEURE },

  // ── Souscription ────────────────────────────────────────────────────────
  //
  // Chaque appel ouvre une intention de paiement chez un prestataire. Un barème
  // large produirait des dizaines de transactions orphelines à rapprocher.
  'billing.subscribe': { limit: 10, windowSeconds: HEURE },

  // ── Réglages ────────────────────────────────────────────────────────────
  'notifications.preferences': { limit: 20, windowSeconds: HEURE },
  'devices.register': { limit: 20, windowSeconds: HEURE },
  'referral.me': { limit: 30, windowSeconds: HEURE },

  // ── Signalement : volontairement GÉNÉREUX ───────────────────────────────
  //
  // Signaler est une fonction de sécurité. Une limite serrée ferait taire
  // quelqu'un qui subit une série d'abus au moment précis où il doit pouvoir
  // parler. Le garde-fou contre le signalement abusif est ailleurs — quota
  // métier journalier et traitement en modération —, pas ici.
  'reports.create': { limit: 30, windowSeconds: HEURE },
  'reports.evidence': { limit: 60, windowSeconds: HEURE },

  // ── Second facteur d'administration ─────────────────────────────────────
  //
  // Serré : une confirmation TOTP se devine à six chiffres. Le compteur porte
  // sur le compte administrateur, pas sur l'IP — un administrateur ne doit pas
  // pouvoir être bloqué par le bruit d'un réseau partagé.
  'admin.2fa.enroll': { limit: 5, windowSeconds: HEURE },
  'admin.2fa.confirm': { limit: 10, windowSeconds: HEURE },

  // ── Routes publiques : par IP, faute de compte ──────────────────────────
  //
  // Ces quatre routes sont la seule surface atteignable sans jeton. Les
  // barèmes sont larges pour ne pas bloquer un cybercafé ou une sortie NAT
  // mobile, et serrés au regard d'un usage humain : personne ne s'inscrit
  // vingt fois par heure depuis le même point de sortie.
  'auth.register': { limit: 20, windowSeconds: HEURE, byIp: true },
  'auth.otp.verify': { limit: 30, windowSeconds: HEURE, byIp: true },
  'auth.refresh': { limit: 60, windowSeconds: HEURE, byIp: true },
  'invites.resolve': { limit: 60, windowSeconds: HEURE, byIp: true },
};

/**
 * Barème appliqué à une route qui déclare une clé inconnue.
 *
 * Il est volontairement **restrictif**. Une clé absente de la table est une
 * erreur de saisie ; retomber sur une limite large transformerait cette erreur
 * en absence silencieuse de protection, ce qui est exactement le défaut que
 * cette story corrige. Un test d'inventaire empêche par ailleurs le cas.
 */
export const DEFAULT_RULE: RateLimitRule = { limit: 20, windowSeconds: MINUTE };

export function ruleFor(key: string): RateLimitRule {
  return RATE_LIMIT_RULES[key] ?? DEFAULT_RULE;
}

/**
 * Clé de comptage.
 *
 * Par compte quand il y en a un, par IP sinon. Le préfixe de route est inclus :
 * envoyer beaucoup de messages ne doit pas épuiser le quota de signalement.
 */
export function counterKey(
  routeKey: string,
  rule: RateLimitRule,
  identity: { userId: string | null; ip: string | null },
): string {
  if (!rule.byIp && identity.userId !== null) return `${routeKey}:u:${identity.userId}`;
  return `${routeKey}:ip:${identity.ip ?? 'inconnue'}`;
}

/** Fenêtres exprimées en jours, pour la lisibilité des barèmes futurs. */
export const FENETRES = { MINUTE, HEURE, JOUR } as const;
