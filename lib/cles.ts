// Clés des services (Claude, ElevenLabs, Pexels, Pixabay, fal). Deux sources, dans cet ordre :
// 1) les variables d'environnement Vercel ; 2) les clés collées dans le studio, gardées dans un cookie
// chiffré (AES-256-GCM, clé dérivée de SESSION_SECRET), HttpOnly : le navigateur ne peut pas les relire.
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const NOMS = ["ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY", "PEXELS_API_KEY", "PIXABAY_API_KEY", "FAL_KEY"] as const;
export type Nom = (typeof NOMS)[number];
type Cles = Partial<Record<Nom, string>>;

export const COOKIE_CLES = "__Host-bachir_cles";
const store = new AsyncLocalStorage<Cles>();

function secret(): Buffer {
  return crypto.createHash("sha256").update("bachir-cles:" + (process.env.SESSION_SECRET ?? "")).digest();
}
export function chiffrer(c: Cles): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secret(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(c), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function dechiffrer(v: string | undefined): Cles {
  if (!v || v.length > 6000) return {};
  try {
    const raw = Buffer.from(v, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", secret(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const obj = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as Record<string, unknown>;
    const out: Cles = {};
    for (const n of NOMS) if (typeof obj[n] === "string") out[n] = obj[n] as string;
    return out;
  } catch {
    return {}; // cookie altéré ou SESSION_SECRET changé : les clés collées sont oubliées
  }
}

/** Clé d'un service pour la requête en cours : Vercel d'abord, puis celle collée dans le studio. */
export function cle(nom: Nom): string {
  return process.env[nom] || store.getStore()?.[nom] || "";
}
export function sourceCle(nom: Nom): "serveur" | "studio" | null {
  return process.env[nom] ? "serveur" : store.getStore()?.[nom] ? "studio" : null;
}
export function clesDuStudio(req: NextRequest): Cles {
  return dechiffrer(req.cookies.get(COOKIE_CLES)?.value);
}
/** Exécute une route avec les clés de la requête (cookie chiffré) disponibles pour les bibliothèques. */
export function avecCles<T>(req: NextRequest, fn: () => Promise<T> | T): Promise<T> {
  return Promise.resolve(store.run(clesDuStudio(req), fn));
}
export function avecTheseCles<T>(c: Cles, fn: () => Promise<T> | T): Promise<T> {
  return Promise.resolve(store.run(c, fn));
}
export function poserCookie(res: NextResponse, c: Cles): NextResponse {
  const vide = !Object.keys(c).length;
  res.cookies.set(COOKIE_CLES, vide ? "" : chiffrer(c), { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: vide ? 0 : 365 * 24 * 3600 });
  return res;
}
