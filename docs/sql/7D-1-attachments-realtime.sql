-- ============================================================================
-- Module Discussion — pieces jointes de carte (etape 7D)
-- ----------------------------------------------------------------------------
-- Realtime sur discussion_attachments + limite de taille du bucket.
-- L'infrastructure (table, RLS, bucket, policies Storage) date de 7A.
-- A executer une seule fois.
-- ============================================================================

-- Realtime : refleter en direct l'ajout / la suppression de pieces jointes
-- pendant que plusieurs membres consultent la meme carte.
alter publication supabase_realtime add table public.discussion_attachments;

-- Limite de taille du bucket : 25 Mo (defense en profondeur ; l'application
-- valide deja la taille avant l'upload). 25 * 1024 * 1024 = 26214400.
update storage.buckets
   set file_size_limit = 26214400
 where id = 'discussion-attachments';
