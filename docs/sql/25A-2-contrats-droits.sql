-- =============================================================================
-- 25A-2 - Module Contrats : qui voit quoi dans le SIM
-- =============================================================================
--
-- OBJECTIF : ouvrir la LECTURE du SIM au-dela des membres, sans rien ouvrir
--   en ecriture.
--
--   | Qui                        | Dossiers                 | Fichiers                    |
--   |----------------------------|--------------------------|-----------------------------|
--   | super_admin, associe_gerant| tous (inchange)          | tous (inchange)             |
--   | associe                    | ouverts aux associes     | ceux des dossiers ouverts   |
--   |                            | (et leurs sous-dossiers) | + ceux qui le concernent    |
--   | remplacant                 | aucun                    | ceux qui le concernent      |
--   | poste_bureau, inactif      | aucun                    | aucun                       |
--
--   L'ecriture (creer, deposer, renommer, supprimer) reste aux membres SIM :
--   les policies INSERT / UPDATE / DELETE de 9A-4 et 9A-5 ne bougent pas.
--
-- CHOIX D'ARCHITECTURE :
--   - Fonctions SECURITY DEFINER : une policy ne doit jamais relire sa propre
--     table (lecon du 28/09/2026, erreur 42P17). La fonction lit les tables
--     sans repasser par leurs policies.
--   - Les fonctions exigent elles-memes un compte ACTIF d'un role medecin :
--     double securite, en plus de la couche restrictive du chantier D.
--   - Fichiers du bucket : la policy lit l'identifiant dans le nom du blob
--     sans planter sur un nom inattendu (comme signature_demande_du_chemin).
--   - Faille fermee au passage : n'importe quel membre SIM pouvait supprimer
--     n'importe quel blob du bucket. Une policy RESTRICTIVE reserve
--     desormais la suppression du blob d'un document signe au super_admin
--     (la ligne en base est deja protegee par sim_fichiers_verrou, 25A-1).
--
-- COMMENT EXECUTER : apres 25A-1, sur le test, puis en production.
-- POUR ANNULER : 25A-9-retour-arriere.sql.
--
-- =============================================================================


-- 1) Fonctions -------------------------------------------------------------------

-- Un dossier est ouvert aux associes si lui-meme OU l'un de ses parents l'est.
-- Profondeur bornee (20) : protection contre une boucle de parent_id.
create or replace function public.sim_dossier_ouvert_associes(p_dossier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive chaine as (
    select id, parent_id, ouvert_associes, 1 as n
      from public.sim_dossiers where id = p_dossier_id
    union all
    select d.id, d.parent_id, d.ouvert_associes, c.n + 1
      from public.sim_dossiers d
      join chaine c on d.id = c.parent_id
     where c.n < 20
  )
  select coalesce(bool_or(ouvert_associes), false) from chaine;
$$;

-- Voir un dossier : membre SIM, ou associe actif et dossier ouvert.
create or replace function public.sim_peut_voir_dossier(p_dossier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid())
       and p.actif
       and (p.role in ('super_admin', 'associe_gerant')
            or (p.role = 'associe' and public.sim_dossier_ouvert_associes(p_dossier_id)))
  );
$$;

-- Voir un fichier : membre SIM, ou associe et fichier dans un dossier ouvert,
-- ou personne concernee (tout role medecin).
create or replace function public.sim_peut_voir_fichier(p_fichier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid())
       and p.actif
       and p.role in ('super_admin', 'associe_gerant', 'associe', 'remplacant')
       and (
         p.role in ('super_admin', 'associe_gerant')
         or (p.role = 'associe' and exists (
               select 1 from public.sim_fichiers f
                where f.id = p_fichier_id
                  and f.dossier_id is not null
                  and public.sim_dossier_ouvert_associes(f.dossier_id)))
         or exists (
               select 1 from public.sim_fichiers_concernes c
                where c.fichier_id = p_fichier_id and c.profil_id = p.id)
       )
  );
$$;

