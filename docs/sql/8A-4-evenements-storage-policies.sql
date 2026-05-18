-- =============================================================================
-- 8A-4 - Storage policies du module Evenements
-- =============================================================================
--
-- PRE-REQUIS : creer le bucket de stockage AVANT d'executer ce script.
--
--   Dashboard Supabase > Storage > "New bucket" :
--     - Name                : evenements
--     - Public bucket       : NON (laisse decoche -> bucket prive)
--     - File size limit     : 25 MB
--     - Allowed MIME types  : laisser vide (pas de restriction)
--
-- OBJECTIF :
--
--   Creer les 3 policies d'acces au bucket "evenements" sur storage.objects.
--   Les documents des evenements y sont stockes a plat, nommes par l'UUID
--   de la ligne evenement_fichiers correspondante (pattern identique a
--   cabinet-pratique).
--
--   REGLES :
--     - Lecture (SELECT)    : tous les utilisateurs authentifies ayant un
--                             profil (tout le monde telecharge les documents).
--     - Ajout (INSERT)      : super_admin, associe_gerant, associe.
--     - Suppression (DELETE): super_admin, associe_gerant, associe.
--     - Pas de policy UPDATE : on ne remplace pas un fichier en place.
--
--   NOTE - granularite : ces policies Storage filtrent par ROLE seulement
--   (un associe peut ecrire dans le bucket). La regle fine "un associe ne
--   gere que les documents de SES evenements" est appliquee par la RLS de
--   la table evenement_fichiers (8A-2), qui est le veritable garde-fou.
--   Storage gere le blob, la table gere l'autorisation metier. Ce decoupage
--   est identique a celui du module Cabinet pratique.
--
-- COMMENT EXECUTER : creer le bucket (ci-dessus), PUIS SQL Editor > New
--   query > coller > Save "8A-4 - Storage policies evenements" > Run.
--
-- COMMENT VERIFIER : le SELECT final liste les 3 policies.
--
-- IDEMPOTENCE : DROP POLICY IF EXISTS avant chaque CREATE POLICY.
--
-- POUR ANNULER (si besoin) :
--   drop policy if exists "evenements_storage_select" on storage.objects;
--   drop policy if exists "evenements_storage_insert" on storage.objects;
--   drop policy if exists "evenements_storage_delete" on storage.objects;
--
-- =============================================================================


-- Lecture : tout utilisateur authentifie ayant un profil.
drop policy if exists "evenements_storage_select" on storage.objects;
create policy "evenements_storage_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'evenements'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
  )
);

-- Ajout : super_admin, associe_gerant, associe.
drop policy if exists "evenements_storage_insert" on storage.objects;
create policy "evenements_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'evenements'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'associe_gerant', 'associe')
  )
);

-- Suppression : super_admin, associe_gerant, associe.
drop policy if exists "evenements_storage_delete" on storage.objects;
create policy "evenements_storage_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'evenements'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'associe_gerant', 'associe')
  )
);


-- Verification : afficher les policies du bucket evenements
select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'evenements_storage_%'
order by policyname;
