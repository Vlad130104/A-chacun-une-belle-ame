import { NextResponse, type NextRequest } from "next/server";
import { jsonError, rateLimit, sessionOf } from "../../../../lib/guard";
import { lienFichier, pexelsDisponible } from "../../../../lib/pexels";
import { lienFichierPixabay, pixabayDisponible } from "../../../../lib/pixabay";

export const runtime = "nodejs";
export const maxDuration = 60;

// Relais de secours quand le navigateur ne peut pas télécharger le clip directement chez Pexels ou Pixabay.
export async function GET(req: NextRequest) {
  const session = await sessionOf(req);
  if (!session) return jsonError("non_connecte", 401);
  if (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin") return jsonError("origine_refusee", 403);
  if (!rateLimit("brollfile:" + session.id, 600, 60 * 60 * 1000)) return jsonError("trop_de_demandes", 429);
  const sp = req.nextUrl.searchParams;
  const source = sp.get("s") === "pixabay" ? "pixabay" : "pexels";
  const id = Number(sp.get("id"));
  const f = sp.get("f") ?? "";
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError("requete_invalide", 400);
  try {
    let link: string | null;
    if (source === "pixabay") {
      if (!pixabayDisponible()) return jsonError("broll_non_configure", 503);
      link = await lienFichierPixabay(id, f);
    } else {
      if (!pexelsDisponible()) return jsonError("broll_non_configure", 503);
      const fid = Number(f);
      if (!Number.isSafeInteger(fid) || fid <= 0) return jsonError("requete_invalide", 400);
      link = await lienFichier(id, fid);
    }
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
