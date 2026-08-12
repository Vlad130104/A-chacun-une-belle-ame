-- Amorçage d'une base PostgreSQL gérée (Render, Neon, Scaleway…).
--
-- À exécuter UNE FOIS, avec le rôle propriétaire fourni par l'hébergeur, AVANT
-- la première migration. Il reproduit ce que `docker/postgres/init` fait en
-- local : deux schémas et deux rôles étanches (ADR-004).
--
-- Les mots de passe ne figurent PAS ici. Renseignez-les par :
--   psql "$DATABASE_URL" -v kyc_password="'…'" -f scripts/sql/bootstrap-production.sql

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS kyc;

-- Rôle de vérification d'identité, distinct du rôle applicatif.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acuba_kyc') THEN
    EXECUTE format('CREATE ROLE acuba_kyc LOGIN PASSWORD %L', :'kyc_password');
  END IF;
END
$$;

GRANT USAGE ON SCHEMA app TO acuba_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app TO acuba_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA app TO acuba_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON TABLES TO acuba_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON SEQUENCES TO acuba_app;

GRANT USAGE ON SCHEMA kyc TO acuba_kyc;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA kyc TO acuba_kyc;
ALTER DEFAULT PRIVILEGES IN SCHEMA kyc GRANT ALL ON TABLES TO acuba_kyc;

-- L'interdiction croisée est le cœur d'ADR-004 : une injection SQL côté produit
-- ne doit pas pouvoir atteindre les pièces d'identité, et l'agent de
-- vérification ne doit pas pouvoir lire les conversations.
REVOKE ALL ON SCHEMA kyc FROM acuba_app;
REVOKE ALL ON ALL TABLES IN SCHEMA kyc FROM acuba_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA kyc REVOKE ALL ON TABLES FROM acuba_app;

REVOKE ALL ON SCHEMA app FROM acuba_kyc;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM acuba_kyc;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM acuba_kyc;

-- Contrôle : doit renvoyer exactement deux lignes, `app` et `kyc`.
SELECT nspname FROM pg_namespace WHERE nspname IN ('app', 'kyc') ORDER BY nspname;
