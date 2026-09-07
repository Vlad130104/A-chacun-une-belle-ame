import { motion } from 'framer-motion';
import { AlarmClock, Send, Sparkles } from 'lucide-react';
import { BRAND, LINKS } from '../data/resources';
import { Cta, Glow, Reveal, SectionShell, SectionTitle } from './ui';

const RECAP = [
  '🎬 Création de vidéos IA',
  '🤖 Ressources IA',
  '✍️ 10 000 prompts',
  '🔥 10 000 vidéos virales',
  '📚 Produits digitaux avec droits de revente',
  '🎥 Ressources VEO3',
  '📱 TikTok & réseaux sociaux',
  '🎬 CapCut Pro',
  '🎁 Formation vidéos animées',
];

export function FinalCtaSection() {
  return (
    <SectionShell id="commander" className="overflow-hidden">
      <Glow className="left-1/2 top-10 h-[28rem] w-[28rem] -translate-x-1/2 bg-primary/30" />
      <div
        aria-hidden
        className="grid-floor absolute inset-x-0 bottom-0 -z-10 h-2/3 opacity-40 [mask-image:linear-gradient(to_top,black,transparent)]"
      />

      <Reveal className="text-center">
        <SectionTitle className="mx-auto max-w-4xl text-4xl sm:text-5xl lg:text-6xl">
          🎯 Vous êtes prêt à passer{' '}
          <span className="text-gradient-gold">à l’action</span> ?
        </SectionTitle>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
          Vous pouvez continuer à chercher des ressources séparément… ou simplement profiter
          maintenant de ce <span className="font-semibold text-ink">pack complet de création
          vidéo IA</span>.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mt-12">
        <div className="glass-strong relative overflow-hidden rounded-[2.5rem] p-6 sm:p-10">
          <div
            aria-hidden
            className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-gold/20 blur-3xl"
          />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <h3 className="text-2xl font-black uppercase leading-tight tracking-tight sm:text-3xl">
                🔥 Votre pack vous attend
              </h3>

              <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                {RECAP.map((item, index) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-50px' }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-300"
                  >
                    {item}
                  </motion.li>
                ))}
              </ul>

              <div className="mt-8 rounded-3xl border border-gold/40 bg-gold/[0.08] p-5 text-center sm:p-6">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-muted">
                  💛 Le tout pour seulement
                </p>
                <p className="mt-2 text-5xl font-black leading-none tracking-tighter text-gradient-gold sm:text-6xl">
                  950 <span className="text-3xl sm:text-4xl">FCFA</span>
                </p>
                <Cta
                  href={LINKS.checkout}
                  size="xl"
                  className="mt-6 w-full"
                  icon={<Sparkles className="h-5 w-5" />}
                >
                  👉 Je veux mon pack maintenant
                </Cta>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, rotateY: 16, scale: 0.94 }}
              whileInView={{ opacity: 1, rotateY: 0, scale: 1 }}
              viewport={{ once: true, margin: '-70px' }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="relative [perspective:1200px]"
            >
              <div
                aria-hidden
                className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-gradient-to-br from-gold/30 to-primary/40 blur-3xl"
              />
              <img
                src={BRAND.logo}
                alt="AI Video Universe"
                loading="lazy"
                className="w-full rounded-[2rem] border border-white/10 object-cover shadow-[0_45px_110px_-40px_rgba(2,8,23,0.95)] animate-float"
              />
            </motion.div>
          </div>
        </div>
      </Reveal>

      {/* Dernier rappel */}
      <Reveal delay={0.12} className="mt-10">
        <div className="relative overflow-hidden rounded-3xl border-2 border-red-500/70 bg-gradient-to-r from-red-600/25 via-orange-500/15 to-transparent p-6 text-center sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-white sm:text-xs">
            <AlarmClock className="h-4 w-4" /> Dernier rappel
          </div>
          <h3 className="mt-4 text-2xl font-black uppercase leading-tight sm:text-3xl">
            🚨 L’offre à <span className="text-gradient-gold">950 FCFA</span> est valable 24 h
          </h3>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
            Profitez-en maintenant, avant la fin de la période promotionnelle.
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
            <Cta href={LINKS.checkout} size="xl">
              👉 Obtenir le pack à 950 FCFA
            </Cta>
            <a
              href={LINKS.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/5 px-6 py-4 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-primary-light/60 hover:text-primary-light"
            >
              <Send className="h-4 w-4" />
              Rejoindre la communauté
            </a>
          </div>

          <p className="mt-6 text-xs text-muted/90">
            🔒 Paiement sécurisé • Accès rapide • Formation 100 % en ligne
          </p>
        </div>
      </Reveal>
    </SectionShell>
  );
}
