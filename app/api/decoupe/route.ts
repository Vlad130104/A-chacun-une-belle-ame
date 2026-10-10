import { NextResponse, type NextRequest } from "next/server";
import { decouperScript, erreurIa } from "../../../lib/claude";
import { guardApi, jsonError } from "../../../lib/guard";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const g = await guardApi(req, 40_000);
  if (g instanceof NextResponse) return g;
  const script = (g.body as { script?: unknown })?.script;
  if (typeof script !== "string" || !script.trim() || script.length > 12_000) return jsonError("script_invalide", 400);
  try {
    return NextResponse.json({ scenes: await decouperScript(script.trim()) });
  } catch (e) {
    const { code, status } = erreurIa(e);
    if (status >= 500 && code !== "ia_non_configuree") console.error("decoupe", code);
    return jsonError(code, status);
  }
}
