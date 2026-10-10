# Bachir IA

Studio vidéo pour YouTube et TikTok : tu colles ton script, le site le découpe en scènes et exporte
un **Short vertical 9:16** (TikTok, YouTube Shorts, Reels) ou une **vidéo longue 16:9** pour YouTube,
de quelques secondes à plusieurs heures.

## Fonctions

Éditeur organisé comme HeyGen : barre du haut (format 9:16 ou 16:9, **Générer la vidéo**, **Télécharger**),
rail d'outils à gauche (Script, Voix, Sous-titres, Export), grand aperçu au centre avec bouton **plein écran**.

- **Le script est lu mot pour mot** : il n'est jamais réécrit. Il est découpé en phrases (14 mots au plus par plan).
- **Une vidéo par phrase, choisie pour ce qu'elle dit** : Claude lit chaque passage et donne la recherche en anglais
  qui montre exactement ce qui est dit, et s'il faut des images d'époque. Vidéos réelles de Pexels, films d'archives de
  Wikimedia Commons pour les passages historiques. Sans clé Claude, repli sur des mots-clés extraits du texte.
  Bouton ↻ sous l'aperçu : autre vidéo pour le passage affiché.
- **Toutes les voix ElevenLabs** : la bibliothèque publique complète (recherche, langue, genre, usage, écoute gratuite
  des extraits), les voix du compte (y compris clonées), 3 voix gratuites calculées dans le navigateur, ou ta voix.
  Une voix de la bibliothèque est ajoutée au compte ElevenLabs quand on la choisit (obligatoire pour la faire lire).
- **Un clic, une vidéo finie** : texte analysé, voix, vidéos, montage, puis bouton Télécharger.
  Au-delà de 20 minutes, le fichier s'écrit directement sur le disque (Chrome ou Edge sur ordinateur).
- **Vidéos longues** : les vidéos téléchargées sont stockées sur le disque (stockage privé du navigateur), pas en mémoire :
  jusqu'à 300 vidéos différentes par montage ; au-delà, les passages prolongent le plan précédent.
- **Claude écrit le script** à partir d'un sujet, pour une durée de 1 minute à 2 heures (par parties de 10 minutes,
  qui deviennent des chapitres YouTube).
- **Sous-titres animés** mot par mot (6 styles), export `.srt`, chapitres YouTube, crédits des vidéos, miniature.

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
