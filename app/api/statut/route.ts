import { NextResponse, type NextRequest } from "next/server";
import { avecCles, sourceCle } from "../../../lib/cles";

// Protégé par le middleware. Indique quels services sont branchés et d'où vient la clé (jamais la clé elle-même).
export const GET = (req: NextRequest) =>
  avecCles(req, () => {
    const src = {
      ia: sourceCle("ANTHROPIC_API_KEY"), eleven: sourceCle("ELEVENLABS_API_KEY"), pexels: sourceCle("PEXELS_API_KEY"),
      pixabay: sourceCle("PIXABAY_API_KEY"), fal: sourceCle("FAL_KEY"),
    };
    return NextResponse.json({
      ia: Boolean(src.ia), eleven: Boolean(src.eleven), pexels: Boolean(src.pexels), pixabay: Boolean(src.pixabay), fal: Boolean(src.fal),
      broll: Boolean(src.pexels || src.pixabay), sources: src,
    });
  });
