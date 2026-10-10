# Bachir IA

Studio vidéo pour YouTube et TikTok : tu colles ton script, le site le découpe en scènes et exporte
un **Short vertical 9:16** (TikTok, YouTube Shorts, Reels) ou une **vidéo longue 16:9** pour YouTube,
de quelques secondes à plusieurs heures.

## Fonctions

**Tu donnes le script, Bachir IA monte la vidéo.** Interface claire bleu ciel et blanc :
script à gauche, aperçu au centre, paramètres et téléchargement à droite.

- **Le script est lu mot pour mot**, découpé en phrases (14 mots au plus par plan), sous-titré mot par mot.
- **Une vidéo par phrase, choisie pour ce qu'elle dit** : Claude lit chaque phrase et décrit ce qu'il faut montrer.
  - *Vidéos réelles* (gratuit) : recherche dans Pexels et Pixabay, archives Wikimedia pour les passages historiques.
  - *Vidéos IA sur mesure* (payant, via fal, modèle Kling 2.6) : chaque phrase est filmée d'après la description de Claude,
    pour une correspondance exacte. Devis affiché et confirmé avant de lancer (environ 0,35 $ par plan de 5 s,
    120 plans au plus ; le reste et les échecs passent en vidéos réelles).
  - Bouton ↻ : autre vidéo (ou nouveau plan IA) pour la phrase affichée.
- **Voix** : toute la bibliothèque ElevenLabs (recherche, filtres, extraits gratuits), voix du compte et clones,
  3 voix gratuites dans le navigateur, ou ta voix enregistrée.
- **Grand format** (plein écran), **téléchargement** en un clic, export long écrit sur le disque au-delà de 20 minutes.
- **Connexions** : chaque service se branche en collant sa clé dans Paramètres → Connexions. La clé est vérifiée
  par un appel gratuit au service, chiffrée (AES-256-GCM, clé dérivée de `SESSION_SECRET`) et gardée dans un cookie
  HttpOnly : elle n'est plus jamais lisible par la page. Les variables d'environnement Vercel restent prioritaires.
- **Claude écrit le script** à partir d'un sujet (1 minute à 2 heures). Export `.srt`, chapitres, crédits, miniature.

## Sécurité

- **Accès par mot de passe.** Seule l'empreinte scrypt est stockée (`ACCESS_PASSWORD_HASH`), jamais le mot de passe.
- **Sessions signées** HMAC-SHA256, cookie `__Host-` HttpOnly, Secure, SameSite=Strict, durée 12 h.
  Changer `SESSION_SECRET` déconnecte tout le monde immédiatement.
- **Anti force brute** : 5 tentatives par IP toutes les 15 minutes, délai sur chaque échec, comparaison en temps constant.
- **Toutes les pages et l'API sont fermées** sans session valide (middleware), sauf la page de connexion.
- **CSRF** : contrôle de l'origine sur chaque requête POST.
- **En-têtes stricts** : CSP sans script ni style en ligne ; seuls domaines tiers autorisés, en lecture : Pexels et Wikimedia
  (médias), aucun script tiers. HSTS, anti-iframe,
  `nosniff`, référent jamais transmis aux autres sites, caméra/micro/géolocalisation désactivés, `noindex`.
- **Aucune ressource externe** : polices hébergées sur le site, pas de Google Fonts, pas de traceur.
- **Données locales** : photos, audio et vidéos sont traités dans le navigateur et ne sont jamais envoyés au serveur.
  Seul le texte du script part vers le serveur : vers Claude pour écrire un script, vers ElevenLabs pour la voix.
- **Clés API côté serveur uniquement** (Claude, Pexels, ElevenLabs), débit limité par session, entrées validées et bornées.
- **Dépendances figées** sur des versions publiées depuis au moins deux semaines.

Limite connue : le compteur anti force brute est en mémoire, par instance de serveur. Il freine une attaque,
il ne remplace pas le pare-feu Vercel.

## Variables d'environnement

Les clés de service peuvent aussi être collées dans le studio (Paramètres → Connexions) au lieu de Vercel.

| Variable | Rôle |
| --- | --- |
| `ACCESS_PASSWORD_HASH` | `npm run hash-password -- "mot de passe long"` |
| `SESSION_SECRET` | `npm run new-secret` |
| `ANTHROPIC_API_KEY` | Facultatif : ajuste le script à la durée choisie et écrit des scripts à partir d'un sujet (Claude) |
| `PEXELS_API_KEY` | Facultatif (gratuit sur pexels.com/api) : active les vidéos modernes (les archives Wikimedia marchent sans) |
| `PIXABAY_API_KEY` | Facultatif (gratuit sur pixabay.com/api/docs) : deuxième banque de vidéos, plus de choix par phrase |
| `FAL_KEY` | Facultatif, payant : vidéos IA sur mesure (fal.ai, Kling 2.6) |
| `ELEVENLABS_API_KEY` | Facultatif (payant au caractère) : active les voix ElevenLabs |

## Licences des composants embarqués

- Voix Piper (`public/voices`) : siwis CC BY 4.0, gilles CC0, mls_1840 CC BY 4.0 (voir `MODEL_CARD.txt`).
- Phonémiseur `public/vendor/piper` : MIT, données espeak-ng GPL-3.0. ONNX Runtime Web : MIT. Mediabunny : MPL-2.0.

## Développement

```bash
npm install
cp .env.example .env.local   # puis remplis les valeurs
npm run dev
```
