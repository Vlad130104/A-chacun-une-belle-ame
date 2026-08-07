/**
 * Écran 1 — page d'accueil (docs/07-parcours-ux.md §2.1).
 *
 * Objectif : convertir un membre du groupe WhatsApp en inscription, en moins de
 * 30 secondes sur réseau lent. Rendu statique, aucun appel API bloquant, aucune
 * police téléchargée.
 */
export default function AccueilPage() {
  return (
    <main>
      <h1>Rencontrez quelqu’un de sérieux, en toute confiance.</h1>

      <p>
        Une communauté de plus de 9 000 personnes qui cherchent une relation durable — désormais
        dans un espace vérifié, modéré et respectueux.
      </p>

      <section aria-labelledby="benefices">
        <h2 id="benefices">Ce qui change ici</h2>

        <article className="carte">
          <h3>Chaque membre est vérifié</h3>
          <p>
            Pièce d’identité et selfie contrôlés avant l’activation du compte. Le badge « Identité
            vérifiée » n’est pas décoratif : sans lui, aucun profil n’apparaît.
          </p>
        </article>

        <article className="carte">
          <h3>Personne ne vous écrit sans votre accord</h3>
          <p>
            La messagerie ne s’ouvre qu’après un intérêt réciproque. C’est une règle du système, pas
            un réglage à activer.
          </p>
        </article>

        <article className="carte">
          <h3>Une modération qui répond</h3>
          <p>
            Signalement en deux touches depuis n’importe quel profil ou conversation. Objectif de
            traitement : moins de 24 heures.
          </p>
        </article>
      </section>

      <p>
        <a className="bouton" href="/inscription">
          Créer mon compte
        </a>
      </p>

      <p className="mention-majorite">
        Service strictement réservé aux personnes majeures. Une vérification d’identité est
        obligatoire.
      </p>
    </main>
  );
}
