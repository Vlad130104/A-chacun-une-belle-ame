import { NextResponse, type NextRequest } from "next/server";
import { videoAutorisee } from "../../../../lib/fal";
import { jsonError, rateLimit, sessionOf } from "../../../../lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

// Relais de secours si le navigateur ne peut pas télécharger directement la vidéo générée chez fal.
export async function GET(req: NextRequest) {
  const session = await sessionOf(req);
  if (!session) return jsonError("non_connecte", 401);
  if (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin") return jsonError("origine_refusee", 403);
  if (!rateLimit("iavideofichier:" + session.id, 600, 60 * 60 * 1000)) return jsonError("trop_de_demandes", 429);
  const u = req.nextUrl.searchParams.get("u");
  if (!videoAutorisee(u)) return jsonError("requete_invalide", 400);
  try {
    const up = await fetch(u, { cache: "no-store", redirect: "error" });
    if (!up.ok || !up.body) return jsonError("ia_video_erreur", 502);
    return new NextResponse(up.body, { headers: { "Content-Type": "video/mp4" } });
  } catch {
    return jsonError("ia_video_erreur", 502);
  }
}
