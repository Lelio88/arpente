-- 2026-10-10 — Jumelage avec DewDrop, en plus d'Agora.
--
-- À jouer une fois, dans une transaction, après 20261009_droits_fermes.sql et
-- AVANT la version de l'app qui jumelle avec DewDrop (elle insère app = 'dewdrop',
-- que les contraintes actuelles refusent) :
--   psql -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261010_jumelage_dewdrop.sql
-- Reportée telle quelle dans schema.sql (section « Jumelage avec Agora et DewDrop »).
--
-- Un groupe peut avoir un jumeau dans chaque app jumelle, au plus un par app
-- (la clé primaire (group_id, app) ne change pas) : un cercle DewDrop, où l'on
-- s'envoie des pensées, comme un groupe Agora. Ses membres en voient le code
-- (« Demander à rejoindre dans DewDrop » : y entrer est une demande que le
-- créateur du cercle accepte). Protocole : docs/liens-inter-apps.md du dépôt méta.
--
-- Seules les deux contraintes CHECK s'élargissent : la liste fermée des apps, et
-- le format du code selon l'app (Agora et DewDrop : 8 caractères du même
-- alphabet). RLS, droits et absence de mise à jour restent ceux de 20261007 et
-- 20261009 : un jumeau ne se remplace pas, on le défait d'abord.

alter table group_twins drop constraint group_twins_app_check;
alter table group_twins add constraint group_twins_app_check
  check (app in ('agora', 'dewdrop'));

alter table group_twins drop constraint group_twins_remote_code_format;
alter table group_twins add constraint group_twins_remote_code_format
  check (
    (app = 'agora' and remote_code ~ '^[A-HJ-NP-Z2-9]{8}$')
    or (app = 'dewdrop' and remote_code ~ '^[A-HJ-NP-Z2-9]{8}$')
  );
