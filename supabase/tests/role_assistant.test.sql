-- Test du rôle arpente_assistant, celui du service de l'assistant IA.
--
-- SET ROLE dépend de l'utilisateur de la SESSION : ce test n'a de sens que
-- joué en se connectant comme arpente_assistant, jamais comme postgres (qui
-- est membre de tout). Sur une base JETABLE portant schema.sql :
--   alter role arpente_assistant password 'essai-local';   -- en postgres
--   PGPASSWORD=essai-local psql -h … -U arpente_assistant -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/role_assistant.test.sql
-- Tout se passe dans une transaction annulée. Dernière ligne affichée :
-- « rôle de l'assistant : tous les cas passent ».

begin;

do $$ begin
  if session_user <> 'arpente_assistant' then
    raise exception 'à jouer connecté comme arpente_assistant (session : %)', session_user;
  end if;
end $$;

-- Sans SET ROLE : rien que assistant_grants.
do $$ begin
  perform count(*) from assistant_grants;
  begin
    perform count(*) from groups;
    raise exception 'le service lit les groupes sans endosser un membre';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from auth.users;
    raise exception 'le service lit auth.users';
  exception when insufficient_privilege then null;
  end;
  begin
    perform delete_my_account();
    raise exception 'le service appelle delete_my_account sans endosser un membre';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Il ne peut endosser ni service_role, ni anon, ni postgres.
do $$
declare
  role_vise text;
begin
  foreach role_vise in array array['service_role', 'anon', 'postgres', 'supabase_admin'] loop
    begin
      execute format('set local role %I', role_vise);
      raise exception 'le service a pu endosser %', role_vise;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

-- Il endosse authenticated, sous les claims d'un membre : la RLS s'applique.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated","is_anonymous":false}';
do $$ begin
  if exists (select 1 from groups) then
    raise exception 'un inconnu voit des groupes';
  end if;
  if current_user <> 'authenticated' then
    raise exception 'le rôle endossé est % au lieu de authenticated', current_user;
  end if;
end $$;

select 'rôle de l''assistant : tous les cas passent' as resultat;
rollback;
