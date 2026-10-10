import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifySession } from "./lib/session";

// Seules ces adresses sont accessibles sans être connecté.
const PUBLIC_PATHS = new Set(["/connexion.html", "/connexion.css", "/connexion.js", "/robots.txt", "/favicon.svg", "/api/login"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/fonts/")) return NextResponse.next();

  const session = await verifySession(req.cookies.get(COOKIE)?.value, process.env.SESSION_SECRET);
  if (!session) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/connexion.html";
    url.search = "";
    return NextResponse.redirect(url, 303);
  }
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/studio/index.html";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
