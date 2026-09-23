# 🏢 ACEEN NGO Website - Application Web Professionnelle

**Organisation:** ACEEN (Association Camerounaise pour l'Éducation et l'Environnement) - Maroua, Cameroun  
**Valeur Estimée:** 1,000,000 FCFA  
**Framework:** Laravel 11  
**Statut:** En Développement  
**Dernière mise à jour:** 2026-09-23

---

## 📖 Vue d'Ensemble

ACEEN est une ONG camerounaise engagée dans les initiatives de développement communautaire, d'éducation, et d'accompagnement social. Ce site web professionnel permet à l'équipe de gérer efficacement :

✅ **Actualités & Blog** - Publication facile d'articles et actualités  
✅ **Galeries** - Gestion de photos/vidéos des projets  
✅ **Activités** - Suivi des initiatives et projets  
✅ **Partenaires** - Mise en avant des collaborateurs  
✅ **Équipe** - Annuaire du personnel  
✅ **Formulaires** - Contact et engagement des visiteurs  

---

## 🏗️ Architecture Technique

### Stack Technologique

```
Backend:          Laravel 11 (PHP 8.2+)
Base de données:  SQLite (développement) / MySQL (production)
Frontend:         Blade Templates + Tailwind CSS + Alpine.js
Authentification: Laravel Sanctum + Sessions
Stockage média:   Local Disk / AWS S3 (configurable)
Cache:            Database (Redis en optionnel)
```

### Structure des Répertoires

```
aceen-ngo/
├── app/
│   ├── Models/              # Modèles Eloquent
│   │   ├── Post.php
│   │   ├── Category.php
│   │   ├── Gallery.php
│   │   ├── Activity.php
│   │   ├── Partner.php
│   │   ├── TeamMember.php
│   │   ├── Department.php
│   │   ├── Tag.php
│   │   ├── Contact.php
│   │   └── GalleryImage.php
│   │
│   └── Http/Controllers/
│       ├── Admin/
│       │   ├── DashboardController.php
│       │   ├── PostController.php
│       │   ├── GalleryController.php
│       │   ├── ActivityController.php
│       │   ├── PartnerController.php
│       │   ├── TeamMemberController.php
│       │   └── ContactController.php
│       └── PublicController.php
│
├── database/
│   ├── migrations/          # Schéma de base de données
│   └── seeders/             # Données initiales
│
├── resources/views/
│   ├── layouts/             # Templates de mise en page
│   ├── admin/               # Pages administrateur
│   └── public/              # Pages publiques
│
├── routes/
│   ├── web.php              # Routes web
│   └── api.php              # Routes API (optionnel)
│
└── public/
    ├── css/                 # Styles compilés
    ├── js/                  # Scripts
    └── uploads/             # Médias uploadés
```

---

## 🗄️ Modèle de Données

### Entités Principales

#### Posts (Actualités)
```
- id, title, slug, excerpt, content
- featured_image, author_id, category_id
- status (draft, published, archived)
- seo_title, seo_description, keywords
- published_at, created_at, updated_at
```

#### Categories
```
- id, name, slug, description, icon
```

#### Tags
```
- id, name, slug
```

#### Gallery & GalleryImage
```
Gallery: id, title, slug, description, cover_image
GalleryImage: id, gallery_id, title, image_path, thumbnail_path, alt_text, order
```

#### Activities
```
- id, title, slug, description, category
- start_date, end_date, location
- status (planned, ongoing, completed)
- featured_image, budget, people_impacted, impact_metrics
```

#### Partners
```
- id, name, slug, description, website, logo_path
- partnership_type, country, sector
- established_since, status (active, inactive)
- contact_person, contact_email, order
```

#### TeamMembers
```
- id, name, position, department_id
- biography_short, biography_long
- email, phone, profile_photo
- linkedin_url, twitter_url, credentials
- status (active, alumni), order
```

#### Departments
```
- id, name, description, manager_id
```

