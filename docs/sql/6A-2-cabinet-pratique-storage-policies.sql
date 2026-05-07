-- Cabinet pratique - Storage policies (etape 6A-2)
-- Pre-requis : bucket cabinet-pratique cree via dashboard Supabase
--   (Storage > New bucket, prive, file size limit 25 MB)

CREATE POLICY "cabinet_pratique_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'cabinet-pratique'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
  )
);

CREATE POLICY "cabinet_pratique_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cabinet-pratique'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'associe_gerant')
  )
);

CREATE POLICY "cabinet_pratique_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'cabinet-pratique'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'associe_gerant')
  )
)
WITH CHECK (
  bucket_id = 'cabinet-pratique'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'associe_gerant')
  )
);

CREATE POLICY "cabinet_pratique_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'cabinet-pratique'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'associe_gerant')
  )
);