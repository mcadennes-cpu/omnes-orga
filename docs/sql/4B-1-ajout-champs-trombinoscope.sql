-- =============================================================================
-- 4B-1 - Ajout des champs jours_disponibles et notes_internes a profiles
-- =============================================================================
--
-- OBJECTIF :
--
--   Enrichir la table public.profiles avec deux champs supplementaires utilises
--   par le module Trombinoscope (etape 4 du plan de developpement) :
--     - jours_disponibles : jours de presence du medecin au cabinet
--                           (ex: "Lundi, Mardi, Jeudi")
--     - notes_internes    : notes libres a usage interne du cabinet
--
-- COMMENT EXECUTER CE SCRIPT :
--
--   1. Va sur https://app.supabase.com et ouvre le projet "OMNES ORGA"
--   2. Dans le menu de gauche, clique sur l'icone "SQL Editor" (>_)
--   3. Clique sur le bouton "+ New query" en haut a droite
--   4. Copie-colle TOUT le contenu de ce fichier dans l'editeur
--   5. Clique sur "Save" et nomme le snippet :
--        "4B-1 - Ajout champs Trombinoscope a profiles"
--   6. Clique sur le bouton vert "Run" (en bas a droite, ou raccourci Cmd+Enter)
--   7. Tu dois voir le message "Success" et la liste des colonnes de profiles
--      retournee par le SELECT de verification (incluant les 2 nouvelles).
--
-- COMMENT VERIFIER :
--
--   Apres execution, le SELECT en fin de script affiche la liste complete des
--   colonnes de public.profiles. Les deux nouvelles colonnes
--   "jours_disponibles" et "notes_internes" doivent y apparaitre, toutes deux
--   de type "text" et nullable ("YES" dans is_nullable).
--
-- POUR ANNULER (si besoin) :
--
--   ALTER TABLE public.profiles
--     DROP COLUMN IF EXISTS jours_disponibles,
--     DROP COLUMN IF EXISTS notes_internes;
--
-- NOTE DE SECURITE (importante) :
--
--   Le champ notes_internes est visible a tous les utilisateurs authentifies
--   via la RLS profiles_select_all_authenticated existante. Le filtrage par
--   role (cacher aux remplacants) est fait cote frontend (approche
--   pragmatique). Migration vers une vue PostgreSQL prevue si besoin de
--   securite forte. TODO : voir docs/cabinet-medical-app.md section securite.
--
-- IDEMPOTENCE :
--
--   Le script utilise "ADD COLUMN IF NOT EXISTS", donc il peut etre rejoue
--   sans erreur meme si les colonnes existent deja.
--
-- =============================================================================


ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS jours_disponibles TEXT,
  ADD COLUMN IF NOT EXISTS notes_internes TEXT;


-- Verification : afficher les colonnes de la table profiles
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;
