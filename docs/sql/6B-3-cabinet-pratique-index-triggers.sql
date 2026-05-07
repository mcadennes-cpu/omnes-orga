-- =============================================================================
-- 6B-3 - Index et triggers updated_at pour cabinet_dossiers et cabinet_fichiers
-- =============================================================================
--
-- OBJECTIF :
--
--   Optimiser les requetes hot path et automatiser la maintenance du champ
--   updated_at sur les 2 tables Cabinet pratique :
--
--     - 2 index sur les colonnes de jointure parent_id et dossier_id, qui
--       seront tres souvent filtrees (chaque navigation dans un dossier
--       provoque un SELECT WHERE parent_id = ? ou WHERE dossier_id = ?).
--     - 2 triggers BEFORE UPDATE qui appellent la fonction generique
--       public.set_updated_at() (creee en 5A-1, reutilisee ici).
--
-- COMMENT EXECUTER CE SCRIPT :
--
--   1. https://app.supabase.com > projet "OMNES ORGA"
--   2. SQL Editor > "+ New query"
--   3. Copie-colle TOUT le contenu de ce fichier
--   4. Save : "6B-3 - Index et triggers cabinet pratique"
--   5. Run.
--
-- COMMENT VERIFIER :
--
--   Database > Indexes : voir cabinet_dossiers_parent_id_idx et
--   cabinet_fichiers_dossier_id_idx.
--   Database > Triggers : voir cabinet_dossiers_set_updated_at et
--   cabinet_fichiers_set_updated_at.
--
-- IDEMPOTENCE :
--
--   create index if not exists, drop trigger if exists avant create trigger.
--   Le script peut etre rejoue sans erreur.
--
-- DEPENDANCE :
--
--   La fonction public.set_updated_at() doit exister prealablement (creee
--   en 5A-1). Si vous rejouez ce script sur une instance neuve, executez
--   d'abord 5A-1.
--
-- =============================================================================


-- 1) Index sur les FK pour acceleration des requetes hot path
--    A chaque navigation dans un dossier on filtre sur parent_id (dossiers)
--    ou dossier_id (fichiers). Sans index, full scan a chaque requete.
create index if not exists cabinet_dossiers_parent_id_idx
  on public.cabinet_dossiers (parent_id);

create index if not exists cabinet_fichiers_dossier_id_idx
  on public.cabinet_fichiers (dossier_id);


-- 2) Triggers BEFORE UPDATE pour maintenir updated_at automatiquement.
--    Reutilise la fonction public.set_updated_at() creee en 5A-1.
drop trigger if exists cabinet_dossiers_set_updated_at on public.cabinet_dossiers;

create trigger cabinet_dossiers_set_updated_at
  before update on public.cabinet_dossiers
  for each row
  execute function public.set_updated_at();

drop trigger if exists cabinet_fichiers_set_updated_at on public.cabinet_fichiers;

create trigger cabinet_fichiers_set_updated_at
  before update on public.cabinet_fichiers
  for each row
  execute function public.set_updated_at();