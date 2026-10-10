// Voix ElevenLabs. La clé reste sur le serveur : le navigateur n'envoie que le texte et l'identifiant de la voix.
import { cle } from "./cles";

const API = "https://api.elevenlabs.io";

export const MODELES = { qualite: "eleven_multilingual_v2", rapide: "eleven_flash_v2_5" } as const;
export type Modele = keyof typeof MODELES;

export function elevenDisponible(): boolean {
  return Boolean(cle("ELEVENLABS_API_KEY"));
}

export class ElevenErreur extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

async function eleven(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(API + path, {
    ...init,
    headers: { "xi-api-key": cle("ELEVENLABS_API_KEY"), ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (res.ok) return res;
  let detail = "";
  try { detail = JSON.stringify(await res.json()); } catch { /* corps vide */ }
  if (/quota_exceeded|insufficient|credits/i.test(detail)) throw new ElevenErreur("voix_quota", 402);
  if (res.status === 401 || res.status === 403) throw new ElevenErreur("voix_cle_invalide", 502);
  if (res.status === 429) throw new ElevenErreur("voix_saturee", 429);
  if (res.status === 404 || /voice_not_found/i.test(detail)) throw new ElevenErreur("voix_introuvable", 404);
  throw new ElevenErreur("voix_erreur", 502);
}

const ID = /^[A-Za-z0-9]{8,40}$/;
const genreFr = (g?: string) => (g === "female" ? "Femme" : g === "male" ? "Homme" : g === "neutral" ? "Neutre" : "");
/** Extrait audio d'une voix : seules les adresses de stockage ElevenLabs sont acceptées (relais côté serveur). */
export function apercuAutorise(u: unknown): string | null {
  if (typeof u !== "string" || u.length > 600) return null;
  try {
    const url = new URL(u);
    const ok = url.protocol === "https:" && ((url.hostname === "storage.googleapis.com" && url.pathname.startsWith("/eleven-")) || /(^|\.)elevenlabs\.io$/.test(url.hostname));
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
}

type Voix = { voice_id: string; name: string; category?: string; labels?: Record<string, string>; preview_url?: string | null };

/** Toutes les voix du compte (par défaut, clonées, ajoutées depuis la bibliothèque), page par page. */
export async function listerVoix() {
  const out: Voix[] = [];
  let token = "";
  for (let page = 0; page < 10; page++) {
    const data = (await (await eleven(`/v2/voices?page_size=100${token ? "&next_page_token=" + encodeURIComponent(token) : ""}`)).json()) as { voices?: Voix[]; has_more?: boolean; next_page_token?: string };
    out.push(...(data.voices ?? []));
    if (!data.has_more || !data.next_page_token) break;
    token = data.next_page_token;
  }
  return out
    .filter((v) => ID.test(v.voice_id))
    .map((v) => {
      const l = v.labels ?? {};
      const detail = [genreFr(l.gender), l.accent, l.age, l.description || l.descriptive, l.use_case].filter(Boolean).join(" · ");
      return { id: v.voice_id, name: String(v.name).slice(0, 60), detail: detail.slice(0, 120), perso: v.category === "cloned" || v.category === "professional", apercu: apercuAutorise(v.preview_url) };
    });
}

type Partagee = { public_owner_id: string; voice_id: string; name: string; gender?: string; age?: string; accent?: string; language?: string; use_case?: string; descriptive?: string; description?: string; preview_url?: string; cloned_by_count?: number };

/** Bibliothèque publique d'ElevenLabs (des milliers de voix), filtrée et paginée. */
export async function bibliotheque(f: { recherche: string; langue: string; genre: string; usage: string; page: number }) {
  const q = new URLSearchParams({ page_size: "30", page: String(f.page) });
  if (f.recherche) q.set("search", f.recherche);
  if (f.langue) q.set("language", f.langue);
  if (f.genre) q.set("gender", f.genre);
  if (f.usage) q.set("use_cases", f.usage);
  const data = (await (await eleven(`/v1/shared-voices?${q}`)).json()) as { voices?: Partagee[]; has_more?: boolean };
  const voices = (data.voices ?? [])
    .filter((v) => ID.test(v.voice_id) && /^[A-Za-z0-9]{8,80}$/.test(v.public_owner_id))
    .map((v) => ({
      id: v.voice_id, owner: v.public_owner_id, name: String(v.name).slice(0, 60),
      detail: [genreFr(v.gender), v.accent, v.age, v.descriptive, v.use_case].filter(Boolean).join(" · ").slice(0, 120),
      langue: String(v.language ?? "").slice(0, 10), apercu: apercuAutorise(v.preview_url), populaire: v.cloned_by_count ?? 0,
    }));
  return { voices, plus: Boolean(data.has_more) };
}

/** Ajoute une voix de la bibliothèque au compte (obligatoire pour la faire lire). Renvoie son identifiant d'utilisation. */
export async function ajouterVoix(owner: string, id: string, nom: string): Promise<string> {
  try {
    const res = await eleven(`/v1/voices/add/${encodeURIComponent(owner)}/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: nom.slice(0, 60) || "Voix Bachir" }),
    });
    const data = (await res.json()) as { voice_id?: string };
    return data.voice_id && ID.test(data.voice_id) ? data.voice_id : id;
  } catch (e) {
    // Déjà ajoutée : la voix se lit avec son identifiant d'origine.
    if (e instanceof ElevenErreur && e.code === "voix_erreur") return id;
    throw e;
  }
}

/**
 * Lit un texte et renvoie le MP3 (en base64) et le temps de chaque mot, tiré de l'alignement caractère par caractère
 * d'ElevenLabs : les sous-titres et les changements de plan suivent la voix réelle, pas une estimation.
 * previous/next : phrases voisines, pour une intonation continue.
 */
export async function synthese(o: { texte: string; voix: string; modele: Modele; vitesse: number; avant?: string; apres?: string }): Promise<{ audio: string; mots: [number, number][] }> {
  const res = await eleven(`/v1/text-to-speech/${encodeURIComponent(o.voix)}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: o.texte,
      model_id: MODELES[o.modele],
      ...(o.avant ? { previous_text: o.avant } : {}),
      ...(o.apres ? { next_text: o.apres } : {}),
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: o.vitesse },
    }),
  });
  const d = (await res.json()) as { audio_base64?: string; alignment?: { characters?: string[]; character_start_times_seconds?: number[]; character_end_times_seconds?: number[] } };
  if (!d.audio_base64) throw new ElevenErreur("voix_erreur", 502);
  return { audio: d.audio_base64, mots: motsAlignes(d.alignment) };
}

/** Regroupe l'alignement par caractère en [début, fin] de chaque mot (séparés par des espaces). */
function motsAlignes(a?: { characters?: string[]; character_start_times_seconds?: number[]; character_end_times_seconds?: number[] }): [number, number][] {
  const c = a?.characters ?? [], s = a?.character_start_times_seconds ?? [], e = a?.character_end_times_seconds ?? [];
  const out: [number, number][] = [];
  let cur: [number, number] | null = null;
  for (let i = 0; i < c.length; i++) {
    if (/\s/.test(c[i])) { if (cur) { out.push(cur); cur = null; } continue; }
    const t0 = Number(s[i]) || 0, t1 = Number(e[i]) || t0;
    if (!cur) cur = [t0, t1]; else cur[1] = t1;
  }
  if (cur) out.push(cur);
  return out.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
}
