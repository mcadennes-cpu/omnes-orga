-- =============================================================================
-- 6B-1 - Creation des tables cabinet_dossiers et cabinet_fichiers
-- =============================================================================
--
-- OBJECTIF :
--
--   Creer les 2 tables du module Cabinet pratique :
--     - cabinet_dossiers : arborescence de dossiers (hierarchie via parent_id
--       self-referent). Chaque dossier porte une couleur symbolique parmi 6
--       valeurs autorisees, pour l'affichage UI.
--     - cabinet_fichiers : metadata des fichiers stockes physiquement dans le
--       bucket Supabase Storage cabinet-pratique. La PK id est utilisee aussi
--       comme nom physique du fichier dans Storage (pattern flat + UUID).
--
--   Convention d'auteurs alignee sur public.annuaire (5A-1) :
--     - auteur_id : FK vers public.profiles(id), nullable, ON DELETE SET NULL.
--       Si un medecin quitte le cabinet, ses dossiers et fichiers sont
--       preserves (l'attribution "cree par" devient simplement vide).
--
--   Triggers updated_at : crees en 6B-3, en reutilisant la fonction generique
--   public.set_updated_at() creee en 5A-1.
--
-- COMMENT EXECUTER CE SCRIPT :
--
--   1. https://app.supabase.com > projet "OMNES ORGA"
--   2. SQL Editor > "+ New query"
--   3. Copie-colle TOUT le contenu de ce fichier
--   4. Save : "6B-1 - Tables cabinet pratique"
--   5. Run.
--
-- COMMENT VERIFIER :
--
--   Database > Tables : les 2 tables apparaissent dans le schema public.
--   Le SELECT final retourne les colonnes des 2 tables.
--
-- POUR ANNULER (si besoin) :
--
--   DROP TABLE IF EXISTS public.cabinet_fichiers;
--   DROP TABLE IF EXISTS public.cabinet_dossiers;
--   -- L'ordre importe : fichiers d'abord car FK vers dossiers.
--
-- IDEMPOTENCE :
--
--   create table if not exists : le script peut etre rejoue sans erreur.
--
-- NOTE :
--
--   Les RLS sont creees dans 6B-2-cabinet-pratique-rls-policies.sql. Tant
--   que 6B-2 n'est pas execute, les tables sont INACCESSIBLES depuis le
--   frontend (RLS active par defaut + aucune policy = tout est bloque).
--
-- =============================================================================


-- 1) Table cabinet_dossiers : arborescence des dossiers
--    parent_id  : self-referent, NULL = dossier a la racine.
--                 ON DELETE RESTRICT empeche de supprimer un dossier qui
--                 contient des sous-dossiers (defense in depth en plus
--                 du garde-fou applicatif prevu en 6H).
--    couleur    : nom symbolique parmi 6 valeurs, defaut 'gris'.
--    auteur_id  : FK vers profiles, nullable, ON DELETE SET NULL.
create table if not exists public.cabinet_dossiers (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.cabinet_dossiers(id) on delete restrict,
  nom         text not null check (length(trim(nom)) > 0),
  couleur     text not null default 'gris'
              check (couleur in ('bleu', 'gris', 'jaune', 'orange', 'rouge', 'vert')),
  auteur_id   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- 2) Table cabinet_fichiers : metadata des fichiers stockes
--    id            : utilise aussi comme nom physique dans Storage (flat + UUID).
--    dossier_id    : FK vers cabinet_dossiers, NULL = fichier a la racine.
--                    ON DELETE RESTRICT empeche de supprimer un dossier non vide.
--    taille_octets : check 25 Mo max (26214400 = 25 * 1024 * 1024).
--    auteur_id     : FK vers profiles, nullable, ON DELETE SET NULL.
create table if not exists public.cabinet_fichiers (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid references public.cabinet_dossiers(id) on delete restrict,
  nom           text not null check (length(trim(nom)) > 0),
  taille_octets bigint not null check (taille_octets > 0 and taille_octets <= 26214400),
  mime_type     text not null,
  auteur_id     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- Verification : afficher les colonnes des 2 tables
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('cabinet_dossiers', 'cabinet_fichiers')
order by table_name, ordinal_position;
