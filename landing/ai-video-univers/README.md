# AI Video Universe — landing page

Page de vente pour le pack « Création des vidéos IA » à 950 FCFA.

Projet **autonome**, volontairement placé hors des globs du workspace pnpm de ce
dépôt (`apps/*`, `packages/*`) : la plateforme de rencontres et cette landing page
n'ont rien en commun, et les mélanger casserait les builds Turbo, Vercel et Render
de la plateforme.

## Stack

| Élément    | Choix                                  |
| ---------- | -------------------------------------- |
| Framework  | React 18 + TypeScript                  |
| Build      | Vite 5                                 |
| Styles     | Tailwind CSS 3                         |
| Animations | Framer Motion 11                       |
| Icônes     | Lucide React                           |
| Police     | Kanit (Google Fonts, 300 → 900)        |

## Lancer le projet

```bash
cd landing/ai-video-univers
npm install
npm run dev        # http://localhost:5173
npm run build      # génère dist/
npm run preview    # sert dist/ en local
```

## Mise en ligne

`npm run build` produit un dossier `dist/` entièrement statique. Il se dépose tel
quel sur Vercel, Netlify, Cloudflare Pages ou n'importe quel hébergeur de fichiers
statiques — aucun serveur, aucune base de données, aucune variable d'environnement.

## Ressources

Toutes les URL réelles (vidéos YouTube, images Google Drive, liens de paiement et
de contact) sont regroupées dans **un seul fichier** : `src/data/resources.ts`.
Pour changer le lien de paiement ou remplacer une vidéo, il n'y a que ce fichier à
modifier — rien n'est codé en dur dans les composants.

### Vidéos

Les quatre vidéos sont de véritables embeds YouTube. L'attribut `src` n'apparaît
jamais dans le JSX : il est construit en JavaScript à partir de `data-video-id`
après le montage du composant (`src/components/VideoFrame.tsx`), ce qui permet de
le reconstruire à chaque bascule du son.

| Emplacement                | ID YouTube    |
| -------------------------- | ------------- |
| Hero (démo principale)     | `ggHdxZCCJ0w` |
| Vitrine — Pub Disaur       | `deW8V0esE-o` |
| Vitrine — Vidéo Tuto       | `Q1fSmJB0Hzc` |
| Vitrine — Storytelling     | `wOtebrzQGZk` |

Chaque lecteur démarre en autoplay silencieux et en boucle, et possède son propre
bouton **Activer le son**. Un seul son peut être actif à la fois : le bus audio
(`src/hooks/useSoundBus.tsx`) remet automatiquement les autres en sourdine.

### Images

Les visuels de marque fournis par le client sont servis depuis `public/brand/`.
Les seize images de galerie proviennent des URL Google Drive fournies, utilisées
telles quelles, dans l'ordre et avec les catégories d'origine.

## Structure des sections

L'ordre exigé est respecté dans `src/App.tsx` :

`Navbar` → `Hero` → `StatsBar` → `ProblemSection` → `VideoShowcaseSection` →
`GallerySection` → `AutomationSkillSection` → `ModulesSection` →
`TestimonialsSection` → `PricingSection` → `FaqSection` → `FinalCtaSection` →
`Footer`

(`StickyCta` s'ajoute par-dessus : barre d'achat fixe sur mobile.)

## Points d'attention

- **Témoignages.** Ceux de `TestimonialsSection` sont des exemples rédigés, pas des
  avis de clients réels. La page le dit explicitement à deux endroits. Retirer cette
  mention reviendrait à présenter des avis inventés comme authentiques, ce qui est
  interdit par la plupart des législations sur la publicité. Remplacez-les par de
  vrais retours dès que vous en avez.
- **Compte à rebours 24 h.** Il démarre à la première visite du navigateur et est
  mémorisé dans `localStorage`. Il est donc propre à chaque visiteur : ce n'est pas
  une date de fin commune. Si l'offre a une vraie date d'expiration, remplacez la
  constante `DUREE_MS` de `src/components/PricingSection.tsx` par cette date.
- **Images Google Drive.** Drive limite le débit des `thumbnail?id=…` très sollicités.
  Si la galerie devient lente en production, rapatriez ces seize images dans
  `public/` et remplacez les URL dans `src/data/resources.ts`.
