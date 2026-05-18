-- =============================================================================
-- 8A-5 - Ajout de la couleur d'identite sur les evenements
-- =============================================================================
--
-- OBJECTIF :
--
--   Ajouter une colonne "couleur" a la table public.evenements.
--
--   Decision produit : chaque evenement porte sa propre couleur d'identite,
--   choisie par son createur dans la palette du design system (6 valeurs).
--   Cette couleur teinte, cote interface : le bloc-date dans la liste, la
--   pastille calendrier du detail, la pill "Sondage", l'indicateur "A
--   repondre" et le bouton actif du sondage.
--
--   - couleur : text, NOT NULL, defaut 'marine' (couleur neutre / primaire
--     du design system : un evenement cree sans choix explicite reste donc
--     sobre, la couleur expressive ne s'applique que sur choix conscient du
--     createur). CHECK sur les 6 valeurs du DS.
--
-- NOTE - script en deux temps :
--   1) add column if not exists : cree la colonne sur une base neuve.
--   2) alter column ... set default : garantit le defaut 'marine' MEME si
--      la colonne avait deja ete creee avec un autre defaut (ex : un premier
--      passage du script avec 'fuchsia'). C'est ce qui rend ce fichier
--      rejouable et auto-correcteur.
--
--   La table evenements est vide : aucune ligne existante n'est impactee.
--   Pas de changement RLS ni Realtime (portee ligne / table).
--
-- COMMENT EXECUTER : SQL Editor > New query > coller > Save
--   "8A-5 - Couleur evenements" > Run. Peut etre rejoue sans risque.
--
-- COMMENT VERIFIER : le SELECT final doit montrer column_default a
--   'marine'::text.
--
-- POUR ANNULER (si besoin) :
--   alter table public.evenements drop column if exists couleur;
--
-- =============================================================================


-- 1) Cree la colonne si elle n'existe pas (base neuve).
alter table public.evenements
  add column if not exists couleur text not null default 'marine'
  check (couleur in ('brique', 'ocre', 'olive', 'canard', 'fuchsia', 'marine'));

-- 2) Force le defaut a 'marine' meme si la colonne existait deja
--    (corrige un premier passage du script avec un autre defaut).
alter table public.evenements
  alter column couleur set default 'marine';


-- Verification : la colonne couleur doit avoir column_default = 'marine'
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'evenements'
  and column_name = 'couleur';
