import { NextResponse, type NextRequest } from "next/server";
import { FORMATS, PUBLICS, ecrireScript, erreurIa } from "../../../lib/claude";
import { guardApi, jsonError } from "../../../lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const g = await guardApi(req, 10_000);
  if (g instanceof NextResponse) return g;
  const b = (g.body ?? {}) as Record<string, unknown>;
  const format = String(b.format);
  const pub = String(b.public);
  const duree = Number(b.duree);
  const sujet = typeof b.sujet === "string" ? b.sujet.trim() : "";
  if (!(format in FORMATS) || !(pub in PUBLICS) || ![30, 60, 90, 120].includes(duree) || !sujet || sujet.length > 3000) {
    return jsonError("brief_invalide", 400);
  }
  try {
    const scenes = await ecrireScript({ format: format as keyof typeof FORMATS, public: pub as keyof typeof PUBLICS, duree, sujet });
    return NextResponse.json({ scenes });
  } catch (e) {
    const { code, status } = erreurIa(e);
    if (status >= 500 && code !== "ia_non_configuree") console.error("script", code);
    return jsonError(code, status);
  }
}
