-- =====================================================================
-- Etape 22 / MOD2-A : journal d'activite du module Agenda
--
-- Premiere sous-etape de MOD-2 (refonte de l'annulation, piste C
-- arbitree le 03/08/2026). Ne touche a AUCUNE table existante : ce
-- script ajoute une table, une fonction et douze declencheurs.
--
-- Ce qu'il remplace a terme : la table undo_buffer, qui ne memorise
-- qu'une seule action par utilisateur et dont 4 des 6 types n'ont
-- jamais ete cables. undo_buffer n'est PAS supprimee ici -- elle vit
-- jusqu'a MOD2-E, ou le bandeau ephemere prend le relais.
--
-- Trois partis pris, expliques a leur place plus bas :
--   1. le journal est ecrit par des DECLENCHEURS, pas par le code de
--      l'application ;
--   2. ces declencheurs sont PAR INSTRUCTION et non par ligne ;
--   3. le journal stocke des FAITS, pas des phrases -- la mise en mots
--      est le travail de l'ecran (MOD2-C).
--
-- A executer une seule fois sur le projet ydihrgnixthrraprclox.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La table
--
-- Une ligne = une instruction SQL ayant modifie des donnees de l'agenda.
--
-- Colonne "txid" : l'identifiant de la transaction PostgreSQL. Cote
-- PostgREST, une action de l'utilisateur est une transaction -- mais
-- pas toujours une seule instruction. Approuver une demande ecrit dans
-- "requests", ce qui reveille le declencheur metier update_shift_status
-- qui ecrit a son tour dans "shifts" : deux instructions, deux lignes de
-- journal, une seule action. Le txid les rattache l'une a l'autre, et
-- l'ecran MOD2-C les presentera comme un seul geste.
--
-- Colonne "actor_id" : nulle quand l'ecriture ne vient pas d'un
-- utilisateur connecte -- script de resynchronisation 7F, migration,
-- intervention en service_role. Un acteur nul est donc une information,
-- pas un defaut : cela signifie "ecrit hors application".
--
-- "rows_before" / "rows_after" portent les lignes completes, ce qui
-- permet a la fois de restaurer (MOD2-D) et de comparer l'etat attendu a
-- l'etat courant. C'est cette comparaison qui manque cruellement
-- aujourd'hui : le diagnostic de l'incident du 29/07 a demande de
-- recouper des updated_at a la seconde pres.
-- ---------------------------------------------------------------------

create table agenda.activity_log (
  id                bigint generated always as identity primary key,
  occurred_at       timestamptz not null default now(),
  txid              bigint      not null,
  actor_id          uuid        references public.profiles(id) on delete set null,
  table_name        text        not null,
  operation         text        not null
                    check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  row_count         integer     not null check (row_count >= 0),
  target_ids        uuid[]      not null default '{}',
  rows_before       jsonb,
  rows_after        jsonb,
  payload_truncated boolean     not null default false,

  -- Renseignees par MOD2-D quand l'entree a ete defaite. Une entree
  -- annulee ne peut pas l'etre deux fois.
  undone_at         timestamptz,
  undone_by         uuid        references public.profiles(id) on delete set null,

  constraint activity_log_undone_coherent
    check ((undone_at is null) = (undone_by is null))
);

comment on table agenda.activity_log is
  'Journal des ecritures du module Agenda. Alimente exclusivement par les declencheurs agenda.journaliser() : aucune ecriture applicative, aucune policy d''insertion. Une ligne = une instruction SQL ; les lignes partageant un txid forment une seule action utilisateur.';

comment on column agenda.activity_log.txid is
  'Transaction PostgreSQL. Regroupe les instructions d''une meme action utilisateur (ex : approuver une demande ecrit dans requests puis, via update_shift_status, dans shifts).';

comment on column agenda.activity_log.actor_id is
  'Auteur, ou NULL si l''ecriture ne vient pas d''un utilisateur connecte (script 7F, migration, service_role).';

comment on column agenda.activity_log.payload_truncated is
  'Vrai quand l''instruction depassait le seuil de detail (voir agenda.journaliser). Seul row_count est alors fiable ; l''entree n''est pas restaurable.';

-- Index
--
-- occurred_at desc : l'ecran du journal liste du plus recent au plus
-- ancien -- c'est la requete de loin la plus frequente.
--
-- gin sur target_ids : repond a "qu'est-il arrive a CETTE garde ?".
-- C'est exactement la question qu'on n'a pas su poser le 29/07, et la
-- raison d'etre du journal. Sans cet index, il faudrait balayer toute la
-- table.
create index activity_log_occurred_at_idx
  on agenda.activity_log (occurred_at desc);

