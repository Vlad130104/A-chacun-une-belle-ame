# Rapport de validation — phase E

Ce document rend compte de la relecture transverse menée après la livraison des dix tranches D1 à D10. Il n'est pas
un bilan de communication : il nomme d'abord ce qui ne fonctionnait pas.

Trois défauts ont été trouvés, tous trois **invisibles pour les 1 014 tests unitaires alors verts**. C'est le
principal enseignement de cette phase, et il tient en une phrase : les tests couvraient les règles du domaine, pas la
chaîne qui les fait appliquer.

---

## 1. Les constats

### E-01 — Aucune route d'administration n'était accessible (gravité : critique)

**Ce qui se passait.** Le garde d'autorisation comparait les permissions exigées par une route aux **rôles portés par
le jeton d'accès** :

```ts
const granted = new Set(claims.roles);
const autorise = policy.permissions.every((permission) => granted.has(permission));
```

Deux fautes superposées.

1. Le jeton était émis avec `roles: []`, systématiquement — la ligne existait dans `verify-otp.use-case.ts` et
   `refresh-token.use-case.ts` depuis la tranche D1, en attendant D9. D9 a livré la table `UserRole`, la matrice
   rôles × permissions et les routes de gestion des rôles, mais **personne n'a rebranché l'émission**.
2. Même remplie, la comparaison était fausse : elle cherchait la permission `users.read` parmi des valeurs de type
   `ADMIN` ou `MODERATOR`. Un ensemble de rôles ne contient jamais une permission.

**Conséquence réelle.** Les quarante-cinq routes `/admin/*` répondaient 403 à tout le monde, y compris à un
super-administrateur. La modération, la revue d'identité, le remboursement, le journal d'audit et le tableau de bord
étaient inatteignables. La plateforme ne pouvait pas être exploitée.

**Ce qui a limité les dégâts.** Le défaut échouait **fermé** : personne n'obtenait de droits qu'il n'avait pas. C'est
le bon sens du défaut, et ce n'est pas un hasard — le garde refuse par défaut. Mais un système inexploitable n'est pas
un système sûr.

**La correction.** Les rôles ne sont plus dans le jeton du tout ; `AccessTokenClaims` ne porte que `sub` et `sid` (et
les statuts, informatifs). Le garde lit les rôles **en base à chaque requête**, via un port `RoleReader` en lecture
seule, puis dérive les permissions par la matrice du domaine. Trois propriétés en découlent :

- un rôle retiré cesse d'agir **immédiatement**, pas à l'expiration du jeton — la même règle que pour la suspension
  d'un compte (ADR-006), qui n'avait jamais été étendue aux rôles ;
- la lecture n'a lieu **que si la route demande une permission** : une route de membre ordinaire ne paie aucune
  requête supplémentaire ;
- une valeur de rôle inconnue du code est **écartée**, jamais convertie : convertir accorderait des droits qu'aucune
  table ne décrit.

Deux fonctions dupliquées de « rôle de l'auteur » — l'une dans le back-office, l'autre dans la modération, avec des
résultats différents — ont été remplacées par une seule, `requireAuditRole`. Elle **refuse la requête** plutôt que
d'inscrire un `SUPPORT` de consolation au journal : une ligne d'audit qui attribue une action à une habilitation
inexistante est pire qu'une absence de ligne.

### E-02 — La limitation de débit était déclarative (gravité : élevée)

**Ce qui se passait.** `@Auth({ rateLimit: 'conversations.send' })` était posé sur quinze routes. Rien ne lisait cette
métadonnée. Le seul compteur réellement actif était celui de l'envoi d'OTP, appelé explicitement dans
`RegisterUseCase`.

La documentation annonçait des routes « protégées par une limitation de débit dédiée ». Elles ne l'étaient pas.

**La correction.** Un garde global lit la métadonnée et applique un barème tenu dans une table pure, testable sans
Redis. Trois décisions méritent d'être justifiées :

- **Le comptage se fait par compte, pas par adresse IP**, sauf sur les quatre routes atteignables sans session.
  Compter par IP une route authentifiée punirait tout un cybercafé ou toute une sortie NAT mobile — situation
  ordinaire au Cameroun, au Bénin et en Côte d'Ivoire.
- **Le signalement reste volontairement généreux.** Une limite serrée ferait taire quelqu'un qui subit une série
  d'abus au moment précis où il doit pouvoir parler. Le garde-fou contre le signalement abusif est le quota métier
  journalier, pas le compteur de requêtes.
- **Une panne de Redis ne ferme pas le service.** L'arbitrage est délibéré et n'est pas l'habitude en sécurité :
  refuser toutes les requêtes parce que le compteur est injoignable transformerait un incident d'infrastructure en
  interruption totale, alors que les vraies barrières — authentification, autorisation, quotas métier — ne dépendent
  pas de Redis.

