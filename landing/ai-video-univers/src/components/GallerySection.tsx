import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Maximize2, X } from 'lucide-react';
import {
  GALLERY,
  GALLERY_CATEGORIES,
  LINKS,
  type GalleryCategory,
  type GalleryImage,
} from '../data/resources';
import { Cta, Eyebrow, Glow, Lead, Reveal, SectionShell, SectionTitle } from './ui';

export function GallerySection() {
  const [filtre, setFiltre] = useState<GalleryCategory>('Tout');
  const [zoom, setZoom] = useState<GalleryImage | null>(null);

  const images = useMemo(
    () => (filtre === 'Tout' ? GALLERY : GALLERY.filter((image) => image.categorie === filtre)),
    [filtre],
  );

  return (
    <SectionShell id="galerie" className="overflow-hidden">
      <Glow className="-left-32 top-24 h-80 w-80 bg-primary/25" />

      <Reveal className="text-center">
        <Eyebrow>Généré, pas photographié</Eyebrow>
        <SectionTitle className="mx-auto mt-5 max-w-3xl">
          Avatars, produits, mockups :{' '}
          <span className="text-gradient-blue">rien de tout cela n’existe</span>
        </SectionTitle>
        <Lead className="mx-auto mt-5 max-w-2xl">
          Aucun shooting. Aucun modèle. Aucun studio. Uniquement des visuels produits avec les
          outils du pack — exactement ce que vous pourrez faire pour vos propres offres.
        </Lead>
      </Reveal>

      {/* Filtres */}
      <Reveal delay={0.08} className="mt-9 flex flex-wrap justify-center gap-2.5">
        {GALLERY_CATEGORIES.map((categorie) => {
          const actif = filtre === categorie;
          return (
            <button
              key={categorie}
              type="button"
              onClick={() => setFiltre(categorie)}
              className={`relative rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors sm:text-sm ${
                actif ? 'text-night' : 'border border-white/15 bg-white/5 text-muted hover:text-ink'
              }`}
            >
              {actif && (
                <motion.span
                  layoutId="gallery-pill"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-300 via-gold to-amber-400"
                />
              )}
              <span className="relative">{categorie}</span>
            </button>
          );
        })}
      </Reveal>

      {/* Grille */}
      <motion.div layout className="mt-10 grid grid-cols-2 gap-3.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {images.map((image, index) => (
            <motion.button
              key={image.src}
              type="button"
              layout
              onClick={() => setZoom(image)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.3) }}
              whileHover={{ y: -6 }}
              className="group relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 bg-navy text-left"
            >
              <img
                src={image.src}
                alt={image.legende}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-night via-night/20 to-transparent opacity-70 transition-opacity group-hover:opacity-90" />
              {/* Bandeau opaque sous la légende : plusieurs visuels ont un fond
                  blanc, sur lequel un texte clair devient illisible. */}
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-night via-night/90 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gold sm:text-[11px]">
                    {image.categorie}
                  </p>
                  <p className="text-xs font-semibold text-ink sm:text-sm">{image.legende}</p>
                </div>
                <Maximize2 className="h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </motion.div>

      <Reveal delay={0.1} className="mt-12 text-center">
        <Cta href={LINKS.checkout} variant="blue" size="lg">
          Je veux créer ces visuels
        </Cta>
      </Reveal>

      {/* Visionneuse */}
      <AnimatePresence>
        {zoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoom(null)}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-night/90 p-5 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              onClick={(event) => event.stopPropagation()}
              className="glass-strong relative max-h-[88vh] w-full max-w-lg overflow-hidden rounded-3xl p-3"
            >
              <img
                src={zoom.src}
                alt={zoom.legende}
                className="max-h-[70vh] w-full rounded-2xl object-contain"
              />
              <div className="flex items-center justify-between px-2 py-3">
                <p className="text-sm font-semibold text-ink">
                  {zoom.legende}
                  <span className="ml-2 text-xs font-normal text-muted">{zoom.categorie}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setZoom(null)}
                  aria-label="Fermer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </SectionShell>
  );
}