create index activity_log_target_ids_idx
  on agenda.activity_log using gin (target_ids);

create index activity_log_txid_idx
  on agenda.activity_log (txid);

-- ---------------------------------------------------------------------
-- 2. La fonction de journalisation
--
-- POURQUOI UN DECLENCHEUR ET NON UN APPEL DANS LE CODE
-- L'appel applicatif est precisement ce qui a echoue avec undo_buffer :
-- saveUndoAction n'a ete branchee qu'a 2 endroits sur les 6 prevus, et
-- personne ne s'en est apercu pendant des mois -- la fonction de rejeu
-- existait, rien ne la nourrissait. Un declencheur ne s'oublie pas. Il
-- capture en prime les ecritures faites hors module : scripts SQL,
-- resynchronisation, correction manuelle.
--
-- POURQUOI PAR INSTRUCTION ET NON PAR LIGNE
-- Un declencheur par ligne produirait 12 entrees illisibles la ou
-- l'utilisateur a fait un seul geste ("dupliquer un modele de semaine").
-- Cote supabase-js, ce geste est une instruction SQL unique -- un
-- .insert([12 lignes]) est UNE instruction. Le declencheur par
-- instruction, avec ses tables de transition, produit donc une entree
-- portant les 12 gardes. Le regroupement est obtenu sans transmettre
-- d'identifiant d'action depuis l'application, ce qui serait impossible
-- via PostgREST ou chaque appel est sa propre transaction.
--
-- POURQUOI SECURITY DEFINER
-- La table n'accorde aucun droit d'ecriture a "authenticated" et n'a
-- aucune policy d'insertion : personne ne peut ecrire dans le journal,
-- ni le falsifier. C'est la fonction, executee avec les droits de son
-- proprietaire, qui y insere. Un journal que l'application pourrait
-- modifier ne vaudrait rien comme trace.
--
-- LE SEUIL DE DETAIL
-- Le script de resynchronisation 7F reinsere 5 669 lignes d'un coup :
-- sans garde-fou, cela produirait une entree de plusieurs megaoctets.
-- Au-dela du seuil, on conserve le nombre de lignes et on abandonne le
-- detail. Une operation de cette taille n'a de toute facon pas vocation
-- a etre annulee depuis l'interface.
-- ---------------------------------------------------------------------

create or replace function agenda.journaliser()
returns trigger
language plpgsql
security definer
set search_path to 'agenda', 'public'
as $function$
declare
  -- Au-dela de ce nombre de lignes, on ne garde que le compte.
  seuil_detail constant integer := 500;

  lignes_avant jsonb;
  lignes_apres jsonb;
  identifiants uuid[];
  nombre       integer := 0;
  tronque      boolean := false;
begin
  -- Chaque branche ne lit que la table de transition que sa definition
  -- de declencheur lui fournit (voir section 3).
  if TG_OP = 'INSERT' then
    select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb),
           coalesce(array_agg(n.id), '{}'::uuid[]),
           count(*)
      into lignes_apres, identifiants, nombre
      from new_rows n;

  elsif TG_OP = 'DELETE' then
    select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb),
           coalesce(array_agg(o.id), '{}'::uuid[]),
           count(*)
      into lignes_avant, identifiants, nombre
      from old_rows o;

  else -- UPDATE : les deux etats, pour pouvoir comparer et restaurer.
    select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb),
           coalesce(array_agg(o.id), '{}'::uuid[]),
           count(*)
      into lignes_avant, identifiants, nombre
      from old_rows o;

    select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb)
      into lignes_apres
      from new_rows n;
  end if;

  -- Une instruction qui n'a touche aucune ligne ne merite pas d'entree :
  -- un UPDATE dont le WHERE ne trouve rien n'est pas un evenement.
  if nombre = 0 then
    return null;
  end if;

  if nombre > seuil_detail then
    lignes_avant := null;
    lignes_apres := null;
    identifiants := '{}'::uuid[];
    tronque      := true;
  end if;

  insert into agenda.activity_log (
    txid, actor_id, table_name, operation,
    row_count, target_ids, rows_before, rows_after, payload_truncated
  )
  values (
    (pg_current_xact_id()::text)::bigint,
    auth.uid(),
    TG_TABLE_NAME,
    TG_OP,
    nombre,
    identifiants,
    lignes_avant,
    lignes_apres,
    tronque
  );

  -- Declencheur AFTER ... FOR EACH STATEMENT : la valeur de retour est
  -- ignoree par PostgreSQL.
  return null;
end;
$function$;

