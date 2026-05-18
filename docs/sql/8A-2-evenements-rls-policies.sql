-- =============================================================================
-- 8A-2 - RLS et policies du module Evenements
-- =============================================================================
--
-- OBJECTIF :
--
--   Activer Row Level Security sur les 3 tables du module Evenements et
--   creer les 10 policies qui traduisent les regles d'acces metier.
--
--   REGLES METIER :
--
--   evenements
--     - Lecture  : tous les utilisateurs authentifies.
--     - Creation : super_admin, associe_gerant, associe
--                  (et l'auteur doit etre soi-meme).
--     - Modif / suppression : super_admin, associe_gerant, OU l'auteur de
--                  l'evenement. Un associe ne touche donc que ses propres
--                  evenements ; les gerants et le super_admin touchent tout.
--
--   evenement_fichiers (documents attaches)
--     - Lecture  : tous les utilisateurs authentifies.
--     - Ajout / suppression : reservee a ceux qui peuvent MODIFIER
--                  l'evenement parent (meme regle que evenements update).
--     - Pas de policy UPDATE : les documents ne se renomment pas en V1.
--
--   evenement_reponses (sondage de presence)
--     - Lecture  : tous les utilisateurs authentifies (resultats publics).
--     - Insertion / mise a jour : chacun gere SA propre reponse (user_id =
--                  soi-meme), et seulement si le sondage de l'evenement est
--                  actif. L'upsert frontend a besoin de INSERT + UPDATE.
--     - Pas de policy DELETE : on ne retire pas une reponse, on la change.
--
--   DEFENSE EN PROFONDEUR : ces regles dupliquent cote serveur ce que les
--   helpers de src/lib/permissions.js appliqueront cote frontend (lot 8B).
--   Meme si le frontend est contourne, la base refuse l'operation.
--
-- COMMENT EXECUTER : SQL Editor > New query > coller > Save
--   "8A-2 - RLS evenements" > Run. A executer APRES 8A-1.
--
-- COMMENT VERIFIER : le SELECT final liste les 10 policies. Dans
--   Database > Tables, l'indicateur RLS des 3 tables doit etre "Enabled".
--
-- IDEMPOTENCE : chaque policy est precedee d'un DROP POLICY IF EXISTS,
--   le script peut donc etre rejoue sans erreur.
--
-- POUR ANNULER (si besoin) :
--   alter table public.evenements         disable row level security;
--   alter table public.evenement_fichiers disable row level security;
--   alter table public.evenement_reponses disable row level security;
--   -- puis drop policy if exists <nom> on <table>; pour chacune des 10.
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Activation de RLS sur les 3 tables
-- -----------------------------------------------------------------------------
alter table public.evenements         enable row level security;
alter table public.evenement_fichiers enable row level security;
alter table public.evenement_reponses enable row level security;


-- -----------------------------------------------------------------------------
-- Table evenements (4 policies)
-- -----------------------------------------------------------------------------

-- Lecture : tout utilisateur authentifie ayant un profil.
drop policy if exists evenements_select_authenticated on public.evenements;
create policy evenements_select_authenticated
on public.evenements for select
to authenticated
using (
  exists (select 1 from public.profiles where id = auth.uid())
);

-- Creation : super_admin, associe_gerant ou associe.
-- WITH CHECK impose aussi auteur_id = soi-meme (pas d'usurpation d'auteur).
drop policy if exists evenements_insert_creators on public.evenements;
create policy evenements_insert_creators
on public.evenements for insert
to authenticated
with check (
  auteur_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'associe_gerant', 'associe')
  )
);

-- Modification : super_admin, associe_gerant, ou auteur de l'evenement.
drop policy if exists evenements_update_editors on public.evenements;
create policy evenements_update_editors
on public.evenements for update
to authenticated
using (
  auteur_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'associe_gerant')
  )
)
with check (
  auteur_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'associe_gerant')
  )
);

-- Suppression : super_admin, associe_gerant, ou auteur de l'evenement.
drop policy if exists evenements_delete_editors on public.evenements;
create policy evenements_delete_editors
on public.evenements for delete
to authenticated
using (
  auteur_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'associe_gerant')
  )
);


-- -----------------------------------------------------------------------------
-- Table evenement_fichiers (3 policies)
-- "Peut modifier l'evenement parent" = auteur de l'evenement OU
--  super_admin / associe_gerant.
-- -----------------------------------------------------------------------------

-- Lecture : tout utilisateur authentifie ayant un profil.
drop policy if exists evenement_fichiers_select_authenticated on public.evenement_fichiers;
create policy evenement_fichiers_select_authenticated
on public.evenement_fichiers for select
to authenticated
using (
  exists (select 1 from public.profiles where id = auth.uid())
);

-- Ajout : ceux qui peuvent modifier l'evenement parent.
-- WITH CHECK impose aussi auteur_id = soi-meme sur le fichier.
drop policy if exists evenement_fichiers_insert_editors on public.evenement_fichiers;
create policy evenement_fichiers_insert_editors
on public.evenement_fichiers for insert
to authenticated
with check (
  auteur_id = auth.uid()
  and exists (
    select 1 from public.evenements e
    where e.id = evenement_fichiers.evenement_id
      and (
        e.auteur_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('super_admin', 'associe_gerant')
        )
      )
  )
);

-- Suppression : ceux qui peuvent modifier l'evenement parent.
drop policy if exists evenement_fichiers_delete_editors on public.evenement_fichiers;
create policy evenement_fichiers_delete_editors
on public.evenement_fichiers for delete
to authenticated
using (
  exists (
    select 1 from public.evenements e
    where e.id = evenement_fichiers.evenement_id
      and (
        e.auteur_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('super_admin', 'associe_gerant')
        )
      )
  )
);


-- -----------------------------------------------------------------------------
-- Table evenement_reponses (3 policies)
-- -----------------------------------------------------------------------------

-- Lecture : tout utilisateur authentifie ayant un profil.
drop policy if exists evenement_reponses_select_authenticated on public.evenement_reponses;
create policy evenement_reponses_select_authenticated
on public.evenement_reponses for select
to authenticated
using (
  exists (select 1 from public.profiles where id = auth.uid())
);

-- Insertion : sa propre reponse, et seulement si le sondage est actif.
drop policy if exists evenement_reponses_insert_own on public.evenement_reponses;
create policy evenement_reponses_insert_own
on public.evenement_reponses for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.evenements e
    where e.id = evenement_reponses.evenement_id
      and e.sondage_actif = true
  )
);

-- Mise a jour : sa propre reponse, et seulement si le sondage est actif.
drop policy if exists evenement_reponses_update_own on public.evenement_reponses;
create policy evenement_reponses_update_own
on public.evenement_reponses for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.evenements e
    where e.id = evenement_reponses.evenement_id
      and e.sondage_actif = true
  )
);


-- Verification : lister les 10 policies creees
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('evenements', 'evenement_fichiers', 'evenement_reponses')
order by tablename, policyname;
