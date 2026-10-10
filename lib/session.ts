// Sessions signées HMAC-SHA256, vérifiables en Edge (middleware) comme en Node (routes API).
// Jeton : v1.<expiration>.<nonce>.<signature>, stocké dans un cookie HttpOnly, Secure, SameSite=Strict.

export const COOKIE = "__Host-bachir_session";
export const SESSION_TTL = 12 * 60 * 60; // 12 heures

const enc = new TextEncoder();

function toB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function usableSecret(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= 32;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSession(secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const nonce = toB64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `v1.${exp}.${nonce}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return `${payload}.${toB64url(new Uint8Array(sig))}`;
}

/** Renvoie l'identifiant de session si le jeton est valide et non expiré, sinon null. Refuse tout si le secret manque. */
export async function verifySession(token: string | undefined, secret: string | undefined): Promise<{ id: string } | null> {
  if (!token || !usableSecret(secret) || token.length > 200) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const exp = Number(parts[1]);
  if (!Number.isInteger(exp) || exp < Date.now() / 1000) return null;
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = fromB64url(parts[3]);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, enc.encode(parts.slice(0, 3).join(".")));
  return ok ? { id: parts[2] } : null;
}
