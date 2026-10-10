# Bachir IA

Studio vidéo pour YouTube et TikTok : tu colles ton script, le site le découpe en scènes et exporte
un **Short vertical 9:16** (TikTok, YouTube Shorts, Reels) ou une **vidéo longue 16:9** pour YouTube,
de quelques secondes à plusieurs heures.

## Fonctions

- **Un script, une durée, un clic, une vidéo finie** : tu colles ton script, tu règles la durée de **1 minute à 2 heures**,
  et « Générer ma vidéo » enchaîne tout : ajustement du texte à la durée, voix, recherche des vidéos, montage du fichier final.
  Si le texte lu est plus court ou plus long que la durée choisie (écart de plus de 15 %), Claude le développe ou le resserre
  en gardant les idées du créateur (option « Garder mon texte mot pour mot » pour ne rien changer). Les vidéos longues
  s'écrivent par parties d'environ 10 minutes (plan, puis une partie par appel), chacune devenant un chapitre YouTube.
  Au-delà de 20 minutes, le fichier s'enregistre directement sur le disque (emplacement choisi au clic, Chrome ou Edge).
- **Uniquement des vidéos réalistes** plein écran, avec sous-titres animés : aucun carton ni titre graphique.
  La vidéo est un seul bloc continu ; le studio change de plan au rythme choisi (rapide, normal, lent) ou garde
  **un seul plan du début à la fin**. Les plans sans vidéo prolongent le plan précédent : jamais d'écran vide.
- **Sources** :
  - vidéos modernes de Pexels (gens, objets, interviews), si `PEXELS_API_KEY` est défini ;
  - films d'archives de Wikimedia Commons (guerres, histoire, actualités d'époque), sans clé, domaine public en premier.
  Le mode automatique choisit les archives quand le script parle d'histoire et traduit les mots-clés en anglais.
  La vidéo affichée à la tête de lecture se remplace par une recherche ou par ta propre vidéo.
- **Voix** :
  - ElevenLabs (voix ultra-réalistes et voix clonées du compte), si `ELEVENLABS_API_KEY` est défini. La clé reste sur
    le serveur ; chaque passage est lu avec ses phrases voisines pour une intonation continue. Modèles Multilingual v2
    (qualité) ou Flash v2.5 (deux fois moins de crédits) ;
  - 3 voix françaises Piper gratuites, calculées dans le navigateur ; ou ta propre voix enregistrée.
- **Crédits** auteur, licence et lien générés pour la description YouTube (obligatoires pour CC BY et CC BY-SA).
- **Export sans limite de durée** : encodage WebCodecs (H.264 + AAC en MP4, ou VP9 + Opus en WebM si le navigateur
  n'a pas de H.264) via [Mediabunny](https://mediabunny.dev) (MPL-2.0, dans `public/vendor`). Le fichier s'écrit
  directement sur le disque (Chrome, Edge), plus vite que le temps réel.
- **Extrait en Short** d'une vidéo longue, **sous-titres .srt**, **chapitres YouTube** (`## Partie`), **miniature** 1920×1080.

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

| Variable | Rôle |
| --- | --- |
| `ACCESS_PASSWORD_HASH` | `npm run hash-password -- "mot de passe long"` |
| `SESSION_SECRET` | `npm run new-secret` |
| `ANTHROPIC_API_KEY` | Facultatif : ajuste le script à la durée choisie et écrit des scripts à partir d'un sujet (Claude) |
| `PEXELS_API_KEY` | Facultatif (gratuit sur pexels.com/api) : active les vidéos modernes (les archives Wikimedia marchent sans) |
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
