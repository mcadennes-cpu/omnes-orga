-- =============================================================================
-- 8A-1 - Creation des tables du module Evenements
-- =============================================================================
--
-- OBJECTIF :
--
--   Creer les 3 tables du module Evenements :
--     - evenements          : un evenement = titre, description, dates, lieu,
--                             et un drapeau sondage_actif. Liste plate (pas de
--                             hierarchie). Sert formations, reunions, congres.
--     - evenement_fichiers  : metadata des documents attaches a un evenement.
--                             Stockes physiquement dans le bucket Storage
--                             "evenements". La PK id sert aussi de nom physique
--                             du fichier dans Storage (pattern flat + UUID),
--                             comme pour cabinet_fichiers.
--     - evenement_reponses  : reponses au sondage de presence. Une ligne par
--                             (evenement, utilisateur). Contrainte unique sur
--                             ce couple pour permettre l'upsert cote frontend.
--
--   Convention d'auteurs alignee sur public.annuaire et cabinet_* :
--     - evenements.auteur_id et evenement_fichiers.auteur_id : FK vers
--       public.profiles(id), nullable, ON DELETE SET NULL. Si un medecin
--       quitte le cabinet, ses evenements et documents sont preserves
--       (l'attribution "ajoute par" devient simplement vide).
--     - evenement_reponses.user_id : FK vers profiles(id), NOT NULL,
--       ON DELETE CASCADE. Une reponse sans auteur n'a pas de sens.
--
--   Suppression d'un evenement = hard delete : evenement_fichiers et
--   evenement_reponses sont en ON DELETE CASCADE, donc effaces avec lui.
--   (Le nettoyage des blobs dans Storage se fera cote application.)
--
--   Triggers updated_at : crees en 8A-3.
--
-- COMMENT EXECUTER CE SCRIPT :
--
--   1. https://app.supabase.com > projet "OMNES ORGA"
--   2. SQL Editor > "+ New query"
--   3. Copie-colle TOUT le contenu de ce fichier
--   4. Save : "8A-1 - Tables evenements"
--   5. Run.
--
-- COMMENT VERIFIER :
--
--   Database > Tables : les 3 tables apparaissent dans le schema public.
--   Le SELECT final retourne les colonnes des 3 tables.
--
-- POUR ANNULER (si besoin) :
--
--   DROP TABLE IF EXISTS public.evenement_reponses;
--   DROP TABLE IF EXISTS public.evenement_fichiers;
--   DROP TABLE IF EXISTS public.evenements;
--   -- L'ordre importe : les tables filles d'abord (FK vers evenements).
--
-- IDEMPOTENCE :
--
--   create table if not exists : le script peut etre rejoue sans erreur.
--
-- NOTE :
--
--   Les RLS sont creees dans 8A-2. Tant que 8A-2 n'est pas execute, RLS
--   n'est pas active : ne teste pas l'app entre 8A-1 et 8A-2.
--
-- =============================================================================


-- 1) Table evenements : un evenement du cabinet.
--    date_debut    : date de l'evenement (obligatoire).
--    date_fin      : optionnelle, pour les evenements multi-jours (congres).
--                    Si renseignee, doit etre >= date_debut (CHECK).
--    lieu          : optionnel.
--    sondage_actif : drapeau d'activation du sondage de presence.
--    auteur_id     : FK profiles, nullable, ON DELETE SET NULL.
create table if not exists public.evenements (
  id            uuid primary key default gen_random_uuid(),
  titre         text not null check (length(trim(titre)) > 0),
  description   text,
  date_debut    date not null,
  date_fin      date,
  lieu          text,
  sondage_actif boolean not null default false,
  auteur_id     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint evenements_dates_coherentes
    check (date_fin is null or date_fin >= date_debut)
);


-- 2) Table evenement_fichiers : documents attaches a un evenement.
--    id            : utilise aussi comme nom physique dans Storage (flat + UUID).
--    evenement_id  : FK vers evenements, NOT NULL, ON DELETE CASCADE
--                    (les documents disparaissent avec l'evenement).
--    taille_octets : check 25 Mo max (26214400 = 25 * 1024 * 1024).
--    auteur_id     : FK vers profiles, nullable, ON DELETE SET NULL.
--    Pas de updated_at : les documents ne se renomment pas en V1.
create table if not exists public.evenement_fichiers (
  id            uuid primary key default gen_random_uuid(),
  evenement_id  uuid not null references public.evenements(id) on delete cascade,
  nom           text not null check (length(trim(nom)) > 0),
  taille_octets bigint not null check (taille_octets > 0 and taille_octets <= 26214400),
  mime_type     text not null,
  auteur_id     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);


-- 3) Table evenement_reponses : reponses au sondage de presence.
--    evenement_id : FK vers evenements, NOT NULL, ON DELETE CASCADE.
--    user_id      : FK vers profiles, NOT NULL, ON DELETE CASCADE.
--    reponse      : 'oui' / 'non' / 'peut_etre' (CHECK).
--    unique (evenement_id, user_id) : une seule reponse par personne et par
--      evenement -> permet l'upsert (INSERT ... ON CONFLICT) cote frontend.
create table if not exists public.evenement_reponses (
  id            uuid primary key default gen_random_uuid(),
  evenement_id  uuid not null references public.evenements(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  reponse       text not null check (reponse in ('oui', 'non', 'peut_etre')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint evenement_reponses_unique_par_user
    unique (evenement_id, user_id)
);


-- Verification : afficher les colonnes des 3 tables
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('evenements', 'evenement_fichiers', 'evenement_reponses')
order by table_name, ordinal_position;
