# 📚 FICHE PÉDAGOGIQUE
## Développement d'un Site Web d'ONG avec Laravel

---

### **INFORMATIONS ADMINISTRATIVES**

| Champ | Valeur |
|-------|--------|
| **Sous-système** | Francophone |
| **Type d'enseignement** | Formation Professionnelle / Développement Web |
| **Niveau** | Professionnel (Développeurs en Formation) |
| **Module** | Développement Web Fullstack avec Laravel |
| **Unité d'apprentissage** | Création d'une Application Web Professionnelle |
| **Leçon** | Développement d'un Site Web d'ONG - Cas Pratique ACEEN Maroua |
| **Durée indicative** | 120-150 minutes (2-3 séances) |
| **Compétence visée** | L'apprenant doit être capable de concevoir et développer une application web fullstack utilisant Laravel 11 avec gestion complète du contenu (blog, galeries, activités, équipe, partenaires), système d'authentification administrateur, et interface publique responsive. |

---

## 1️⃣ SITUATION DE VIE RÉELLE

### Contexte

ACEEN (Association Camerounaise pour l'Éducation et l'Environnement) est une ONG basée à Maroua, au Cameroun. L'organisation mène diverses initiatives de développement communautaire, d'éducation, et d'accompagnement social.

### Problématique

Actuellement, ACEEN dispose d'un site web statique (pages HTML) qui présente plusieurs limitations :

- ❌ Mise à jour difficile des contenus (requiert un webmaster)
- ❌ Galeries de projets mal organisées
- ❌ Aucun système centralisé pour l'équipe
- ❌ Partenaires non mis en avant adéquatement
- ❌ Pas de formulaire de contact interactif
- ❌ Pauvre référencement SEO
- ❌ Impossible pour les administrateurs non-tech de gérer le contenu

### Objectif du Projet

Développer un site web professionnel et moderne permettant à l'équipe d'ACEEN de :

✅ Publier autonomement des actualités et articles  
✅ Gérer les galeries photos/vidéos des projets  
✅ Présenter les activités et initiatives  
✅ Afficher l'équipe et l'organisation  
✅ Valoriser les partenaires  
✅ Collecter les messages via un formulaire de contact  
✅ Mesurer l'impact des activités  

**Budget approuvé :** 1,000,000 FCFA  
**Timeline :** 2-3 semaines de développement  

### ❓ QUESTION DÉCLENCHANTE

**« Comment développer une application web moderne, sécurisée et facile à maintenir qui permet à l'équipe d'ACEEN de gérer autonomement tous leurs contenus sans connaissances techniques approfondies ? »**

---

## 2️⃣ CONSIGNES CLAIRES

| Modalité | Tâche | Matériel | Durée |
|----------|-------|----------|-------|
| **Individuel** | Analyser le cahier des charges d'ACEEN | Cahier charges, Contexte du cas | 15 min |
| **Binôme** | Concevoir la structure BD (tables, champs, relations) | Ordinateur, UML / Schéma | 25 min |
| **Groupe (3-5)** | Installer Laravel, créer modèles, migrations | PC, PHP 8.2, Composer | 30 min |
| **Groupe** | Développer les contrôleurs Admin (CRUD) | Code Editor, Documentation | 35 min |
| **Binôme** | Construire les vues publiques responsive | Frontend Tools, Tailwind CSS | 25 min |
| **Individuel** | Implémenter authentification et sécurité | Laravel Auth, Validation | 20 min |

**DURÉE TOTALE : 150 minutes avec pauses courtes**

---

## 3️⃣ ACTIVITÉS D'APPRENTISSAGE

### Activité 1 : Analyse du Cahier des Charges ✍️
**Durée :** 15 min | **Modalité :** Individuel

**Objectif :** Comprendre les besoins fonctionnels et techniques

**Tâche :**
1. Lire attentivement le contexte d'ACEEN
2. Identifier les 6 modules principaux (Blog, Galeries, Activités, Partenaires, Équipe, Contact)
3. Pour chaque module, énumérer :
   - Les données à afficher
   - Les actions possibles (créer, modifier, supprimer)
   - Les utilisateurs concernés (admin, visiteur)
