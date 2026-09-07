import { motion } from 'framer-motion';
import {
  Bot,
  Clapperboard,
  Film,
  Gift,
  Layers,
  PenLine,
  Scissors,
  Sparkles,
  TrendingUp,
  Wand2,
} from 'lucide-react';
import { GALLERY, LINKS } from '../data/resources';
import { Cta, Eyebrow, Glow, Lead, Reveal, SectionShell, SectionTitle } from './ui';

interface Module {
  icon: typeof Bot;
  emoji: string;
  titre: string;
  motCle: string;
  couleurMotCle: string;
  texte: string;
  appui?: string;
}

const MODULES: Module[] = [
  {
    icon: Bot,
    emoji: '🤖',
    titre: 'Application',
    motCle: 'GROK',
    couleurMotCle: 'text-[#2563EB]',
    texte:
      'Découvrez l’utilisation de l’intelligence artificielle pour vous accompagner dans vos recherches, idées, créations et différents travaux de contenu.',
    appui: 'Un véritable assistant IA à portée de main.',
  },
  {
    icon: Clapperboard,
    emoji: '🎬',
    titre: 'Application de',
    motCle: 'VEO3',
    couleurMotCle: 'text-[#A78BFA]',
    texte:
      'Découvrez des accès dédiés à la création de vidéos avec l’intelligence artificielle. Créez des scènes, imaginez des concepts et donnez vie à vos idées grâce aux nouvelles possibilités offertes par la génération vidéo IA.',
  },
  {
    icon: Sparkles,
    emoji: '🧠',
    titre: 'Accès à',
    motCle: 'OPAL DE VEO3',
    couleurMotCle: 'text-[#60A5FA]',
    texte: 'Profitez également de l’accès annoncé à Opal de VEO3 dans votre pack.',
  },
  {
    icon: PenLine,
    emoji: '✍️',
    titre: '',
    motCle: '10 000 PROMPTS',
    couleurMotCle: 'text-gradient-gold',
    texte:
      'Ne partez plus d’une page blanche. Découvrez une énorme collection de prompts pour trouver des idées, créer des contenus, générer des visuels, produire des vidéos et expérimenter différentes utilisations de l’IA.',
    appui: 'Plus besoin de passer des heures à chercher quoi demander à l’IA.',
  },
  {
    icon: Scissors,
    emoji: '🎥',
    titre: '',
    motCle: 'CAPCUT PRO',
    couleurMotCle: 'text-[#2563EB]',
    texte:
      'Disposez de la ressource et de la formation prévues autour de CapCut Pro pour faciliter vos travaux de montage et de création vidéo.',
  },
  {
    icon: TrendingUp,
    emoji: '💰',
    titre: '',
    motCle: 'MONÉTISATION DE TIKTOK',
    couleurMotCle: 'text-gradient-gold',
    texte:
      'Découvrez les ressources et informations incluses dans le pack autour de la création de contenu et de la monétisation sur TikTok.',
    appui:
      'L’objectif ? Ne plus simplement créer du contenu… mais apprendre à transformer votre audience et votre contenu en opportunités.',
  },
  {
    icon: Film,
    emoji: '🔥',
    titre: '',
    motCle: '10 000 VIDÉOS VIRALES',
    couleurMotCle: 'text-[#F59E0B]',
    texte:
      'Besoin d’idées pour TikTok, Facebook, Instagram ou d’autres réseaux ? Vous disposez d’une immense bibliothèque d’inspiration pour identifier des formats, concepts, angles et idées de contenus.',
    appui: 'Fini le syndrome de la page blanche.',
  },
  {
    icon: Layers,
    emoji: '📚',
    titre: '',
    motCle: '10 MILLIONS DE PRODUITS DIGITAUX',
    couleurMotCle: 'text-[#60A5FA]',
    texte:
      'Avec droits de revente. Accédez à une immense bibliothèque de ressources digitales destinée à vous donner davantage de possibilités pour développer vos propres offres et activités digitales.',
    appui: 'Imaginez simplement la quantité de possibilités que cela peut représenter…',
  },
];

const PROMPTS_APERCU = [
  'Publicité produit — luxe, éclairage studio, 8s',
  'Avatar présentateur, plan taille, voix off FR',
  'Storytelling animé — ouverture cinématique',
  'Unboxing produit, ralenti, fond dégradé',
  'Hook TikTok 3s — question directe caméra',
  'Scène urbaine nuit, néons, travelling avant',
];

const STYLES_VIRAUX = [
  'Storytelling',
  'Business',
  'Humour',
  'Motivation',
  'Produits',
  'Lifestyle',
  'Tutoriel',
  'Avant / Après',
];

