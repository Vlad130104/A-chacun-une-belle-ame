// Usage : npm run hash-password -- "mot de passe"
// Affiche la valeur à placer dans la variable ACCESS_PASSWORD_HASH.
import { randomBytes, scryptSync } from "node:crypto";

const pw = process.argv[2];
if (!pw || pw.length < 12) {
  console.error("Donne un mot de passe d'au moins 12 caractères.");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(pw.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
console.log(`scrypt:${salt.toString("base64")}:${hash.toString("base64")}`);
