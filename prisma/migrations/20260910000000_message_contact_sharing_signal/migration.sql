-- Tranche D5 — messagerie.
--
-- Ajoute le signal `CONTACT_SHARING` au catalogue de modération. Un message qui
-- contient un numéro de téléphone ou un identifiant de messagerie tierce est
-- TRANSMIS puis signalé : bloquer punirait deux personnes qui veulent
-- légitimement se parler ailleurs, ne rien marquer laisserait prospérer
-- l'arnaque sentimentale.
--
-- Réversibilité : PostgreSQL ne sait pas retirer une valeur d'un type énuméré.
-- Le retour arrière consiste donc à cesser d'écrire cette valeur, pas à la
-- supprimer — la valeur restante est inerte. C'est assumé, et c'est la raison
-- pour laquelle aucune donnée n'est migrée ici.
--
-- `ALTER TYPE ... ADD VALUE` est admis dans une transaction depuis PostgreSQL 12
-- tant que la nouvelle valeur n'est pas utilisée dans la même transaction : c'est
-- le cas ici, la migration n'écrit aucune ligne.

ALTER TYPE "app"."SignalType" ADD VALUE IF NOT EXISTS 'CONTACT_SHARING';
