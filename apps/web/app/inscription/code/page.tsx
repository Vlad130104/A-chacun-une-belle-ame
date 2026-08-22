import type { Metadata } from 'next';
import { FormulaireCode } from './formulaire';

export const metadata: Metadata = {
  title: 'Validation du code — À Chacun Une Belle Âme',
};

/**
 * Saisie du code reçu par SMS (story D1-04, tranche F1).
 *
 * Le bandeau « mode test » n'est PAS décoratif. Tant que l'envoi de SMS est
 * simulé, aucun code n'arrive sur le téléphone : sans cet avertissement, la
 * personne attendrait indéfiniment un message qui ne viendra pas. Le drapeau
 * vient du serveur, jamais d'une constante du client — c'est le serveur qui
 * sait si son fournisseur est réel.
 */
export default async function CodePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametres = await searchParams;
  const defi = typeof parametres.defi === 'string' ? parametres.defi : null;
  const modeTest = parametres.test === '1';

  if (defi === null) {
    return (
      <main>
        <h1>Demande introuvable</h1>
        <p>
          Ce lien ne correspond à aucune demande en cours. Reprenez depuis le début, votre
          progression n’est pas perdue.
        </p>
        <p>
          <a className="bouton" href="/inscription">
            Recommencer l’inscription
          </a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Entrez le code reçu</h1>

      {modeTest ? (
        <p role="status" className="erreur">
          <strong>Mode test — aucun SMS n’est envoyé.</strong> La plateforme n’est pas encore reliée
          à un opérateur : le code est visible dans les journaux du serveur. Cette inscription ne
          crée pas un compte utilisable.
        </p>
      ) : (
        <p>Un code à six chiffres vient d’être envoyé par SMS. Il est valable quelques minutes.</p>
      )}

      <FormulaireCode challengeId={defi} />

      <p>
        <a href="/inscription">Modifier mon numéro</a>
      </p>
    </main>
  );
}
