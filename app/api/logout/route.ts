import { NextResponse, type NextRequest } from "next/server";
import { sameOrigin } from "../../../lib/guard";
import { COOKIE } from "../../../lib/session";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("Origine refusée", { status: 403 });
  const res = NextResponse.redirect(new URL("/connexion.html?e=sortie", req.url), 303);
  res.cookies.set(COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}
