-- 2026-10-06 — Comptes et assistant IA, seconde partie : la bascule.
--
-- À jouer SEULEMENT quand la version de l'app qui sait se connecter (e-mail
-- ou Google) est entre les mains des testeurs, et dans le même temps que la
-- fermeture de la connexion anonyme dans GoTrue
-- (GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false) et de /auth/v1/signup dans
-- Caddy. Une fois, dans une transaction :
--   psql -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261006_comptes_obligatoires.sql
--
-- Ce qu'elle change, et pourquoi :
-- 1. Les groupes deviennent réservés aux comptes : une politique RESTRICTIVE
--    par table, qui s'ajoute (ET) aux politiques existantes, et s'applique
--    aussi aux abonnements Realtime, qui évaluent la RLS sous les claims de
--    l'abonné. profiles en fait partie : une identité anonyme ne réserve plus
--    de pseudo.
-- 2. Les deux fonctions SECURITY DEFINER qui contournent la RLS
--    (preview_group_by_code, join_group_by_code) refusent l'anonyme.
-- 3. Décision de l'utilisateur : pas de reprise des groupes anonymes. Les
--    identités anonymes sont supprimées (leurs pseudos, adhésions, votes et
--    envies partent en cascade), puis les groupes restés sans membre.
-- 4. La purge supprime désormais toute identité anonyme de plus d'un jour :
--    GoTrue n'en crée plus, une survivante est un reste.

-- ── 1. Groupes réservés aux comptes ──────────────────────────────────────
create policy "compte requis" on profiles         as restrictive for all to authenticated using (compte_requis()) with check (compte_requis());
create policy "compte requis" on groups           as restrictive for all to authenticated using (compte_requis()) with check (compte_requis());
create policy "compte requis" on group_members    as restrictive for all to authenticated using (compte_requis()) with check (compte_requis());
create policy "compte requis" on poi_votes        as restrictive for all to authenticated using (compte_requis()) with check (compte_requis());
create policy "compte requis" on preference_votes as restrictive for all to authenticated using (compte_requis()) with check (compte_requis());
create policy "compte requis" on visited_pois     as restrictive for all to authenticated using (compte_requis()) with check (compte_requis());
create policy "compte requis" on decided_routes   as restrictive for all to authenticated using (compte_requis()) with check (compte_requis());

-- ── 2. Découverte et adhésion par code ───────────────────────────────────
create or replace function preview_group_by_code(p_code text)
returns table (id uuid, name text, city text, status text, member_count bigint)
language sql security definer set search_path = public stable as $$
  select g.id, g.name, g.city, g.status, count(gm.user_id)
  from groups g left join group_members gm on gm.group_id = g.id
  where g.code = upper(p_code) and compte_requis()
  group by g.id;
$$;

create or replace function join_group_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_group_id uuid;
begin
  if not compte_requis() then
    raise exception 'compte_requis';
  end if;
  select id into v_group_id from groups where code = upper(p_code);
  if v_group_id is null then
    raise exception 'group_not_found';
  end if;
  insert into group_members (group_id, user_id) values (v_group_id, auth.uid())
    on conflict (group_id, user_id) do nothing;
  return v_group_id;
end; $$;

-- ── 3. Les identités anonymes et leurs groupes orphelins ─────────────────
delete from auth.users where is_anonymous;
delete from groups g where not exists (select 1 from group_members m where m.group_id = g.id);

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

  -- GoTrue ne crée plus d'identité anonyme : une survivante est un reste.
  delete from auth.users u
  where u.is_anonymous and u.created_at < now() - interval '1 day';

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
