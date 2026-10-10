import { NextResponse, type NextRequest } from "next/server";
import { avecCles } from "../../../../../lib/cles";
import { guardApi, jsonError } from "../../../../../lib/guard";
import { ajouterVoix, ElevenErreur, elevenDisponible } from "../../../../../lib/elevenlabs";

export const runtime = "nodejs";

async function post(req: NextRequest) {
  const g = await guardApi(req, 1_000, "voixajout", 60);
  if (g instanceof NextResponse) return g;
  if (!elevenDisponible()) return jsonError("voix_non_configuree", 503);
  const b = (g.body ?? {}) as Record<string, unknown>;
  const owner = String(b.owner ?? ""), id = String(b.id ?? ""), nom = String(b.nom ?? "").replace(/[^\p{L}\p{N} '().-]/gu, "").slice(0, 60);
  if (!/^[A-Za-z0-9]{8,80}$/.test(owner) || !/^[A-Za-z0-9]{8,40}$/.test(id)) return jsonError("requete_invalide", 400);
  try {
    return NextResponse.json({ id: await ajouterVoix(owner, id, nom) });
  } catch (e) {
    return e instanceof ElevenErreur ? jsonError(e.code, e.status) : jsonError("voix_erreur", 502);
  }
}

export const POST = (req: NextRequest) => avecCles(req, () => post(req));
