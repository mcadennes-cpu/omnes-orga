-- =============================================================================
-- 8A-3 - Index, triggers updated_at et Realtime du module Evenements
-- =============================================================================
--
-- OBJECTIF :
--
--   1) Index utiles aux requetes frequentes :
--      - evenements(date_debut)           : tri chronologique de la liste.
--      - evenement_fichiers(evenement_id) : chargement des documents.
--      - evenement_reponses(evenement_id) : chargement des reponses.
--   2) Mise a jour automatique de updated_at sur les tables qui ont cette
--      colonne (evenements et evenement_reponses). evenement_fichiers n'a
--      pas de updated_at, donc pas de trigger.
--   3) Activer Supabase Realtime sur la table evenements : la liste des
--      evenements se rafraichira en direct quand un autre utilisateur en
--      cree ou modifie un.
--
--   La fonction public.set_updated_at() est (re)creee ici en CREATE OR
--   REPLACE : le script reste autonome meme si la fonction existe deja
--   (creee a une etape precedente). Le corps est standard et identique.
--
-- COMMENT EXECUTER : SQL Editor > New query > coller > Save
--   "8A-3 - Index triggers evenements" > Run. A executer APRES 8A-1 et 8A-2.
--
-- COMMENT VERIFIER : les 2 SELECT finaux listent les index et les triggers.
--
-- IDEMPOTENCE : create index if not exists / create or replace function /
--   drop trigger if exists avant create / ajout Realtime protege par un
--   bloc conditionnel. Le script peut etre rejoue sans erreur.
--
-- POUR ANNULER (si besoin) :
--   drop trigger if exists set_updated_at_evenements on public.evenements;
--   drop trigger if exists set_updated_at_evenement_reponses on public.evenement_reponses;
--   drop index if exists public.idx_evenements_date_debut;
--   drop index if exists public.idx_evenement_fichiers_evenement_id;
--   drop index if exists public.idx_evenement_reponses_evenement_id;
--   alter publication supabase_realtime drop table public.evenements;
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Index
-- -----------------------------------------------------------------------------
create index if not exists idx_evenements_date_debut
  on public.evenements (date_debut);

create index if not exists idx_evenement_fichiers_evenement_id
  on public.evenement_fichiers (evenement_id);

create index if not exists idx_evenement_reponses_evenement_id
  on public.evenement_reponses (evenement_id);


-- -----------------------------------------------------------------------------
-- 2) Fonction + triggers updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_evenements on public.evenements;
create trigger set_updated_at_evenements
  before update on public.evenements
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_updated_at_evenement_reponses on public.evenement_reponses;
create trigger set_updated_at_evenement_reponses
  before update on public.evenement_reponses
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 3) Realtime sur la table evenements
--    On ajoute la table a la publication supabase_realtime seulement si
--    elle n'y est pas deja (sinon "alter publication ... add table" echoue
--    a la 2e execution du script).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'evenements'
  ) then
    alter publication supabase_realtime add table public.evenements;
  end if;
end $$;


-- Verification : index
select indexname, tablename
from pg_indexes
where schemaname = 'public'
  and tablename in ('evenements', 'evenement_fichiers', 'evenement_reponses')
order by tablename, indexname;

-- Verification : triggers
select event_object_table as table_name, trigger_name,
       action_timing, event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('evenements', 'evenement_reponses')
order by event_object_table, trigger_name;