4. Compléter un tableau synthèse fourni

**Matériel :** Cahier des charges (PDF), Template de tableau

---

### Activité 2 : Conception de la BD 📐
**Durée :** 25 min | **Modalité :** Binôme

**Objectif :** Maîtriser la modélisation de données

**Tâche :**
1. Identifier les entités principales
2. Définir les champs pour chaque table
3. Établir les relations (1-n, n-n, etc)
4. Créer un diagramme ER sur papier ou Lucidchart
5. Valider avec le groupe avant programmation

**Entités attendues :**
```
- User (admin)
- Category (catégories d'articles)
- Post (actualités/blog)
- Tag (étiquettes)
- Gallery (galeries)
- GalleryImage (images)
- Activity (activités/projets)
- Partner (partenaires)
- Department (départements)
- TeamMember (membres équipe)
- Contact (messages formulaire)
- ActivityPartner (relation n-n)
- PostTag (relation n-n)
```

**Relations clés à identifier :**
- Post belongsTo Category et Author
- Post belongsToMany Tag
- Gallery hasMany GalleryImage
- Activity belongsToMany Partner
- TeamMember belongsTo Department
- etc.

---

### Activité 3 : Installation et Configuration ⚙️
**Durée :** 30 min | **Modalité :** Groupe

**Objectif :** Mettre en place l'environnement Laravel

**Étapes :**

```bash
# 1. Vérifier les prérequis
php -v          # Minimum 8.2
composer -V

# 2. Créer le projet
composer create-project laravel/laravel aceen-ngo

# 3. Configurer .env
APP_NAME="ACEEN Maroua"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000
DB_CONNECTION=sqlite

# 4. Générer clé
php artisan key:generate

# 5. Créer et migrer BD
touch database/database.sqlite
php artisan migrate

# 6. Créer les modèles avec migrations
php artisan make:model Post -m
php artisan make:model Category -m
php artisan make:model Gallery -m
# ... etc pour tous les modèles

# 7. Exécuter toutes les migrations
php artisan migrate

# 8. Vérifier avec Tinker
php artisan tinker
>>> Post::count()      # Doit être 0
>>> App\Models\Post::count()
```

**Résultat attendu :** 
- ✅ Tous les modèles créés
- ✅ Migrations exécutées sans erreur
- ✅ Tables créées dans la BD
- ✅ Serveur démarre sans erreur

---

### Activité 4 : Développement des Contrôleurs 🎮
**Durée :** 35 min | **Modalité :** Groupe

**Objectif :** Comprendre les opérations CRUD et le pattern MVC

**Contrôleurs à créer :**

```bash
php artisan make:controller Admin/PostController --model=Post --resource
php artisan make:controller Admin/GalleryController --model=Gallery --resource
php artisan make:controller Admin/ActivityController --model=Activity --resource
php artisan make:controller Admin/PartnerController --model=Partner --resource
php artisan make:controller Admin/TeamMemberController --model=TeamMember --resource
php artisan make:controller Admin/ContactController --model=Contact
php artisan make:controller PublicController
```

**Actions CRUD attendues (Par PostController) :**

| Action | HTTP | URL | Fonction |
|--------|------|-----|----------|
| index | GET | /posts | Afficher liste |
| create | GET | /posts/create | Formulaire nouveau |
| store | POST | /posts | Sauvegarder |
| show | GET | /posts/{id} | Afficher détail |
| edit | GET | /posts/{id}/edit | Éditer |
| update | PUT | /posts/{id} | Mettre à jour |
| destroy | DELETE | /posts/{id} | Supprimer |

**Exemple de contrôleur simple :**

```php
<?php
namespace App\Http\Controllers\Admin;

use App\Models\Post;
use Illuminate\Http\Request;

class PostController extends Controller
{
    public function index()
    {
        $posts = Post::paginate(10);
        return view('admin.posts.index', compact('posts'));
    }

    public function create()
    {
        return view('admin.posts.create');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|max:255',
            'content' => 'required',
            'category_id' => 'required|exists:categories,id',
        ]);

        Post::create($validated);

        return redirect()->route('posts.index')
            ->with('success', 'Article créé!');
    }

    // ... edit, update, destroy
}
```

