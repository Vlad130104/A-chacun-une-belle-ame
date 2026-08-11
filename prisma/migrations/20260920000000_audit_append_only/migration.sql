-- Tranche D9 — journal d'audit inaltérable (story D9-07).
--
-- Jusqu'ici, le caractère « en ajout seul » du journal reposait sur une
-- convention applicative : aucun service n'exposait de mise à jour, aucune route
-- d'écriture n'existait. C'était vrai, et insuffisant — un accès direct à la
-- base, une migration maladroite ou un script de correction auraient pu réécrire
-- une ligne sans laisser de trace.
--
-- Cette migration remplace la convention par une CONTRAINTE. Deux verrous
-- indépendants, parce qu'un seul se contourne :
--
--   1. un déclencheur qui refuse UPDATE et DELETE, quel que soit l'auteur —
--      y compris le propriétaire de la table ;
--   2. le retrait explicite des droits UPDATE et DELETE au rôle applicatif,
--      pour que la tentative échoue avant même d'atteindre le déclencheur.
--
-- Ce que cela n'empêche pas, et il faut le savoir : un super-utilisateur
-- PostgreSQL peut désactiver un déclencheur. La protection vise l'erreur et
-- l'abus ordinaire, pas un administrateur de base malveillant — contre lui, le
-- rempart est l'export du journal vers un stockage externe, prévu en V1.

-- ── Verrou 1 : déclencheur ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.refuse_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Le journal d''audit est en ajout seul : % interdit sur app."AdminAuditLog".',
    TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_audit_log_no_update ON app."AdminAuditLog";
CREATE TRIGGER admin_audit_log_no_update
  BEFORE UPDATE ON app."AdminAuditLog"
  FOR EACH ROW EXECUTE FUNCTION app.refuse_audit_mutation();

DROP TRIGGER IF EXISTS admin_audit_log_no_delete ON app."AdminAuditLog";
CREATE TRIGGER admin_audit_log_no_delete
  BEFORE DELETE ON app."AdminAuditLog"
  FOR EACH ROW EXECUTE FUNCTION app.refuse_audit_mutation();

-- ── Verrou 2 : droits du rôle applicatif ─────────────────────────────────────
--
-- `acuba_app` est le rôle utilisé par l'API en production (docs/10 §4). Le bloc
-- est conditionnel : en développement local, la base tourne souvent sous un rôle
-- unique et la migration ne doit pas échouer pour autant.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acuba_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON app."AdminAuditLog" FROM acuba_app;
    GRANT SELECT, INSERT ON app."AdminAuditLog" TO acuba_app;
  END IF;
END
$$;

-- ── Réversibilité ────────────────────────────────────────────────────────────
--
-- Le retour arrière consiste à supprimer les deux déclencheurs et la fonction :
--
--   DROP TRIGGER admin_audit_log_no_update ON app."AdminAuditLog";
--   DROP TRIGGER admin_audit_log_no_delete ON app."AdminAuditLog";
--   DROP FUNCTION app.refuse_audit_mutation();
--
-- Il n'est pas automatisé, et c'est délibéré : défaire cette protection doit
-- être une décision explicite, tracée, jamais un effet de bord de déploiement.
