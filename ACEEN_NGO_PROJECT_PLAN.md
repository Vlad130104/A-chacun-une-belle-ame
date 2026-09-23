# 🏢 ACEEN NGO Website - Plan de Projet Complet
## Organisation: ACEEN Maroua, Cameroun
**Valeur estimée**: 1,000,000 FCFA | **Framework**: Laravel 11 | **Budget**: Production-Ready

---

## 📋 Table des Matières
1. [Vue d'ensemble](#vue-densemble)
2. [Architecture technique](#architecture-technique)
3. [Spécifications fonctionnelles](#spécifications-fonctionnelles)
4. [Structure de la base de données](#structure-de-la-base-de-données)
5. [Modules et fonctionnalités](#modules-et-fonctionnalités)
6. [Authentification & Permissions](#authentification--permissions)
7. [Calendrier de développement](#calendrier-de-développement)

---

## Vue d'ensemble

### À propos d'ACEEN
**ACEEN** est une organisation non-gouvernementale basée à Maroua, Cameroun, engagée dans des initiatives de développement communautaire, d'éducation, et d'accompagnement social.

### Objectifs du site web
- ✅ Présenter les activités et initiatives d'ACEEN
- ✅ Publier des actualités, rapports, et études
- ✅ Afficher les galeries (photos/vidéos des projets)
- ✅ Gérer les partenariats et collaborations
- ✅ Présenter l'équipe et les ressources
- ✅ Permettre aux administrateurs de gérer tout le contenu
- ✅ Optimiser pour les moteurs de recherche (SEO)
- ✅ Assurer la sécurité des données

---

## Architecture technique

### Stack technologique
```
Backend:      Laravel 11 (PHP 8.2+)
Base données: MySQL 8.0 / MariaDB
Frontend:     Blade Templates + Tailwind CSS + Alpine.js
Cache:        Redis (optionnel, pour performances)
Stockage:     AWS S3 ou Local Disk
Auth:         Laravel Sanctum (API) + Sessions (Web)
Mail:         SMTP configurable
Search:       Database Full-Text Search
```

### Infrastructure recommandée
- **Serveur VPS**: 2GB RAM, 20GB SSD minimum
- **HTTPS**: Certificat SSL/TLS obligatoire
- **Backups**: Quotidiens (base données + fichiers)
- **CDN**: CloudFlare ou similaire pour les assets

---

## Spécifications fonctionnelles

### 🔐 Authentification & Admin Panel
- Connexion administrateur sécurisée (2FA optionnel)
- Rôles: Admin Principal, Rédacteur, Modérateur, Contributeur
- Tableau de bord personnalisé avec statistiques
- Gestion des utilisateurs administrateurs

### 📰 Module Blog / Actualités
**Modèle de données:**
```
Posts:
  - id, title, slug, content (wysiwyg)
  - excerpt, featured_image, status
  - author_id, category_id, created_at, updated_at
  - seo_title, seo_description, keywords

Categories:
  - id, name, slug, description, icon

Tags:
  - id, name, slug
```

**Fonctionnalités admin:**
- CRUD complet des articles
- Éditeur WYSIWYG (TinyMCE ou Quill)
- Upload d'images optimisées
- Programmation de publication (Draft → Published)
- Catégorisation et tagging
- Historique des versions

**Fonctionnalités frontend:**
- Affichage paginer des actualités (6-10 par page)
- Filtrage par catégorie/tag/date
- Articles connexes suggérés
- Commentaires (optionnel, modérés)
- Partage réseaux sociaux

### 🖼️ Galerie / Photothèque
**Modèle de données:**
```
Galleries:
  - id, title, slug, description
  - created_at, updated_at

Images:
  - id, gallery_id, title, description
  - image_path, thumbnail_path, alt_text
  - order, created_at

Videos:
  - id, gallery_id, title, description
  - youtube_embed_id or video_url
  - thumbnail, order, created_at
```

**Fonctionnalités admin:**
- Création/édition de galeries
- Upload d'images par lot (mass upload)
- Génération auto de thumbnails
- Optimisation d'images (compression)
- Intégration YouTube pour vidéos
- Tri/réorganisation par drag-drop
- Gestion des droits d'auteur/attribution

**Fonctionnalités frontend:**
- Galerie lightbox responsive
- Chargement lazy des images
- Filtrage par galerie
- Métadonnées EXIF (date, auteur)

### 🎯 Module Activités & Projets
**Modèle de données:**
```
Activities:
  - id, title, slug, description (long text)
  - category (education, health, community, etc)
  - start_date, end_date, location
  - status (planned, ongoing, completed)
  - featured_image, budget, impact_metrics
  - team_id, partner_ids
  - created_at, updated_at

Impact Metrics:
  - id, activity_id
  - people_impacted, communities_reached
  - funds_used, outcomes_description
```

**Fonctionnalités admin:**
- CRUD complet des activités
- Calendrier visuel des activités
- Lien aux partenaires impliqués
- Métriques d'impact mesurables
- Attachement de documents (PDF, rapport)

**Fonctionnalités frontend:**
- Liste d'activités par statut
- Cartes détaillées par activité
- Timeline des réalisations
- Filtrage par localisation/type
- Téléchargement de rapports

### 🤝 Module Partenaires
**Modèle de données:**
```
Partners:
  - id, name, slug, website
  - logo_path, description
  - partnership_type (funding, technical, community)
  - country, sector
  - established_since, status (active/inactive)
  - contact_person, contact_email
  - order (pour classement), created_at

Partnership Types:
  - id, name (Bailleur de fonds, Partenaire technique, etc)
```

**Fonctionnalités admin:**
- CRUD partenaires avec logo
- Gestion de statuts (actif/inactif/archives)
- Tri personnalisé
- Lien aux activités/projets

**Fonctionnalités frontend:**
- Affichage logos partenaires (carousel optionnel)
- Filtrage par type de partenariat
- Page détail partenaire
- Lien vers site web partenaire

### 👥 Module Équipe
**Modèle de données:**
```
TeamMembers:
  - id, name, position, department
  - biography (short & long)
  - email, phone, social_links (linkedin, twitter, etc)
  - profile_photo, credentials
  - order, status (active/alumni)
  - created_at, updated_at

Departments:
  - id, name, description, manager_id
```

**Fonctionnalités admin:**
- CRUD équipe avec photo
- Gestion des postes et départements
- Historique (actif/alumni)
- Liens vers activités assignées

**Fonctionnalités frontend:**
- Annuaire équipe par département
- Cartes profil détaillées (bio, coordonnées)
- Photo professionnelle
- Réseaux sociaux

### 🏠 Page d'accueil & Sections statiques
**Sections:**
- Présentation ACEEN (mission, vision, valeurs)
- Statistiques clés (infographique)
- Actualités récentes (feed dynamique)
- Galerie projet principal (carousel)
- Appel à l'action (Rejoindre, Donner, Contact)
- Partenaires logos
- Footer avec liens/contact

**Optimisation:**
- SEO-friendly
- Mobile-first design
- Performance (Core Web Vitals)
- Accessibilité WCAG 2.1 AA

---

## Structure de la base de données

### Diagramme ER (Entité-Relation)
```
User
├── id (PK)
├── name, email, password
├── role (admin, editor, contributor)
├── status (active, inactive)
└── timestamps

Post (Actualités & Blog)
├── id (PK)
├── title, slug, content
├── excerpt, featured_image
├── author_id (FK → User)
├── category_id (FK → Category)
├── status (draft, published, archived)
├── seo_title, seo_description
└── timestamps

Category
├── id (PK)
├── name, slug
└── description

Tag
├── id (PK)
├── name, slug

Gallery
├── id (PK)
├── title, slug, description
└── timestamps

GalleryImage
├── id (PK)
├── gallery_id (FK)
├── title, description
├── image_path, thumbnail_path
├── alt_text, order
└── timestamps

Activity
├── id (PK)
├── title, slug, description
├── category (enum)
├── start_date, end_date, location
├── featured_image, budget
├── status (planned, ongoing, completed)
├── created_at, updated_at

Partner
├── id (PK)
├── name, slug, website
├── logo_path, description
├── partnership_type
├── country, sector
├── status (active/inactive)
├── order
└── timestamps

TeamMember
├── id (PK)
├── name, position, department
├── biography, email, phone
├── profile_photo, credentials
├── status (active/alumni)
├── order
└── timestamps

Department
├── id (PK)
├── name, description
└── manager_id (FK → TeamMember)

Contact (Messages formulaire)
├── id (PK)
├── name, email, phone
├── subject, message
├── status (new, read, replied)
└── timestamps
```

---

## Modules et fonctionnalités

### 1️⃣ Admin Dashboard
```
GET  /admin/dashboard
  ├── Statistiques (posts récents, visites, etc)
  ├── Activités récentes
  ├── Messages contact (nouveaux)
  └── Alertes système
```

### 2️⃣ Gestion Blog/Actualités
```
GET    /admin/posts              # Liste paginée
GET    /admin/posts/create       # Formulaire création
POST   /admin/posts              # Sauvegarde
GET    /admin/posts/{id}/edit    # Édition
PUT    /admin/posts/{id}         # Mise à jour
DELETE /admin/posts/{id}         # Suppression
GET    /admin/categories         # Gestion catégories
```

### 3️⃣ Gestion Galeries
```
GET    /admin/galleries          # Liste galeries
GET    /admin/galleries/create   # Créer galerie
POST   /admin/galleries          # Sauvegarder
GET    /admin/galleries/{id}/images
POST   /admin/galleries/{id}/images # Upload images
DELETE /admin/galleries/{id}/images/{img_id}
```

### 4️⃣ Gestion Activités
```
GET    /admin/activities         # Liste
GET    /admin/activities/create  # Créer
POST   /admin/activities         # Sauvegarder
GET    /admin/activities/{id}/edit
PUT    /admin/activities/{id}    # Mettre à jour
DELETE /admin/activities/{id}    # Supprimer
```

### 5️⃣ Gestion Partenaires
```
GET    /admin/partners           # Liste
GET    /admin/partners/create
POST   /admin/partners
GET    /admin/partners/{id}/edit
PUT    /admin/partners/{id}
DELETE /admin/partners/{id}
```

### 6️⃣ Gestion Équipe
```
GET    /admin/team               # Liste membres
GET    /admin/team/create        # Ajouter membre
POST   /admin/team               # Sauvegarder
GET    /admin/team/{id}/edit
PUT    /admin/team/{id}
DELETE /admin/team/{id}
GET    /admin/departments        # Gestion département
```

### 7️⃣ Frontend Public
```
GET  /                          # Accueil
GET  /actualites                # Blog/Actualités (list)
GET  /actualites/{slug}         # Détail article
GET  /galerie                   # Galeries
GET  /galeries/{slug}           # Détail galerie
GET  /activites                 # Liste activités
GET  /activites/{slug}          # Détail activité
GET  /partenaires               # Partenaires
GET  /equipe                    # Équipe/Annuaire
GET  /about                     # À propos
GET  /contact                   # Formulaire contact
POST /contact                   # Soumettre contact
GET  /sitemap.xml               # Sitemap
GET  /robots.txt                # Robots.txt
```

---

## Authentification & Permissions

### Système de rôles
```
┌─────────────────────────────────────────────────────────────┐
│ Rôle          │ Permissions                                  │
├─────────────────────────────────────────────────────────────┤
│ Admin         │ Tous (CRUD complet, gestion utilisateurs)   │
│ Éditeur       │ CRUD posts/galeries/activités/partenaires   │
│ Contributeur  │ Créer posts/galeries (modération requise)   │
│ Modérateur    │ Approuver/rejeter contenus, gérer comm.     │
│ Utilisateur   │ Profil perso (non admin)                    │
└─────────────────────────────────────────────────────────────┘
```

### Sécurité
- ✅ CSRF Protection (Laravel middleware)
- ✅ Hachage des mots de passe (Bcrypt)
- ✅ Authorization gates & policies
- ✅ Rate limiting sur formulaires
- ✅ Injection SQL: Prepared statements (Eloquent ORM)
- ✅ XSS Protection: HTML escaping dans Blade
- ✅ Logs d'audit (qui a modifié quoi, quand)

---

## Calendrier de développement

### Phase 1: Fondations (Semaine 1-2)
- [ ] Installation Laravel + dépendances
- [ ] Configuration base données MySQL
- [ ] Migration structure tables (schema)
- [ ] Configuration authentification
- [ ] Tests de connexion/déconnexion

### Phase 2: Admin Backend (Semaine 2-3)
- [ ] Dashboard admin
- [ ] CRUD Blog + Éditeur WYSIWYG
- [ ] CRUD Galeries + Upload images
- [ ] CRUD Activités
- [ ] CRUD Partenaires
- [ ] CRUD Équipe

### Phase 3: Frontend Visiteur (Semaine 3-4)
- [ ] Mise en page responsive (Tailwind CSS)
- [ ] Page accueil avec sections
- [ ] Blog public
- [ ] Galeries lightbox
- [ ] Pages activités
- [ ] Annuaire équipe
- [ ] Formulaire contact

### Phase 4: Optimisation & SEO (Semaine 4-5)
- [ ] Meta tags dynamiques
- [ ] Sitemap + robots.txt
- [ ] Pagination et filtres
- [ ] Performance (lazy loading, compression)
- [ ] Accessibilité WCAG
- [ ] Tests de sécurité

### Phase 5: Déploiement (Semaine 5)
- [ ] Configuration serveur production
- [ ] Migration données
- [ ] Certificat SSL
- [ ] Monitoring & logs
- [ ] Formation administrateurs
- [ ] Documentation maintenance

---

## Fichiers clés à créer

```
laravel/
├── app/
│   ├── Http/Controllers/
│   │   ├── Admin/DashboardController.php
│   │   ├── Admin/PostController.php
│   │   ├── Admin/GalleryController.php
│   │   ├── Admin/ActivityController.php
│   │   ├── Admin/PartnerController.php
│   │   ├── Admin/TeamController.php
│   │   └── PublicController.php
│   ├── Models/
│   │   ├── User.php
│   │   ├── Post.php
│   │   ├── Category.php
│   │   ├── Gallery.php
│   │   ├── Activity.php
│   │   ├── Partner.php
│   │   └── TeamMember.php
│   └── Services/
│       ├── ImageService.php
│       ├── SeoService.php
│       └── SearchService.php
│
├── database/
│   ├── migrations/
│   │   ├── 2024_01_01_000000_create_users_table.php
│   │   ├── 2024_01_01_000001_create_posts_table.php
│   │   ├── 2024_01_01_000002_create_galleries_table.php
│   │   └── ... (autres migrations)
│   └── seeders/
│       ├── UserSeeder.php
│       ├── CategorySeeder.php
│       └── DepartmentSeeder.php
│
├── resources/views/
│   ├── layouts/
│   │   ├── admin.blade.php
│   │   └── app.blade.php
│   ├── admin/
│   │   ├── dashboard.blade.php
│   │   ├── posts/
│   │   │   ├── index.blade.php
│   │   │   ├── create.blade.php
│   │   │   └── edit.blade.php
│   │   └── ... (autres modules)
│   ├── public/
│   │   ├── index.blade.php
│   │   ├── blog.blade.php
│   │   ├── gallery.blade.php
│   │   └── ...
│   └── components/
│       ├── navbar.blade.php
│       ├── footer.blade.php
│       └── ...
│
├── routes/
│   ├── web.php (routes publiques)
│   ├── admin.php (routes admin protégées)
│   └── api.php (API optionnelle)
│
├── public/
│   ├── css/
│   │   └── app.css (Tailwind)
│   ├── js/
│   │   ├── app.js
│   │   └── alpine.js
│   ├── images/
│   │   ├── logo.png
│   │   └── ...
│   └── uploads/
│       ├── posts/
│       ├── galleries/
│       └── ...
│
├── .env.example
├── composer.json
├── tailwind.config.js
├── vite.config.js
└── README.md
```

---

## Notes importantes

⚠️ **Sauvegardes régulières**
- Sauvegarde quotidienne de la base de données
- Versionning des fichiers avec Git
- Backup sur stockage externe (AWS S3 ou autre)

⚠️ **Maintenance**
- Mise à jour Laravel trimestriellement
- Vérification des vulnérabilités dépendances
- Monitoring des performances
- Logs des erreurs centralisés

⚠️ **Performance**
- Cache de requêtes fréquentes (Redis)
- CDN pour images/assets statiques
- Pagination limitée (10-20 par page)
- Indexes de base de données sur slug, date

---

**Document de référence complet pour le développement**
*Mis à jour: 2026-09-23*
