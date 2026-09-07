import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Plus, ShieldQuestion } from 'lucide-react';
import { LINKS } from '../data/resources';
import { Cta, Eyebrow, Glow, Lead, Reveal, SectionShell, SectionTitle } from './ui';

const QUESTIONS = [
  {
    question: 'Est-ce que je dois être expert en IA ?',
    reponse:
      'Non. Le pack est conçu pour permettre aux débutants de découvrir progressivement les outils et ressources proposés.',
  },
  {
    question: 'Est-ce que je dois avoir un ordinateur puissant ?',
    reponse:
      'Pas nécessairement pour toutes les ressources. Une partie des outils et services proposés fonctionne directement en ligne ou sur mobile, selon leurs propres conditions techniques.',
  },
  {
    question: 'Est-ce que je peux utiliser ces ressources pour mon activité ?',
    reponse:
      'Oui, dans la limite des droits et conditions propres à chaque ressource fournie.',
  },
  {
    question: 'Est-ce que je dois déjà savoir créer des vidéos ?',
    reponse:
      'Non. Justement : les ressources et la formation bonus sont destinées à vous aider à progresser.',
  },
  {
    question: 'Comment je reçois le pack après le paiement ?',
    reponse:
      'L’accès est transmis après l’achat via le lien de paiement. En cas de question, l’assistance WhatsApp reste joignable.',
  },
  {
    question: 'Et si j’ai besoin d’aide ?',
    reponse:
      'Le support WhatsApp et le canal Telegram sont accessibles depuis cette page, avant comme après l’achat.',
  },
];

export function FaqSection() {
  const [ouverte, setOuverte] = useState<number | null>(0);

  return (
    <SectionShell id="faq" className="overflow-hidden">
      <Glow className="-left-24 top-16 h-72 w-72 bg-primary/20" />

      <Reveal className="text-center">
        <Eyebrow>🛡️ Vous hésitez encore ?</Eyebrow>
        <SectionTitle className="mx-auto mt-5 max-w-3xl">
          C’est <span className="text-gradient-blue">normal</span>. Voici les réponses.
        </SectionTitle>
        <Lead className="mx-auto mt-5 max-w-2xl">
          Les quatre questions que tout le monde se pose avant d’acheter — et deux de plus.
        </Lead>
      </Reveal>

      <div className="mx-auto mt-12 max-w-3xl space-y-3">
        {QUESTIONS.map((item, index) => {
          const active = ouverte === index;
          return (
            <motion.div
              key={item.question}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: Math.min(index * 0.06, 0.3) }}
              className={`glass overflow-hidden rounded-2xl transition-colors ${
                active ? 'border-primary/40' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => setOuverte(active ? null : index)}
                aria-expanded={active}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
              >
                <span className="flex items-start gap-3">
                  <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-primary-light" />
                  <span className="text-sm font-bold text-ink sm:text-base">{item.question}</span>
                </span>
                <motion.span
                  animate={{ rotate: active ? 45 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5"
                >
                  <Plus className="h-4 w-4 text-gold" />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {active && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <p className="px-5 pb-5 pl-[3.25rem] text-sm leading-relaxed text-muted sm:px-6 sm:pb-6 sm:pl-[3.5rem] sm:text-base">
                      {item.reponse}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      <Reveal delay={0.1} className="mt-12 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
        <Cta href={LINKS.checkout} size="lg">
          Obtenir le pack — 950 F
        </Cta>
        <a
          href={LINKS.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-6 py-4 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:border-emerald-400/60 hover:text-emerald-300"
        >
          <MessageCircle className="h-4 w-4" />
          Poser ma question sur WhatsApp
        </a>
      </Reveal>
    </SectionShell>
  );
}
