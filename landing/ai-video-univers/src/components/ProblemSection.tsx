import { motion } from 'framer-motion';
import { ArrowRight, Camera, CircleSlash, Clock, Sparkles, Wallet } from 'lucide-react';
import { BRAND, LINKS } from '../data/resources';
import { Cta, Eyebrow, Glow, Lead, Reveal, SectionShell, SectionTitle } from './ui';

const AVANT = [
  { icon: Wallet, texte: 'Un budget tournage que vous n’avez pas.' },
  { icon: Camera, texte: 'Du matériel, un acteur, un lieu… avant même la première vidéo.' },
  { icon: Clock, texte: 'Des heures perdues devant une page blanche, sans idée de contenu.' },
  { icon: CircleSlash, texte: 'Et au final : rien ne sort. Ou rien ne marche.' },
];

const APRES = [
  'Vous écrivez une phrase. L’IA génère la scène.',
  'Vous piochez dans 10 000 prompts déjà écrits pour vous.',
  'Vous montez en quelques minutes avec CapCut Pro.',
  'Vous publiez, vous testez, vous monétisez.',
];

export function ProblemSection() {
  return (
    <SectionShell id="probleme" className="overflow-hidden">
      <Glow className="-left-40 top-20 h-72 w-72 bg-primary/25" />

      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-14">
        <div className="relative order-2 lg:order-1">
          <Reveal>
            <Eyebrow>Le vrai blocage</Eyebrow>
            <SectionTitle className="mt-5">
              Ce n’est pas le <span className="text-gradient-blue">talent</span> qui vous
              manque.
            </SectionTitle>
            <Lead className="mt-5">
              C’est le matériel, le budget, le temps et les idées. Quatre murs qui arrêtent
              99 % des gens avant leur première vidéo.
            </Lead>
          </Reveal>

          <motion.ul
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}
            className="mt-8 space-y-3"
          >
            {AVANT.map((item) => (
              <motion.li
                key={item.texte}
                variants={{
                  hidden: { opacity: 0, x: -22 },
                  show: { opacity: 1, x: 0, transition: { duration: 0.5 } },
                }}
                className="flex items-start gap-3.5 rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3.5"
              >
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <span className="text-sm text-slate-300 sm:text-base">{item.texte}</span>
              </motion.li>
            ))}
          </motion.ul>

          <Reveal delay={0.15} className="mt-8">
            <div className="glass rounded-3xl p-6 sm:p-7">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gold">
                <Sparkles className="h-4 w-4" /> Avec le pack
              </div>
              <ul className="mt-4 space-y-3">
                {APRES.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gold" />
                    <span className="text-sm font-medium text-ink sm:text-base">{item}</span>
                  </li>
                ))}
              </ul>
              <Cta href={LINKS.checkout} size="md" className="mt-6 w-full sm:w-auto">
                Débloquer le pack — 950 F
              </Cta>
            </div>
          </Reveal>
        </div>

        {/* Visuel incliné, cohérent avec le mockup du hero */}
        <Reveal className="order-1 lg:order-2" delay={0.1}>
          <div className="relative [perspective:1400px]">
            <div
              aria-hidden
              className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-gold/25 via-transparent to-primary/40 blur-3xl"
            />
            <motion.div
              initial={{ rotateY: 16, rotateX: 6, opacity: 0 }}
              whileInView={{ rotateY: 8, rotateX: 3, opacity: 1 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="glass-strong overflow-hidden rounded-[2rem] p-3 shadow-[0_50px_120px_-45px_rgba(2,8,23,0.95)]"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <img
                src={BRAND.hook}
                alt="Créer des vidéos ultra-réalistes avec l’intelligence artificielle"
                loading="lazy"
                className="w-full rounded-[1.5rem] object-cover"
              />
              <div className="flex items-center justify-between gap-3 px-3 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted sm:text-sm">
                  Avant / Après
                </p>
                <p className="text-sm font-black uppercase text-gradient-gold sm:text-base">
                  0 tournage
                </p>
              </div>
            </motion.div>
          </div>
        </Reveal>
      </div>
    </SectionShell>
  );
}
