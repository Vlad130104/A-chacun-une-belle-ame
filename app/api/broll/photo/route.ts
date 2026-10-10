import { NextResponse, type NextRequest } from "next/server";
import { jsonError, rateLimit, sessionOf } from "../../../../lib/guard";
import { lienPhotoParId, pexelsDisponible } from "../../../../lib/pexels";

export const runtime = "nodejs";
export const maxDuration = 30;

// Relais de secours pour les photos Pexels : l'adresse est retrouvée chez Pexels, jamais fournie par le navigateur.
export async function GET(req: NextRequest) {
  const session = await sessionOf(req);
  if (!session) return jsonError("non_connecte", 401);
  if (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin") return jsonError("origine_refusee", 403);
  if (!pexelsDisponible()) return jsonError("broll_non_configure", 503);
  if (!rateLimit("brollphoto:" + session.id, 300, 60 * 60 * 1000)) return jsonError("trop_de_demandes", 429);
  const id = Number(req.nextUrl.searchParams.get("id"));
  const orientation = req.nextUrl.searchParams.get("o") === "landscape" ? "landscape" : "portrait";
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError("requete_invalide", 400);
  try {
    const link = await lienPhotoParId(id, orientation);
    if (!link) return jsonError("introuvable", 404);
    const up = await fetch(link, { cache: "no-store" });
    const type = up.headers.get("content-type") ?? "";
    if (!up.ok || !up.body || !/^image\/(jpeg|png|webp)$/.test(type.split(";")[0])) return jsonError("broll_erreur", 502);
    return new NextResponse(up.body, { headers: { "Content-Type": type.split(";")[0] } });
  } catch {
    return jsonError("broll_erreur", 502);
  }
}