comment on function agenda.journaliser() is
  'Ecrit une entree d''activity_log par instruction modifiant une table journalisee. Attachee uniquement a des tables ayant une colonne "id" de type uuid.';

-- ---------------------------------------------------------------------
-- 3. Les declencheurs
--
-- Quatre tables x trois operations. Les tables de transition portent
-- toujours les memes noms (new_rows / old_rows), ce qui permet a une
-- fonction unique de les servir toutes.
--
-- shifts et requests : le coeur du planning, ce que MOD-2 doit tracer.
-- fixed_duty_series : supprimer une serie efface aujourd'hui sa
--   definition en plus de ses gardes, sans laisser de trace.
-- rotation_plans : le roulement est deja protege par MOD-1 (plans
--   versionnes, trois portes en security definer), mais son historique
--   vit a part ; le journaliser donne au journal une histoire complete.
--
-- Non journalisees volontairement : sites, rooms, shift_types et les
-- tables de parametrage. Elles bougent une fois par an et leurs
-- modifications ne se confondent jamais avec une action de planning.
-- A ajouter si le besoin apparait -- c'est une ligne par declencheur.
-- ---------------------------------------------------------------------

create trigger journaliser_shifts_insert
  after insert on agenda.shifts
  referencing new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_shifts_update
  after update on agenda.shifts
  referencing old table as old_rows new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_shifts_delete
  after delete on agenda.shifts
  referencing old table as old_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_requests_insert
  after insert on agenda.requests
  referencing new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_requests_update
  after update on agenda.requests
  referencing old table as old_rows new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_requests_delete
  after delete on agenda.requests
  referencing old table as old_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_series_insert
  after insert on agenda.fixed_duty_series
  referencing new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_series_update
  after update on agenda.fixed_duty_series
  referencing old table as old_rows new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_series_delete
  after delete on agenda.fixed_duty_series
  referencing old table as old_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_rotation_plans_insert
  after insert on agenda.rotation_plans
  referencing new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_rotation_plans_update
  after update on agenda.rotation_plans
  referencing old table as old_rows new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_rotation_plans_delete
  after delete on agenda.rotation_plans
  referencing old table as old_rows
  for each statement execute function agenda.journaliser();

-- ---------------------------------------------------------------------
-- 4. Droits et RLS
--
-- Lecture reservee au coordinateur (arbitre par Matthieu le 03/08/2026).
-- Le journal contient les arbitrages de coordination -- refus de
-- demandes, mises en attente, reattributions -- qui n'ont pas vocation a
-- etre exposes a toute l'equipe. Ouvrir plus tard ne coutera qu'une
-- policy supplementaire ; refermer apres coup serait mal vecu.
--
-- Aucune policy INSERT / UPDATE / DELETE, et aucun grant correspondant :
-- le journal est en lecture seule pour tout le monde, y compris le
-- coordinateur. Seule la fonction journaliser() y ecrit, et seule
-- restaurer_action() (MOD2-D) y touchera pour marquer undone_at.
-- ---------------------------------------------------------------------

alter table agenda.activity_log enable row level security;

create policy "Le coordinateur lit le journal" on agenda.activity_log
  for select to authenticated using (agenda.est_coordinateur());

grant select on agenda.activity_log to authenticated;

-- =====================================================================
-- 5. Controles a passer apres execution
--
-- Le detail du test de bout en bout (par le chemin du navigateur, pas
-- par l'API d'administration -- lecon de MOD-1) est dans la doc.
-- Ici, les verifications structurelles :
--
--   -- 12 declencheurs attendus
--   select tgrelid::regclass as table_journalisee, tgname
--     from pg_trigger
--    where tgname like 'journaliser_%'
--    order by 1, 2;
--
--   -- aucun droit d'ecriture accorde sur le journal
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'agenda' and table_name = 'activity_log';
--   -- attendu : SELECT pour authenticated, rien d'autre
--
--   -- une seule policy, en lecture
--   select policyname, cmd from pg_policies
--    where schemaname = 'agenda' and tablename = 'activity_log';
-- =====================================================================

-- =====================================================================
-- ATTENTION -- interaction avec le script de resynchronisation 7F
--
-- 22-7F-resynchronisation-agenda.py fait une recopie complete depuis la
-- base Planning. A partir de maintenant, il declenchera la
-- journalisation : c'est sans danger (entrees tronquees, acteur nul),
-- mais il faudra le relire avant MOD2-B, ou l'arrivee de deleted_at
-- fera qu'une recopie complete ecraserait l'etat de suppression douce.
-- Le script est de toute facon voue a disparaitre a la bascule.
-- =====================================================================
