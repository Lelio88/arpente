-- 2026-09-30 — Conformité : suppression par l'utilisateur, purge, cloisonnement.
--
-- Migration de la base DÉJÀ en service (api.arpente). Une installation neuve
-- n'en a pas besoin : supabase/schema.sql décrit l'état complet, ce fichier
-- compris. À jouer une fois, dans une transaction :
--   psql -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20260930_conformite.sql
--
-- Ce qu'elle change, et pourquoi :
-- 1. Trois clés étrangères vers profiles n'avaient pas de règle de
--    suppression : supprimer l'identité de quelqu'un qui avait créé un groupe,
--    coché une étape ou arrêté un parcours échouait. Elles passent à
--    « on delete set null » : le groupe et sa progression restent aux autres.
-- 2. Les pseudos n'étaient lisibles que par « tout utilisateur connecté »,
--    c'est-à-dire n'importe qui (l'inscription anonyme est libre) : la table
--    s'énumérait entière. Désormais : soi-même et ses coéquipiers.
-- 3. Un membre pouvait réécrire toutes les colonnes d'un groupe (nom, code,
--    créateur, ville). Il ne peut plus changer que le statut, seul champ que
--    l'app modifie.
-- 4. Le créateur peut supprimer son groupe ; chacun peut supprimer son
--    identité (delete_my_account), ce que la politique promettait sans moyen.
-- 5. Purge nocturne (pg_cron) : groupe sans activité depuis 6 mois ; identité
--    anonyme membre d'aucun groupe depuis 30 jours.

-- ── 1. Supprimer une identité ne bute plus sur une clé étrangère ─────────
alter table groups alter column created_by drop not null;
alter table groups drop constraint groups_created_by_fkey,
  add constraint groups_created_by_fkey
    foreign key (created_by) references profiles(id) on delete set null;

alter table visited_pois alter column user_id drop not null;
alter table visited_pois drop constraint visited_pois_user_id_fkey,
  add constraint visited_pois_user_id_fkey
    foreign key (user_id) references profiles(id) on delete set null;

alter table decided_routes alter column decided_by drop not null;
alter table decided_routes drop constraint decided_routes_decided_by_fkey,
  add constraint decided_routes_decided_by_fkey
    foreign key (decided_by) references profiles(id) on delete set null;

-- ── 2. Pseudos : soi-même et ses coéquipiers ────────────────────────────
-- SECURITY DEFINER pour la même raison que is_group_member : lire
-- group_members depuis une policy de profiles sans repasser par sa RLS.
create or replace function shares_group_with(p_user uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1
    from group_members moi
    join group_members autre on autre.group_id = moi.group_id
    where moi.user_id = auth.uid() and autre.user_id = p_user
  );
$$;

drop policy "profiles readable by signed-in users" on profiles;
create policy "profiles: self or teammates" on profiles
  for select using (id = auth.uid() or shares_group_with(id));

-- ── 3. Un membre ne change que le statut d'un groupe ─────────────────────
revoke update on groups from authenticated;
grant update (status) on groups to authenticated;

-- ── 4. Suppression par l'utilisateur ─────────────────────────────────────
create policy "groups: creator delete" on groups
  for delete using (created_by = auth.uid());

-- Efface l'identité anonyme de l'appelant : le profil part en cascade
-- (profiles → auth.users), et avec lui ses adhésions, ses votes et ses
-- préférences ; les groupes qu'il a créés et ses coches restent aux autres.
-- L'identifiant vient du jeton (auth.uid()), jamais d'un paramètre.
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end; $$;
revoke execute on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;

-- ── 5. Purge nocturne ────────────────────────────────────────────────────
-- Activité d'un groupe = la plus récente de ses traces (création, adhésion,
-- vote, préférence, coche, décision). last_sign_in_at ne bouge pas quand une
-- session se renouvelle : une identité sans groupe part donc 30 jours après sa
-- dernière vraie connexion, ce qui est le but.
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
end; $$;
revoke execute on function purge_inactive() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('arpente-purge', '17 3 * * *', 'select public.purge_inactive()');
