export const CACHE_PROBE = Symbol('CacheProbe');

/**
 * Sonde du cache, déclarée par son consommateur (story E-03).
 *
 * Le module de santé n'a pas à connaître Redis, ni à ouvrir sa propre
 * connexion : une seconde connexion vérifierait la santé d'un lien que le
 * service n'utilise pas. Le port est donc implémenté par le composant qui
 * détient la connexion réellement employée — le compteur de limitation de
 * débit.
 */
export interface CacheProbe {
  /** Rejette si le cache est injoignable. */
  ping(): Promise<void>;
}
