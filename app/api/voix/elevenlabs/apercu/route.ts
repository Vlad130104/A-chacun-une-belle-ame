import { NextResponse, type NextRequest } from "next/server";
import { jsonError, rateLimit, sessionOf } from "../../../../../lib/guard";
import { apercuAutorise } from "../../../../../lib/elevenlabs";

export const runtime = "nodejs";

// Relais des extraits audio des voix : écouter une voix ne consomme aucun crédit, et la page reste sans domaine tiers.
export async function GET(req: NextRequest) {
  const session = await sessionOf(req);
  if (!session) return jsonError("non_connecte", 401);
  if (req.headers.get("sec-fetch-site") && !["same-origin", "none"].includes(req.headers.get("sec-fetch-site")!)) return jsonError("origine_refusee", 403);
  if (!rateLimit("voixapercu:" + session.id, 600, 60 * 60 * 1000)) return jsonError("trop_de_demandes", 429);
  const url = apercuAutorise(req.nextUrl.searchParams.get("u"));
  if (!url) return jsonError("requete_invalide", 400);
  try {
    const up = await fetch(url, { cache: "no-store", redirect: "error" });
    const type = (up.headers.get("content-type") ?? "").split(";")[0];
    if (!up.ok || !up.body || !/^audio\//.test(type)) return jsonError("voix_erreur", 502);
    const len = Number(up.headers.get("content-length") || 0);
    if (len > 5_000_000) return jsonError("trop_long", 413);
    return new NextResponse(up.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
  } catch {
    return jsonError("voix_erreur", 502);
  }
}
