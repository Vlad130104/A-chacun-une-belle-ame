import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Zap } from 'lucide-react';
import { LINKS } from '../data/resources';

/** Barre d'achat permanente sur mobile, à partir du premier scroll utile. */
export function StickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 900);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-night/90 px-4 py-3 backdrop-blur-xl lg:hidden"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex w-full max-w-md items-center gap-2.5">
            <a
              href={LINKS.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Support WhatsApp"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-emerald-300"
            >
              <MessageCircle className="h-5 w-5" />
            </a>
            <a
              href={LINKS.checkout}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-300 via-gold to-amber-400 px-5 py-3.5 text-sm font-extrabold uppercase tracking-wide text-night shadow-gold"
            >
              <Zap className="h-4 w-4" />
              Obtenir le pack — 950 F
            </a>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
