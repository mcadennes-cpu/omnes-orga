-- =============================================================
-- 10A-4 : Module Immobilier — bucket Storage + 3 policies
-- =============================================================
-- Bucket prive immobilier-attachments, 25 Mo, MIME libre.
-- Pattern flat UUID (nom du blob = id de la ligne attachments).
-- =============================================================

-- ---------- Creation du bucket --------------------------------
-- INSERT direct dans storage.buckets, equivalent du dashboard
-- "New bucket" avec les bonnes options. Idempotent via ON CONFLICT.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'immobilier-attachments',
  'immobilier-attachments',
  false,                  -- prive (pas d'URL publique)
  26214400,               -- 25 Mo
  NULL                    -- MIME types non restreints au niveau bucket
)
ON CONFLICT (id) DO NOTHING;

-- ---------- Storage policies ----------------------------------
-- 3 policies sur storage.objects filtrees par bucket_id.

CREATE POLICY immobilier_storage_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'immobilier-attachments');

CREATE POLICY immobilier_storage_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'immobilier-attachments'
    AND public.is_immobilier_member()
  );

CREATE POLICY immobilier_storage_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'immobilier-attachments'
    AND public.is_immobilier_member()
  );

-- =============================================================
-- Fin 10A-4
-- =============================================================
