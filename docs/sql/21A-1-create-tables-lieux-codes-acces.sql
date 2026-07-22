-- =============================================================================
-- 21A-1 - Creation des tables public.lieux et public.codes_acces
--         (module Codes d'acces : maisons de retraite, cabinet, domiciles...)
-- =============================================================================
--
-- OBJECTIF :
--
--   Creer les deux tables du module Codes d'acces :
--
--     - public.lieux : les lieux ou l'equipe utilise des codes (maison de
--       retraite, le cabinet lui-meme, domicile d'un patient...). La colonne
--       "categorie" est en texte libre, comme annuaire.categorie : c'est ce
--       qui permet d'ajouter une nouvelle categorie ("onglet") depuis
--       l'application, sans migration SQL.
--
--     - public.codes_acces : les codes rattaches a un lieu. Deux types :
--         * titulaire_id NULL      -> code COMMUN du lieu (digicode, wifi,
--                                     boite a cles...)
--         * titulaire_id renseigne -> code PERSONNEL de ce medecin dans ce
--                                     lieu (session Windows, logiciel de
--                                     dossier patient...)
--
--   Inclut aussi :
--     - 4 index (lieux: nom, categorie ; codes_acces: lieu_id, titulaire_id).
--     - Les triggers BEFORE UPDATE reutilisant la fonction generique
--       public.set_updated_at() creee en 5A-1 (on ne la recree pas ici).
--
--   CHOIX DES REGLES DE SUPPRESSION (a comprendre) :
--     - codes_acces.lieu_id       ON DELETE CASCADE  : supprimer un lieu
--       supprime tous ses codes (un code sans lieu n'a aucun sens).
--     - codes_acces.titulaire_id  ON DELETE CASCADE  : si un medecin quitte
--       le cabinet, ses codes personnels disparaissent. Surtout PAS de
--       SET NULL ici : cela transformerait silencieusement ses codes
--       personnels en "codes communs" (titulaire_id NULL), mauvaise
--       semantique.
--     - auteur_id (les deux tables) ON DELETE SET NULL : simple tracabilite
--       "cree par", l'entree reste utile collectivement (meme logique que
--       annuaire.auteur_id).
--
-- COMMENT EXECUTER CE SCRIPT :
--
--   1. https://app.supabase.com > projet "OMNES ORGA"
--   2. SQL Editor > "+ New query"
--   3. Copie-colle TOUT le contenu de ce fichier dans l'editeur
--   4. Save : "21A-1 - Creation tables lieux et codes_acces"
--   5. Run (bouton vert ou Cmd+Enter)
--   6. Le SELECT final affiche les colonnes des deux tables.
--
-- COMMENT VERIFIER :
--
--   Database > Tables : "lieux" et "codes_acces" apparaissent dans public.
--   Database > Triggers : lieux_set_updated_at et codes_acces_set_updated_at.
--   Le SELECT final retourne 19 lignes (9 colonnes lieux + 10 codes_acces).
--
-- POUR ANNULER (si besoin) :
--
--   DROP TRIGGER IF EXISTS codes_acces_set_updated_at ON public.codes_acces;
--   DROP TRIGGER IF EXISTS lieux_set_updated_at ON public.lieux;
--   DROP TABLE IF EXISTS public.codes_acces;
--   DROP TABLE IF EXISTS public.lieux;
--   -- NE PAS dropper public.set_updated_at() : utilisee par d'autres tables.
--
-- IDEMPOTENCE :
--
--   CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP/CREATE
--   TRIGGER : le script peut etre rejoue sans erreur.
--
-- NOTE :
--
--   Les RLS sont creees dans 21A-2-rls-lieux-codes-acces.sql. Tant que 21A-2
--   n'est pas execute, les tables sont INACCESSIBLES depuis le frontend
--   (RLS activee par defaut + aucune policy = tout est bloque). C'est
--   volontaire : ces tables contiennent des codes d'acces sensibles.
--
-- =============================================================================


-- 1) Table lieux.
create table if not exists public.lieux (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  categorie   text,
  adresse     text,
  telephone   text,
  note        text,
  auteur_id   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- 2) Table codes_acces.
--    titulaire_id NULL = code commun du lieu (digicode, wifi...).
create table if not exists public.codes_acces (
  id            uuid primary key default gen_random_uuid(),
  lieu_id       uuid not null references public.lieux(id) on delete cascade,
  titulaire_id  uuid references public.profiles(id) on delete cascade,
  label         text not null,
  identifiant   text,
  code          text not null,
  note          text,
  auteur_id     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- 3) Activation explicite de la Row Level Security sur les deux tables.
--    Sans policy associee (cf 21A-2), tout est bloque. Volontaire.
alter table public.lieux enable row level security;
alter table public.codes_acces enable row level security;


-- 4) Index pour accelerer les requetes frontend :
--    - lieux.nom            : tri alphabetique de la liste.
--    - lieux.categorie      : pills de filtre par categorie.
--    - codes_acces.lieu_id  : chargement des codes d'une fiche lieu.
--    - codes_acces.titulaire_id : regroupement "mes codes" / par medecin.
create index if not exists lieux_nom_idx                on public.lieux (nom);
create index if not exists lieux_categorie_idx          on public.lieux (categorie);
create index if not exists codes_acces_lieu_id_idx      on public.codes_acces (lieu_id);
create index if not exists codes_acces_titulaire_id_idx on public.codes_acces (titulaire_id);


-- 5) Triggers BEFORE UPDATE pour maintenir updated_at automatiquement.
--    Reutilise la fonction generique public.set_updated_at() creee en 5A-1.
drop trigger if exists lieux_set_updated_at on public.lieux;

create trigger lieux_set_updated_at
  before update on public.lieux
  for each row
  execute function public.set_updated_at();

drop trigger if exists codes_acces_set_updated_at on public.codes_acces;

create trigger codes_acces_set_updated_at
  before update on public.codes_acces
  for each row
  execute function public.set_updated_at();


-- Verification : afficher les colonnes des deux tables
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('lieux', 'codes_acces')
order by table_name, ordinal_position;