---

### Activité 5 : Développement du Frontend 🎨
**Durée :** 25 min | **Modalité :** Binôme

**Objectif :** Créer une interface utilisateur responsive et moderne

**Vues à créer :**

```
resources/views/
├── layouts/
│   ├── app.blade.php        # Layout public
│   └── admin.blade.php      # Layout admin
├── admin/
│   ├── dashboard.blade.php
│   ├── posts/
│   │   ├── index.blade.php
│   │   ├── create.blade.php
│   │   └── edit.blade.php
│   └── ... (galleries, activities, etc)
└── public/
    ├── index.blade.php      # Accueil
    ├── posts/
    │   ├── index.blade.php  # Liste articles
    │   └── show.blade.php   # Détail article
    ├── gallery/
    ├── activities/
    ├── team/
    └── contact.blade.php
```

**Technos Frontend :**
- **Tailwind CSS** : Framework CSS utility-first
- **Alpine.js** : Réactivité légère sans JavaScript lourd
- **Blade** : Moteur de templates Laravel

**Exemple de template Blade :**

```blade
<!-- resources/views/public/index.blade.php -->
@extends('layouts.app')

@section('content')
<div class="container mx-auto px-4 py-8">
    <h1 class="text-4xl font-bold mb-8">Actualités d'ACEEN</h1>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        @foreach($posts as $post)
        <div class="bg-white rounded-lg shadow-lg overflow-hidden">
            <img src="{{ $post->featured_image }}" class="w-full h-48 object-cover">
            <div class="p-4">
                <h2 class="font-bold text-xl mb-2">{{ $post->title }}</h2>
                <p class="text-gray-600">{{ $post->excerpt }}</p>
                <a href="{{ route('posts.show', $post) }}" class="text-blue-600 hover:underline mt-4">
                    Lire la suite →
                </a>
            </div>
        </div>
        @endforeach
    </div>
    
    {{ $posts->links() }}
</div>
@endsection
```

**Points clés :**
- Responsive design (mobile-first)
- Pagination des listes
- Images optimisées (lazy loading)
- Accessibilité (alt-text, contraste)
- SEO-friendly (meta tags)

---

### Activité 6 : Authentification et Sécurité 🔐
**Durée :** 20 min | **Modalité :** Individuel

**Objectif :** Sécuriser l'application

**Tâches :**

1. **Créer un utilisateur admin :**
```bash
php artisan tinker
User::create([
    'name' => 'Admin ACEEN',
    'email' => 'admin@aceen.cm',
    'password' => bcrypt('SecurePassword123'),
]);
exit
```

2. **Protéger les routes admin :**
```php
// routes/web.php
Route::middleware('auth')->group(function () {
    Route::resource('admin/posts', PostController::class);
    Route::resource('admin/galleries', GalleryController::class);
    // ...
});
```

3. **Ajouter la validation :**
```php
$validated = $request->validate([
    'email' => 'email|unique:users',
    'password' => 'min:8|confirmed',
    'title' => 'required|max:255',
]);
```

4. **Protéger contre les attaques :**
- CSRF Token automatiquement dans formulaires
- XSS Protection via Blade escaping
- SQL Injection impossible (Eloquent)
- Password Hashing automatique

---

## 3.7 🎯 DIFFÉRENCIATION PÉDAGOGIQUE

### Pour les apprenants en difficulté

- ✅ Fournir des templates Blade préremplis
- ✅ Donner les migrations déjà écrites
- ✅ Utiliser des screencasts vidéo en français
- ✅ Pair-programming avec un mentor
- ✅ Simplifier le scope (3 modules au lieu de 6)
- ✅ Provide step-by-step checklists

### Pour les apprenants avancés

