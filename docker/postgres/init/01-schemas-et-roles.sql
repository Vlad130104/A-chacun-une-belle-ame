-- Séparation physique des données d'identité (ADR-004).
--
-- Deux schémas, deux rôles. Le rôle applicatif du produit n'a AUCUN droit sur le
-- schéma `kyc` : une injection ou une faille côté produit ne peut pas atteindre les
-- pièces d'identité. Un test d'intégration tente cette lecture et attend un refus
-- (docs/09-plan-de-tests.md §4).
--
-- Les mots de passe ci-dessous sont locaux et triviaux. En production, ils viennent
-- du gestionnaire de secrets.

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS kyc;

-- Rôle du produit : plein accès à `app`, aucun accès à `kyc`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acuba_app') THEN
    CREATE ROLE acuba_app LOGIN PASSWORD 'acuba_local_dev';
  END IF;
END
$$;

-- Rôle de vérification : accès à `kyc` uniquement, utilisé par le seul module
-- `verification`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acuba_kyc') THEN
    CREATE ROLE acuba_kyc LOGIN PASSWORD 'acuba_kyc_local_dev';
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

-- Interdiction explicite : le produit ne voit pas les pièces d'identité.
REVOKE ALL ON SCHEMA kyc FROM acuba_app;
REVOKE ALL ON ALL TABLES IN SCHEMA kyc FROM acuba_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA kyc REVOKE ALL ON TABLES FROM acuba_app;

-- Et symétriquement : l'agent de vérification ne voit pas les conversations.
REVOKE ALL ON SCHEMA app FROM acuba_kyc;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM acuba_kyc;
