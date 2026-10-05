-- 2026-10-09 — Droits fermés : rien à anon ; à authenticated, ce que la RLS permet.
--
-- À jouer une fois, dans une transaction :
--   psql -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261009_droits_fermes.sql
--
-- Pourquoi : la base en service accorde par défaut TOUS les droits sur une table
-- neuve de public à anon et authenticated (pg_default_acl de Supabase),
-- TRUNCATE compris, qui échappe à la RLS. schema.sql n'accordait rien à anon,
-- mais ne révoquait pas ces défauts : la RLS tenait seule, et la politique
-- restrictive « compte requis », qui ne vise que authenticated, ne couvrait pas
-- anon. Rien n'était ouvert par l'API, mais une politique future sans auth.uid()
-- l'aurait été à quiconque détient la clé publique de l'app.
-- supabase/tests/conformite.test.sql vérifie désormais chaque table.

-- 1. Tables : tout retirer, puis rendre à authenticated les seules opérations
--    qu'une politique autorise. Les droits par colonne disent le reste :
--    groups ne change que de statut ; assistant_grants se lit sans
--    refresh_gen ni client_key.
revoke all on profiles, groups, group_members, poi_votes, preference_votes, visited_pois,
  decided_routes, group_twins, assistant_grants from anon, authenticated;
grant select, insert, update on profiles, preference_votes to authenticated;
grant select, insert, delete on groups, group_members, poi_votes, visited_pois, group_twins to authenticated;
grant update (status) on groups to authenticated;
grant select, insert on decided_routes to authenticated;
grant select (id, client_name, assistant, created_at, last_used_at, expires_at)
  on assistant_grants to authenticated;
grant delete on assistant_grants to authenticated;

-- 2. Fonctions : anon n'en appelle aucune (les comptes sont obligatoires).
revoke execute on function compte_requis(), generate_join_code(), is_group_member(uuid),
  shares_group_with(uuid), preview_group_by_code(text), join_group_by_code(text) from public, anon;
grant execute on function compte_requis(), generate_join_code(), is_group_member(uuid),
  shares_group_with(uuid), preview_group_by_code(text), join_group_by_code(text) to authenticated;

-- 3. Tables futures : plus de droits par défaut ; chacune dira les siens.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
