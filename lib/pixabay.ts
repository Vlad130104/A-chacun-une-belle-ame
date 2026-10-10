// Vidéos libres de Pixabay. La clé reste sur le serveur ; les réponses sont gardées 24 h (règle de l'API Pixabay).
import { cle } from "./cles";

const API = "https://pixabay.com/api/videos/";
const CDN = /^https:\/\/cdn\.pixabay\.com\//;

type Rendu = { url: string; width: number; height: number; size?: number; thumbnail?: string };
type Hit = { id: number; pageURL: string; duration: number; user?: string; videos: Record<string, Rendu | undefined> };
export type Orientation = "portrait" | "landscape";
export const RENDUS = ["tiny", "small", "medium", "large"] as const;

export function pixabayDisponible(): boolean {
  return Boolean(cle("PIXABAY_API_KEY"));
}

const cache = new Map<string, { t: number; data: { hits?: Hit[] } }>();
async function pixabay(params: Record<string, string>): Promise<{ hits?: Hit[] }> {
  const q = new URLSearchParams({ key: cle("PIXABAY_API_KEY"), safesearch: "true", ...params });
  const k = q.toString();
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < 24 * 3600 * 1000) return hit.data;
  const res = await fetch(`${API}?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`pixabay_${res.status}`);
  const data = (await res.json()) as { hits?: Hit[] };
  if (cache.size > 2000) cache.clear();
  cache.set(k, { t: Date.now(), data });
  return data;
}

/** Rendu le plus léger dont le petit côté atteint 540 px, hébergé par Pixabay. */
function choisirRendu(h: Hit): { rendu: (typeof RENDUS)[number]; v: Rendu } | null {
  const ok = RENDUS.map((r) => ({ rendu: r, v: h.videos?.[r] })).filter((x): x is { rendu: (typeof RENDUS)[number]; v: Rendu } => Boolean(x.v && CDN.test(x.v.url) && x.v.width && x.v.height));
  if (!ok.length) return null;
  const petit = (v: Rendu) => Math.min(v.width, v.height);
  return ok.find((x) => petit(x.v) >= 540) ?? ok[ok.length - 1];
}

export async function chercherVideosPixabay(q: string, orientation: Orientation) {
  // Les requêtes de Claude sont en anglais ; un texte accentué est cherché en français.
  const lang = /[àâçéèêëîïôûùüÿœ]/i.test(q) ? "fr" : "en";
  const data = await pixabay({ q: q.slice(0, 100), lang, per_page: "20", video_type: "film" });
  return (data.hits ?? [])
    .map((h) => {
      const c = choisirRendu(h);
      if (!c) return null;
      const portrait = c.v.height > c.v.width;
      return {
        id: h.id, fileId: c.rendu, link: c.v.url, width: c.v.width, height: c.v.height, duration: h.duration,
        image: c.v.thumbnail && CDN.test(c.v.thumbnail) ? c.v.thumbnail : "", page: h.pageURL, author: h.user ?? "",
        bonSens: orientation === "portrait" ? portrait : !portrait,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    // Vidéos déjà dans le bon sens en premier (Pixabay ne filtre pas l'orientation)
    .sort((a, b) => Number(b.bonSens) - Number(a.bonSens))
    .map(({ bonSens: _, ...v }) => v);
}

/** Lien du fichier retrouvé auprès de Pixabay : le relais ne télécharge jamais une adresse fournie par le navigateur. */
export async function lienFichierPixabay(id: number, rendu: string): Promise<string | null> {
  if (!(RENDUS as readonly string[]).includes(rendu)) return null;
  const data = await pixabay({ id: String(id) });
  const v = data.hits?.[0]?.videos?.[rendu];
  return v && CDN.test(v.url) ? v.url : null;
}
