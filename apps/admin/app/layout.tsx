import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Back-office — À Chacun Une Belle Âme',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          fontFamily: '-apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif',
          background: '#f8fafc',
          color: '#0f172a',
        }}
      >
        {children}
      </body>
    </html>
  );
}
