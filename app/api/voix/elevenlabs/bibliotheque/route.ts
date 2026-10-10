import { NextResponse, type NextRequest } from "next/server";
import { jsonError, rateLimit, sessionOf } from "../../../../../lib/guard";
import { bibliotheque, ElevenErreur, elevenDisponible } from "../../../../../lib/elevenlabs";

export const runtime = "nodejs";

const GENRES = new Set(["", "female", "male", "neutral"]);
const USAGES = new Set(["", "narrative_story", "conversational", "characters_animation", "social_media", "educational", "advertisement", "entertainment_tv", "informative_educational"]);

export async function GET(req: NextRequest) {
  const session = await sessionOf(req);
  if (!session) return jsonError("non_connecte", 401);
  if (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin") return jsonError("origine_refusee", 403);
  if (!elevenDisponible()) return jsonError("voix_non_configuree", 503);
  if (!rateLimit("voixbiblio:" + session.id, 300, 60 * 60 * 1000)) return jsonError("trop_de_demandes", 429);
  const sp = req.nextUrl.searchParams;
  const recherche = (sp.get("q") ?? "").replace(/[^\p{L}\p{N} '-]/gu, " ").trim().slice(0, 60);
  const langue = /^[a-z]{2}$/.test(sp.get("langue") ?? "") ? sp.get("langue")! : "";
  const genre = GENRES.has(sp.get("genre") ?? "") ? sp.get("genre")! : "";
  const usage = USAGES.has(sp.get("usage") ?? "") ? sp.get("usage")! : "";
  const page = Math.min(200, Math.max(0, Math.floor(Number(sp.get("page")) || 0)));
  try {
    return NextResponse.json(await bibliotheque({ recherche, langue, genre, usage, page }));
  } catch (e) {
    return e instanceof ElevenErreur ? jsonError(e.code, e.status) : jsonError("voix_erreur", 502);
  }
}
