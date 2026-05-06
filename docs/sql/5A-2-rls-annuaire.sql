-- =============================================================================
-- 5A-2 - RLS et policies sur public.annuaire
-- =============================================================================
--
-- OBJECTIF :
--
--   Mettre en place les Row Level Security policies pour public.annuaire
--   conformement a la matrice de droits du module Annuaire
--   (cf docs/cabinet-medical-app.md > section "Annuaire") :
--
--     Action                                  | super_admin | associe_gerant | associe | remplacant
--     --------------------------------------- | :---------: | :------------: | :-----: | :--------:
--     Voir l'annuaire                         |     OUI     |      OUI       |   OUI   |    OUI
--     Ajouter une entree                      |     OUI     |      OUI       |   OUI   |    OUI
--     Modifier / supprimer SA PROPRE entree   |     OUI     |      OUI       |   OUI   |    OUI
--     Modifier / supprimer l'entree d'un AUTRE|     OUI     |      OUI       |   NON   |    NON
--
-- POLICIES CREEES (4) :
--
--   1. annuaire_select_all_authenticated : tout authentifie peut SELECT.
--   2. annuaire_insert_authenticated     : tout authentifie peut INSERT,
--      contrainte WITH CHECK : auteur_id = auth.uid() (impossible de creer
--      une entree au nom de quelqu'un d'autre).
--   3. annuaire_update_owner_or_admin    : UPDATE si auteur OU role admin/gerant.
--      WITH CHECK identique pour empecher de "donner" une entree a autrui.
--   4. annuaire_delete_owner_or_admin    : DELETE meme regle que UPDATE.
--
-- PRE-REQUIS :
--
--   5A-1 doit avoir ete execute avec succes (table + RLS activee).
--
-- COMMENT EXECUTER CE SCRIPT :
--
--   SQL Editor > "+ New query" > coller > Save : "5A-2 - RLS annuaire" > Run.
--   Le SELECT final affiche les 4 policies creees.
--
-- COMMENT VERIFIER :
--
--   Authentication > Policies > public.annuaire : 4 policies visibles.
--   Le SELECT final retourne 4 lignes.
--
-- POUR ANNULER (si besoin) :
--
--   DROP POLICY IF EXISTS annuaire_select_all_authenticated ON public.annuaire;
--   DROP POLICY IF EXISTS annuaire_insert_authenticated     ON public.annuaire;
--   DROP POLICY IF EXISTS annuaire_update_owner_or_admin    ON public.annuaire;
--   DROP POLICY IF EXISTS annuaire_delete_owner_or_admin    ON public.annuaire;
--
-- IDEMPOTENCE :
--
--   DROP POLICY IF EXISTS avant chaque CREATE POLICY : rejouable sans erreur.
--
-- NOTE TECHNIQUE :
--
--   Le test du role passe par une sous-requete sur public.profiles. C'est
--   sur ici car on interroge profiles depuis annuaire (pas de recursion).
--   Si on optimise plus tard, on pourra extraire dans une fonction helper
--   SECURITY DEFINER (ex: public.current_user_role()).
--
-- =============================================================================


-- 1) SELECT : tout authentifie peut lire toute la table.
drop policy if exists annuaire_select_all_authenticated on public.annuaire;

create policy annuaire_select_all_authenticated
  on public.annuaire
  for select
  to authenticated
  using (true);


-- 2) INSERT : tout authentifie peut inserer, mais auteur_id = auth.uid()
--    obligatoire (impossible de creer au nom d'un autre).
drop policy if exists annuaire_insert_authenticated on public.annuaire;

create policy annuaire_insert_authenticated
  on public.annuaire
  for insert
  to authenticated
  with check (auteur_id = auth.uid());


-- 3) UPDATE : autorise si l'utilisateur est l'auteur de l'entree
--    OU s'il a un role admin/gerant.
--    WITH CHECK identique : empeche de changer auteur_id pour autrui.
drop policy if exists annuaire_update_owner_or_admin on public.annuaire;

create policy annuaire_update_owner_or_admin
  on public.annuaire
  for update
  to authenticated
  using (
    auteur_id = auth.uid()
    or (select role from public.profiles where id = auth.uid())
       in ('super_admin', 'associe_gerant')
  )
  with check (
    auteur_id = auth.uid()
    or (select role from public.profiles where id = auth.uid())
       in ('super_admin', 'associe_gerant')
  );


-- 4) DELETE : meme regle que UPDATE.
drop policy if exists annuaire_delete_owner_or_admin on public.annuaire;

create policy annuaire_delete_owner_or_admin
  on public.annuaire
  for delete
  to authenticated
  using (
    auteur_id = auth.uid()
    or (select role from public.profiles where id = auth.uid())
       in ('super_admin', 'associe_gerant')
  );


-- Verification : afficher les 4 policies de la table annuaire
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'annuaire'
order by policyname;
