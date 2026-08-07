#!/usr/bin/env node
/**
 * Génère des clés de DÉVELOPPEMENT local.
 *
 * Les valeurs produites s'affichent dans le terminal et doivent être collées dans un
 * .env local. Elles ne sont écrites nulle part et ne doivent JAMAIS servir en
 * production : les clés de production viennent du gestionnaire de secrets
 * (SECURITY.md §7).
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const enUneLigne = (pem) => pem.trim().replace(/\n/g, '\\n');

console.log('# Clés de développement — à coller dans .env, jamais en production\n');
console.log(`JWT_PRIVATE_KEY="${enUneLigne(privateKey)}"`);
console.log(`JWT_PUBLIC_KEY="${enUneLigne(publicKey)}"`);
console.log(`ENCRYPTION_KEY="${randomBytes(32).toString('base64')}"`);
console.log(`HASH_SALT="${randomBytes(32).toString('base64')}"`);
