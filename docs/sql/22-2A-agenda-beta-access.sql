-- =============================================================================
-- 22-2A - Colonne profiles.agenda_beta_access (module Agenda, phase beta)
-- =============================================================================
--
-- OBJECTIF :
--
--   Ajouter a public.profiles la colonne agenda_beta_access (boolean,
--   DEFAULT false) qui pilote la visibilite du module Agenda pendant sa
--   phase beta :
--
--     - false (defaut) -> l'icone Agenda n'apparait pas sur la grille
--       d'accueil, la route /agenda redirige vers l'accueil.
--     - true           -> acces au module (super_admin + 1 testeur designe).
--
--   Le script active aussi le flag pour le(s) super_admin. Le testeur sera
--   active plus tard par un simple UPDATE (voir NOTE en fin de fichier).
--
--   A la sortie de beta (etape 8 du plan d'integration agenda) : passer tout
--   le monde a true en un seul UPDATE, ou supprimer la condition cote code.
--
--   NOTE SECURITE : ce flag est un confort d'interface (masquer l'icone),
--   pas une barriere de securite. Les donnees de l'agenda vivent dans le
--   projet Supabase Planning, protege par sa propre authentification et sa
--   propre RLS. Aucune policy RLS du projet OMNES ORGA ne depend de cette
--   colonne a ce stade.
--
-- COMMENT EXECUTER CE SCRIPT :
--
--   1. https://app.supabase.com > projet "OMNES ORGA"
--   2. SQL Editor > "+ New query"
--   3. Copie-colle TOUT le contenu de ce fichier dans l'editeur
--   4. Save : "22-2A - Colonne agenda_beta_access"
--   5. Run (bouton vert ou Cmd+Enter)
--   6. Le SELECT final liste les profils ayant acces a la beta.
--
-- COMMENT VERIFIER :
--
--   Database > Tables > profiles : la colonne agenda_beta_access existe,
--   type bool, defaut false.
--   Le SELECT final retourne le(s) super_admin avec agenda_beta_access = true.
--
-- POUR ANNULER (si besoin) :
--
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS agenda_beta_access;
--
-- IDEMPOTENCE :
--
--   ADD COLUMN IF NOT EXISTS + UPDATE cible par role : le script peut etre
--   rejoue sans erreur (le re-UPDATE ne change rien).
--
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agenda_beta_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.agenda_beta_access IS
  'Acces beta au module Agenda (etapes 2-6 integration). true = icone visible sur la grille d''accueil.';

-- Activation pour le(s) super_admin (Matthieu). Le testeur designe sera
-- active plus tard (voir NOTE ci-dessous).
UPDATE public.profiles
SET agenda_beta_access = true
WHERE role = 'super_admin';

-- Verification : qui a acces a la beta ?
SELECT prenom, nom, email, role, agenda_beta_access
FROM public.profiles
WHERE agenda_beta_access = true
ORDER BY nom;

-- NOTE - activer le testeur designe le moment venu :
--
--   UPDATE public.profiles
--   SET agenda_beta_access = true
--   WHERE email = 'email-du-testeur@exemple.fr';
