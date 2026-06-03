-- =============================================================
-- 16A-1 : Photos de profil — bucket Storage `avatars`
-- =============================================================
-- Bucket prive, 500 Ko max, MIME restreint a image/jpeg + png + webp.
-- Pattern flat : un seul fichier par user, path = `{user_id}.jpg`
-- (le remplacement ecrase, pas de fichiers orphelins).
-- =============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,                                                -- prive (URL signee a l'affichage)
  512000,                                               -- 500 Ko
  ARRAY['image/jpeg', 'image/png', 'image/webp']        -- defense en profondeur cote bucket
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- Fin 16A-1
-- =============================================================
