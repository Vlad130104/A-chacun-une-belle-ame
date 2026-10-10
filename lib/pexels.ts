// B-rolls libres de droits via l'API Pexels. La clé reste sur le serveur.
const API = "https://api.pexels.com/videos";

export type Orientation = "portrait" | "landscape";
type PexelsFile = { id: number; link: string; width: number | null; height: number | null; file_type: string };
type PexelsVideo = { id: number; duration: number; image: string; url: string; user?: { name?: string }; video_files: PexelsFile[] };

export function pexelsDisponible(): boolean {
  return Boolean(process.env.PEXELS_API_KEY);
}

async function pexels(path: string): Promise<unknown> {
  const res = await fetch(API + path, { headers: { Authorization: process.env.PEXELS_API_KEY ?? "" }, cache: "no-store" });
  if (!res.ok) throw new Error(`pexels_${res.status}`);
  return res.json();
}

/** Fichier MP4 le plus léger dont le petit côté atteint 540 px, hébergé par Pexels. */
function choisirFichier(files: PexelsFile[]): PexelsFile | null {
  const ok = files.filter((f) => f.file_type === "video/mp4" && f.width && f.height && /^https:\/\/videos\.pexels\.com\//.test(f.link));
  if (!ok.length) return null;
  const petit = (f: PexelsFile) => Math.min(f.width ?? 0, f.height ?? 0);
  const assez = ok.filter((f) => petit(f) >= 540).sort((a, b) => petit(a) - petit(b));
  return assez[0] ?? ok.sort((a, b) => petit(b) - petit(a))[0];
}

export async function chercherVideos(q: string, orientation: Orientation) {
  const params = new URLSearchParams({ query: q, orientation, per_page: "8", locale: "fr-FR", size: "medium" });
  const data = (await pexels(`/search?${params}`)) as { videos?: PexelsVideo[] };
  return (data.videos ?? [])
    .map((v) => {
      const f = choisirFichier(v.video_files);
      return f && { id: v.id, fileId: f.id, link: f.link, width: f.width, height: f.height, duration: v.duration, image: v.image, page: v.url, author: v.user?.name ?? "" };
    })
    .filter(Boolean);
}

/** Retrouve le lien du fichier auprès de Pexels : le relais ne télécharge jamais une adresse fournie par le navigateur. */
export async function lienFichier(videoId: number, fileId: number): Promise<string | null> {
  const v = (await pexels(`/videos/${videoId}`)) as PexelsVideo;
  const f = v.video_files.find((x) => x.id === fileId);
  return f && /^https:\/\/videos\.pexels\.com\//.test(f.link) ? f.link : null;
}
