-- =============================================================================
-- 5A-3 - Ajout du support multi-categories sur public.annuaire
-- =============================================================================
--
-- OBJECTIF :
--   Permettre a une entree d'appartenir a PLUSIEURS categories
--   (ex: "Urgences mains" trouvable sous "Urgences" ET "Chirurgie").
--   On ajoute une colonne tableau public.annuaire.categories (text[]) et on
--   recopie la valeur existante de la colonne "categorie" (singulier) dedans.
--   La colonne "categorie" est CONSERVEE pour l'instant (filet de securite) :
--   supprimee plus tard (script 5A-4) une fois le code front valide.
--
-- POURQUOI UN TABLEAU (text[]) PLUTOT QUE DES TABLES SEPAREES :
--   Petit carnet d'adresses a saisie libre : un tableau suffit, evite les
--   jointures et ne touche PAS aux policies RLS (on reste sur la meme table).
--   Un index GIN garde les filtres rapides.
--
-- COMMENT EXECUTER : SQL Editor > New query > coller > Run.
-- COMMENT VERIFIER  : le SELECT final montre categories peuplee.
--
-- POUR ANNULER :
--   DROP INDEX IF EXISTS public.annuaire_categories_idx;
--   ALTER TABLE public.annuaire DROP COLUMN IF EXISTS categories;
--
-- IDEMPOTENCE : ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS +
--   backfill conditionne a "categories = '{}'" : rejouable sans doublon.
-- =============================================================================


-- 1) Nouvelle colonne tableau. NOT NULL DEFAULT '{}' : jamais NULL, un tableau
--    vide = "aucune categorie". Simplifie le code React (pas de test null).
alter table public.annuaire
  add column if not exists categories text[] not null default '{}';


-- 2) Backfill : recopier la categorie unique existante dans le tableau.
--    Le filtre "categories = '{}'" garantit qu'on ne remplit que les lignes
--    pas encore migrees (rejouable sans dupliquer).
update public.annuaire
set categories = array[categorie]
where categorie is not null
  and btrim(categorie) <> ''
  and categories = '{}';


-- 3) Index GIN : accelere le filtre "entrees contenant la categorie X".
create index if not exists annuaire_categories_idx
  on public.annuaire using gin (categories);


-- Verification : ancienne colonne vs nouvelle colonne.
select id, nom, categorie, categories
from public.annuaire
order by nom;
