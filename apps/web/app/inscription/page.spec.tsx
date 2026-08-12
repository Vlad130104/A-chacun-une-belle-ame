import { render, screen } from '@testing-library/react';
import InscriptionPage from './page';

/**
 * Cette page existe pour qu'un bouton d'appel à l'action ne mène pas à une
 * erreur 404. Les tests vérifient donc surtout ce qu'elle NE promet PAS.
 */
describe("page d'inscription", () => {
  it('dit clairement que l’inscription n’est pas ouverte', () => {
    render(<InscriptionPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/pas encore ouverte/i);
  });

  it('n’affiche AUCUN formulaire tant que rien ne peut être envoyé', () => {
    // Un formulaire qui échoue en silence coûterait plus cher qu'un « pas
    // encore » : ni l'API ni l'envoi de SMS ne sont en place, le code de
    // validation n'arriverait jamais.
    const { container } = render(<InscriptionPage />);
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('rappelle la réserve aux personnes majeures', () => {
    render(<InscriptionPage />);
    expect(screen.getByText(/réservé aux personnes majeures/i)).toBeInTheDocument();
  });

  it('annonce la vérification d’identité comme obligatoire', () => {
    render(<InscriptionPage />);
    expect(screen.getByText(/obligatoire, sans exception/i)).toBeInTheDocument();
  });

  it('permet de revenir à l’accueil', () => {
    render(<InscriptionPage />);
    expect(screen.getByRole('link', { name: /retour à l’accueil/i })).toHaveAttribute('href', '/');
  });

  it('n’affiche aucun lien externe quand aucune adresse n’est configurée', () => {
    // Le lien WhatsApp vient d'une variable d'environnement : pas de valeur
    // inventée dans le code, et rien d'affiché tant qu'elle est absente.
    render(<InscriptionPage />);
    expect(screen.queryByRole('link', { name: /être prévenu/i })).toBeNull();
  });
});
