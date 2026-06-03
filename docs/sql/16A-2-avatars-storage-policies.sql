-- =============================================================
-- 16A-2 : Photos de profil — Storage policies (4 policies)
-- =============================================================
-- Modele : chacun gere sa propre photo, super_admin et associe_gerant
-- peuvent aussi modifier celle des autres. Lecture ouverte a tout
-- utilisateur authentifie (necessaire pour generer une URL signee
-- sur n'importe quel avatar du cabinet).
--
-- Le path Storage est `{user_id}.jpg|.png|.webp`. On extrait l'user_id
-- depuis le nom du fichier via split_part : `5e3a...-uuid.jpg` -> `5e3a...-uuid`.
-- =============================================================

-- ---------- SELECT : tous authentifies ------------------------
-- Necessaire pour pouvoir generer une URL signee sur n'importe quel
-- avatar (Trombinoscope, Discussion, Immobilier, Profil... tous les
-- sites d'affichage ont besoin de lire les avatars de tous les
-- collegues, pas seulement le sien).
CREATE POLICY avatars_storage_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

-- ---------- INSERT : son propre avatar OU role privilegie -----
-- L'user_id est extrait du nom du fichier (sans extension) via
-- split_part(name, '.', 1). Doit egaler auth.uid()::text, OU
-- l'appelant doit etre super_admin / associe_gerant.
CREATE POLICY avatars_storage_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      split_part(name, '.', 1) = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('super_admin', 'associe_gerant')
      )
    )
  );

-- ---------- UPDATE : meme regle qu'INSERT ---------------------
-- Necessaire car Supabase Storage utilise UPDATE quand on upload
-- en mode upsert: true sur un path existant.
CREATE POLICY avatars_storage_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      split_part(name, '.', 1) = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('super_admin', 'associe_gerant')
      )
    )
  );

-- ---------- DELETE : meme regle qu'INSERT ---------------------
CREATE POLICY avatars_storage_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      split_part(name, '.', 1) = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('super_admin', 'associe_gerant')
      )
    )
  );

-- =============================================================
-- Fin 16A-2
-- =============================================================
