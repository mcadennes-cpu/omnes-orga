-- docs/sql/9A-5-sim-storage-policies.sql
-- Etape 9A-5 : 3 policies Storage sur le bucket "sim"
--
-- Les policies Storage raisonnent au niveau "role" uniquement (le bucket ne
-- connait que le nom du blob = UUID, pas l'auteur_id metier).
-- La granularite fine "auteur" sur la suppression est portee par la RLS de
-- la table sim_fichiers (9A-4). Meme pattern qu'en Evenements (8A).
--
-- 3 policies : SELECT (lire/telecharger), INSERT (uploader), DELETE (supprimer
-- le blob). Pas d'UPDATE : on ne modifie jamais un blob en place, un renommage
-- ne touche que la colonne "nom" de la table.

-- Lecture : tout membre SIM peut telecharger les blobs du bucket
create policy sim_storage_select_member
  on storage.objects for select
  to authenticated
  using ( bucket_id = 'sim' and public.is_sim_member() );

-- Upload : tout membre SIM peut deposer un blob
create policy sim_storage_insert_member
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'sim' and public.is_sim_member() );

-- Suppression du blob : tout membre SIM (le filtrage "auteur" est fait par la
-- RLS de sim_fichiers ; le code supprime d'abord la ligne DB, puis le blob).
create policy sim_storage_delete_member
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'sim' and public.is_sim_member() );
