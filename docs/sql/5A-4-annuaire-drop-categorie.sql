-- =============================================================================
-- 5A-4 - Suppression de l'ancienne colonne public.annuaire.categorie
-- =============================================================================
--
-- OBJECTIF :
--   Finaliser la migration multi-categories (cf 5A-3). La colonne "categorie"
--   (singulier) n'est plus lue ni ecrite par l'application : la donnee a ete
--   recopiee dans le tableau "categories" (text[]) et le front travaille
--   exclusivement dessus (formulaire, liste, fiche, recherche globale).
--   On supprime donc la colonne devenue inutile.
--
-- PRE-REQUIS :
--   - 5A-3 execute (colonne categories creee + backfill effectue).
--   - Code front a jour ne lisant plus "categorie" (branche
--     feature/annuaire-multi-categories, teste OK).
--
-- ATTENTION : action DESTRUCTIVE et IRREVERSIBLE. La colonne "categorie" et
--   son index dependant annuaire_categorie_idx sont supprimes. Les valeurs ne
--   sont pas perdues fonctionnellement (deja copiees dans categories) mais la
--   colonne d'origine disparait definitivement.
--
-- COMMENT EXECUTER : SQL Editor > New query > coller > Run.
-- COMMENT VERIFIER  : le SELECT final ne liste plus la colonne "categorie".
--
-- IDEMPOTENCE : DROP COLUMN IF EXISTS : rejouable sans erreur.
-- =============================================================================


-- DROP COLUMN retire aussi l'index dependant annuaire_categorie_idx :
-- pas besoin d'un DROP INDEX separe.
alter table public.annuaire
  drop column if exists categorie;


-- Verification : la colonne "categorie" ne doit plus apparaitre.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'annuaire'
order by ordinal_position;
