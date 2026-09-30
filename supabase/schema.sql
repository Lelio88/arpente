-- Arpente — schema des groupes/vote (Phase 0+).
-- État COMPLET, pour une base neuve : à exécuter tel quel (psql ou éditeur SQL).
-- La base déjà en service évolue par les fichiers de supabase/migrations/,
-- dont chacun est reporté ici dans le même commit.
-- Vérification : supabase/tests/conformite.test.sql, sur une base jetable.

-- ── Tables ──────────────────────────────────────────────────────────
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  handle      text not null,
  created_at  timestamptz not null default now()
);
create unique index profiles_handle_lower_idx on profiles (lower(handle));

create table groups (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  city        text not null check (city in ('caen', 'troyes')),
  status      text not null default 'voting' check (status in ('voting', 'decided')),
  -- Nullable : la suppression d'une identité laisse le groupe aux autres membres.
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table group_members (
  group_id  uuid not null references groups(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on group_members (user_id);

-- Vote d'approbation : 1 ligne = 1 membre approuve 1 POI.
create table poi_votes (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  poi_slug   text not null,
  created_at timestamptz not null default now(),
  unique (group_id, user_id, poi_slug)
);
create index poi_votes_group_idx on poi_votes (group_id, poi_slug);

-- Preference numerique : 1 ligne par membre par groupe (upsert).
create table preference_votes (
  id                       uuid primary key default gen_random_uuid(),
  group_id                 uuid not null references groups(id) on delete cascade,
  user_id                  uuid not null references profiles(id) on delete cascade,
  target_poi_count         int check (target_poi_count between 1 and 30),
  target_duration_minutes  int check (target_duration_minutes between 10 and 600),
  updated_at               timestamptz not null default now(),
  unique (group_id, user_id)
);

-- Checklist partagee : n'importe quel membre peut cocher/decocher un POI pour le groupe.
create table visited_pois (
  group_id   uuid not null references groups(id) on delete cascade,
  poi_slug   text not null,
  user_id    uuid references profiles(id) on delete set null,
  visited_at timestamptz not null default now(),
  primary key (group_id, poi_slug)
);

-- Snapshot immuable du parcours decide. Une nouvelle decision = une nouvelle ligne.
create table decided_routes (
  id                       uuid primary key default gen_random_uuid(),
  group_id                 uuid not null references groups(id) on delete cascade,
  poi_slugs                text[] not null,
  city                     text not null,
  target_poi_count         int not null,
  target_duration_minutes  int,
  distance_meters          numeric,
  duration_seconds         numeric,
  decided_at               timestamptz not null default now(),
  decided_by               uuid references profiles(id) on delete set null
);
create index decided_routes_group_idx on decided_routes (group_id, decided_at desc);

-- ── Code d'invitation + decouverte/adhesion sans exposer toute la table groups ──
create or replace function generate_join_code() returns text
language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- pas de O/0, I/1 (ambigus a l'oral/ecrit)
  -- Prefixe v_ obligatoire : une variable nommee « code » serait ambigue avec
  -- groups.code dans le EXIT WHEN ci-dessous, et Postgres refuse l'insertion
  -- avec 42702 au lieu de choisir. Meme convention que join_group_by_code.
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from groups where groups.code = v_code);
  end loop;
  return v_code;
end; $$;
alter table groups alter column code set default generate_join_code();

create or replace function preview_group_by_code(p_code text)
returns table (id uuid, name text, city text, status text, member_count bigint)
language sql security definer set search_path = public stable as $$
  select g.id, g.name, g.city, g.status, count(gm.user_id)
  from groups g left join group_members gm on gm.group_id = g.id
  where g.code = upper(p_code)
  group by g.id;
$$;

create or replace function join_group_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_group_id uuid;
begin
  select id into v_group_id from groups where code = upper(p_code);
  if v_group_id is null then
    raise exception 'group_not_found';
  end if;
  insert into group_members (group_id, user_id) values (v_group_id, auth.uid())
    on conflict (group_id, user_id) do nothing;
  return v_group_id;
end; $$;

-- ── Row Level Security ──────────────────────────────────────────────
-- SECURITY DEFINER pour eviter la recursion RLS classique d'une politique
-- group_members qui se referencerait elle-meme dans son propre USING().
create or replace function is_group_member(p_group_id uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

-- Même raison que is_group_member : lire group_members depuis une policy de
-- profiles sans repasser par sa RLS.
create or replace function shares_group_with(p_user uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1
    from group_members moi
    join group_members autre on autre.group_id = moi.group_id
    where moi.user_id = auth.uid() and autre.user_id = p_user
  );
$$;

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table poi_votes enable row level security;
alter table preference_votes enable row level security;
alter table visited_pois enable row level security;
alter table decided_routes enable row level security;

-- Soi-même et ses coéquipiers seulement : l'inscription anonyme étant libre,
-- « tout utilisateur connecté » voulait dire n'importe qui, et la table
-- s'énumérait entière.
create policy "profiles: self or teammates" on profiles
  for select using (id = auth.uid() or shares_group_with(id));
create policy "profiles: self insert" on profiles
  for insert with check (id = auth.uid());
create policy "profiles: self update" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- « ou createur » n'est pas une commodite : sans cette clause, celui qui cree un
-- groupe ne peut pas relire la ligne qu'il vient d'inserer, puisqu'il ne devient
-- membre qu'a l'appel suivant (join_group_by_code). Or le client fait
-- .insert().select().single() — le RETURNING exige la lisibilite de la ligne, et
-- Postgres refuse l'insertion entiere avec 42501. Le createur n'aurait alors
-- aucun moyen de connaitre le code d'invitation de son propre groupe.
create policy "groups: members select" on groups
  for select using (is_group_member(id) or created_by = auth.uid());
create policy "groups: self-created insert" on groups
  for insert with check (created_by = auth.uid());
-- La policy dit QUI ; le grant par colonne (plus bas) dit QUOI : seul le statut.
create policy "groups: members update status" on groups
  for update using (is_group_member(id)) with check (is_group_member(id));
create policy "groups: creator delete" on groups
  for delete using (created_by = auth.uid());

create policy "members: select roster" on group_members
  for select using (is_group_member(group_id));
create policy "members: join self" on group_members
  for insert with check (user_id = auth.uid());
create policy "members: leave self" on group_members
  for delete using (user_id = auth.uid());

create policy "poi_votes: members select" on poi_votes
  for select using (is_group_member(group_id));
create policy "poi_votes: cast own" on poi_votes
  for insert with check (user_id = auth.uid() and is_group_member(group_id));
create policy "poi_votes: retract own" on poi_votes
  for delete using (user_id = auth.uid());

create policy "prefs: members select" on preference_votes
  for select using (is_group_member(group_id));
create policy "prefs: set own" on preference_votes
  for insert with check (user_id = auth.uid() and is_group_member(group_id));
create policy "prefs: update own" on preference_votes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "visited: members select" on visited_pois
  for select using (is_group_member(group_id));
-- « user_id = auth.uid() » en plus de l'appartenance : sans lui, un membre peut
-- ecrire une ligne au nom d'un autre. La checklist resterait juste, mais
-- l'attribution affichee (« coche par X ») serait falsifiable.
create policy "visited: members check-off" on visited_pois
  for insert with check (is_group_member(group_id) and user_id = auth.uid());
create policy "visited: members uncheck" on visited_pois
  for delete using (is_group_member(group_id));

create policy "decided: members select" on decided_routes
  for select using (is_group_member(group_id));
create policy "decided: members insert" on decided_routes
  for insert with check (is_group_member(group_id) and decided_by = auth.uid());

-- RLS + policies ne suffisent pas seules : Postgres exige aussi le GRANT de base
-- sur le schema/les tables au role authenticated, sinon "permission denied for
-- schema public" meme avec des policies correctes.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  profiles, groups, group_members, poi_votes, preference_votes, visited_pois, decided_routes
  to authenticated;
grant execute on function preview_group_by_code, join_group_by_code, generate_join_code to authenticated;
-- Un membre ne réécrit ni le nom, ni le code, ni le créateur d'un groupe : l'app
-- ne change que le statut.
revoke update on groups from authenticated;
grant update (status) on groups to authenticated;

-- ── Suppression par l'utilisateur ───────────────────────────────────
-- Efface l'identité anonyme de l'appelant : le profil part en cascade, avec
-- ses adhésions, ses votes et ses préférences ; ses groupes et ses coches
-- restent aux autres (on delete set null). L'identifiant vient du jeton.
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

-- ── Purge nocturne ──────────────────────────────────────────────────
-- Groupe sans activité depuis 6 mois (sa trace la plus récente : création,
-- adhésion, vote, préférence, coche, décision) ; identité anonyme membre
-- d'aucun groupe depuis 30 jours (last_sign_in_at ne bouge pas au
-- renouvellement de session). Durées annoncées par docs/privacy.html.
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

-- ── Realtime ────────────────────────────────────────────────────────
alter publication supabase_realtime add table
  groups, group_members, poi_votes, preference_votes, visited_pois, decided_routes;
