import { useEffect, useRef, useState } from 'react';
import { motion, useInView as useFramerInView } from 'framer-motion';
import { Film, Sparkles, Store, Timer } from 'lucide-react';

interface Stat {
  icon: typeof Film;
  valeur: number;
  suffixe: string;
  label: string;
  accent: string;
}

const STATS: Stat[] = [
  { icon: Sparkles, valeur: 10000, suffixe: '', label: 'Prompts prêts à l’emploi', accent: 'text-primary-light' },
  { icon: Film, valeur: 10000, suffixe: '', label: 'Vidéos virales d’inspiration', accent: 'text-gold' },
  { icon: Store, valeur: 10, suffixe: ' M', label: 'Produits digitaux revendables', accent: 'text-primary-light' },
  { icon: Timer, valeur: 950, suffixe: ' F', label: 'Le pack complet, aujourd’hui', accent: 'text-gold' },
];

function Counter({ to, suffixe }: { to: number; suffixe: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const visible = useFramerInView(ref, { once: true, margin: '-60px' });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const duration = 1400;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(to * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, to]);

  return (
    <span ref={ref}>
      {value.toLocaleString('fr-FR')}
      {suffixe}
    </span>
  );
}

export function StatsBar() {
  return (
    <section className="relative border-y border-white/10 bg-navy/60 px-5 py-10 backdrop-blur-sm sm:px-8 sm:py-12">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(700px_200px_at_50%_0%,rgba(37,99,235,0.22),transparent_70%)]"
      />
      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 sm:gap-8 lg:grid-cols-4">
        {STATS.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.55, delay: index * 0.08 }}
            className="text-center lg:text-left"
          >
            <stat.icon className={`mx-auto h-5 w-5 lg:mx-0 ${stat.accent}`} />
            <p className="mt-3 text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">
              <Counter to={stat.valeur} suffixe={stat.suffixe} />
            </p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted sm:text-xs">
              {stat.label}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
