-- Arpente — schema des groupes/vote (Phase 0+).
-- A executer tel quel dans l'editeur SQL du projet Supabase (Supabase Studio > SQL Editor).

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
  created_by  uuid not null references profiles(id),
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
  user_id    uuid not null references profiles(id),
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
  decided_by               uuid not null references profiles(id)
);
create index decided_routes_group_idx on decided_routes (group_id, decided_at desc);

-- ── Code d'invitation + decouverte/adhesion sans exposer toute la table groups ──
create or replace function generate_join_code() returns text
language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- pas de O/0, I/1 (ambigus a l'oral/ecrit)
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from groups where groups.code = code);
  end loop;
  return code;
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

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table poi_votes enable row level security;
alter table preference_votes enable row level security;
alter table visited_pois enable row level security;
alter table decided_routes enable row level security;

create policy "profiles readable by signed-in users" on profiles
  for select using (auth.uid() is not null);
create policy "profiles: self insert" on profiles
  for insert with check (id = auth.uid());
create policy "profiles: self update" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "groups: members select" on groups
  for select using (is_group_member(id));
create policy "groups: self-created insert" on groups
  for insert with check (created_by = auth.uid());
create policy "groups: members update status" on groups
  for update using (is_group_member(id)) with check (is_group_member(id));

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
create policy "visited: members check-off" on visited_pois
  for insert with check (is_group_member(group_id));
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

-- ── Realtime ────────────────────────────────────────────────────────
alter publication supabase_realtime add table
  groups, group_members, poi_votes, preference_votes, visited_pois, decided_routes;
