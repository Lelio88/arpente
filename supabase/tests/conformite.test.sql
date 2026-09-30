-- Test de conformité de la couche groupes : cloisonnement des pseudos, droits
-- sur les groupes, suppression par l'utilisateur, purge.
--
-- À jouer sur une base JETABLE portant schema.sql (ou le schéma d'origine +
-- les migrations) — par exemple un « supabase start » local :
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/conformite.test.sql
-- Tout se passe dans une transaction annulée à la fin : la base ne garde rien.
-- Chaque vérification lève une exception au premier écart ; la dernière ligne
-- affichée est « conformité : tous les cas passent ».
--
-- Personnages : A crée le groupe G1, B le rejoint, C est un inconnu.

begin;

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, last_sign_in_at) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());
insert into profiles (id, handle) values
  ('00000000-0000-0000-0000-00000000000a', 'alice'),
  ('00000000-0000-0000-0000-00000000000b', 'bob'),
  ('00000000-0000-0000-0000-00000000000c', 'chloe');
insert into groups (id, name, city, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'Visite', 'caen', '00000000-0000-0000-0000-00000000000a');
insert into group_members (group_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b');

-- ── Pseudos : soi-même et ses coéquipiers ────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
do $$ begin
  if (select count(*) from profiles) <> 1 then
    raise exception 'un inconnu voit % pseudos au lieu du sien seul', (select count(*) from profiles);
  end if;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$ begin
  if (select array_agg(handle order by handle) from profiles) <> array['alice', 'bob'] then
    raise exception 'un membre devrait voir exactement lui-même et son coéquipier';
  end if;
end $$;

-- ── Un membre ne change que le statut ────────────────────────────────────
do $$ begin
  begin
    update groups set name = 'piraté' where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'un membre a pu renommer le groupe';
  exception when insufficient_privilege then null;
  end;
  begin
    update groups set created_by = '00000000-0000-0000-0000-00000000000b' where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'un membre a pu se déclarer créateur';
  exception when insufficient_privilege then null;
  end;
end $$;
update groups set status = 'decided' where id = '10000000-0000-0000-0000-000000000001';
do $$ begin
  if (select status from groups where id = '10000000-0000-0000-0000-000000000001') <> 'decided' then
    raise exception 'un membre doit pouvoir changer le statut';
  end if;
end $$;

-- ── Seul le créateur supprime un groupe ──────────────────────────────────
delete from groups where id = '10000000-0000-0000-0000-000000000001';
do $$ begin
  if not exists (select 1 from groups where id = '10000000-0000-0000-0000-000000000001') then
    raise exception 'un simple membre a supprimé le groupe';
  end if;
end $$;

-- B crée son propre groupe G2 et le supprime : tout part en cascade.
insert into groups (id, name, city, created_by) values
  ('10000000-0000-0000-0000-000000000002', 'Le mien', 'troyes', '00000000-0000-0000-0000-00000000000b');
insert into group_members (group_id, user_id) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b');
insert into poi_votes (group_id, user_id, poi_slug) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'cathedrale');
delete from groups where id = '10000000-0000-0000-0000-000000000002';
do $$ begin
  if exists (select 1 from poi_votes where group_id = '10000000-0000-0000-0000-000000000002') then
    raise exception 'les votes d''un groupe supprimé subsistent';
  end if;
end $$;

-- ── Droits d'appel ───────────────────────────────────────────────────────
do $$ begin
  begin
    perform purge_inactive();
    raise exception 'un utilisateur a pu déclencher la purge';
  exception when insufficient_privilege then null;
  end;
end $$;
set local role anon;
do $$ begin
  begin
    perform delete_my_account();
    raise exception 'un appel sans session a pu supprimer un compte';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── A supprime son identité ; son groupe et ses traces restent aux autres ─
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into visited_pois (group_id, poi_slug, user_id) values
  ('10000000-0000-0000-0000-000000000001', 'chateau', '00000000-0000-0000-0000-00000000000a');
insert into decided_routes (group_id, poi_slugs, city, target_poi_count, decided_by) values
  ('10000000-0000-0000-0000-000000000001', '{chateau}', 'caen', 1, '00000000-0000-0000-0000-00000000000a');
select delete_my_account();
reset role;
do $$ begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'l''identité de A existe encore';
  end if;
  if exists (select 1 from profiles where id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'le pseudo de A existe encore';
  end if;
  if exists (select 1 from group_members where user_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'A est encore membre d''un groupe';
  end if;
  if (select created_by from groups where id = '10000000-0000-0000-0000-000000000001') is not null
     or (select user_id from visited_pois where group_id = '10000000-0000-0000-0000-000000000001') is not null
     or (select decided_by from decided_routes where group_id = '10000000-0000-0000-0000-000000000001') is not null then
    raise exception 'une trace de A pointe encore vers lui';
  end if;
  if not exists (select 1 from group_members where group_id = '10000000-0000-0000-0000-000000000001') then
    raise exception 'le groupe de A a perdu ses autres membres';
  end if;
end $$;

-- ── Purge ────────────────────────────────────────────────────────────────
-- G3 : sans activité depuis 7 mois. G4 : créé il y a 7 mois mais un vote
-- récent. D : anonyme, 40 jours, aucun groupe. E : anonyme, 40 jours, membre
-- de G4. F : anonyme, 10 jours, aucun groupe.
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, last_sign_in_at) values
  ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now() - interval '40 days', now() - interval '40 days'),
  ('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now() - interval '40 days', now() - interval '40 days'),
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now() - interval '10 days', now() - interval '10 days');
insert into profiles (id, handle) values
  ('00000000-0000-0000-0000-00000000000d', 'dora'),
  ('00000000-0000-0000-0000-00000000000e', 'emile'),
  ('00000000-0000-0000-0000-00000000000f', 'fanny');
insert into groups (id, name, city, created_by, created_at) values
  ('10000000-0000-0000-0000-000000000003', 'Oublié', 'caen', '00000000-0000-0000-0000-00000000000b', now() - interval '7 months'),
  ('10000000-0000-0000-0000-000000000004', 'Actif', 'caen', '00000000-0000-0000-0000-00000000000e', now() - interval '7 months');
insert into group_members (group_id, user_id, joined_at) values
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', now() - interval '7 months'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000e', now() - interval '7 months');
insert into poi_votes (group_id, user_id, poi_slug, created_at) values
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000e', 'abbaye', now() - interval '2 days');

select purge_inactive();
do $$ begin
  if exists (select 1 from groups where id = '10000000-0000-0000-0000-000000000003') then
    raise exception 'un groupe inactif depuis 7 mois a survécu à la purge';
  end if;
  if not exists (select 1 from groups where id = '10000000-0000-0000-0000-000000000004') then
    raise exception 'un groupe actif a été purgé';
  end if;
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000d') then
    raise exception 'une identité sans groupe depuis 40 jours a survécu';
  end if;
  if not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000e') then
    raise exception 'une identité membre d''un groupe a été purgée';
  end if;
  if not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000f') then
    raise exception 'une identité de 10 jours a été purgée';
  end if;
  if not exists (select 1 from cron.job where jobname = 'arpente-purge') then
    raise exception 'la purge n''est pas planifiée';
  end if;
end $$;

select 'conformité : tous les cas passent' as resultat;
rollback;
