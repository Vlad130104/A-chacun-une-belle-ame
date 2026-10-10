import { NextResponse, type NextRequest } from "next/server";
import { avecTheseCles, clesDuStudio, NOMS, poserCookie, type Nom } from "../../../lib/cles";
import { verifierClaude } from "../../../lib/claude";
import { guardApi, jsonError } from "../../../lib/guard";

export const runtime = "nodejs";

// Vérifie une clé par un appel gratuit au service. true : acceptée ; false : refusée ; null : service injoignable.
async function verifier(nom: Nom, v: string): Promise<boolean | null> {
  try {
    if (nom === "ANTHROPIC_API_KEY") return await avecTheseCles({ ANTHROPIC_API_KEY: v }, verifierClaude);
    let res: Response;
    if (nom === "PEXELS_API_KEY") res = await fetch("https://api.pexels.com/videos/search?query=nature&per_page=1", { headers: { Authorization: v }, cache: "no-store" });
    else if (nom === "PIXABAY_API_KEY") res = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(v)}&q=nature&per_page=3`, { cache: "no-store" });
    else if (nom === "ELEVENLABS_API_KEY") res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=1", { headers: { "xi-api-key": v }, cache: "no-store" });
    else return null; // fal : pas d'appel gratuit de vérification, la clé sera testée au premier plan
    if (res.ok) return true;
    return [400, 401, 403].includes(res.status) ? false : null;
  } catch {
    return null;
  }
}

// Branche (POST) ou débranche (DELETE) un service en collant sa clé dans le studio.
async function ecrire(req: NextRequest, retirer: boolean) {
  const g = await guardApi(req, 2_000, "cles", 60);
  if (g instanceof NextResponse) return g;
  const b = (g.body ?? {}) as Record<string, unknown>;
  const nom = String(b.nom) as Nom;
  if (!(NOMS as readonly string[]).includes(nom)) return jsonError("requete_invalide", 400);
  const cles = clesDuStudio(req);
  if (retirer) {
    delete cles[nom];
    return poserCookie(NextResponse.json({ ok: true }), cles);
  }
  const valeur = typeof b.valeur === "string" ? b.valeur.trim() : "";
  if (!/^[\x21-\x7e]{8,300}$/.test(valeur)) return jsonError("cle_format", 400);
  const ok = await verifier(nom, valeur);
  if (ok === false) return jsonError("cle_refusee", 400);
  cles[nom] = valeur;
  return poserCookie(NextResponse.json({ ok: true, verifiee: ok === true }), cles);
}
export const POST = (req: NextRequest) => ecrire(req, false);
export const DELETE = (req: NextRequest) => ecrire(req, true);
