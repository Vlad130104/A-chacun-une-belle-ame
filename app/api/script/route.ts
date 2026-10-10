import { NextResponse, type NextRequest } from "next/server";
import { DUREES, FORMATS, TONS, ecrireScript, erreurIa } from "../../../lib/claude";
import { guardApi, jsonError } from "../../../lib/guard";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const g = await guardApi(req, 10_000);
  if (g instanceof NextResponse) return g;
  const b = (g.body ?? {}) as Record<string, unknown>;
  const format = String(b.format);
  const ton = String(b.ton);
  const duree = Number(b.duree);
  const sujet = typeof b.sujet === "string" ? b.sujet.trim() : "";
  if (!Object.hasOwn(FORMATS, format) || !Object.hasOwn(TONS, ton) || !(DUREES as readonly number[]).includes(duree) || !sujet || sujet.length > 3000) {
    return jsonError("brief_invalide", 400);
  }
  try {
    const scenes = await ecrireScript({ format: format as keyof typeof FORMATS, ton: ton as keyof typeof TONS, duree, sujet });
    return NextResponse.json({ scenes });
  } catch (e) {
    const { code, status } = erreurIa(e);
    if (status >= 500 && code !== "ia_non_configuree") console.error("script", code);
    return jsonError(code, status);
  }
}
