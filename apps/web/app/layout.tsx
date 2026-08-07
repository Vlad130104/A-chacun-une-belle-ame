import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'À Chacun Une Belle Âme — rencontres sérieuses entre adultes',
  description:
    'Plateforme de rencontres sérieuses, sécurisée et modérée, réservée aux personnes majeures. Membres vérifiés, messagerie ouverte uniquement après accord mutuel.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      {/* Typographie système : zéro octet téléchargé, rendu immédiat sur réseau lent. */}
      <body>{children}</body>
    </html>
  );
}
