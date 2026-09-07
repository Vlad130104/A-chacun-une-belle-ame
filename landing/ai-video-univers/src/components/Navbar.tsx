import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useScroll, useSpring } from 'framer-motion';
import { Menu, ShoppingCart, X } from 'lucide-react';
import { BRAND, LINKS } from '../data/resources';

const NAV_LINKS = [
  { label: 'Démos', href: '#demos' },
  { label: 'Galerie', href: '#galerie' },
  { label: 'Contenu du pack', href: '#modules' },
  { label: 'Prix', href: '#prix' },
  { label: 'FAQ', href: '#faq' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <motion.div
        style={{ scaleX: progress }}
        className="h-[3px] origin-left bg-gradient-to-r from-primary via-primary-light to-gold"
      />

      <nav
        className={`transition-all duration-500 ${
          scrolled ? 'border-b border-white/10 bg-night/85 backdrop-blur-xl' : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <a href={LINKS.checkout} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
            <img
              src={BRAND.logo}
              alt="AI Video Universe"
              className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/15 sm:h-11 sm:w-11"
            />
            <span className="hidden text-sm font-extrabold uppercase leading-none tracking-tight sm:block sm:text-base">
              AI Video <span className="text-gradient-gold">Universe</span>
            </span>
          </a>

          <ul className="hidden items-center gap-7 lg:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="relative text-sm font-medium text-muted transition-colors hover:text-ink"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <motion.a
              href={LINKS.checkout}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-300 via-gold to-amber-400 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-night shadow-gold sm:px-5 sm:text-sm"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden xs:inline">Obtenir&nbsp;</span>950 F
            </motion.a>

            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-ink lg:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="border-b border-white/10 bg-night/95 backdrop-blur-xl lg:hidden"
          >
            <ul className="mx-auto flex w-full max-w-6xl flex-col px-5 py-3 sm:px-8">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block border-b border-white/5 py-3.5 text-base font-semibold text-ink"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={LINKS.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="block py-3.5 text-base font-semibold text-primary-light"
                >
                  Support WhatsApp
                </a>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
