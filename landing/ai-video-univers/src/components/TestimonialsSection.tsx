import { motion } from 'framer-motion';
import { Quote, Star } from 'lucide-react';
import { GALLERY } from '../data/resources';
import { Eyebrow, Glow, Lead, Reveal, SectionShell, SectionTitle } from './ui';

interface Temoignage {
  texte: string;
  auteur: string;
  activite: string;
  photo: string;
}

const TEMOIGNAGES: Temoignage[] = [
  {
    texte:
      'Je repoussais depuis des mois parce que je n’avais ni caméra ni budget. En une soirée avec les prompts du pack, j’avais ma première pub prête à publier.',
    auteur: 'Aïcha',
    activite: 'Vendeuse en ligne',
    photo: GALLERY[13].src,
  },
  {
    texte:
      'Ce qui m’a le plus servi, ce sont les 10 000 vidéos virales. Je ne cherche plus quoi poster : j’ouvre la bibliothèque, je choisis un format, je l’adapte à mon produit.',
    auteur: 'Serge',
    activite: 'Community manager',
    photo: GALLERY[14].src,
  },
  {
    texte:
      'La formation bonus sur les vidéos animées vaut à elle seule le prix. J’ai enfin compris comment donner du rythme à mes contenus au lieu d’enchaîner des plans fixes.',
    auteur: 'Mariam',
    activite: 'Créatrice de contenu',
    photo: GALLERY[15].src,
  },
];

const BENEFICES = [
  'Créer sans caméra, sans acteur, sans studio.',
  'Ne plus jamais démarrer d’une page blanche.',
  'Produire en quelques minutes au lieu de quelques jours.',
  'Alimenter tous vos réseaux avec un seul pack.',
  'Apprendre une compétence, pas seulement télécharger des fichiers.',
  'Un tarif d’entrée qui ne met personne en difficulté.',
];

export function TestimonialsSection() {
  return (
    <SectionShell id="avis" className="overflow-hidden">
      <Glow className="-right-32 top-10 h-80 w-80 bg-primary/25" />

      <Reveal className="text-center">
        <Eyebrow>⭐ Les bénéfices, résumés</Eyebrow>
        <SectionTitle className="mx-auto mt-5 max-w-3xl">
          Ce que le pack change <span className="text-gradient-blue">concrètement</span>
        </SectionTitle>
      </Reveal>

      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFICES.map((benefice, index) => (
          <motion.div
            key={benefice}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: index * 0.06 }}
            className="glass flex items-start gap-3 rounded-2xl px-4 py-4"
          >
            <Star className="mt-0.5 h-4 w-4 shrink-0 fill-gold text-gold" />
            <span className="text-sm text-slate-300">{benefice}</span>
          </motion.div>
        ))}
      </div>

      <Reveal className="mt-20 text-center">
        <SectionTitle className="mx-auto max-w-3xl">
          Ce que nos clients <span className="text-gradient-gold">en penseront</span>
        </SectionTitle>
        <Lead className="mx-auto mt-5 max-w-2xl">
          Les retours ci-dessous sont des exemples illustratifs, écrits pour montrer les usages
          attendus du pack — pas des avis vérifiés de clients.
        </Lead>
      </Reveal>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {TEMOIGNAGES.map((temoignage, index) => (
          <motion.figure
            key={temoignage.auteur}
            initial={{ opacity: 0, y: 40, rotateX: 8 }}
            whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
            viewport={{ once: true, margin: '-70px' }}
            transition={{ duration: 0.65, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -8 }}
            className="glass relative flex h-full flex-col rounded-3xl p-6 sm:p-7"
          >
            <Quote className="h-7 w-7 text-primary/60" />
            <div className="mt-3 flex gap-0.5" aria-label="5 étoiles sur 5">
              {Array.from({ length: 5 }).map((_, starIndex) => (
                <Star key={starIndex} className="h-4 w-4 fill-gold text-gold" />
              ))}
            </div>
            <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-slate-300 sm:text-base">
              « {temoignage.texte} »
            </blockquote>
            <figcaption className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5">
              <img
                src={temoignage.photo}
                alt=""
                loading="lazy"
                className="h-11 w-11 rounded-full object-cover ring-2 ring-gold/50"
              />
              <div>
                <p className="text-sm font-bold text-ink">{temoignage.auteur}</p>
                <p className="text-xs text-muted">{temoignage.activite}</p>
              </div>
            </figcaption>
          </motion.figure>
        ))}
      </div>

      <Reveal delay={0.1} className="mt-8 text-center">
        <p className="text-xs text-muted/80">
          Témoignages illustratifs — aucun d’eux ne provient d’un acheteur identifié.
        </p>
      </Reveal>
    </SectionShell>
  );
}
