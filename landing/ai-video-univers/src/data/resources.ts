/**
 * Ressources réelles du projet.
 *
 * Les vidéos et les liens sont ceux fournis par le client, utilisés tels quels :
 * aucune substitution, aucune régénération, aucun lien factice.
 *
 * Les images de galerie sont les mêmes fichiers, mais téléchargés depuis Drive et
 * servis par le site : une page de vente ne doit pas dépendre de la disponibilité
 * d'un Drive tiers, ni de ses limites de débit. `driveId` garde la trace du
 * fichier d'origine.
 */

export const LINKS = {
  checkout: 'https://cutt.ly/PykB9jcf',
  whatsapp: 'https://wa.me/message/P3MB57AH73G5I1',
  telegram: 'https://t.me/+UJNwsEUIZYE1YjFk',
} as const;

export type VideoKey = 'hero_demo' | 'pub_disaur' | 'video_tuto' | 'storytelling';

export interface VideoResource {
  key: VideoKey;
  id: string;
  badge: string;
  titre: string;
  description: string;
}

export const VIDEOS: Record<VideoKey, VideoResource> = {
  hero_demo: {
    key: 'hero_demo',
    id: 'ggHdxZCCJ0w',
    badge: 'Exemple de création ✦',
    titre: 'Démo principale',
    description: 'Une création réalisée entièrement avec les outils du pack.',
  },
  pub_disaur: {
    key: 'pub_disaur',
    id: 'deW8V0esE-o',
    badge: 'Pub Disaur ✦',
    titre: 'Publicité produit',
    description: 'Une publicité complète, sans caméra, sans acteur, sans studio.',
  },
  video_tuto: {
    key: 'video_tuto',
    id: 'Q1fSmJB0Hzc',
    badge: 'Vidéo Tuto ✦',
    titre: 'Format tutoriel',
    description: 'Le format qui explique, rassure et vend en même temps.',
  },
  storytelling: {
    key: 'storytelling',
    id: 'wOtebrzQGZk',
    badge: 'Storytelling ✦',
    titre: 'Histoire animée',
    description: 'Une histoire animée de bout en bout par l’intelligence artificielle.',
  },
};

/** Construit l'URL d'embed YouTube exigée par le brief. */
export function buildEmbedUrl(videoId: string, muted: boolean): string {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: muted ? '1' : '0',
    loop: '1',
    controls: '0',
    playlist: videoId,
    rel: '0',
    enablejsapi: '1',
    playsinline: '1',
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export interface GalleryImage {
  /** Chemin local, servi par le site lui-même. */
  src: string;
  categorie: 'Avatar IA' | 'Produit de luxe' | 'Mockup' | 'Avatar habillé';
  legende: string;
  /** Identifiant Drive d'origine, conservé pour retrouver le fichier source. */
  driveId: string;
}

export const GALLERY: GalleryImage[] = [
  {
    src: '/galerie/avatar-ia-1.jpg',
    categorie: 'Avatar IA',
    legende: 'Avatar IA 1',
    driveId: '1OW2_v585nkmjUD3qfG2u2NsjdN382dke',
  },
  {
    src: '/galerie/avatar-ia-2.jpg',
    categorie: 'Avatar IA',
    legende: 'Avatar IA 2',
    driveId: '15RobvGXVlyspBUEtQpF1ltx_nRclX783',
  },
  {
    src: '/galerie/avatar-ia-3.jpg',
    categorie: 'Avatar IA',
    legende: 'Avatar IA 3',
    driveId: '1v_vVwdrtRzkfRkz588lnkzLF6T_XifZ_',
  },
  {
    src: '/galerie/avatar-ia-4.jpg',
    categorie: 'Avatar IA',
    legende: 'Avatar IA 4',
    driveId: '1DgWcACCibHZU_akA1H1XQ7urOSe6NCOG',
  },
  {
    src: '/galerie/avatar-ia-5.jpg',
    categorie: 'Avatar IA',
    legende: 'Avatar IA 5',
    driveId: '1EkqJU54oVnDg6Qy-FmycxbV3XnOp2cEn',
  },
  {
    src: '/galerie/produit-luxe-1.jpg',
    categorie: 'Produit de luxe',
    legende: 'Produit de luxe 1',
    driveId: '1j2oLb6FtlstnaXN9C68nIfBWtgQxLL4N',
  },
  {
    src: '/galerie/produit-luxe-2.jpg',
    categorie: 'Produit de luxe',
    legende: 'Produit de luxe 2',
    driveId: '1Iaxea7hQn4haMnNwofBDiX6OeF18J5JL',
  },
  {
    src: '/galerie/produit-luxe-3.png',
    categorie: 'Produit de luxe',
    legende: 'Produit de luxe 3',
    driveId: '12kQp1yPfLARc_bPJiE5D10NhE4G7p8xj',
  },
  {
    src: '/galerie/produit-luxe-4.png',
    categorie: 'Produit de luxe',
    legende: 'Produit de luxe 4',
    driveId: '1HMjgOvnDFe9UUgU6YL5d3735C3UUpFGZ',
  },
  {
    src: '/galerie/produit-luxe-5.jpg',
    categorie: 'Produit de luxe',
    legende: 'Produit de luxe 5',
    driveId: '1HfTkintbrCOh-nMDyl1vOwQqNQ4X7TPf',
  },
  {
    src: '/galerie/mockup-1.jpg',
    categorie: 'Mockup',
    legende: 'Mockup 1',
    driveId: '1pd85t1ZMRoFp_NtMof7jX8nkY8dHvQ1q',
  },
  {
    src: '/galerie/mockup-2.jpg',
    categorie: 'Mockup',
    legende: 'Mockup 2',
    driveId: '1TGiYyPsVVEmU5TPqNVXz8vnj9DLfiJ45',
  },
  {
    src: '/galerie/combinaison.jpg',
    categorie: 'Mockup',
    legende: 'Combinaison',
    driveId: '10uIE5hV9I2TMZrPH8ZjW-7ksiYMHCD4E',
  },
  {
    src: '/galerie/avatar-habille-1.png',
    categorie: 'Avatar habillé',
    legende: 'Avatar habillé 1',
    driveId: '1YOOC_0h5ckjk3qzF6ojwI66xTpp8bxV0',
  },
  {
    src: '/galerie/avatar-habille-2.png',
    categorie: 'Avatar habillé',
    legende: 'Avatar habillé 2',
    driveId: '196PNOC2G-m_wWoRKqqj6BaMKLeTEygdl',
  },
  {
    src: '/galerie/avatar-habille-3.jpg',
    categorie: 'Avatar habillé',
    legende: 'Avatar habillé 3',
    driveId: '1xSVvwScv8MM2YquZIaDXDRExcm-al5UK',
  },
];

export const GALLERY_CATEGORIES = [
  'Tout',
  'Avatar IA',
  'Produit de luxe',
  'Mockup',
  'Avatar habillé',
] as const;

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];

/** Visuels de marque fournis par le client (servis depuis /public). */
export const BRAND = {
  logo: '/brand/logo-ai-video-univers.png',
  offre: '/brand/offre-pack-950f.png',
  hook: '/brand/creator-hook.jpg',
} as const;