`app.set('trust proxy', 1)` a été ajouté : sans lui, toutes les requêtes derrière un répartiteur porteraient
l'adresse du répartiteur et un seul visiteur épuiserait le quota de tous. Faire confiance à toute la chaîne serait
l'erreur inverse — n'importe qui pourrait alors forger `X-Forwarded-For`.

Un test d'inventaire vérifie que **toute clé déclarée sur une route possède un barème**. Il a immédiatement trouvé
une clé orpheline (`billing.subscribe`), qui serait autrement retombée en silence sur le barème par défaut.

### E-03 — La sonde de disponibilité mentait (gravité : élevée)

`GET /health/ready` renvoyait `{ status: 'ok' }` sans rien vérifier. Un répartiteur de charge y aurait envoyé du
trafic vers une instance incapable de joindre PostgreSQL, et ne l'aurait jamais retirée du service.

Une sonde qui répond toujours oui est pire qu'une sonde absente : elle donne une garantie qui n'existe pas.

La sonde interroge désormais PostgreSQL et Redis, avec une échéance de deux secondes, et renvoie **503** — le code,
pas un statut dégradé dans le corps : un répartiteur lit le code. La sonde de **vivacité**, elle, continue de ne rien
tester : y inclure la base ferait redémarrer en boucle toutes les instances pendant une panne, ajoutant une tempête
de démarrages à l'incident.

---

## 2. Ce que la phase E n'a pas trouvé

La relecture a aussi confirmé des choses, et il est honnête de le dire :

- **Aucun secret dans le dépôt.** Les valeurs par défaut de développement sont nommées comme telles
  (`sel-de-developpement-non-secret`), et la configuration refuse en production les ports critiques simulés.
- **Aucune route sans politique d'autorisation.** Le test d'inventaire tenait, et tient toujours.
- **Aucun contenu de message ni photo dans les journaux.** La liste de rédaction de `pino` couvre les champs
  sensibles, et l'analytique refuse les clés nominatives par deux filtres.
- **Les frontières de modules tiennent.** Aucun dépôt Prisma ne lit la table d'un autre domaine, à deux exceptions
  documentées : le back-office, qui lit tout en lecture seule, et le nouveau `RoleReader`.

---

## 3. Ce qui reste, dit sans détour

| Réf.   | Sujet                                                        | Effet aujourd'hui                                                                               |
| ------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| E-04   | 2FA non **exigée** à l'ouverture de session d'administration | L'enrôlement et la vérification fonctionnent ; le contrôle manque dans le parcours de connexion |
| E-05   | Aucune tâche planifiée                                       | Purges (KYC, analytique, notifications), fins de grâce et levées de sanction restent manuelles  |
| D10-08 | Offre de lancement non accordée                              | Le rattachement au lien fonctionne ; aucun abonnement promotionnel n'est créé                   |
| D9-05  | Gestion de contenu (CGU, charte, modèles)                    | Aucune table versionnée au modèle de données                                                    |
| D9-06  | Transport SMTP                                               | Aucun e-mail ne part ; la notification in-app fonctionne                                        |
| D3-01  | Jeu de données de démonstration                              | Le seed ne contient ni profils fictifs, ni conversations, ni cas de modération                  |
| D1-11  | Tâches CI end-to-end et Lighthouse                           | Les tests E2E Playwright ne tournent pas en intégration continue                                |

**Et la réserve qui l'emporte sur toutes les autres :** rien de ce code n'a encore été exécuté contre un vrai
PostgreSQL ni un vrai Redis. L'environnement de génération ne dispose pas de Docker. Les 1 049 tests unitaires
couvrent les règles ; la résolution complète du conteneur d'injection couvre le câblage ; **les dépôts Prisma, les
migrations, les déclencheurs d'audit et les compteurs Redis ne seront confirmés qu'au premier `docker compose up`.**
C'est la première chose à faire, avant toute nouvelle fonctionnalité.

---

## 4. La leçon de méthode

Les trois défauts partagent une forme. Dans chacun, **une intention avait été déclarée quelque part** — un champ
`roles` dans le jeton, une clé `rateLimit` dans un décorateur, une route `/health/ready` — **et rien ne la lisait**.
Le code se relit comme s'il fonctionnait ; les tests passent, parce qu'ils testent les règles, pas leur application.

Deux pratiques en sortent, désormais outillées :

1. **Un test par point de passage obligé, pas seulement par règle.** Le garde d'autorisation, qui commande tout le
   reste, était le seul composant sans test. Il en a dix-sept maintenant.
2. **Un test d'inventaire pour chaque déclaration.** Toute clé déclarée dans un décorateur doit correspondre à une
   entrée dans une table lue à l'exécution. La faute de frappe devient un échec de CI au lieu d'un trou silencieux.