/** Rend tangibles les « 10 000 prompts » : un écran, pas une promesse. */
function EcranPrompts() {
  return (
    <Reveal className="mt-6">
      <div className="glass-strong relative overflow-hidden rounded-3xl p-4 sm:p-6">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(500px_200px_at_20%_0%,rgba(37,99,235,0.25),transparent_70%)]"
        />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            <span className="ml-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted sm:text-[11px]">
              bibliothèque de prompts · 10 000 entrées
            </span>
          </div>

          <div className="mt-5 grid gap-2.5 lg:grid-cols-2">
            {PROMPTS_APERCU.map((prompt, index) => (
              <motion.div
                key={prompt}
                initial={{ opacity: 0, x: -18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.45, delay: index * 0.07 }}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-night/60 px-3.5 py-2.5"
              >
                <Wand2 className="h-4 w-4 shrink-0 text-primary-light" />
                <span className="truncate font-mono text-[11px] text-slate-300 sm:text-xs">
                  {prompt}
                </span>
              </motion.div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-gold/25 bg-gold/[0.07] px-4 py-3">
            <span className="text-xs font-semibold text-muted sm:text-sm">
              … et 9 994 autres dans le pack
            </span>
            <span className="shrink-0 text-lg font-black text-gradient-gold sm:text-xl">
              10 000
            </span>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

/** Mosaïque des formats couverts par les 10 000 vidéos virales. */
function MosaiqueVirale() {
  return (
    <Reveal className="mt-6">
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {GALLERY.slice(0, 8).map((image, index) => (
          <motion.div
            key={image.src}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.45, delay: index * 0.05 }}
            className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-navy"
          >
            <img
              src={image.src}
              alt={image.legende}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-night via-night/70 to-transparent" />
            <span className="absolute bottom-2 left-2 text-[9px] font-bold uppercase tracking-wide text-gold sm:text-[10px]">
              {STYLES_VIRAUX[index]}
            </span>
          </motion.div>
        ))}
      </div>
    </Reveal>
  );
}

export function ModulesSection() {
  return (
    <SectionShell id="modules" className="overflow-hidden">
      <Glow className="-left-32 top-32 h-80 w-80 bg-primary/25" />
      <Glow className="-right-24 bottom-20 h-72 w-72 bg-gold/20" />

      <Reveal className="text-center">
        <Eyebrow>🎁 Contenu du pack</Eyebrow>
        <SectionTitle className="mx-auto mt-5 max-w-4xl">
          Voici exactement ce que vous allez{' '}
          <span className="text-gradient-gold">recevoir</span> en vous procurant ce pack
        </SectionTitle>
        <Lead className="mx-auto mt-5 max-w-2xl">
          Neuf blocs de ressources, plus un bonus. Tout est listé, rien n’est caché.
        </Lead>
      </Reveal>

      <div className="mt-12 space-y-4">
        {MODULES.map((module, index) => (
          <motion.article
            key={module.motCle}
            initial={{ opacity: 0, y: 34 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, delay: Math.min(index * 0.05, 0.3) }}
            whileHover={{ x: 6 }}
            className="glass group relative overflow-hidden rounded-3xl p-5 sm:p-7"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-primary-light to-gold opacity-60 transition-opacity group-hover:opacity-100"
            />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/5">
                <module.icon className="h-6 w-6 text-primary-light" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-extrabold uppercase leading-tight tracking-tight sm:text-2xl">
                  <span className="mr-2">{module.emoji}</span>
                  {module.titre && <span className="text-ink">{module.titre} </span>}
                  <span className={module.couleurMotCle}>{module.motCle}</span>
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted sm:text-base">
                  {module.texte}
                </p>
                {module.appui && (
                  <p className="mt-2.5 text-sm font-semibold italic text-primary-light sm:text-base">
                    {module.appui}
                  </p>
                )}

                {module.motCle === '10 000 PROMPTS' && <EcranPrompts />}
                {module.motCle === '10 000 VIDÉOS VIRALES' && <MosaiqueVirale />}
              </div>
            </div>
          </motion.article>
        ))}
      </div>

      {/* BONUS */}
      <Reveal delay={0.05} className="mt-10">
        <div className="relative overflow-hidden rounded-[2rem] border-2 border-gold/60 bg-gradient-to-br from-gold/15 via-purple-500/10 to-primary/15 p-6 sm:p-9">
          <div
            aria-hidden
            className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/25 blur-3xl"
          />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <motion.span
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-night sm:text-sm"
              >
                <Gift className="h-4 w-4" /> Bonus exclusif
              </motion.span>

              <h3 className="mt-5 text-2xl font-black uppercase leading-tight tracking-tight sm:text-3xl lg:text-4xl">
                🎬 Formation en création de{' '}
                <span className="text-gradient-gold">vidéos animées</span>
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">
                En plus de toutes les ressources précédentes, vous recevez une formation dédiée
                à la création de contenus animés : apprenez à donner davantage de mouvement et
                de dynamisme à vos productions.
              </p>
              <p className="mt-3 text-sm font-semibold italic text-gold sm:text-base">
                Vous ne recevez pas uniquement des ressources. Vous recevez de quoi apprendre à
                les exploiter.
              </p>
              <Cta href={LINKS.checkout} size="lg" className="mt-7">
                Recevoir le pack + le bonus
              </Cta>
            </div>

            {/* Visuel bonus : timeline de montage */}
            <motion.div
              initial={{ opacity: 0, rotateY: -14 }}
              whileInView={{ opacity: 1, rotateY: 0 }}
              viewport={{ once: true, margin: '-70px' }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="glass-strong rounded-3xl p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                  timeline · animation
                </span>
                <span className="rounded-full bg-gold px-2.5 py-1 text-[10px] font-black uppercase text-night">
                  Bonus
                </span>
              </div>

              <div className="mt-4 aspect-video overflow-hidden rounded-2xl border border-white/10 bg-night">
                <img
                  src={GALLERY[12].src}
                  alt={GALLERY[12].legende}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="mt-4 space-y-2">
                {[92, 64, 78].map((largeur, index) => (
                  <div key={largeur} className="h-3 overflow-hidden rounded-full bg-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${largeur}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.1, delay: 0.2 + index * 0.15 }}
                      className={`h-full rounded-full ${
                        index === 1
                          ? 'bg-gradient-to-r from-gold to-amber-300'
                          : 'bg-gradient-to-r from-primary to-primary-light'
                      }`}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </Reveal>
    </SectionShell>
  );
}
