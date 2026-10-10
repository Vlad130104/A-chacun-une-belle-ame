import { NextResponse, type NextRequest } from "next/server";
import { ecrirePartie, erreurIa } from "../../../../lib/claude";
import { guardApi, jsonError } from "../../../../lib/guard";
import { lirePlan, lireRequete } from "../../../../lib/script-requete";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const g = await guardApi(req, 320_000, "iapartie", 200);
  if (g instanceof NextResponse) return g;
  const r = lireRequete(g.body);
  const b = (g.body ?? {}) as Record<string, unknown>;
  const plan = lirePlan(b.plan);
  const index = Number(b.index);
  const avant = typeof b.avant === "string" ? b.avant.slice(-1500) : "";
  if (!r || !plan || !Number.isInteger(index) || index < 0 || index >= plan.parties.length) return jsonError("brief_invalide", 400);
  try {
    return NextResponse.json({ texte: await ecrirePartie({ ...r, plan, index, avant }) });
  } catch (e) {
    const { code, status } = erreurIa(e);
    if (status >= 500 && code !== "ia_non_configuree") console.error("partie", code);
    return jsonError(code, status);
  }
}
