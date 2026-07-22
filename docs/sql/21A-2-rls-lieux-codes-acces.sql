-- =============================================================================
-- 21A-2 - RLS des tables lieux et codes_acces (module Codes d'acces)
-- =============================================================================
--
-- OBJECTIF :
--
--   Proteger les deux tables du module Codes d'acces avec des policies RLS
--   strictes, sur le modele de profiles_compta (11A-1) : des fonctions
--   SECURITY DEFINER a liste blanche de roles, puis des policies qui les
--   utilisent.
--
--   MATRICE DES DROITS :
--
--   | Operation | super_admin | associe_gerant | associe | remplacant | poste_bureau |
--   |-----------|:-----------:|:--------------:|:-------:|:----------:|:------------:|
--   | SELECT    |     oui     |      oui       |   oui   |    oui     |     NON      |
--   | INSERT    |     oui     |      oui       |   oui   |    non     |     NON      |
--   | UPDATE    |     oui     |      oui       |   oui   |    non     |     NON      |
--   | DELETE    |     oui     |      oui       |   oui   |    non     |     NON      |
--
--   Points cles :
--     - Le remplacant LIT tout (il a parfois besoin des codes d'un titulaire
--       pour se loguer en maison de retraite) mais n'ecrit rien : aucune
--       policy d'ecriture ne le couvre.
--     - Le poste_bureau (borne partagee du cabinet) est exclu par
--       construction : les listes blanches ne le contiennent pas. Des codes
--       d'acces a des dossiers patients ne doivent jamais s'afficher sur un
--       poste partage.
--     - Tout associe peut modifier TOUT code, y compris le code personnel
--       d'un collegue (choix valide par l'equipe : usage collaboratif type
--       "le digicode a change, je le corrige"). La tracabilite passe par
--       auteur_id ("cree par") affiche dans l'application.
--     - INSERT impose auteur_id = auth.uid() : on ne peut pas creer une
--       entree "au nom" d'un autre auteur.
--
--   POURQUOI SECURITY DEFINER : la fonction lit public.profiles en
--   contournant les RLS de profiles (sinon, risque de recursion et de
--   dependance aux droits de lecture de profiles). "stable" + search_path
--   fige = memes garanties que can_read_compta() (11A-1).
--
-- COMMENT EXECUTER CE SCRIPT :
--
--   1. https://app.supabase.com > projet "OMNES ORGA"
--   2. SQL Editor > "+ New query"
--   3. Copie-colle TOUT le contenu de ce fichier dans l'editeur
--   4. Save : "21A-2 - RLS lieux et codes_acces"
--   5. Run (bouton vert ou Cmd+Enter)
--   6. Le SELECT final affiche les 8 policies attendues.
--
-- COMMENT VERIFIER :
--
--   Database > Functions : can_read_codes et can_write_codes presentes.
--   Le SELECT final retourne 8 lignes (4 policies par table).
--
-- POUR ANNULER (si besoin) :
--
--   Rejouer la section 2 (boucle de suppression des policies) puis :
--   DROP FUNCTION IF EXISTS public.can_read_codes();
--   DROP FUNCTION IF EXISTS public.can_write_codes();
--
-- IDEMPOTENCE :
--
--   CREATE OR REPLACE FUNCTION + suppression de toutes les policies avant
--   recreation : le script peut etre rejoue sans erreur.
--
-- =============================================================================


-- 1. Fonctions SECURITY DEFINER ----------------------------------------------

-- Lecture : tous les roles "equipe medicale", y compris remplacant.
-- Liste blanche volontairement SANS poste_bureau.
create or replace function public.can_read_codes()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'associe_gerant', 'associe', 'remplacant')
  );
$$;

-- Ecriture : les trois roles associes uniquement (pas le remplacant).
create or replace function public.can_write_codes()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'associe_gerant', 'associe')
  );
$$;


-- 2. Suppression de TOUTES les anciennes policies ----------------------------

do $$
declare
  pol record;
begin
  for pol in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('lieux', 'codes_acces')
  loop
    execute format(
      'drop policy if exists %I on public.%I;',
      pol.policyname, pol.tablename
    );
  end loop;
end $$;


-- 3. RLS + policies : table lieux --------------------------------------------

alter table public.lieux enable row level security;

create policy lieux_select_reader
  on public.lieux
  for select
  to authenticated
  using ( public.can_read_codes() );

create policy lieux_insert_writer
  on public.lieux
  for insert
  to authenticated
  with check ( public.can_write_codes() and auteur_id = auth.uid() );

create policy lieux_update_writer
  on public.lieux
  for update
  to authenticated
  using ( public.can_write_codes() )
  with check ( public.can_write_codes() );

create policy lieux_delete_writer
  on public.lieux
  for delete
  to authenticated
  using ( public.can_write_codes() );


-- 4. RLS + policies : table codes_acces --------------------------------------

alter table public.codes_acces enable row level security;

create policy codes_acces_select_reader
  on public.codes_acces
  for select
  to authenticated
  using ( public.can_read_codes() );

create policy codes_acces_insert_writer
  on public.codes_acces
  for insert
  to authenticated
  with check ( public.can_write_codes() and auteur_id = auth.uid() );

create policy codes_acces_update_writer
  on public.codes_acces
  for update
  to authenticated
  using ( public.can_write_codes() )
  with check ( public.can_write_codes() );

create policy codes_acces_delete_writer
  on public.codes_acces
  for delete
  to authenticated
  using ( public.can_write_codes() );


-- Verification : afficher les 8 policies attendues
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('lieux', 'codes_acces')
order by tablename, cmd;
