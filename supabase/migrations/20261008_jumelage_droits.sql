-- 2026-10-08 — Jumelage : droits de group_twins ramenés à ce que la RLS promet.
--
-- À jouer une fois, dans une transaction, après 20261007_jumelage.sql :
--   psql -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261008_jumelage_droits.sql
--
-- Pourquoi : la base en service accorde par défaut TOUS les droits sur une table
-- neuve de public à anon et authenticated (pg_default_acl de Supabase). La
-- migration précédente ajoutait SELECT, INSERT, DELETE sans retirer le reste :
-- UPDATE restait accordé (la RLS, sans politique UPDATE, le refusait quand même)
-- et TRUNCATE, qui échappe à la RLS, aussi. Un jumeau ne se remplace pas : on le
-- défait d'abord — c'est maintenant le droit qui le dit, pas seulement la RLS.
-- schema.sql porte la même révocation, pour qu'une base neuve soit identique.
revoke all on group_twins from anon, authenticated;
grant select, insert, delete on group_twins to authenticated;
