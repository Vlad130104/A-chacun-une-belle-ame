import { MessageCircle, Send, ShoppingCart } from 'lucide-react';
import { BRAND, LINKS } from '../data/resources';

const RESEAUX = [
  { label: 'Support WhatsApp', href: LINKS.whatsapp, icon: MessageCircle },
  { label: 'Communauté Telegram', href: LINKS.telegram, icon: Send },
  { label: 'Obtenir le pack', href: LINKS.checkout, icon: ShoppingCart },
];

const ANCRES = [
  { label: 'Démos vidéo', href: '#demos' },
  { label: 'Galerie', href: '#galerie' },
  { label: 'Contenu du pack', href: '#modules' },
  { label: 'Prix', href: '#prix' },
  { label: 'FAQ', href: '#faq' },
];

export function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-navy/60 px-5 py-14 sm:px-8">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
      />

      <div className="mx-auto grid w-full max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <a
            href={LINKS.checkout}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3"
          >
            <img
              src={BRAND.logo}
              alt="AI Video Universe"
              loading="lazy"
              className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/15"
            />
            <span className="text-base font-extrabold uppercase leading-none tracking-tight">
              AI Video <span className="text-gradient-gold">Universe</span>
            </span>
          </a>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            Créez, éditez et monétisez des vidéos générées par intelligence artificielle — sans
            caméra, sans acteur, sans studio. Le pack complet à 950 FCFA.
          </p>
        </div>

        <nav aria-label="Sections de la page">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-ink">Naviguer</h2>
          <ul className="mt-4 space-y-2.5">
            {ANCRES.map((ancre) => (
              <li key={ancre.href}>
                <a
                  href={ancre.href}
                  className="text-sm text-muted transition-colors hover:text-primary-light"
                >
                  {ancre.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-ink">Nous joindre</h2>
          <ul className="mt-4 space-y-2.5">
            {RESEAUX.map((reseau) => (
              <li key={reseau.href}>
                <a
                  href={reseau.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 text-sm text-muted transition-colors hover:text-gold"
                >
                  <reseau.icon className="h-4 w-4" />
                  {reseau.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-12 flex w-full max-w-6xl flex-col items-center justify-between gap-3 border-t border-white/10 pt-7 sm:flex-row">
        <p className="text-xs text-muted">
          © {new Date().getFullYear()} AI Video Universe. Tous droits réservés.
        </p>
        <p className="text-center text-xs text-muted/80 sm:text-right">
          🔒 Paiement sécurisé • Accès rapide • Formation 100 % en ligne
        </p>
      </div>
    </footer>
  );
}
