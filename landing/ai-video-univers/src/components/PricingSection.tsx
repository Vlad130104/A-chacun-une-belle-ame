import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlarmClock, Check, GraduationCap, Lock, Zap } from 'lucide-react';
import { BRAND, LINKS } from '../data/resources';
import { Cta, Eyebrow, Glow, Reveal, SectionShell, SectionTitle } from './ui';

const STORAGE_KEY = 'avu-offre-debut';
const DUREE_MS = 24 * 60 * 60 * 1000;

/** Compte à rebours de 24 h, démarré à la première visite. */
function useCompteARebours() {
  const [restant, setRestant] = useState(DUREE_MS);

  useEffect(() => {
    let debut = Date.now();
    try {
      const enregistre = window.localStorage.getItem(STORAGE_KEY);
      const parse = enregistre ? Number(enregistre) : NaN;
      if (Number.isFinite(parse) && Date.now() - parse < DUREE_MS) {
        debut = parse;
      } else {
        window.localStorage.setItem(STORAGE_KEY, String(debut));
      }
    } catch {
      // Stockage indisponible (navigation privée) : le rebours repart de 24 h.
    }

    const tick = () => setRestant(Math.max(0, debut + DUREE_MS - Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const totalSecondes = Math.floor(restant / 1000);
  return {
    heures: String(Math.floor(totalSecondes / 3600)).padStart(2, '0'),
    minutes: String(Math.floor((totalSecondes % 3600) / 60)).padStart(2, '0'),
    secondes: String(totalSecondes % 60).padStart(2, '0'),
  };
}

const INCLUS = [
  '10 millions de produits digitaux avec droits de revente',
  'Application Grok en illimitée',
  '2 applications de VEO3',
  'Opal de VEO3 gratuit',
  '10 000 prompts',
  '10 000 vidéos virales pour les réseaux sociaux',
  'Monétisation de TikTok',
  'CapCut Pro',
  '🎁 Bonus : formation en création de vidéos animées',
];

const GARANTIES = [
  { icon: Lock, titre: 'Paiement sécurisé', texte: 'Transaction protégée de bout en bout.' },
  { icon: Zap, titre: 'Accès rapide', texte: 'Vos ressources vous parviennent après achat.' },
  {
    icon: GraduationCap,
    titre: 'Formation & ressources',
    texte: '100 % en ligne, accessibles où que vous soyez.',
  },
];

export function PricingSection() {
  const { heures, minutes, secondes } = useCompteARebours();

  return (
    <SectionShell id="prix" className="overflow-hidden">
      <Glow className="left-1/2 top-0 h-96 w-96 -translate-x-1/2 bg-gold/20" />

      <Reveal className="text-center">
        <Eyebrow>🤯 Le prix</Eyebrow>
        <SectionTitle className="mx-auto mt-5 max-w-4xl text-4xl sm:text-5xl lg:text-6xl">
          Tout cela pour <span className="text-gradient-gold">950 FCFA</span> ?
        </SectionTitle>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
          Vous avez probablement déjà dépensé plus que cela pour une seule ressource digitale.
          Ici, vous obtenez un véritable <span className="font-semibold text-ink">pack</span> de
          ressources autour de la création vidéo, de l’IA, du contenu viral et de la
          monétisation.
        </p>
      </Reveal>

      <div className="mt-14 grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Carte de prix */}
        <Reveal>
          <div className="glass-strong relative overflow-hidden rounded-[2rem] p-6 sm:p-9">
            <div
              aria-hidden
              className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gold/25 blur-3xl"
            />
            <div className="relative">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
                💰 Prix normal perçu
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-500 line-through sm:text-3xl">
                25 000 F CFA
              </p>

              <p className="mt-7 text-xs font-bold uppercase tracking-[0.25em] text-gold sm:text-sm">
                🔥 Aujourd’hui
              </p>
              <div className="mt-1 flex flex-wrap items-end gap-3">
                <motion.span
                  initial={{ scale: 0.85, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                  className="text-6xl font-black leading-none tracking-tighter text-gradient-gold sm:text-7xl lg:text-8xl"
                >
                  950
                </motion.span>
                <span className="pb-2 text-2xl font-black uppercase text-gold sm:text-3xl">
                  FCFA
                </span>
              </div>

              <ul className="mt-6 space-y-1 text-sm text-muted sm:text-base">
                <li className="line-through decoration-red-400/70">Pas 5 000 FCFA.</li>
                <li className="line-through decoration-red-400/70">Pas 10 000 FCFA.</li>
                <li className="line-through decoration-red-400/70">Pas 25 000 FCFA.</li>
                <li className="pt-1 text-base font-black uppercase text-ink sm:text-lg">
                  👉 Seulement 950 FCFA.
                </li>
              </ul>

              <ul className="mt-7 space-y-2.5 border-t border-white/10 pt-7">
                {INCLUS.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/20">
                      <Check className="h-3.5 w-3.5 text-gold" />
                    </span>
                    <span className="text-sm text-slate-300 sm:text-base">{item}</span>
                  </li>
                ))}
              </ul>

              <Cta href={LINKS.checkout} size="xl" className="mt-8 w-full">
                Obtenir le pack à 950 FCFA
              </Cta>

              <p className="mt-4 text-center text-xs text-muted">
                🔒 Paiement sécurisé • ⚡ Accès rapide • 🎓 Formation 100 % en ligne
              </p>
            </div>
          </div>
        </Reveal>

        <div className="space-y-6">
          {/* Offre limitée */}
          <Reveal delay={0.08}>
            <div className="relative overflow-hidden rounded-3xl border-2 border-red-500/70 bg-gradient-to-br from-red-600/25 via-orange-500/15 to-transparent p-6 sm:p-7">
              <div className="inline-flex items-center gap-2 rounded-full bg-red-500 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-white sm:text-xs">
                <AlarmClock className="h-4 w-4" /> Attention : offre limitée
              </div>
              <h3 className="mt-4 text-xl font-black uppercase leading-tight sm:text-2xl">
                🚨 Offre valable uniquement pendant 24 h
              </h3>
              <p className="mt-2.5 text-sm text-slate-300">
                Le pack est actuellement proposé au prix exceptionnel de{' '}
                <span className="font-black text-gold">950 FCFA</span>. Après la période
                promotionnelle, le prix ou les conditions de l’offre peuvent changer.
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2.5">
                {[
                  { valeur: heures, label: 'Heures' },
                  { valeur: minutes, label: 'Minutes' },
                  { valeur: secondes, label: 'Secondes' },
                ].map((bloc) => (
                  <div
                    key={bloc.label}
                    className="rounded-2xl border border-white/15 bg-night/70 py-3 text-center"
                  >
                    <p className="font-mono text-2xl font-black leading-none text-ink sm:text-3xl">
                      {bloc.valeur}
                    </p>
                    <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      {bloc.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Visuel de l'offre */}
          <Reveal delay={0.14}>
            <div className="glass overflow-hidden rounded-3xl p-3">
              <img
                src={BRAND.offre}
                alt="Création des vidéos IA — contenu du pack à 950 F"
                loading="lazy"
                className="w-full rounded-2xl object-cover"
              />
            </div>
          </Reveal>

          {/* Garanties */}
          <Reveal delay={0.2}>
            <div className="grid gap-3 sm:grid-cols-3">
              {GARANTIES.map((garantie) => (
                <div
                  key={garantie.titre}
                  className="glass rounded-2xl p-4 text-center sm:text-left"
                >
                  <garantie.icon className="mx-auto h-5 w-5 text-primary-light sm:mx-0" />
                  <p className="mt-2.5 text-sm font-bold text-ink">{garantie.titre}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{garantie.texte}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </SectionShell>
  );
}