#### Contacts
```
- id, name, email, phone, subject, message
- status (new, read, replied), admin_reply, replied_at
```

---

## 🚀 Installation & Configuration

### Prérequis

- PHP 8.2 ou supérieur
- Composer
- MySQL/MariaDB ou SQLite
- Git

### Étapes d'Installation

```bash
# 1. Cloner le projet
git clone <repo-url>
cd apps/aceen-ngo

# 2. Installer les dépendances
composer install

# 3. Copier le fichier .env
cp .env.example .env

# 4. Générer la clé d'application
php artisan key:generate

# 5. Créer la base de données
touch database/database.sqlite  # Pour SQLite

# 6. Exécuter les migrations
php artisan migrate

# 7. Créer les répertoires de stockage
php artisan storage:link

# 8. Installer les dépendances frontend (optionnel)
npm install
npm run dev

# 9. Lancer le serveur de développement
php artisan serve

# Accès : http://localhost:8000
```

---

## 👤 Authentification Administrateur

### Créer un Utilisateur Admin

```bash
php artisan tinker

User::create([
    'name' => 'Admin ACEEN',
    'email' => 'admin@aceen.cm',
    'password' => bcrypt('SecurePassword123'),
    'role' => 'admin',
]);
```

### Login Admin
```
URL: http://localhost:8000/admin/login
Email: admin@aceen.cm
Password: SecurePassword123
```

---

## 📋 Modules Fonctionnels

### 1. **Dashboard Admin** (`/admin`)
- Vue d'ensemble statistiques
- Activités récentes
- Messages de contact non lus
- Liens rapides vers modules

### 2. **Gestion Blog** (`/admin/posts`)
- CRUD articles
- Éditeur WYSIWYG
- Catégorisation
- Scheduling de publication
- SEO optimization

### 3. **Gestion Galeries** (`/admin/galleries`)
- Création/édition de galeries
- Upload d'images (mass upload)
- Thumbnails automatiques
- Tri/réorganisation
- Métadonnées images

### 4. **Gestion Activités** (`/admin/activities`)
- CRUD activités
- Associer partenaires
- Calendrier visuel
- Métriques d'impact
- Attachement documents

### 5. **Gestion Partenaires** (`/admin/partners`)
- CRUD partenaires
- Gestion logos
- Statuts (actif/inactif)
- Classement personnalisé

### 6. **Gestion Équipe** (`/admin/team`)
- CRUD membres
- Organisation par département
- Historique (actif/alumni)
- Réseaux sociaux

### 7. **Messages Contact** (`/admin/contacts`)
- Consultation des messages
- Marquage lu/répondu
- Système de réponse intégré
- Export/archivage

---

## 🌐 Frontend Public

### Pages Disponibles

| Page | URL | Description |
|------|-----|-------------|
| Accueil | `/` | Présentation ACEEN, actualités récentes, appel à l'action |
| Blog | `/actualites` | Liste articles paginée |
| Article | `/actualites/{slug}` | Détail article |
| Galeries | `/galerie` | Liste galeries |
| Galerie Détail | `/galeries/{slug}` | Lightbox images |
| Activités | `/activites` | Liste projets |
| Activité Détail | `/activites/{slug}` | Détail projet |
| Partenaires | `/partenaires` | Affichage partenaires |
| Équipe | `/equipe` | Annuaire équipe |
| À Propos | `/about` | Mission, vision, valeurs |
| Contact | `/contact` | Formulaire contact |
| Sitemap | `/sitemap.xml` | Sitemap SEO |

---

## 🔐 Sécurité

Fonctionnalités de sécurité intégrées :

✅ **CSRF Protection** - Tokens automatiques sur formulaires  
✅ **SQL Injection Prevention** - Prepared statements (Eloquent ORM)  
✅ **XSS Prevention** - Blade escaping par défaut  
✅ **Password Hashing** - Bcrypt automatique  
✅ **Rate Limiting** - Sur routes sensibles  
✅ **HTTPS** - Redirection automatique en production  
✅ **Audit Logs** - Suivi des actions admin  
✅ **Environment Isolation** - Secrets en .env  

