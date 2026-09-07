import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { buildEmbedUrl, type VideoResource } from '../data/resources';
import { useSoundBus } from '../hooks/useSoundBus';
import { useInView } from '../hooks/useInView';

interface VideoFrameProps {
  video: VideoResource;
  /** Charge l'iframe immédiatement, sans attendre l'entrée dans le viewport. */
  eager?: boolean;
  className?: string;
  ratio?: string;
}

/**
 * Vrai embed YouTube, monté en JavaScript à partir de `data-video-id`.
 *
 * L'attribut `src` n'est jamais écrit dans le JSX : il est construit après le
 * montage, ce qui permet de le reconstruire à chaque changement d'état du son.
 */
export function VideoFrame({
  video,
  eager = false,
  className = '',
  ratio = 'aspect-video',
}: VideoFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { ref: wrapperRef, inView } = useInView<HTMLDivElement>('300px');
  const { isUnmuted, toggle } = useSoundBus();

  const unmuted = isUnmuted(video.key);
  const shouldLoad = eager || inView;

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame || !shouldLoad) return;

    const videoId = frame.dataset.videoId;
    if (!videoId) return;

    const next = buildEmbedUrl(videoId, !unmuted);
    if (frame.src !== next) {
      frame.src = next;
    }
  }, [shouldLoad, unmuted]);

  return (
    <div ref={wrapperRef} className={`group relative ${className}`}>
      <div
        className={`relative ${ratio} w-full overflow-hidden rounded-2xl border border-white/10 bg-navy shadow-[0_28px_90px_-30px_rgba(37,99,235,0.85)]`}
      >
        {/* Fond de chargement : évite tout aplat blanc avant l'arrivée de l'embed. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-navy via-night to-navy"
        >
          <div className="absolute inset-0 animate-pulse bg-[radial-gradient(300px_140px_at_50%_50%,rgba(37,99,235,0.22),transparent_70%)]" />
        </div>

        <iframe
          ref={iframeRef}
          data-video-id={video.id}
          title={`${video.titre} — AI Video Universe`}
          className="absolute inset-0 h-full w-full scale-[1.02]"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading={eager ? 'eager' : 'lazy'}
        />

        {/* Vignetage : ne bloque jamais le clic sur la vidéo. */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-night/80 to-transparent" />

        <span className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/20 bg-night/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-light backdrop-blur-md sm:text-xs">
          {video.badge}
        </span>

        <motion.button
          type="button"
          onClick={() => toggle(video.key)}
          whileTap={{ scale: 0.94 }}
          aria-pressed={unmuted}
          className={`absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold uppercase tracking-wide backdrop-blur-md transition-colors sm:text-sm ${
            unmuted
              ? 'border border-gold/60 bg-gold/20 text-gold'
              : 'border border-white/20 bg-night/70 text-ink hover:border-primary-light/60 hover:text-primary-light'
          }`}
        >
          {unmuted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {unmuted ? 'Son actif' : 'Activer le son'}
        </motion.button>
      </div>
    </div>
  );
}
