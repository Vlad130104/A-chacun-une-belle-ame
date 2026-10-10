import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimit, sameOrigin } from "../../../lib/guard";
import { verifyPassword } from "../../../lib/password";
import { COOKIE, SESSION_TTL, createSession } from "../../../lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/connexion.html${q}`, req.url), 303);
  if (!sameOrigin(req)) return new NextResponse("Origine refusée", { status: 403 });

  const secret = process.env.SESSION_SECRET;
  const hash = process.env.ACCESS_PASSWORD_HASH;
  if (!secret || secret.length < 32 || !hash) return back("?e=config");

  // 5 tentatives par adresse IP toutes les 15 minutes.
  if (!rateLimit("login:" + clientIp(req), 5, 15 * 60 * 1000)) return back("?e=bloque");

  const raw = await req.text();
  if (raw.length > 2000) return back("?e=1");
  const password = new URLSearchParams(raw).get("motdepasse") ?? "";
  const ok = password.length > 0 && password.length <= 256 && verifyPassword(password, hash);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 700));
    return back("?e=1");
  }

  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(COOKIE, await createSession(secret), {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: SESSION_TTL,
  });
  return res;
}
