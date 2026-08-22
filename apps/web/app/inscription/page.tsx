import type { Metadata } from 'next';
import { FormulaireInscription } from './formulaire';

export const metadata: Metadata = {
  title: 'Créer mon compte — À Chacun Une Belle Âme',
  description:
    'Inscription réservée aux personnes majeures. Vérification d’identité obligatoire avant activation du compte.',
};

/**
 * Écran d'inscription (tranche F1).
 *
 * La page est rendue côté serveur, le formulaire seul est interactif : sur un
 * téléphone d'entrée de gamme, le texte s'affiche avant que le JavaScript ne
 * soit chargé, et la lecture peut commencer.
 *
 * Le code de campagne arrive par l'URL (`?invite=…`), tel qu'il circule dans le
 * groupe WhatsApp. Il est transmis au serveur **sans être interprété ici** :
 * c'est le serveur qui décide s'il correspond à un lien utilisable, et un code
 * invalide n'empêche jamais l'inscription.
 */
export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametres = await searchParams;
  const brut = parametres.invite;
  const invite = typeof brut === 'string' && brut.length > 0 ? brut : undefined;

  return (
    <main>
      <h1>Créer mon compte</h1>

      <p>
        Trois étapes : votre numéro, votre pièce d’identité, puis votre profil. Comptez une dizaine
        de minutes, et une attente pour la vérification.
      </p>

      <FormulaireInscription {...(invite === undefined ? {} : { inviteCode: invite })} />

      <p className="mention-majorite">
        Service strictement réservé aux personnes majeures. L’âge est vérifié à partir d’une pièce
        d’identité officielle : aucune exception n’est possible.
      </p>
    </main>
  );
}
