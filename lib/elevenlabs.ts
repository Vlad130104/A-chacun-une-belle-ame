// Voix ElevenLabs. La clé reste sur le serveur : le navigateur n'envoie que le texte et l'identifiant de la voix.
const API = "https://api.elevenlabs.io";

export const MODELES = { qualite: "eleven_multilingual_v2", rapide: "eleven_flash_v2_5" } as const;
export type Modele = keyof typeof MODELES;

export function elevenDisponible(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export class ElevenErreur extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

async function eleven(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(API + path, {
    ...init,
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", ...(init.headers ?? {}) },
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

type Voix = { voice_id: string; name: string; category?: string; labels?: Record<string, string>; description?: string | null };

/** Voix disponibles sur le compte (voix par défaut, clonées et ajoutées depuis la bibliothèque). */
export async function listerVoix() {
  const data = (await (await eleven("/v2/voices?page_size=100")).json()) as { voices?: Voix[] };
  return (data.voices ?? [])
    .filter((v) => /^[A-Za-z0-9]{8,40}$/.test(v.voice_id))
    .map((v) => {
      const l = v.labels ?? {};
      const genre = l.gender === "female" ? "Femme" : l.gender === "male" ? "Homme" : "";
      const detail = [genre, l.accent, l.age, l.description || l.descriptive, l.use_case].filter(Boolean).join(" · ");
      return { id: v.voice_id, name: String(v.name).slice(0, 60), detail: detail.slice(0, 120), perso: v.category === "cloned" || v.category === "professional" };
    })
    .slice(0, 100);
}

/** Lit un texte et renvoie un MP3 (44,1 kHz). previous/next : phrases voisines, pour une intonation continue. */
export async function synthese(o: { texte: string; voix: string; modele: Modele; vitesse: number; avant?: string; apres?: string }): Promise<ArrayBuffer> {
  const res = await eleven(`/v1/text-to-speech/${encodeURIComponent(o.voix)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: o.texte,
      model_id: MODELES[o.modele],
      ...(o.avant ? { previous_text: o.avant } : {}),
      ...(o.apres ? { next_text: o.apres } : {}),
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: o.vitesse },
    }),
  });
  return res.arrayBuffer();
}
