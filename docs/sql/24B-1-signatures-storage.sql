-- =============================================================================
-- 24B-1 - Module Signatures : bucket Storage `signatures` et ses policies
-- =============================================================================
--
-- OBJECTIF :
--
--   Un bucket PRIVE, PDF uniquement, 20 Mo, avec deux fichiers par demande :
--
--     {demande_id}/source.pdf  depose par le createur, EN BROUILLON seulement
--     {demande_id}/final.pdf   pose par l'Edge Function au scellement
--
--   | Geste (appli)        | Qui                                            |
--   |----------------------|------------------------------------------------|
--   | Lire un fichier      | createur, signataires (hors brouillon),        |
--   |                      | super_admin -- meme regle que la table          |
--   | Deposer / remplacer  | createur, demande en brouillon, nom impose     |
--   | Supprimer            | createur, demande en brouillon                 |
--
--   POURQUOI CA FIGE LE DOCUMENT : des que la demande part (statut
--   en_cours), plus aucune policy n'autorise l'ecriture, le remplacement ou
--   la suppression depuis l'appli. Seule la cle service_role (Edge Function)
--   pourrait encore ecrire -- et elle recalcule l'empreinte du PDF a chaque
--   signature : un fichier remplace serait refuse (« document_altere »).
--
--   poste_bureau, remplacant non signataire, associe non signataire : rien.
--   La policy restrictive « compte actif » du chantier D (23-24) couvre deja
--   tout storage.objects, donc ce bucket aussi.
--
--   POURQUOI UNE FONCTION POUR LIRE LE CHEMIN : un nom d'objet qui ne
--   commence pas par un UUID ferait planter un simple cast (`::uuid`) et donc
--   la requete entiere. La fonction renvoie NULL a la place.
--
-- COMMENT EXECUTER : apres 24A-1 et 24A-2, sur le test (puis 23-23 n'est
--   pas a relancer : ce script s'y applique directement), puis en production.
--
-- COMMENT VERIFIER : le SELECT final montre le bucket et 4 policies.
--
-- POUR ANNULER (bucket vide uniquement) :
--   drop policy signatures_storage_lecture / _depot / _remplacement /
--     _suppression on storage.objects;
--   delete from storage.buckets where id = 'signatures';
--   drop function public.signature_demande_du_chemin(text);
--
-- =============================================================================


-- 1. Bucket ----------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 20971520,
      allowed_mime_types = array['application/pdf'];


-- 2. Lecture sure du chemin -----------------------------------------------------
create or replace function public.signature_demande_du_chemin(p_nom text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_nom ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(source|final)\.pdf$'
    then split_part(p_nom, '/', 1)::uuid
  end;
$$;
grant execute on function public.signature_demande_du_chemin(text) to authenticated, service_role;


-- 3. Policies ----------------------------------------------------------------------
drop policy if exists signatures_storage_lecture      on storage.objects;
drop policy if exists signatures_storage_depot        on storage.objects;
drop policy if exists signatures_storage_remplacement on storage.objects;
drop policy if exists signatures_storage_suppression  on storage.objects;

create policy signatures_storage_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'signatures'
         and public.peut_voir_signature(public.signature_demande_du_chemin(name)));

-- Le createur depose UNIQUEMENT {id}/source.pdf de SON brouillon.
create policy signatures_storage_depot on storage.objects
  for insert to authenticated
  with check (bucket_id = 'signatures'
              and name ~ '/source\.pdf$'
              and public.est_createur_brouillon(public.signature_demande_du_chemin(name)));

-- Remplacer le fichier (upload « upsert ») : meme regle, avant et apres.
create policy signatures_storage_remplacement on storage.objects
  for update to authenticated
  using (bucket_id = 'signatures'
         and name ~ '/source\.pdf$'
         and public.est_createur_brouillon(public.signature_demande_du_chemin(name)))
  with check (bucket_id = 'signatures'
              and name ~ '/source\.pdf$'
              and public.est_createur_brouillon(public.signature_demande_du_chemin(name)));

create policy signatures_storage_suppression on storage.objects
  for delete to authenticated
  using (bucket_id = 'signatures'
         and public.est_createur_brouillon(public.signature_demande_du_chemin(name)));


-- Verification ------------------------------------------------------------------
select 'bucket' as quoi, id || ' public=' || public || ' max=' || file_size_limit
       || ' types=' || array_to_string(allowed_mime_types, ',') as detail
  from storage.buckets where id = 'signatures'
union all
select 'policy', policyname || ' (' || cmd || ')'
  from pg_policies
 where schemaname = 'storage' and policyname like 'signatures_storage_%';
