import { motion } from 'framer-motion';
import { Headphones } from 'lucide-react';
import { LINKS, VIDEOS } from '../data/resources';
import { VideoFrame } from './VideoFrame';
import { Cta, Eyebrow, Glow, Lead, Reveal, SectionShell, SectionTitle } from './ui';

const SHOWCASE = [VIDEOS.pub_disaur, VIDEOS.video_tuto, VIDEOS.storytelling];

export function VideoShowcaseSection() {
  return (
    <SectionShell id="demos" className="overflow-hidden">
      <Glow className="-right-40 top-10 h-80 w-80 bg-gold/20" />

      <Reveal className="text-center">
        <Eyebrow>Les créations, en vrai</Eyebrow>
        <SectionTitle className="mx-auto mt-5 max-w-3xl">
          Voilà ce que l’IA <span className="text-gradient-gold">filme</span> à votre place
        </SectionTitle>
        <Lead className="mx-auto mt-5 max-w-2xl">
          Trois formats, trois usages, zéro caméra. Les vidéos tournent en sourdine :
          appuyez sur <span className="font-semibold text-ink">Activer le son</span> pour en
          écouter une — les autres se coupent automatiquement.
        </Lead>
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted sm:text-sm">
          <Headphones className="h-4 w-4 text-primary-light" />
          Un seul son actif à la fois.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-6 sm:gap-7 lg:grid-cols-3">
        {SHOWCASE.map((video, index) => (
          <motion.article
            key={video.key}
            initial={{ opacity: 0, y: 40, rotateX: 8 }}
            whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
            viewport={{ once: true, margin: '-70px' }}
            transition={{ duration: 0.7, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -8 }}
            className="glass group rounded-3xl p-3.5 transition-shadow hover:shadow-glow sm:p-4"
          >
            <VideoFrame video={video} />
            <div className="px-1.5 pb-1 pt-4">
              <h3 className="text-lg font-extrabold tracking-tight sm:text-xl">{video.titre}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{video.description}</p>
            </div>
          </motion.article>
        ))}
      </div>

      <Reveal delay={0.1} className="mt-12 text-center">
        <Cta href={LINKS.checkout} size="lg">
          Créer les miennes — 950 F
        </Cta>
      </Reveal>
    </SectionShell>
  );
}
