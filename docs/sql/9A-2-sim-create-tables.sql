-- docs/sql/9A-2-sim-create-tables.sql
-- Etape 9A-2 : tables du module SIM (Drive restreint)
-- Calque sur cabinet_dossiers / cabinet_fichiers (etape 6B).
--
-- CORRECTIF : la fonction handle_updated_at() (censee venir de 6B-3) n'existe
-- pas dans la base. Elle est donc (re)creee ici via "create or replace" : le
-- script devient autonome. "create or replace" est sans risque meme si la
-- fonction existe deja par ailleurs.
--
-- Ce script commence par un nettoyage defensif : si un run precedent a echoue
-- en cours de route (ex. tables creees mais pas les triggers), on repart propre.

-- ============================================================
-- Nettoyage defensif (au cas ou un run precedent aurait echoue)
-- ============================================================
drop table if exists public.sim_fichiers;
drop table if exists public.sim_dossiers;

-- ============================================================
-- Fonction handle_updated_at() : met a jour updated_at avant chaque UPDATE.
-- "create or replace" : ne casse rien si la fonction existe deja.
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Table sim_dossiers : arborescence de dossiers
-- ============================================================
create table public.sim_dossiers (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  parent_id   uuid references public.sim_dossiers(id) on delete restrict,
  couleur     text not null default 'gris'
              check (couleur in ('bleu', 'gris', 'jaune', 'orange', 'rouge', 'vert')),
  auteur_id   uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- Table sim_fichiers : fichiers rattaches a un dossier (ou racine)
-- L'id sert aussi de nom physique du blob dans le bucket Storage "sim".
-- ============================================================
create table public.sim_fichiers (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null,
  dossier_id    uuid references public.sim_dossiers(id) on delete restrict,
  taille_octets bigint not null check (taille_octets <= 26214400),
  mime_type     text,
  auteur_id     uuid not null references public.profiles(id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- Index sur les colonnes de navigation arborescente
-- ============================================================
create index sim_dossiers_parent_id_idx on public.sim_dossiers(parent_id);
create index sim_fichiers_dossier_id_idx on public.sim_fichiers(dossier_id);

-- ============================================================
-- Triggers updated_at
-- ============================================================
create trigger sim_dossiers_set_updated_at
  before update on public.sim_dossiers
  for each row execute function public.handle_updated_at();

create trigger sim_fichiers_set_updated_at
  before update on public.sim_fichiers
  for each row execute function public.handle_updated_at();
