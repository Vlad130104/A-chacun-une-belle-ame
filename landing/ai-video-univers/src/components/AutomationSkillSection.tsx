import { motion } from 'framer-motion';
import {
  Brain,
  Check,
  Clapperboard,
  Clock4,
  Coins,
  Film,
  Smartphone,
  TrendingUp,
  Users,
  Wand2,
} from 'lucide-react';
import { GALLERY, LINKS } from '../data/resources';
import { Cta, Eyebrow, Glow, Lead, Reveal, SectionShell, SectionTitle } from './ui';

const CAPACITES = [
  {
    icon: Clapperboard,
    titre: 'Créer',
    texte: 'Développez des concepts et explorez la création de vidéos assistées par IA.',
    accent: 'from-primary/25',
  },
  {
    icon: Brain,
    titre: 'Imaginer',
    texte: 'Utilisez les prompts et les ressources disponibles pour trouver plus vite vos idées.',
    accent: 'from-primary-light/25',
  },
  {
    icon: Smartphone,
    titre: 'Publier',
    texte: 'Alimentez vos réseaux sociaux avec davantage de concepts et de contenus.',
    accent: 'from-gold/25',
  },
  {
    icon: Coins,
    titre: 'Monétiser',
    texte:
      'Explorez différentes possibilités de monétisation liées au contenu et aux réseaux sociaux.',
    accent: 'from-gold/30',
  },
  {
    icon: Clock4,
    titre: 'Gagner du temps',
    texte:
      'Au lieu de chercher des centaines de ressources séparément, retrouvez-les au même endroit.',
    accent: 'from-primary/25',
  },
];

const CIBLES = [
  'Les créateurs de contenu qui veulent publier davantage.',
  'Les débutants en IA qui veulent découvrir la création vidéo.',
  'Les entrepreneurs et commerçants qui veulent promouvoir leurs produits.',
  'Les community managers en manque d’idées pour leurs clients.',
  'Les freelances qui veulent enrichir leurs services de création.',
  'Les personnes qui veulent développer une activité autour du contenu digital.',
  'Les passionnés de TikTok, Facebook, Instagram et autres réseaux.',
];

const CHAINE = [
  { icon: Wand2, label: 'IA' },
  { icon: Film, label: 'Vidéo' },
  { icon: Smartphone, label: 'TikTok' },
  { icon: Users, label: 'Audience' },
  { icon: TrendingUp, label: 'Revenus' },
];

/** Visuel du résultat : la chaîne IA → Vidéo → TikTok → Audience → Revenus. */
function ChaineDeValeur() {
  return (
    <div className="glass-strong relative overflow-hidden rounded-[2rem] p-5 sm:p-7">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(600px_240px_at_50%_0%,rgba(37,99,235,0.25),transparent_70%)]"
      />
      <div className="relative">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-muted sm:text-xs">
          Ce que ça produit, concrètement
        </p>

        <div className="mt-6 grid grid-cols-5 items-start gap-1.5 sm:gap-3">
          {CHAINE.map((etape, index) => (
            <motion.div
              key={etape.label}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: index * 0.12 }}
              className="flex flex-col items-center gap-2 text-center"
            >
              <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/5 sm:h-14 sm:w-14">
                <etape.icon className="h-5 w-5 text-primary-light sm:h-6 sm:w-6" />
                {index < CHAINE.length - 1 && (
                  <motion.span
                    aria-hidden
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.25 + index * 0.12 }}
                    className="absolute left-full top-1/2 h-px w-[calc(100%+0.75rem)] origin-left bg-gradient-to-r from-primary-light/70 to-gold/50"
                  />
                )}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-ink sm:text-xs">
                {etape.label}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Bandeau de miniatures : le contenu produit à l'arrivée */}
        <div className="mt-7 grid grid-cols-4 gap-2 sm:gap-3">
          {GALLERY.slice(10, 14).map((image) => (
            <div
              key={image.src}
              className="aspect-square overflow-hidden rounded-xl border border-white/10 bg-navy"
            >
              <img
                src={image.src}
                alt={image.legende}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AutomationSkillSection() {
  return (
    <SectionShell id="competences" className="overflow-hidden">
      <Glow className="-right-32 top-0 h-80 w-80 bg-gold/20" />

      <Reveal className="text-center">
        <Eyebrow>La compétence, pas juste les fichiers</Eyebrow>
        <SectionTitle className="mx-auto mt-5 max-w-3xl">
          Ce que vous pourrez <span className="text-gradient-gold">faire</span> avec ces
          ressources
        </SectionTitle>
      </Reveal>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPACITES.map((capacite, index) => (
          <motion.div
            key={capacite.titre}
            initial={{ opacity: 0, y: 34 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, delay: index * 0.08 }}
            whileHover={{ y: -6 }}
            className={`glass relative overflow-hidden rounded-3xl bg-gradient-to-br ${capacite.accent} to-transparent p-6`}
          >
            <capacite.icon className="h-7 w-7 text-gold" />
            <h3 className="mt-4 text-xl font-extrabold uppercase tracking-tight">
              {capacite.titre}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{capacite.texte}</p>
          </motion.div>
        ))}

        <Reveal delay={0.1} className="sm:col-span-2 lg:col-span-1">
          <ChaineDeValeur />
        </Reveal>
      </div>

      {/* À qui s'adresse ce pack */}
      <div className="mt-20 grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal>
          <Eyebrow>Public visé</Eyebrow>
          <SectionTitle className="mt-5">
            À qui s’adresse <span className="text-gradient-blue">ce pack</span> ?
          </SectionTitle>
          <Lead className="mt-5">
            Si vous vous reconnaissez dans une seule de ces lignes, le pack a été pensé pour
            vous.
          </Lead>
          <Cta href={LINKS.checkout} size="lg" className="mt-7">
            C’est exactement moi — 950 F
          </Cta>
        </Reveal>

        <motion.ul
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
          className="space-y-2.5"
        >
          {CIBLES.map((cible) => (
            <motion.li
              key={cible}
              variants={{
                hidden: { opacity: 0, x: 26 },
                show: { opacity: 1, x: 0, transition: { duration: 0.45 } },
              }}
              className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5"
            >
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/20">
                <Check className="h-3.5 w-3.5 text-gold" />
              </span>
              <span className="text-sm text-slate-300 sm:text-base">{cible}</span>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </SectionShell>
  );
}