-- Nom du blob -> identifiant du fichier (null si le nom n'est pas un uuid).
create or replace function public.sim_fichier_du_chemin(p_nom text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_nom ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then p_nom::uuid
  end;
$$;

-- Le blob est-il celui d'un document signe ?
create or replace function public.sim_fichier_est_signe(p_fichier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.sim_fichiers
                  where id = p_fichier_id and signature_demande_id is not null);
$$;

-- Peut etre « concerne » : un compte d'un role medecin (actif ou non : on
-- rattache aussi d'anciens contrats ; un inactif ne voit rien de toute facon).
create or replace function public.sim_profil_medecin(p_profil_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles
                  where id = p_profil_id
                    and role in ('super_admin', 'associe_gerant', 'associe', 'remplacant'));
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sim_dossier_ouvert_associes(uuid)',
    'public.sim_peut_voir_dossier(uuid)',
    'public.sim_peut_voir_fichier(uuid)',
    'public.sim_fichier_du_chemin(text)',
    'public.sim_fichier_est_signe(uuid)',
    'public.sim_profil_medecin(uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;


-- 2) Lecture des dossiers et des fichiers -----------------------------------------
drop policy if exists sim_dossiers_select_member on public.sim_dossiers;
drop policy if exists sim_dossiers_lecture       on public.sim_dossiers;
create policy sim_dossiers_lecture on public.sim_dossiers
  for select to authenticated
  using (public.sim_peut_voir_dossier(id));

drop policy if exists sim_fichiers_select_member on public.sim_fichiers;
drop policy if exists sim_fichiers_lecture       on public.sim_fichiers;
create policy sim_fichiers_lecture on public.sim_fichiers
  for select to authenticated
  using (public.sim_peut_voir_fichier(id));


-- 3) Personnes concernees ----------------------------------------------------------
alter table public.sim_fichiers_concernes enable row level security;

revoke all on public.sim_fichiers_concernes from anon, authenticated;
grant all on public.sim_fichiers_concernes to service_role;
grant select, delete on public.sim_fichiers_concernes to authenticated;
grant insert (fichier_id, profil_id, ajoute_par) on public.sim_fichiers_concernes to authenticated;
-- Seule colonne modifiable par l'appli : l'archivage personnel.
grant update (archive_at) on public.sim_fichiers_concernes to authenticated;

drop policy if exists sim_concernes_lecture      on public.sim_fichiers_concernes;
drop policy if exists sim_concernes_ajout        on public.sim_fichiers_concernes;
drop policy if exists sim_concernes_retrait      on public.sim_fichiers_concernes;
drop policy if exists sim_concernes_archivage    on public.sim_fichiers_concernes;
drop policy if exists exiger_compte_actif        on public.sim_fichiers_concernes;

-- Je vois mes lignes ; les membres SIM voient toutes les lignes.
create policy sim_concernes_lecture on public.sim_fichiers_concernes
  for select to authenticated
  using (profil_id = (select auth.uid()) or public.is_sim_member());

-- Rattacher / detacher : super_admin seul (cadrage du 17/11/2026).
create policy sim_concernes_ajout on public.sim_fichiers_concernes
  for insert to authenticated
  with check (public.is_super_admin()
              and public.sim_profil_medecin(profil_id)
              and ajoute_par = (select auth.uid()));

create policy sim_concernes_retrait on public.sim_fichiers_concernes
  for delete to authenticated
  using (public.is_super_admin());

-- Archiver / desarchiver : chacun ses propres lignes.
create policy sim_concernes_archivage on public.sim_fichiers_concernes
  for update to authenticated
  using (profil_id = (select auth.uid()))
  with check (profil_id = (select auth.uid()));

-- Couche restrictive « compte actif » (meme forme que 23-21, chantier D).
create policy exiger_compte_actif on public.sim_fichiers_concernes
  as restrictive for all to authenticated
  using (public.est_actif()) with check (public.est_actif());


-- 4) Fichiers du bucket « sim » -----------------------------------------------------
drop policy if exists sim_storage_select_member on storage.objects;
drop policy if exists sim_storage_lecture       on storage.objects;
create policy sim_storage_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'sim'
         and public.sim_peut_voir_fichier(public.sim_fichier_du_chemin(name)));

-- Restrictive : ne s'applique qu'au bucket sim, et seulement a la suppression.
-- Le code supprime la ligne AVANT le blob : pour un super_admin, la ligne a
-- deja disparu, le blob n'est plus « signe », la suppression passe.
drop policy if exists sim_storage_suppression_signe on storage.objects;
create policy sim_storage_suppression_signe on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id <> 'sim'
         or not public.sim_fichier_est_signe(public.sim_fichier_du_chemin(name))
         or public.is_super_admin());


-- Verification ------------------------------------------------------------------
select tablename, policyname, permissive, cmd
  from pg_policies
 where (schemaname = 'public'
        and tablename in ('sim_dossiers', 'sim_fichiers', 'sim_fichiers_concernes'))
    or (schemaname = 'storage' and policyname like 'sim_%')
 order by tablename, policyname;
