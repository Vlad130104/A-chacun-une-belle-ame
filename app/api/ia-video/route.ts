import { NextResponse, type NextRequest } from "next/server";
import { avecCles } from "../../../lib/cles";
import { FalErreur, falDisponible, lancer, suivre } from "../../../lib/fal";
import { guardApi, jsonError, rateLimit, sessionOf } from "../../../lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const erreur = (e: unknown) => (e instanceof FalErreur ? jsonError(e.code, e.status) : jsonError("ia_video_erreur", 502));

// Lance la génération d'un plan vidéo (payant, facturé sur le compte fal). 200 plans par heure au plus.
async function post(req: NextRequest) {
  const g = await guardApi(req, 3_000, "iavideo", 200);
  if (g instanceof NextResponse) return g;
  if (!falDisponible()) return jsonError("ia_video_non_configuree", 503);
  const b = (g.body ?? {}) as Record<string, unknown>;
  const prompt = typeof b.prompt === "string" ? b.prompt.replace(/\s+/g, " ").trim().slice(0, 800) : "";
  const format = b.format === "16:9" ? "16:9" : "9:16";
  if (prompt.length < 3) return jsonError("requete_invalide", 400);
  try { return NextResponse.json(await lancer(prompt, format)); } catch (e) { return erreur(e); }
}

// Suit l'état d'un plan lancé.
async function get(req: NextRequest) {
  const session = await sessionOf(req);
  if (!session) return jsonError("non_connecte", 401);
  if (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin") return jsonError("origine_refusee", 403);
  if (!falDisponible()) return jsonError("ia_video_non_configuree", 503);
  if (!rateLimit("iavideoetat:" + session.id, 6000, 60 * 60 * 1000)) return jsonError("trop_de_demandes", 429);
  const sp = req.nextUrl.searchParams;
  try { return NextResponse.json(await suivre(sp.get("s") ?? "", sp.get("r") ?? "")); } catch (e) { return erreur(e); }
}

export const POST = (req: NextRequest) => avecCles(req, () => post(req));
export const GET = (req: NextRequest) => avecCles(req, () => get(req));
