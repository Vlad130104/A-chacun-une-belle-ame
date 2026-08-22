import { render, screen } from '@testing-library/react';
import InscriptionPage from './page';

/**
 * La page est un composant serveur asynchrone : on l'attend avant de la rendre.
 */
async function afficher(parametres: Record<string, string> = {}): Promise<void> {
  const arbre = await InscriptionPage({ searchParams: Promise.resolve(parametres) });
  render(arbre);
}

describe("page d'inscription", () => {
  it('annonce l’action dans un titre de niveau 1 unique', async () => {
    await afficher();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('demande le numéro et la date de naissance', async () => {
    await afficher();
    expect(screen.getByLabelText(/numéro de téléphone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date de naissance/i)).toBeInTheDocument();
  });

  it('exige les TROIS consentements obligatoires', async () => {
    // Conditions générales, confidentialité et charte : la loi impose de
    // conserver chaque acceptation, horodatée et versionnée.
    await afficher();
    expect(screen.getByRole('checkbox', { name: /conditions générales/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /confidentialité/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /charte/i })).toBeInTheDocument();
  });

  it('DÉSACTIVE l’envoi tant que les consentements ne sont pas donnés', async () => {
    // Le serveur refuserait de toute façon, mais laisser le bouton actif
    // enverrait la personne vers un échec évitable.
    await afficher();
    expect(screen.getByRole('button', { name: /recevoir mon code/i })).toBeDisabled();
  });

  it('rappelle la réserve aux personnes majeures, et sans ambiguïté', async () => {
    // Deux fois : sous le champ de date, et en mention finale. La répétition
    // est voulue — c'est la règle non négociable du produit.
    await afficher();
    expect(screen.getAllByText(/réservé aux personnes majeures/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/aucune exception n’est possible/i)).toBeInTheDocument();
  });

  it('n’affiche AUCUN champ d’âge — l’âge est déduit de la date par le serveur', async () => {
    // Un champ « âge » serait une valeur cliente, donc une valeur qui se ment.
    await afficher();
    expect(screen.queryByLabelText(/^âge$/i)).toBeNull();
  });

  it('accepte un code de campagne dans l’URL sans l’afficher comme un champ', async () => {
    // Le code circule par capture d'écran ; l'exposer en champ modifiable
    // inviterait à en essayer d'autres.
    await afficher({ invite: 'BELLEAME2026' });
    expect(screen.queryByDisplayValue('BELLEAME2026')).toBeNull();
  });
});
