#!/usr/bin/env node
/**
 * Contrôles préalables au développement local.
 * Échoue tôt et bruyamment plutôt que de laisser une erreur obscure apparaître
 * au premier `pnpm dev`.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const erreurs = [];
const avertissements = [];

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  erreurs.push(`Node 22 ou plus est requis (version détectée : ${process.versions.node}).`);
}

if (!existsSync(join(racine, '.env'))) {
  avertissements.push(
    'Aucun fichier .env : copiez .env.example en .env avant de lancer les applications.',
  );
}

if (existsSync(join(racine, '.env'))) {
  // Garde-fou : le .env ne doit jamais être suivi par Git (SECURITY.md §7).
  const { execSync } = await import('node:child_process');
  try {
    const suivi = execSync('git ls-files --error-unmatch .env', {
      cwd: racine,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    if (suivi.trim()) {
      erreurs.push(
        'Le fichier .env est suivi par Git. Retirez-le immédiatement : `git rm --cached .env`.',
      );
    }
  } catch {
    // `git ls-files --error-unmatch` échoue quand le fichier n'est pas suivi : c'est le cas nominal.
  }
}

for (const avertissement of avertissements) console.warn(`⚠  ${avertissement}`);
for (const erreur of erreurs) console.error(`✖  ${erreur}`);

if (erreurs.length > 0) process.exit(1);
