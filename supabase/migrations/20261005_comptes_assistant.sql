-- 2026-10-05 — Comptes et assistant IA, première partie (sans effet sur l'app
-- encore anonyme).
--
-- Migration de la base DÉJÀ en service (api.arpente). Une installation neuve
-- n'en a pas besoin : supabase/schema.sql décrit l'état complet. À jouer une
-- fois, dans une transaction :
--   psql -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261005_comptes_assistant.sql
-- puis poser le mot de passe du rôle (jamais dans ce fichier) :
--   alter role arpente_assistant password '…';   -- valeur du coffre
--
-- Ce qu'elle ajoute, et pourquoi :
-- 1. compte_requis() : vrai seulement pour un jeton de compte (e-mail ou
--    Google), jamais pour une identité anonyme — ni pour un jeton sans le
--    claim is_anonymous (échec fermé). La seconde migration
--    (20261006_comptes_obligatoires.sql) l'applique aux groupes.
-- 2. assistant_grants : les accès accordés à un assistant IA. L'app les
--    liste et les révoque (ses propres lignes, sans refresh_gen) ; le service
--    de l'assistant les crée, les fait tourner et les vérifie à chaque appel.
-- 3. Le rôle arpente_assistant, celui du service. NOINHERIT : membre de
--    authenticated sans en hériter les droits, il ne lit les groupes qu'après
--    « SET LOCAL ROLE authenticated » et sous les claims du membre — la RLS
--    s'applique alors comme à l'app. Hors de ce geste, il ne touche qu'à
--    assistant_grants. (Postgres 15 : la syntaxe « grant … with inherit false,
--    set true » n'existe qu'à partir de la 16.)
-- 4. Purge : inscriptions jamais confirmées (24 h), comptes sans groupe ni
--    activité depuis un an, accès d'assistant expirés.

-- ── 1. Compte requis ─────────────────────────────────────────────────────
create or replace function compte_requis() returns boolean
language sql stable set search_path = public as $$
  select (auth.jwt()->>'is_anonymous')::boolean is false;
$$;
grant execute on function compte_requis() to authenticated;

-- ── 2. Accès accordés à un assistant IA ──────────────────────────────────
create table assistant_grants (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  client_name  text not null check (char_length(client_name) between 1 and 80),
  assistant    text not null check (char_length(assistant) between 1 and 80),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz not null,
  refresh_gen  integer not null default 0,
  check (expires_at > created_at)
);
create index assistant_grants_user_idx on assistant_grants (user_id);
alter table assistant_grants enable row level security;

create policy "grants: own select" on assistant_grants
  for select to authenticated using (user_id = auth.uid());
create policy "grants: own revoke" on assistant_grants
  for delete to authenticated using (user_id = auth.uid());
-- L'app ne lit pas refresh_gen : c'est le compteur de rotation des jetons.
grant select (id, client_name, assistant, created_at, last_used_at, expires_at)
  on assistant_grants to authenticated;
grant delete on assistant_grants to authenticated;

-- ── 3. Le rôle du service ────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'arpente_assistant') then
    create role arpente_assistant login noinherit;
  end if;
end $$;
grant authenticated to arpente_assistant;
grant usage on schema public to arpente_assistant;
grant select, insert, update, delete on assistant_grants to arpente_assistant;
-- Le service lit et écrit les accès sans contexte d'utilisateur (échange
-- d'un jeton de rafraîchissement) : sa propre politique, sur cette seule table.
create policy "grants: service" on assistant_grants
  for all to arpente_assistant using (true) with check (true);

-- ── 4. Purge ─────────────────────────────────────────────────────────────
create or replace function purge_inactive() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from groups g
  where greatest(
    g.created_at,
    coalesce((select max(joined_at)   from group_members    where group_id = g.id), g.created_at),
    coalesce((select max(created_at)  from poi_votes        where group_id = g.id), g.created_at),
    coalesce((select max(updated_at)  from preference_votes where group_id = g.id), g.created_at),
    coalesce((select max(visited_at)  from visited_pois     where group_id = g.id), g.created_at),
    coalesce((select max(decided_at)  from decided_routes   where group_id = g.id), g.created_at)
  ) < now() - interval '6 months';

  delete from auth.users u
  where u.is_anonymous
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
    and not exists (select 1 from group_members m where m.user_id = u.id);

  -- Une adresse saisie puis jamais confirmée par son code : chaque demande
  -- de code pour une adresse neuve crée une telle ligne.
  delete from auth.users u
  where not u.is_anonymous
    and u.email_confirmed_at is null
    and u.created_at < now() - interval '24 hours';

  -- Compte sans groupe et sans activité depuis un an. last_sign_in_at ne
  -- bouge pas au renouvellement de session : les sessions et l'usage d'un
  -- assistant comptent aussi comme activité.
  delete from auth.users u
  where not u.is_anonymous
    and not exists (select 1 from group_members m where m.user_id = u.id)
    and greatest(
      u.created_at,
      coalesce(u.last_sign_in_at, u.created_at),
      coalesce((select max(greatest(s.updated_at, s.refreshed_at::timestamptz))
                from auth.sessions s where s.user_id = u.id), u.created_at),
      coalesce((select max(g.last_used_at)
                from assistant_grants g where g.user_id = u.id), u.created_at)
    ) < now() - interval '1 year';

  delete from assistant_grants where expires_at < now();
end; $$;
revoke execute on function purge_inactive() from public, anon, authenticated;
