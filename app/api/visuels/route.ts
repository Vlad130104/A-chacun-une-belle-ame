import { NextResponse, type NextRequest } from "next/server";
import { PASSAGES_MAX, choisirVisuels, erreurIa } from "../../../lib/claude";
import { guardApi, jsonError } from "../../../lib/guard";

export const runtime = "nodejs";
export const maxDuration = 300;

// Une requête par lot de 200 passages au plus ; une vidéo de 2 h en demande environ 5.
export async function POST(req: NextRequest) {
  const g = await guardApi(req, 120_000, "visuels", 100);
  if (g instanceof NextResponse) return g;
  const b = (g.body ?? {}) as { passages?: unknown; contexte?: unknown };
  const passages = Array.isArray(b.passages) ? b.passages.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 500)) : [];
  const contexte = typeof b.contexte === "string" ? b.contexte.slice(0, 300) : "";
  if (!passages.length || passages.length > PASSAGES_MAX || passages.length !== (b.passages as unknown[]).length) return jsonError("requete_invalide", 400);
  try {
    return NextResponse.json({ visuels: await choisirVisuels(passages, contexte) });
  } catch (e) {
    const { code, status } = erreurIa(e);
    if (status >= 500 && code !== "ia_non_configuree") console.error("visuels", code);
    return jsonError(code, status);
  }
}
