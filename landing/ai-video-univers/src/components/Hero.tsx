import { useRef } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { Clock3, Play, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { LINKS, VIDEOS } from '../data/resources';
import { VideoFrame } from './VideoFrame';
import { Cta, Glow } from './ui';

/**
 * Hero « cinématique ».
 *
 * Le bloc visuel est un mockup 3D en verre dépoli, incliné en perspective et
 * flottant sur le fond nuit — pas un cadre vidéo posé à plat. L'inclinaison
 * suit la souris ; sur mobile, elle reste fixe et légère.
 */
export function Hero() {
  const sectionRef = useRef<HTMLElement | null>(null);

  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);

  const springConfig = { stiffness: 120, damping: 20, mass: 0.6 };
  const rotateY = useSpring(useTransform(pointerX, [0, 1], [14, -14]), springConfig);
  const rotateX = useSpring(useTransform(pointerY, [0, 1], [-10, 12]), springConfig);
  const shineX = useMotionTemplate`${useTransform(pointerX, [0, 1], [10, 90])}%`;
  const shineY = useMotionTemplate`${useTransform(pointerY, [0, 1], [10, 90])}%`;
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${shineX} ${shineY}, rgba(96,165,250,0.22), transparent 62%)`;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  const parallaxSlow = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const parallaxFast = useTransform(scrollYProgress, [0, 1], [0, 260]);
  const heroFade = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  function handlePointer(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left) / bounds.width);
    pointerY.set((event.clientY - bounds.top) / bounds.height);
  }

  function resetPointer() {
    pointerX.set(0.5);
    pointerY.set(0.5);
  }

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24 lg:pt-36"
    >
      {/* Décor de fond */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(37,99,235,0.28),transparent_65%)]" />
        <motion.div
          style={{ y: parallaxSlow }}
          className="grid-floor absolute inset-x-0 bottom-0 h-[65%] [mask-image:linear-gradient(to_top,black,transparent)] opacity-60"
        />
        <Glow className="-left-24 top-10 h-72 w-72 bg-primary/40" />
        <Glow className="-right-16 top-40 h-80 w-80 bg-gold/25" />
        <motion.div
          style={{ y: parallaxFast }}
          className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full border border-primary/15 animate-spin-slow"
        />
      </div>

      <motion.div
        style={{ opacity: heroFade }}
        className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.02fr_1fr] lg:gap-10"
      >
        {/* Colonne texte */}
        <div className="relative z-10 text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gold sm:text-xs"
          >
            <Clock3 className="h-3.5 w-3.5" />
            Offre valable 24h — 950 FCFA
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 text-balance text-4xl font-black uppercase leading-[0.98] tracking-tight sm:text-5xl lg:text-[3.5rem] xl:text-[3.9rem]"
          >
            Créez des <span className="text-gradient-blue">publicités vidéo</span> qui vendent
            <br className="hidden sm:block" />{' '}
            <span className="relative inline-block">
              <span className="text-gradient-gold">sans caméra.</span>
              <motion.span
                aria-hidden
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="absolute -bottom-1 left-0 h-1 w-full origin-left rounded-full bg-gradient-to-r from-gold to-transparent"
              />
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg lg:mx-0"
          >
            Pas d'acteur. Pas de studio. Pas de matériel. Vous décrivez la scène,
            l'intelligence artificielle la filme pour vous — puis vous publiez, et vous
            monétisez. <span className="font-semibold text-ink">Grok, VEO3, Opal, CapCut Pro</span>{' '}
            réunis dans un seul pack.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.32 }}
            className="mt-9 flex flex-col items-center gap-3.5 sm:flex-row sm:justify-center lg:justify-start"
          >
            <Cta href={LINKS.checkout} size="xl" icon={<Zap className="h-5 w-5" />}>
              Je veux mon pack à 950 F
            </Cta>
            <a
              href="#demos"
              className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-6 py-4 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-primary-light/60 hover:text-primary-light"
            >
              <Play className="h-4 w-4" />
              Voir les créations
            </a>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 text-xs text-muted sm:text-sm lg:justify-start"
          >
            <li className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary-light" /> Paiement sécurisé
            </li>
            <li className="inline-flex items-center gap-2">
              <Zap className="h-4 w-4 text-gold" /> Accès immédiat
            </li>
            <li className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary-light" /> Formation 100 % en ligne
            </li>
          </motion.ul>
        </div>

        {/* Colonne visuelle : mockup 3D en verre dépoli */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, rotateY: -18 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          transition={{ duration: 1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 [perspective:1600px]"
          onPointerMove={handlePointer}
          onPointerLeave={resetPointer}
        >
          {/* Inclinaison de repos : le mockup n'est jamais à plat. */}
          <div className="[transform:rotateY(-9deg)_rotateX(4deg)] [transform-style:preserve-3d]">
            <motion.div
              style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
              className="relative animate-float"
            >
            {/* Halo projeté sous le mockup */}
            <div
              aria-hidden
              className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-primary/40 via-transparent to-gold/30 blur-3xl"
            />

            <div className="glass-strong relative rounded-[2rem] p-3 shadow-[0_50px_120px_-40px_rgba(2,8,23,0.95)] sm:p-4">
              <motion.div
                aria-hidden
                style={{ background: spotlight }}
                className="pointer-events-none absolute inset-0 rounded-[2rem]"
              />

              {/* Barre de fenêtre */}
              <div className="mb-3 flex items-center gap-2 px-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-3 truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted sm:text-[11px]">
                  ai-video-universe · rendu final
                </span>
              </div>

              <div style={{ transform: 'translateZ(45px)' }}>
                <VideoFrame video={VIDEOS.hero_demo} eager />
              </div>

              {/* Étincelle décorative, coin bas */}
              <motion.div
                aria-hidden
                style={{ transform: 'translateZ(85px)' }}
                animate={{ rotate: [0, 18, -12, 0], scale: [1, 1.14, 0.96, 1] }}
                transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -bottom-5 -left-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/50 bg-gold/15 backdrop-blur-md sm:-bottom-6 sm:-left-6 sm:h-16 sm:w-16"
              >
                <Sparkles className="h-7 w-7 text-gold drop-shadow-[0_0_12px_rgba(245,158,11,0.9)]" />
                <span className="absolute inset-0 rounded-2xl border border-gold/40 animate-pulse-ring" />
              </motion.div>

              {/* Pastille flottante haut-droite */}
              <motion.div
                style={{ transform: 'translateZ(70px)' }}
                animate={{ y: [0, -9, 0] }}
                transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
                className="glass absolute -right-3 -top-5 hidden rounded-2xl px-3.5 py-2.5 xs:block sm:-right-6 sm:-top-6"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Généré par IA
                </p>
                <p className="text-lg font-black leading-none text-gradient-gold sm:text-xl">
                  0 caméra
                </p>
              </motion.div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