- 🚀 Ajouter une API REST complète
- 🚀 Intégrer Redis pour le caching
- 🚀 Tests unitaires et fonctionnels (PHPUnit)
- 🚀 Déploiement et DevOps (Docker, CI/CD)
- 🚀 Optimisation performance (profiling)
- 🚀 Multilingue (i18n)
- 🚀 Intégration paiements (Stripe)

---

## 3.8 🖥️ INTÉGRATION DU NUMÉRIQUE

**Outils et technologies :**

| Outil | Usage |
|-------|-------|
| **VS Code** | IDE avec extensions Laravel, PHP Intelephense |
| **Laravel Valet** ou **php artisan serve** | Serveur local |
| **Postman** | Tester les contrôleurs/API |
| **GitHub** | Versionning et collaboration |
| **SQLite/MySQL** | Base de données |
| **Tailwind CSS** | CSS framework |
| **Vite** | Bundler asset frontend |

**Ressources en ligne :**

- 📖 [Laravel Docs](https://laravel.com/docs)
- 📖 [Blade Documentation](https://laravel.com/docs/blade)
- 📖 [Eloquent ORM](https://laravel.com/docs/eloquent)
- 🎥 [Laravel From Scratch](https://laracasts.com) (vidéos en anglais)
- 🎨 [Tailwind CSS](https://tailwindcss.com)

---

## 4️⃣ COURS STRUCTURÉ

### 4.1 Qu'est-ce que Laravel ?

**Définition :** Laravel est un framework PHP moderne qui simplifie le développement d'applications web en fournissant une structure MVC (Model-View-Controller) et des outils pré-construits.

**Avantages :**
- ✅ Développement rapide
- ✅ Code élégant et lisible
- ✅ Sécurité intégrée
- ✅ Grande communauté
- ✅ Documentation excellente

---

### 4.2 Architecture MVC

```
┌─────────────────────────────────────────┐
│          USER REQUEST                   │
└─────────────┬──────────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │      ROUTER         │  (routes/web.php)
    │  (Direction la req) │
    └─────────┬───────────┘
              │
              ▼
  ┌────────────────────────────────────────┐
  │         CONTROLLER                     │
  │  (Logique métier, orchestration)      │
  │  - Récupère données du Model           │
  │  - Prépare données pour View           │
  └────────┬──────────────────┬────────────┘
           │                  │
           ▼                  ▼
    ┌────────────┐   ┌──────────────┐
    │   MODEL    │   │    VIEW      │
    │  (Données) │   │ (Interface)  │
    │  (Logique) │   │ (Affichage)  │
    └────────────┘   └──────────────┘
```

**Rôles :**

| Composant | Responsabilité |
|-----------|----------------|
| **Model** | Gère les données et la logique métier (Post.php, Category.php) |
| **View** | Affiche les données à l'utilisateur (templates Blade .blade.php) |
| **Controller** | Orchestre requêtes, appelle Models et Views (PostController.php) |

---

### 4.3 Installation et Configuration

**Commandes essentielles :**

```bash
# Créer projet
composer create-project laravel/laravel mon-app

# Générer clé
php artisan key:generate

# Migrer BD
php artisan migrate

# Créer modèle avec migration
php artisan make:model Post -m

# Créer contrôleur
php artisan make:controller PostController

# Lancer serveur
php artisan serve
```

---

### 4.4 Modèles Eloquent

**Qu'est-ce qu'Eloquent ?**

Eloquent est l'ORM (Object-Relational Mapping) de Laravel. Il permet de travailler avec les tables de base de données comme des objets PHP.

**Exemple :**

```php
// Sans Eloquent (PDO brut)
$pdo = new PDO('...');
$stmt = $pdo->prepare('SELECT * FROM posts WHERE id = ?');
$stmt->execute([$id]);
$post = $stmt->fetch();

// Avec Eloquent (Laravel)
$post = Post::find($id);
```

**Relations :**

```php
// Post Model
class Post extends Model
{
    public function category()  // Relation belongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function tags()      // Relation belongsToMany
    {
        return $this->belongsToMany(Tag::class);
    }
}

// Utilisation
$post = Post::find(1);
echo $post->category->name;  // Récupère catégorie
echo $post->tags;            // Récupère tags
```

**Relations principales :**

| Relation | Exemple | Signification |
|----------|---------|---------------|
| **belongsTo** | Post→Category | Un post appartient à UNE catégorie |
| **hasMany** | Category→Posts | Une catégorie a PLUSIEURS posts |
| **belongsToMany** | Post↔Tag | Un post a PLUSIEURS tags, un tag a PLUSIEURS posts |

---

### 4.5 Migrations

**Qu'est-ce qu'une migration ?**

Une migration est un fichier PHP qui décrit la structure de la base de données. Elle est versionnée et peut être exécutée et annulée.

**Exemple :**

```php
// database/migrations/2024_01_01_create_posts_table.php

return new class extends Migration {
    public function up(): void
    {
        Schema::create('posts', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('content');
            $table->foreignId('category_id')->constrained();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('posts');
    }
};
```

**Commandes :**

```bash
php artisan migrate           # Exécuter migrations
php artisan migrate:rollback  # Annuler dernière migration
php artisan migrate:refresh   # Annuler tout et rejouer
```

---

### 4.6 Contrôleurs

**Qu'est-ce qu'un contrôleur ?**

Un contrôleur est une classe qui gère la logique pour un ensemble de routes. Il reçoit les requêtes, traite les données et retourne les réponses.

**Exemple :**

```php
namespace App\Http\Controllers;

use App\Models\Post;

class PostController extends Controller
{
    public function index()  // GET /posts → afficher liste
    {
        $posts = Post::paginate(10);
        return view('posts.index', compact('posts'));
    }

    public function store(Request $request)  // POST /posts → créer
    {
        $post = Post::create($request->validated());
        return redirect()->route('posts.show', $post);
    }
}
```

---

### 4.7 Vues Blade

**Qu'est-ce que Blade ?**

Blade est le moteur de templates de Laravel. Il compile du PHP intelligemment et prévent les attaques XSS.

**Syntaxe clés :**

```blade
<!-- Variables -->
{{ $variable }}              @* Échappe automatiquement (XSS-safe) *@

<!-- Conditions -->
@if ($user->isAdmin())
    <p>Admin panel</p>
@else
    <p>User page</p>
@endif

<!-- Boucles -->
@foreach ($posts as $post)
    <h2>{{ $post->title }}</h2>
@endforeach

<!-- Héritage -->
@extends('layouts.app')     @* Étendre layout *@
@section('content')
    <p>Contenu</p>
@endsection

<!-- Components -->
@component('components.alert')
    Attention!
@endcomponent
```

---

### 4.8 Authentification

**Login & Logout :**

```php
// Routes protégées
Route::middleware('auth')->group(function () {
    Route::get('/dashboard', function () {
        return view('dashboard');
    });
});

// Dans un contrôleur
if (Auth::check()) {
    $user = Auth::user();  // Utilisateur connecté
}

Auth::logout();  // Déconnecter
```

---

### 4.9 Validation

**Valider les données :**

```php
public function store(Request $request)
{
    $validated = $request->validate([
        'title' => 'required|max:255',
        'content' => 'required',
        'email' => 'email|unique:users',
        'category_id' => 'required|exists:categories,id',
    ]);

    Post::create($validated);
}
```

**Messages d'erreur personnalisés :**

```blade
@error('title')
    <span class="text-red-600">{{ $message }}</span>
@enderror
```

---

### 4.10 Sécurité

**Bonnes pratiques :**

1. **CSRF Protection** - Laravel ajoute {{ csrf_token() }} automatiquement
2. **XSS Prevention** - Blade échappe {{ $var }} par défaut
3. **SQL Injection** - Eloquent utilise prepared statements
4. **Password Hashing** - bcrypt() automatique
5. **Environment** - Secrets en .env

---

## 5️⃣ EXERCICES D'INTÉGRATION

### Exercice 1 : Quiz - Restitution (Facile) ⭐

Répondre aux questions suivantes :

1. **Qu'est-ce que MVC ?**
   - a) Un sigle pour modèles complexes
   - b) Model-View-Controller : séparation des responsabilités
   - c) Une base de données MySQL

2. **Quelle commande crée un modèle avec migration ?**
   - a) `php artisan create:model Post`
   - b) `php artisan make:model Post -m`
   - c) `php make:model Post`

