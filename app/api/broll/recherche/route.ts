import { NextResponse, type NextRequest } from "next/server";
import { avecCles } from "../../../../lib/cles";
import { guardApi, jsonError } from "../../../../lib/guard";
import { chercherVideos, pexelsDisponible } from "../../../../lib/pexels";
import { chercherVideosPixabay, pixabayDisponible } from "../../../../lib/pixabay";

export const runtime = "nodejs";

// Recherche dans toutes les banques configurées (Pexels, Pixabay) ; résultats alternés pour varier les plans.
async function post(req: NextRequest) {
  const g = await guardApi(req, 2_000, "broll", 400);
  if (g instanceof NextResponse) return g;
  if (!pexelsDisponible() && !pixabayDisponible()) return jsonError("broll_non_configure", 503);
  const b = (g.body ?? {}) as { q?: unknown; orientation?: unknown };
  const q = typeof b.q === "string" ? b.q.trim().slice(0, 80) : "";
  const orientation = b.orientation === "landscape" ? "landscape" : "portrait";
  if (!q) return jsonError("requete_invalide", 400);
  const [px, pb] = await Promise.allSettled([
    pexelsDisponible() ? chercherVideos(q, orientation) : Promise.resolve([]),
    pixabayDisponible() ? chercherVideosPixabay(q, orientation) : Promise.resolve([]),
  ]);
  if (px.status === "rejected" && pb.status === "rejected") {
    const sature = [px.reason, pb.reason].some((e) => e instanceof Error && /_429$/.test(e.message));
    return jsonError(sature ? "broll_sature" : "broll_erreur", sature ? 429 : 502);
  }
  const a = px.status === "fulfilled" ? px.value.map((v) => ({ ...v, source: "pexels" })) : [];
  const c = pb.status === "fulfilled" ? pb.value.map((v) => ({ ...v, source: "pixabay" })) : [];
  const videos = [];
  for (let i = 0; i < Math.max(a.length, c.length); i++) { if (a[i]) videos.push(a[i]); if (c[i]) videos.push(c[i]); }
  return NextResponse.json({ videos });
}

export const POST = (req: NextRequest) => avecCles(req, () => post(req));
