import { NextResponse, type NextRequest } from "next/server";
import { avecCles } from "../../../../lib/cles";
import { guardApi, jsonError, rateLimit, sessionOf } from "../../../../lib/guard";
import { ElevenErreur, elevenDisponible, listerVoix, MODELES, synthese, type Modele } from "../../../../lib/elevenlabs";

export const runtime = "nodejs";
export const maxDuration = 60;

const erreur = (e: unknown) => (e instanceof ElevenErreur ? jsonError(e.code, e.status) : jsonError("voix_erreur", 502));

// Liste des voix du compte ElevenLabs.
async function get(req: NextRequest) {
  const session = await sessionOf(req);
  if (!session) return jsonError("non_connecte", 401);
  if (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin") return jsonError("origine_refusee", 403);
  if (!elevenDisponible()) return jsonError("voix_non_configuree", 503);
  if (!rateLimit("voixliste:" + session.id, 120, 60 * 60 * 1000)) return jsonError("trop_de_demandes", 429);
  try {
    return NextResponse.json({ voices: await listerVoix() });
  } catch (e) {
    return erreur(e);
  }
}

// Lecture d'un passage du script. Un appel par passage : la durée de chaque plan vidéo suit la voix.
async function post(req: NextRequest) {
  const g = await guardApi(req, 8_000, "voix", 2_000);
  if (g instanceof NextResponse) return g;
  if (!elevenDisponible()) return jsonError("voix_non_configuree", 503);
  const b = (g.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const texte = str(b.texte, 2_500);
  const voix = str(b.voix, 40);
  const modele: Modele = Object.hasOwn(MODELES, String(b.modele)) ? (b.modele as Modele) : "qualite";
  const vitesse = Math.min(1.2, Math.max(0.7, Number(b.vitesse) || 1));
  if (!texte || !/^[A-Za-z0-9]{8,40}$/.test(voix)) return jsonError("requete_invalide", 400);
  try {
    return NextResponse.json(await synthese({ texte, voix, modele, vitesse, avant: str(b.avant, 400), apres: str(b.apres, 400) }));
  } catch (e) {
    return erreur(e);
  }
}

export const GET = (req: NextRequest) => avecCles(req, () => get(req));

export const POST = (req: NextRequest) => avecCles(req, () => post(req));