3. **Les migrations permettent :**
   - a) D'envoyer des emails
   - b) De versionner la structure BD
   - c) De créer des utilisateurs

4. **Blade est :**
   - a) Un moteur de templates
   - b) Un framework CSS
   - c) Un ORM

5. **La relation belongsTo signifie :**
   - a) Possession exclusive
   - b) Appartenance à un(e)
   - c) Relation many-to-many

**Réponses :** 1-b, 2-b, 3-b, 4-a, 5-b

---

### Exercice 2 : Complétion de Tableau (Moyen) ⭐⭐

Compléter le tableau des routes REST :

| Nom Route | Méthode HTTP | URL | Action | Description |
|-----------|--------------|-----|--------|-------------|
| posts.index | GET | /posts | index | Lister tous les posts |
| posts.create | ? | ? | create | Afficher formulaire création |
| posts.store | POST | /posts | store | Sauvegarder nouveau post |
| posts.show | GET | /posts/{id} | show | Afficher un post |
| posts.edit | GET | ? | ? | Afficher formulaire édition |
| posts.update | ? | /posts/{id} | update | Mettre à jour post |
| posts.destroy | DELETE | ? | destroy | Supprimer un post |

**Réponses :**
| Row 2 | GET | /posts/create | create | |
| Row 5 | GET | /posts/{id}/edit | edit | |
| Row 6 | PUT | /posts/{id} | update | |
| Row 7 | DELETE | /posts/{id} | destroy | |

