import { scryptSync, timingSafeEqual } from "node:crypto";

/** Vérifie un mot de passe contre une empreinte « scrypt:<sel>:<hash> », en temps constant. */
export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [algo, saltB64, hashB64] = stored.split(":");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  if (expected.length < 32) return false;
  const got = scryptSync(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(got, expected);
}
