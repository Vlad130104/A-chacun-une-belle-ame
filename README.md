# Bachir IA

Studio de vidéos de sensibilisation HSE : tu colles ton script, le site le découpe en scènes
(pictogrammes ISO 7010, sous-titres, photos de chantier, voix off) et exporte une vidéo MP4
pour WhatsApp (9:16) ou pour l'écran du briefing (16:9).

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

## Développement

```bash
npm install
cp .env.example .env.local   # puis remplis les valeurs
npm run dev
```