---

### Exercice 3 : Résolution de Problème (Difficile) ⭐⭐⭐

**Scénario :**
Un administrateur d'ACEEN signale qu'un visiteur peut voir les articles en brouillon dans l'affichage public. C'est un problème de sécurité.

**Tâches :**
1. Identifier le bug : quelle ligne du code cause le problème ?
2. Proposer une correction
3. Coder la solution
4. Tester que seuls les articles "published" s'affichent

**Code problématique :**
```php
// app/Http/Controllers/PublicController.php
public function blog()
{
    $posts = Post::all();  // ❌ Affiche TOUS les posts
    return view('blog', compact('posts'));
}
```

**Solution :**
```php
public function blog()
{
    $posts = Post::where('status', 'published')->paginate(10);
    return view('blog', compact('posts'));
}

// Ou avec un scope
public function blog()
{
    $posts = Post::published()->paginate(10);
    return view('blog', compact('posts'));
}
```

---

### Exercice 4 : Défi Ouvert (Très Difficile) ⭐⭐⭐⭐

**Défi :** Ajouter un système de **commentaires sur les articles**.

**Fonctionnalités requises :**
1. Modèle Comment avec champs : id, post_id, author_name, email, content, approved
2. Relation : Post hasMany Comments, Comment belongsTo Post
3. Formulaire de commentaire en bas de chaque article
4. Validation : name min 3, email valid, content min 10
5. Admin peut approuver/rejeter commentaires
6. Afficher seulement les commentaires approuvés

**Étapes :**
```bash
php artisan make:model Comment -m

# Dans la migration
Schema::create('comments', function (Blueprint $table) {
    $table->id();
    $table->foreignId('post_id')->constrained();
    $table->string('author_name');
    $table->string('email');
    $table->text('content');
    $table->boolean('approved')->default(false);
    $table->timestamps();
});

# Établir relations
# Post::hasMany(Comment)
# Comment::belongsTo(Post)
```

---

### 5.1 Grille d'Auto-Évaluation

Évaluer votre niveau sur chaque critère (1-5) :

| Critère | Niveau | Notes |
|---------|--------|-------|
| Comprendre le pattern MVC | ___ | |
| Créer modèles et migrations | ___ | |
| Développer des contrôleurs REST | ___ | |
| Créer des vues Blade | ___ | |
| Implémenter authentification | ___ | |
| Valider et sécuriser données | ___ | |
| Tester une application | ___ | |
| Déployer en production | ___ | |

