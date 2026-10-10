// Vidéos générées par IA sur mesure (payant) via fal.ai, modèle Kling 2.6 Pro, en file d'attente :
// on soumet le plan, on suit son état, puis on récupère l'adresse du fichier. La clé reste sur le serveur.
import { cle } from "./cles";

const QUEUE = "https://queue.fal.run/";
export const MODELE = "fal-ai/kling-video/v2.6/pro/text-to-video";
export const PRIX_PLAN = 0.35; // dollars pour un plan de 5 s sans son (0,07 $ par seconde, tarif fal affiché)

export function falDisponible(): boolean {
  return Boolean(cle("FAL_KEY"));
}
export class FalErreur extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
const surFal = (u: unknown): u is string => typeof u === "string" && u.startsWith(QUEUE) && u.length < 400 && !/[\s"'<>]/.test(u);

async function fal(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Key ${cle("FAL_KEY")}`, "Content-Type": "application/json", ...(init.headers ?? {}) }, cache: "no-store" });
  if (res.ok || res.status === 202) return res;
  if (res.status === 401 || res.status === 403) throw new FalErreur("ia_video_cle", 502);
  if (res.status === 402) throw new FalErreur("ia_video_credit", 402);
  if (res.status === 429) throw new FalErreur("ia_video_sature", 429);
  if (res.status === 422) throw new FalErreur("ia_video_refus", 422);
  throw new FalErreur("ia_video_erreur", 502);
}

/** Soumet un plan de 5 secondes. Renvoie les adresses de suivi fournies par fal (vérifiées). */
export async function lancer(prompt: string, format: "9:16" | "16:9"): Promise<{ statut: string; resultat: string }> {
  const res = await fal(QUEUE + MODELE, {
    method: "POST",
    body: JSON.stringify({ prompt, duration: "5", aspect_ratio: format, negative_prompt: "text, subtitles, watermark, logo, blur, distortion, low quality", generate_audio: false }),
  });
  const d = (await res.json()) as { status_url?: string; response_url?: string };
  if (!surFal(d.status_url) || !surFal(d.response_url)) throw new FalErreur("ia_video_erreur", 502);
  return { statut: d.status_url, resultat: d.response_url };
}

/** État d'un plan ; une fois terminé, l'adresse de la vidéo. */
export async function suivre(statut: string, resultat: string): Promise<{ etat: "attente" | "fini" | "echec"; url?: string }> {
  if (!surFal(statut) || !surFal(resultat)) throw new FalErreur("requete_invalide", 400);
  const s = (await (await fal(statut)).json()) as { status?: string };
  if (s.status === "IN_QUEUE" || s.status === "IN_PROGRESS") return { etat: "attente" };
  if (s.status !== "COMPLETED") return { etat: "echec" };
  const r = (await (await fal(resultat)).json()) as { video?: { url?: string } };
  const url = r.video?.url;
  return url && videoAutorisee(url) ? { etat: "fini", url } : { etat: "echec" };
}

/** Fichiers produits par fal : seuls ses domaines de stockage sont acceptés par le relais. */
export function videoAutorisee(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 600) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && /(^|\.)fal\.media$/.test(url.hostname);
  } catch {
    return false;
  }
}
