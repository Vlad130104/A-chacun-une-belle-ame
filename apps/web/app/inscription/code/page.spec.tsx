import { render, screen } from '@testing-library/react';
import CodePage from './page';

async function afficher(parametres: Record<string, string> = {}): Promise<void> {
  const arbre = await CodePage({ searchParams: Promise.resolve(parametres) });
  render(arbre);
}

describe('page de validation du code', () => {
  it('demande le code quand une demande est en cours', async () => {
    await afficher({ defi: 'defi-1' });
    expect(screen.getByLabelText(/code à six chiffres/i)).toBeInTheDocument();
  });

  it('AVERTIT qu’aucun SMS ne part en mode test', async () => {
    // Sans cet avertissement, la personne attendrait indéfiniment un message
    // qui ne viendra jamais. Le drapeau vient du serveur, pas du client.
    await afficher({ defi: 'defi-1', test: '1' });
    expect(screen.getByText(/aucun SMS n’est envoyé/i)).toBeInTheDocument();
  });

  it('n’affiche PAS le bandeau de test quand le SMS est réel', async () => {
    await afficher({ defi: 'defi-1' });
    expect(screen.queryByText(/aucun SMS n’est envoyé/i)).toBeNull();
  });

  it('propose de recommencer plutôt que d’échouer sans issue', async () => {
    await afficher();
    expect(screen.getByRole('link', { name: /recommencer/i })).toHaveAttribute(
      'href',
      '/inscription',
    );
  });

  it('n’affiche aucun champ de code sans demande en cours', async () => {
    await afficher();
    expect(screen.queryByLabelText(/code à six chiffres/i)).toBeNull();
  });
});