**Grille :** 1=Non acquis, 2=Partiel, 3=Satisfaisant, 4=Bon, 5=Excellent

---

## 6️⃣ CORRIGÉ ENSEIGNANT

### Réponses Quiz (Exercice 1)
1. **b)** Model-View-Controller
2. **b)** `php artisan make:model Post -m`
3. **b)** Versionner la structure BD
4. **a)** Moteur de templates
5. **b)** Appartenance à un(e)

### Réponses Tableau Routes (Exercice 2)
```
posts.create | GET | /posts/create | create
posts.edit | GET | /posts/{id}/edit | edit  
posts.update | PUT | /posts/{id} | update
posts.destroy | DELETE | /posts/{id} | destroy
```

### Solution Exercice 3
Le problème : `Post::all()` affiche tous les posts sans filtre.

```php
// Solution 1 : Ajouter une clause where
$posts = Post::where('status', 'published')->get();

// Solution 2 : Utiliser un scope (mieux)
// Dans Model Post :
public function scopePublished($query)
{
    return $query->where('status', 'published');
}

// Dans le contrôleur :
$posts = Post::published()->get();
```

### Guide Exercice 4 (Système de Commentaires)

Code complet :

```php
// 1. Model Comment
class Comment extends Model {
    public function post() {
        return $this->belongsTo(Post::class);
    }
}

// 2. Model Post - ajouter relation
public function comments() {
    return $this->hasMany(Comment::class);
}

// 3. Formulaire dans la vue
<form action="{{ route('comments.store') }}" method="POST">
    @csrf
    <input type="hidden" name="post_id" value="{{ $post->id }}">
    <input type="text" name="author_name" placeholder="Nom">
    <input type="email" name="email" placeholder="Email">
    <textarea name="content" placeholder="Commentaire"></textarea>
    <button>Envoyer</button>
</form>

// 4. Contrôleur
public function store(Request $request) {
    $validated = $request->validate([
        'author_name' => 'required|min:3',
        'email' => 'required|email',
        'content' => 'required|min:10',
    ]);
    
    Comment::create($validated);
    return back()->with('success', 'Commentaire envoyé!');
}

// 5. Afficher commentaires approuvés
@foreach($post->comments()->where('approved', true)->get() as $comment)
    <div class="comment">
        <strong>{{ $comment->author_name }}</strong>
        <p>{{ $comment->content }}</p>
    </div>
@endforeach
```

---

## 📝 À RETENIR

### Concepts Clés
1. **MVC :** Séparation Model (données) - View (affichage) - Controller (logique)
2. **Eloquent :** ORM pour travailler avec BD comme objets
3. **Migrations :** Versionning de la structure BD
4. **Blade :** Moteur templates sécurisé
5. **Routes :** Connexion URLs → Contrôleurs
6. **Middleware :** Filtres pour protéger routes
7. **Validation :** Vérifier données avant traitement
8. **Security :** CSRF, XSS, SQL Injection protection

### Bonnes Pratiques
✅ Toujours valider les entrées utilisateur  
✅ Utiliser Eloquent au lieu de SQL brut  
✅ Protéger routes admin avec middleware  
✅ Hacher les mots de passe (bcrypt)  
✅ Utiliser migrations pour BD  
✅ Tester le code régulièrement  
✅ Documenter les APIs  
✅ Utiliser versionning (Git)  

---

## 🔗 Ressources Complémentaires

- **Tuto Laravel :** https://laravel.com/docs
- **Eloquent :** https://laravel.com/docs/eloquent
- **Blade :** https://laravel.com/docs/blade
- **Security :** https://laravel.com/docs/security
- **YouTube :** "Laravel Tutorial for Beginners" (anglais)
- **Forum :** Laravel.io, Stack Overflow

---

**Fiche créée :** 23 Septembre 2026  
**Niveau :** Formation Professionnelle  
**Durée :** 120-150 minutes  
**Supports :** Cahier charges, Code source, Documentation en ligne
