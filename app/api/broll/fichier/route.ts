import { NextResponse, type NextRequest } from "next/server";
import { jsonError, rateLimit, sessionOf } from "../../../../lib/guard";
import { lienFichier, pexelsDisponible } from "../../../../lib/pexels";

export const runtime = "nodejs";
export const maxDuration = 60;

// Relais de secours quand le navigateur ne peut pas télécharger le clip directement chez Pexels.
export async function GET(req: NextRequest) {
  const session = await sessionOf(req);
  if (!session) return jsonError("non_connecte", 401);
  if (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin") return jsonError("origine_refusee", 403);
  if (!pexelsDisponible()) return jsonError("broll_non_configure", 503);
  if (!rateLimit("brollfile:" + session.id, 300, 60 * 60 * 1000)) return jsonError("trop_de_demandes", 429);
  const id = Number(req.nextUrl.searchParams.get("id"));
  const f = Number(req.nextUrl.searchParams.get("f"));
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(f) || id <= 0 || f <= 0) return jsonError("requete_invalide", 400);
  try {
    const link = await lienFichier(id, f);
    if (!link) return jsonError("introuvable", 404);
    const up = await fetch(link, { cache: "no-store" });
    if (!up.ok || !up.body) return jsonError("broll_erreur", 502);
    return new NextResponse(up.body, {
      headers: { "Content-Type": "video/mp4", ...(up.headers.get("content-length") ? { "Content-Length": up.headers.get("content-length")! } : {}) },
    });
  } catch {
    return jsonError("broll_erreur", 502);
  }
}
