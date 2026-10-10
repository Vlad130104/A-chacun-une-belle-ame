import { NextResponse, type NextRequest } from "next/server";
import { guardApi, jsonError } from "../../../../lib/guard";
import { chercherVideos, pexelsDisponible } from "../../../../lib/pexels";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await guardApi(req, 2_000, "broll", 200);
  if (g instanceof NextResponse) return g;
  if (!pexelsDisponible()) return jsonError("broll_non_configure", 503);
  const b = (g.body ?? {}) as { q?: unknown; orientation?: unknown };
  const q = typeof b.q === "string" ? b.q.trim().slice(0, 80) : "";
  const orientation = b.orientation === "landscape" ? "landscape" : "portrait";
  if (!q) return jsonError("requete_invalide", 400);
  try {
    return NextResponse.json({ videos: await chercherVideos(q, orientation) });
  } catch (e) {
    const code = e instanceof Error && e.message === "pexels_429" ? "broll_sature" : "broll_erreur";
    return jsonError(code, code === "broll_sature" ? 429 : 502);
  }
}
