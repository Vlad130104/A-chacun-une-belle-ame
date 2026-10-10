import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifySession } from "./session";

/** Protection CSRF : une requête qui modifie quelque chose doit venir de ce site. */
export function sameOrigin(req: Request): boolean {
  // Sec-Fetch-Site est posé par le navigateur et ne peut pas être forgé par une page web.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!host) return false;
  if (!origin || origin === "null") return site === "same-origin";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "inconnu").trim();
}

// Limiteur en mémoire, par instance de serveur : il freine une attaque, il ne remplace pas un pare-feu.
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) {
    b = { n: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.n++;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return b.n <= max;
}

export function jsonError(code: string, status: number): NextResponse {
  return NextResponse.json({ error: code }, { status });
}

/** Contrôles communs aux routes de l'API IA : origine, session, débit, taille du corps. */
export async function guardApi(req: NextRequest, maxBytes: number): Promise<{ body: unknown } | NextResponse> {
  if (!sameOrigin(req)) return jsonError("origine_refusee", 403);
  const session = await verifySession(req.cookies.get(COOKIE)?.value, process.env.SESSION_SECRET);
  if (!session) return jsonError("non_connecte", 401);
  if (!rateLimit("ia:" + session.id, 30, 60 * 60 * 1000)) return jsonError("trop_de_demandes", 429);
  const raw = await req.text();
  if (raw.length > maxBytes) return jsonError("trop_long", 413);
  try {
    return { body: JSON.parse(raw) as unknown };
  } catch {
    return jsonError("requete_invalide", 400);
  }
}
