# Journal d'audit — garantie append-only

Ce fichier **n'est pas exécuté** au démarrage : la table `AdminAuditLog` n'existe pas
encore à ce moment-là (elle est créée par la première migration Prisma).

Le script ci-dessous doit être joué **après** `prisma migrate deploy`, dans chaque
environnement. Il est repris tel quel dans la procédure de déploiement
(`docs/10-plan-de-deploiement.md` §6) et sa présence est vérifiée par un test
d'intégration qui tente un `UPDATE` puis un `DELETE` et attend un refus
(`docs/09-plan-de-tests.md` §4).

La garantie est posée **au niveau de la base**, pas au niveau du code : aucune route
d'écriture n'existe, et même une erreur de programmation ne pourrait pas altérer le
journal.

```sql
-- À exécuter après les migrations, en tant que superutilisateur.
REVOKE UPDATE, DELETE, TRUNCATE ON app."AdminAuditLog" FROM acuba_app;

-- Ceinture et bretelles : un déclencheur refuse toute altération, y compris par un
-- rôle disposant par erreur des droits.
CREATE OR REPLACE FUNCTION app.refuser_alteration_audit()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Le journal d''audit est en écriture seule (append-only).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_append_only ON app."AdminAuditLog";
CREATE TRIGGER audit_append_only
  BEFORE UPDATE OR DELETE ON app."AdminAuditLog"
  FOR EACH ROW EXECUTE FUNCTION app.refuser_alteration_audit();
```

> **TODO(D9-07)** : intégrer ce script à la migration de la tranche D9, sous forme de
> migration Prisma personnalisée, afin qu'il soit appliqué automatiquement dans tous
> les environnements.
