import { NextResponse, type NextRequest } from "next/server";
import { avecCles } from "../../../../lib/cles";
import { erreurIa, planifier } from "../../../../lib/claude";
import { guardApi, jsonError } from "../../../../lib/guard";
import { lireRequete } from "../../../../lib/script-requete";

export const runtime = "nodejs";
export const maxDuration = 300;

async function post(req: NextRequest) {
  const g = await guardApi(req, 10_000, "ia", 30);
  if (g instanceof NextResponse) return g;
  const r = lireRequete(g.body);
  if (!r) return jsonError("brief_invalide", 400);
  try {
    return NextResponse.json({ plan: await planifier(r) });
  } catch (e) {
    const { code, status } = erreurIa(e);
    if (status >= 500 && code !== "ia_non_configuree") console.error("plan", code);
    return jsonError(code, status);
  }
}

export const POST = (req: NextRequest) => avecCles(req, () => post(req));
