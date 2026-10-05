-- 2026-10-07 — Jumelage avec Agora, et changement du code d'un groupe.
--
-- À jouer une fois, dans une transaction, AVANT la version de l'app qui
-- jumelle (elle lit group_twins à l'ouverture d'un groupe) :
--   psql -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261007_jumelage.sql
-- Reportée telle quelle dans schema.sql (section « Jumelage avec Agora »).
--
-- ── Jumelage avec Agora, et changement du code d'un groupe ──────────
-- Un groupe peut avoir un jumeau dans Agora (agendas partagés) : ses membres en
-- voient le code d'invitation (« Rejoindre aussi dans Agora »). Les deux apps ne
-- se parlent pas, elles s'ouvrent l'une l'autre par des liens ; le protocole est
-- dans docs/liens-inter-apps.md du dépôt méta.
--   - les membres lisent le jumeau ; le créateur seul l'ajoute ou le défait ;
--   - PAS de mise à jour : un jumeau ne se remplace pas, on le défait d'abord.
--     Une demande forgée, acceptée sur un groupe déjà jumelé, redirigerait sinon
--     tous les membres vers un autre groupe Agora sans que personne le voie ;
--   - regenerate_join_code rend révocable le code donné à Agora (et tout code qui
--     a trop circulé) : l'ancien n'ouvre plus rien, les membres restent.
--     SECURITY DEFINER parce que le grant par colonne n'ouvre que le statut ;
--   - aucun outil de l'assistant IA ne lit group_twins.

-- Même raison que is_group_member : lire groups depuis une policy de
-- group_twins sans repasser par sa RLS.
create or replace function is_group_creator(p_group_id uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from groups
    where id = p_group_id and created_by = auth.uid()
  );
$$;

create table group_twins (
  group_id    uuid not null references groups(id) on delete cascade,
  app         text not null check (app in ('agora')),
  remote_code text not null,
  created_at  timestamptz not null default now(),
  primary key (group_id, app),
  -- Le format du code dépend de l'app jumelle (Agora : 8 caractères).
  constraint group_twins_remote_code_format
    check (app = 'agora' and remote_code ~ '^[A-HJ-NP-Z2-9]{8}$')
);

alter table group_twins enable row level security;
create policy "twins: members select" on group_twins
  for select using (is_group_member(group_id));
create policy "twins: creator insert" on group_twins
  for insert with check (is_group_creator(group_id));
create policy "twins: creator delete" on group_twins
  for delete using (is_group_creator(group_id));
create policy "compte requis" on group_twins as restrictive for all to authenticated using (compte_requis()) with check (compte_requis());
grant select, insert, delete on group_twins to authenticated;

create or replace function regenerate_join_code(p_group_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not compte_requis() then
    raise exception 'compte_requis';
  end if;
  if not is_group_creator(p_group_id) then
    raise exception 'not_group_creator';
  end if;
  v_code := generate_join_code();
  update groups set code = v_code where id = p_group_id;
  return v_code;
end; $$;
revoke execute on function is_group_creator(uuid), regenerate_join_code(uuid) from public, anon;
grant execute on function is_group_creator(uuid), regenerate_join_code(uuid) to authenticated;
