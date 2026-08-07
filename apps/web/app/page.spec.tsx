import { render, screen } from '@testing-library/react';
import AccueilPage from './page';

describe("page d'accueil", () => {
  it('annonce la promesse dans un titre de niveau 1 unique', () => {
    render(<AccueilPage />);
    const titres = screen.getAllByRole('heading', { level: 1 });
    expect(titres).toHaveLength(1);
  });

  it('propose la création de compte comme action principale', () => {
    render(<AccueilPage />);
    expect(screen.getByRole('link', { name: /créer mon compte/i })).toHaveAttribute(
      'href',
      '/inscription',
    );
  });

  it('mentionne explicitement la réserve aux personnes majeures', () => {
    render(<AccueilPage />);
    expect(screen.getByText(/réservé aux personnes majeures/i)).toBeInTheDocument();
  });

  it('annonce la règle du consentement mutuel', () => {
    render(<AccueilPage />);
    expect(screen.getByText(/intérêt réciproque/i)).toBeInTheDocument();
  });
});
