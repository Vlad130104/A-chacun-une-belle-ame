# Bachir IA

Studio vidéo pour YouTube et TikTok : tu colles ton script, le site le découpe en scènes et exporte
un **Short vertical 9:16** (TikTok, YouTube Shorts, Reels) ou une **vidéo longue 16:9** pour YouTube,
de quelques secondes à plusieurs heures.

## Fonctions

- **Un seul script, un clic** : « Générer ma vidéo » découpe le script, génère la voix et ajoute les B-rolls.
- **Choix de la voix** : 3 voix françaises Piper (Siwis, Gilles, Mathis) exécutées dans le navigateur
  (ONNX Runtime Web + phonémiseur espeak-ng en WebAssembly), sans coût par minute ; ou ta propre voix.
  Chaque scène est lue séparément : sa durée devient exactement celle de sa phrase.
- **B-rolls** : vidéo ou image par scène (import), ou recherche automatique de vidéos libres de droits Pexels
  si `PEXELS_API_KEY` est défini. Rendu plein écran, sous-titres façon CapCut avec le mot prononcé surligné.

- **Script vers scènes** : une scène par paragraphe ; repères `# Titre`, `## Chapitre`, `> Citation — Auteur`, `- liste`.
  Aucune limite de longueur ; la mise en forme par Claude (facultative) traite jusqu'à 12 000 caractères.
- **Voix off** d'un seul fichier, de n'importe quelle durée, avec les scènes calées dessus.
- **Sous-titres animés** mot par mot, incrustés, et export `.srt` pour YouTube.
- **Export sans limite de durée** : encodage WebCodecs (H.264 + AAC en MP4, ou VP9 + Opus en WebM si le navigateur
  n'a pas de H.264) via [Mediabunny](https://mediabunny.dev) (MPL-2.0, dans `public/vendor`). Le fichier s'écrit
  directement sur le disque (Chrome, Edge), plus vite que le temps réel, sans garder la vidéo en mémoire.
- **Shorts tirés d'une vidéo longue** : export d'une plage de scènes en 9:16.
- **Chapitres YouTube** générés et vérifiés (3 minimum, premier à 00:00, 10 s minimum), **miniature** 1920×1080.

## Sécurité

- **Accès par mot de passe.** Seule l'empreinte scrypt est stockée (`ACCESS_PASSWORD_HASH`), jamais le mot de passe.
- **Sessions signées** HMAC-SHA256, cookie `__Host-` HttpOnly, Secure, SameSite=Strict, durée 12 h.
  Changer `SESSION_SECRET` déconnecte tout le monde immédiatement.
- **Anti force brute** : 5 tentatives par IP toutes les 15 minutes, délai sur chaque échec, comparaison en temps constant.
- **Toutes les pages et l'API sont fermées** sans session valide (middleware), sauf la page de connexion.
- **CSRF** : contrôle de l'origine sur chaque requête POST.
- **En-têtes stricts** : CSP sans script ni style en ligne et sans aucun domaine tiers, HSTS, anti-iframe,
  `nosniff`, référent jamais transmis aux autres sites, caméra/micro/géolocalisation désactivés, `noindex`.
- **Aucune ressource externe** : polices hébergées sur le site, pas de Google Fonts, pas de traceur.
- **Données locales** : photos, audio et vidéos sont traités dans le navigateur et ne sont jamais envoyés au serveur.
  Seul le texte du script part vers l'API Claude, et seulement si l'IA est activée.
- **Clé API côté serveur uniquement**, limitée à 30 appels par heure et par session, entrées validées et bornées.
- **Dépendances figées** sur des versions publiées depuis au moins deux semaines.

Limite connue : le compteur anti force brute est en mémoire, par instance de serveur. Il freine une attaque,
il ne remplace pas le pare-feu Vercel.

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `ACCESS_PASSWORD_HASH` | `npm run hash-password -- "mot de passe long"` |
| `SESSION_SECRET` | `npm run new-secret` |
| `ANTHROPIC_API_KEY` | Facultatif : active la mise en forme et l'écriture des scripts par Claude |
| `PEXELS_API_KEY` | Facultatif (gratuit sur pexels.com/api) : active la recherche automatique de B-rolls |

## Licences des composants embarqués

- Voix Piper (`public/voices`) : siwis CC BY 4.0, gilles CC0, mls_1840 CC BY 4.0 (voir `MODEL_CARD.txt`).
- Phonémiseur `public/vendor/piper` : MIT, données espeak-ng GPL-3.0. ONNX Runtime Web : MIT. Mediabunny : MPL-2.0.

## Développement

```bash
npm install
cp .env.example .env.local   # puis remplis les valeurs
npm run dev
```
