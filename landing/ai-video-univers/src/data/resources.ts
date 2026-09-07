/**
 * Ressources réelles du projet.
 *
 * Les URLs ci-dessous sont fournies par le client et doivent être utilisées
 * telles quelles : aucune substitution, aucune régénération, aucun lien factice.
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
  src: string;
  categorie: 'Avatar IA' | 'Produit de luxe' | 'Mockup' | 'Avatar habillé';
  legende: string;
}

export const GALLERY: GalleryImage[] = [
  {
    src: 'https://drive.google.com/thumbnail?id=1OW2_v585nkmjUD3qfG2u2NsjdN382dke&sz=w800',
    categorie: 'Avatar IA',
    legende: 'Avatar IA 1',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=15RobvGXVlyspBUEtQpF1ltx_nRclX783&sz=w800',
    categorie: 'Avatar IA',
    legende: 'Avatar IA 2',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=1v_vVwdrtRzkfRkz588lnkzLF6T_XifZ_&sz=w800',
    categorie: 'Avatar IA',
    legende: 'Avatar IA 3',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=1DgWcACCibHZU_akA1H1XQ7urOSe6NCOG&sz=w800',
    categorie: 'Avatar IA',
    legende: 'Avatar IA 4',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=1EkqJU54oVnDg6Qy-FmycxbV3XnOp2cEn&sz=w800',
    categorie: 'Avatar IA',
    legende: 'Avatar IA 5',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=1j2oLb6FtlstnaXN9C68nIfBWtgQxLL4N&sz=w800',
    categorie: 'Produit de luxe',
    legende: 'Produit de luxe 1',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=1Iaxea7hQn4haMnNwofBDiX6OeF18J5JL&sz=w800',
    categorie: 'Produit de luxe',
    legende: 'Produit de luxe 2',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=12kQp1yPfLARc_bPJiE5D10NhE4G7p8xj&sz=w800',
    categorie: 'Produit de luxe',
    legende: 'Produit de luxe 3',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=1HMjgOvnDFe9UUgU6YL5d3735C3UUpFGZ&sz=w800',
    categorie: 'Produit de luxe',
    legende: 'Produit de luxe 4',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=1HfTkintbrCOh-nMDyl1vOwQqNQ4X7TPf&sz=w800',
    categorie: 'Produit de luxe',
    legende: 'Produit de luxe 5',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=1pd85t1ZMRoFp_NtMof7jX8nkY8dHvQ1q&sz=w800',
    categorie: 'Mockup',
    legende: 'Mockup 1',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=1TGiYyPsVVEmU5TPqNVXz8vnj9DLfiJ45&sz=w800',
    categorie: 'Mockup',
    legende: 'Mockup 2',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=10uIE5hV9I2TMZrPH8ZjW-7ksiYMHCD4E&sz=w800',
    categorie: 'Mockup',
    legende: 'Combinaison',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=1YOOC_0h5ckjk3qzF6ojwI66xTpp8bxV0&sz=w800',
    categorie: 'Avatar habillé',
    legende: 'Avatar habillé 1',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=196PNOC2G-m_wWoRKqqj6BaMKLeTEygdl&sz=w800',
    categorie: 'Avatar habillé',
    legende: 'Avatar habillé 2',
  },
  {
    src: 'https://drive.google.com/thumbnail?id=1xSVvwScv8MM2YquZIaDXDRExcm-al5UK&sz=w800',
    categorie: 'Avatar habillé',
    legende: 'Avatar habillé 3',
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
