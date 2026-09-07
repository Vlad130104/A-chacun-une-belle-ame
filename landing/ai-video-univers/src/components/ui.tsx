import { motion, type Variants } from 'framer-motion';
import type { ElementType, ReactNode } from 'react';

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 34 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

/** Révélation au scroll, jouée une seule fois. */
export function Reveal({
  children,
  className = '',
  delay = 0,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: ElementType;
}) {
  const Component = motion(as as 'div');
  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      variants={fadeUp}
      transition={{ delay }}
    >
      {children}
    </Component>
  );
}

export function SectionShell({
  id,
  children,
  className = '',
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`relative px-5 py-20 sm:px-8 sm:py-24 lg:py-28 ${className}`}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-light sm:text-xs">
      {children}
    </span>
  );
}

export function SectionTitle({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-balance text-3xl font-extrabold uppercase leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl ${className}`}
    >
      {children}
    </h2>
  );
}

export function Lead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-pretty text-base leading-relaxed text-muted sm:text-lg ${className}`}>
      {children}
    </p>
  );
}

type CtaProps = {
  href: string;
  children: ReactNode;
  variant?: 'gold' | 'blue' | 'ghost';
  size?: 'md' | 'lg' | 'xl';
  className?: string;
  icon?: ReactNode;
};

const SIZES: Record<NonNullable<CtaProps['size']>, string> = {
  md: 'px-5 py-3 text-sm',
  lg: 'px-7 py-4 text-base',
  xl: 'px-8 py-5 text-base sm:text-lg',
};

const VARIANTS: Record<NonNullable<CtaProps['variant']>, string> = {
  gold: 'bg-gradient-to-r from-amber-300 via-gold to-amber-400 text-night shadow-gold',
  blue: 'bg-gradient-to-r from-primary via-primary-light to-primary text-white shadow-glow',
  ghost: 'border border-white/20 bg-white/5 text-ink hover:border-primary-light/60',
};

/**
 * Tous les CTA sont de vrais liens : jamais de `#`, jamais de bouton mort.
 */
export function Cta({ href, children, variant = 'gold', size = 'lg', className = '', icon }: CtaProps) {
  const external = href.startsWith('http');
  return (
    <motion.a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      whileHover={{ scale: 1.035, y: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      className={`cta-glow inline-flex items-center justify-center gap-2.5 rounded-full text-center font-extrabold uppercase tracking-wide ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    >
      {icon}
      {children}
    </motion.a>
  );
}

/** Halo lumineux décoratif, purement visuel. */
export function Glow({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute rounded-full blur-[120px] ${className}`}
    />
  );
}