---

## 📊 Performance & SEO

### Optimisations Implémentées

- **Lazy Loading** pour images
- **Compression** d'images automatique
- **Caching** des requêtes fréquentes
- **Pagination** limitée (10-20 items)
- **Meta Tags** dynamiques
- **Sitemap** généré automatiquement
- **Robots.txt** configuré
- **Image Optimization** avec responsives images

---

## 🧪 Tests

```bash
# Tests unitaires
php artisan test

# Tests spécifiques
php artisan test --filter=PostTest

# Coverage
php artisan test --coverage
```

---

## 📦 Déploiement

### Serveur Recommandé

- **VPS** : 2GB RAM, 20GB SSD minimum
- **PHP** : 8.2 avec extensions : mbstring, curl, json, zip
- **Serveur Web** : Nginx ou Apache
- **SSL** : Certificat Let's Encrypt (obligatoire)
- **Database** : MySQL 8.0 ou MariaDB

### Étapes Déploiement

```bash
# 1. Cloner en production
git clone <repo-url> /var/www/aceen-ngo

# 2. Installer dépendances
cd /var/www/aceen-ngo
composer install --no-dev

# 3. Configurer .env production
cp .env.example .env
# Modifier avec données production (DB, APP_KEY, MAIL, etc)

# 4. Générer clé
php artisan key:generate

# 5. Migrations
php artisan migrate --force

# 6. Optimisations
php artisan config:cache
php artisan route:cache
php artisan view:cache

# 7. Permissions
chmod -R 755 storage bootstrap/cache
chown -R www-data:www-data /var/www/aceen-ngo

# 8. Configurer serveur web (Nginx/Apache)
# Pointer vers /var/www/aceen-ngo/public

# 9. SSL
certbot certonly -d aceen.cm

# 10. Cron jobs (optionnel)
* * * * * cd /var/www/aceen-ngo && php artisan schedule:run >> /dev/null 2>&1
```

---

## 📞 Support & Maintenance

### Commandes Utiles

```bash
# Effacer les caches
php artisan cache:clear
php artisan config:clear
php artisan view:clear

# Optimiser
php artisan optimize

# Vérifier logs
tail -f storage/logs/laravel.log

# Backup base de données
php artisan db:seed --class=BackupSeeder

# Statistiques
php artisan tinker
# User::count(), Post::count(), Activity::count()
```

### Mise à Jour

```bash
# Vérifier mises à jour disponibles
composer outdated

# Mettre à jour les dépendances
composer update

# Tester après mise à jour
php artisan migrate
php artisan test
```

---

## 📚 Documentation & Ressources

- **Laravel Documentation** : https://laravel.com/docs
- **Eloquent ORM** : https://laravel.com/docs/eloquent
- **Blade Templates** : https://laravel.com/docs/blade
- **Tailwind CSS** : https://tailwindcss.com
- **Alpine.js** : https://alpinejs.dev

---

## 👥 Contributeurs

- **Développement** : Claude Haiku 4.5
- **Framework** : Laravel (Taylor Otwell)
- **Client** : ACEEN Maroua, Cameroon

---

## 📄 Licence

Licensed under a proprietary license. Contact ACEEN for permissions.

---

## ✅ Checklist Lancement

- [ ] Configuration .env production finalisée
- [ ] Database migrations exécutées
- [ ] Utilisateur admin créé
- [ ] SSL certificate installé
- [ ] DNS configuré
- [ ] Sauvegardes automatiques activées
- [ ] Monitoring setup
- [ ] Email SMTP configuré
- [ ] CDN configuré (optionnel)
- [ ] Documentation équipe complète
- [ ] Formation utilisateurs effectuée

---

**Dernière modification:** 23 Septembre 2026
