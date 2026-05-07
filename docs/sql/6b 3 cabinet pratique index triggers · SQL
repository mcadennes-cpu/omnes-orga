-- Cabinet pratique - Index et triggers updated_at (etape 6B-3)
--
-- Note : la fonction handle_updated_at() peut deja exister si elle a ete
-- creee pour une autre table (ex : annuaire). Le CREATE OR REPLACE la
-- remplace par une version identique sans casser quoi que ce soit.

-- Index sur les FK pour acceleration des requetes hot path

CREATE INDEX cabinet_dossiers_parent_id_idx
ON public.cabinet_dossiers(parent_id);

CREATE INDEX cabinet_fichiers_dossier_id_idx
ON public.cabinet_fichiers(dossier_id);

-- Fonction trigger reutilisable

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers BEFORE UPDATE

CREATE TRIGGER cabinet_dossiers_handle_updated_at
BEFORE UPDATE ON public.cabinet_dossiers
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER cabinet_fichiers_handle_updated_at
BEFORE UPDATE ON public.cabinet_fichiers
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();