import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Inscription — À Chacun Une Belle Âme',
  description:
    'L’inscription ouvrira lorsque la vérification d’identité sera opérationnelle. Service strictement réservé aux personnes majeures.',
};

/**
 * Écran d'attente d'inscription.
 *
 * Il existe pour une raison précise : la page d'accueil pointait vers cette
 * adresse, qui n'existait pas. Mise en ligne, elle aurait offert un bouton
 * d'appel à l'action menant à une erreur 404 — la pire première impression
 * possible pour quelqu'un venu du groupe WhatsApp.
 *
 * Cette page n'est PAS le parcours d'inscription. Elle dit honnêtement où en est
 * le service plutôt que d'afficher un formulaire qui ne pourrait rien envoyer :
 * l'API n'est pas encore hébergée, et aucun SMS ne part tant qu'aucun
 * agrégateur n'est contractualisé — le code de validation n'arriverait jamais.
 *
 * Promettre une inscription qui échoue silencieusement coûterait plus cher que
 * de dire « pas encore » : la confiance est le produit.
 *
 * TODO(D1-02) : remplacer par le formulaire réel — numéro, date de naissance,
 * consentements versionnés — dès que l'API est jointe et le SMS branché.
 */
export default function InscriptionPage() {
  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_URL;

  return (
    <main>
      <h1>L’inscription n’est pas encore ouverte</h1>

      <p>
        La plateforme est en cours de préparation. Nous n’ouvrons pas les inscriptions tant que la
        vérification d’identité n’est pas pleinement opérationnelle : un compte non vérifié parmi
        des comptes vérifiés retirerait tout son sens au badge.
      </p>

      <section aria-labelledby="etapes">
        <h2 id="etapes">Ce qui se passera à l’ouverture</h2>

        <article className="carte">
          <h3>1. Votre numéro</h3>
          <p>
            Vous recevrez un code à six chiffres par SMS. Votre numéro n’apparaîtra jamais sur votre
            profil, et aucun autre membre ne pourra le voir.
          </p>
        </article>

        <article className="carte">
          <h3>2. Votre pièce d’identité</h3>
          <p>
            Une pièce officielle et un selfie, contrôlés par une équipe. Ces documents sont
            conservés séparément du reste de vos données, et supprimés après le délai légal.
          </p>
        </article>

        <article className="carte">
          <h3>3. Votre profil</h3>
          <p>
            Une fois l’identité vérifiée, vous complétez votre profil et accédez aux suggestions.
            Personne ne peut vous écrire avant que vous ayez manifesté un intérêt en retour.
          </p>
        </article>
      </section>

      {whatsapp === undefined ? null : (
        <p>
          <a className="bouton" href={whatsapp} rel="noopener noreferrer">
            Être prévenu à l’ouverture
          </a>
        </p>
      )}

      <p>
        <a href="/">Retour à l’accueil</a>
      </p>

      <p className="mention-majorite">
        Service strictement réservé aux personnes majeures. Une vérification d’identité sera
        obligatoire, sans exception.
      </p>
    </main>
  );
}
