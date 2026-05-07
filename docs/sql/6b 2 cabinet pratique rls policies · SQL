-- Cabinet pratique - RLS et 8 policies (etape 6B-2)
-- 4 policies par table : SELECT, INSERT, UPDATE, DELETE
-- Lecture pour tout utilisateur authentifie avec un profil
-- Ecriture pour super_admin et associe_gerant uniquement

ALTER TABLE public.cabinet_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabinet_fichiers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Policies cabinet_dossiers
-- ============================================================

CREATE POLICY "cabinet_dossiers_select"
ON public.cabinet_dossiers FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
  )
);

CREATE POLICY "cabinet_dossiers_insert"
ON public.cabinet_dossiers FOR INSERT
TO authenticated
WITH CHECK (
  auteur_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'associe_gerant')
  )
);

CREATE POLICY "cabinet_dossiers_update"
ON public.cabinet_dossiers FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'associe_gerant')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'associe_gerant')
  )
);

CREATE POLICY "cabinet_dossiers_delete"
ON public.cabinet_dossiers FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'associe_gerant')
  )
);

-- ============================================================
-- Policies cabinet_fichiers
-- ============================================================

CREATE POLICY "cabinet_fichiers_select"
ON public.cabinet_fichiers FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
  )
);

CREATE POLICY "cabinet_fichiers_insert"
ON public.cabinet_fichiers FOR INSERT
TO authenticated
WITH CHECK (
  auteur_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'associe_gerant')
  )
);

CREATE POLICY "cabinet_fichiers_update"
ON public.cabinet_fichiers FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'associe_gerant')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'associe_gerant')
  )
);

CREATE POLICY "cabinet_fichiers_delete"
ON public.cabinet_fichiers FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'associe_gerant')
  )
);