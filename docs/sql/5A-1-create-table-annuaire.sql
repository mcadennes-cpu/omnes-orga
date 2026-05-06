-- =============================================================================
-- 5A-1 - Creation de la table public.annuaire (module Annuaire collaboratif)
-- =============================================================================
--
-- OBJECTIF :
--
--   Creer la table public.annuaire qui stocke les entrees du carnet d'adresses
--   partage du cabinet (specialistes externes, hopitaux, labos, pharmacies...).
--   Cette table est distincte de public.profiles : profiles = medecins du
--   cabinet (Trombinoscope), annuaire = ressources externes au cabinet.
--
--   Inclut aussi :
--     - 3 index (nom, categorie, auteur_id) pour accelerer les requetes
--       cote frontend (tri, filtre, auto-complete).
--     - Une fonction GENERIQUE public.set_updated_at() reutilisable sur
--       toutes les futures tables ayant un champ updated_at.
--     - Le trigger BEFORE UPDATE qui met a jour updated_at automatiquement.
--
-- COMMENT EXECUTER CE SCRIPT :
--
--   1. https://app.supabase.com > projet "OMNES ORGA"
--   2. SQL Editor > "+ New query"
--   3. Copie-colle TOUT le contenu de ce fichier dans l'editeur
--   4. Save : "5A-1 - Creation table annuaire"
--   5. Run (bouton vert ou Cmd+Enter)
--   6. Le SELECT final affiche les colonnes de la table.
--
-- COMMENT VERIFIER :
--
--   Database > Tables : la table "annuaire" apparait dans le schema public.
--   Database > Functions : set_updated_at est presente.
--   Database > Triggers : annuaire_set_updated_at est liee a annuaire.
--   Le SELECT final retourne 9 lignes (les 9 colonnes attendues).
--
-- POUR ANNULER (si besoin) :
--
--   DROP TRIGGER IF EXISTS annuaire_set_updated_at ON public.annuaire;
--   DROP TABLE IF EXISTS public.annuaire;
--   -- NE PAS dropper public.set_updated_at() : sera reutilisee sur d'autres
--   -- tables (Cabinet pratique, Discussion, Evenements, Immobilier...).
--
-- IDEMPOTENCE :
--
--   CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE
--   FUNCTION, DROP/CREATE TRIGGER : le script peut etre rejoue sans erreur.
--
-- NOTE :
--
--   Les RLS sont creees dans 5A-2-rls-annuaire.sql. Tant que 5A-2 n'est pas
--   execute, la table est INACCESSIBLE depuis le frontend (RLS active par
--   defaut + aucune policy = tout est bloque). C'est volontaire.
--
-- =============================================================================


-- 1) Fonction generique pour maintenir updated_at.
--    Reutilisable sur toutes les futures tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- 2) Table annuaire.
--    auteur_id : ON DELETE SET NULL pour preserver les entrees d'annuaire
--    si un medecin quitte le cabinet (l'info reste utile collectivement,
--    on perd seulement le "cree par").
create table if not exists public.annuaire (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  categorie   text,
  telephone   text,
  email       text,
  note        text,
  auteur_id   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- 3) Activation explicite de la Row Level Security.
--    Sans policy associee (cf 5A-2), la table reste totalement bloquee.
alter table public.annuaire enable row level security;


-- 4) Index pour accelerer les requetes frontend :
--    - nom        : tri alphabetique et recherche par nom.
--    - categorie  : filtre par categorie et auto-complete (DISTINCT categorie).
--    - auteur_id  : retrouver "mes entrees" et controles RLS plus rapides.
create index if not exists annuaire_nom_idx       on public.annuaire (nom);
create index if not exists annuaire_categorie_idx on public.annuaire (categorie);
create index if not exists annuaire_auteur_id_idx on public.annuaire (auteur_id);


-- 5) Trigger BEFORE UPDATE pour maintenir updated_at automatiquement.
--    DROP IF EXISTS avant CREATE pour rester idempotent.
drop trigger if exists annuaire_set_updated_at on public.annuaire;

create trigger annuaire_set_updated_at
  before update on public.annuaire
  for each row
  execute function public.set_updated_at();


-- Verification : afficher les colonnes de la table annuaire
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'annuaire'
order by ordinal_position;
