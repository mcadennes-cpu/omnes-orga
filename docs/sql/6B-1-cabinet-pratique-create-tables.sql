-- Cabinet pratique - Tables (etape 6B-1)
-- Cree les 2 tables cabinet_dossiers (hierarchie via parent_id self-referent)
-- et cabinet_fichiers (id UUID utilise aussi comme nom physique dans Storage)
 
CREATE TABLE public.cabinet_dossiers (
  id          UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID REFERENCES public.cabinet_dossiers(id) ON DELETE RESTRICT,
  nom         TEXT NOT NULL CHECK (length(trim(nom)) > 0),
  couleur     TEXT NOT NULL DEFAULT 'gris'
              CHECK (couleur IN ('bleu', 'gris', 'jaune', 'orange', 'rouge', 'vert')),
  auteur_id   UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
 
CREATE TABLE public.cabinet_fichiers (
  id            UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id    UUID REFERENCES public.cabinet_dossiers(id) ON DELETE RESTRICT,
  nom           TEXT NOT NULL CHECK (length(trim(nom)) > 0),
  taille_octets BIGINT NOT NULL CHECK (taille_octets > 0 AND taille_octets <= 26214400),
  mime_type     TEXT NOT NULL,
  auteur_id     UUID NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
 