-- =============================================================================
-- 25A-4 - Module Contrats : dossiers (cadrage du 17/11/2026)
-- =============================================================================
--
--   - « Contrats d'exercice médecins » est renomme « Contrats médecins/SIM »
--     et reste reserve aux membres SIM (ses contrats individuels ne doivent
--     pas etre vus par les autres associes) ;
--   - nouveau dossier racine « Contrat d'exercice en commun », ouvert aux
--     associes ;
--   - « Asso 1901 OMNES MEDECINS » est ouvert aux associes ;
--   - nouveau dossier racine « Contrats de remplacement » (membres SIM ;
--     chaque medecin y voit SES contrats via « Mes contrats »).
--
--   Auteur des nouveaux dossiers : Matthieu (super_admin), comme les six
--   dossiers racine existants.
--
-- COMMENT EXECUTER : apres 25A-1 (colonne ouvert_associes). Rejouable :
--   les dossiers ne sont crees que s'ils n'existent pas deja.
--
-- POUR ANNULER : voir 25A-9 (les dossiers crees ne sont supprimes que vides).
--
-- =============================================================================

update public.sim_dossiers
   set nom = 'Contrats médecins/SIM'
 where id = '9328e7bd-5e8b-4533-93f8-e7d8dfc16cdc'
   and nom = 'Contrats d''exercice médecins';

update public.sim_dossiers
   set ouvert_associes = true
 where id = '76551fad-8a3a-449e-a4fb-fbc7037dee53';   -- Asso 1901 OMNES MEDECINS

insert into public.sim_dossiers (nom, parent_id, couleur, auteur_id, ouvert_associes)
select 'Contrat d''exercice en commun', null, 'jaune',
       'b43659df-fcd8-4d32-a915-efa2e580fbbd', true
 where not exists (select 1 from public.sim_dossiers
                    where parent_id is null and nom = 'Contrat d''exercice en commun');

insert into public.sim_dossiers (nom, parent_id, couleur, auteur_id, ouvert_associes)
select 'Contrats de remplacement', null, 'bleu',
       'b43659df-fcd8-4d32-a915-efa2e580fbbd', false
 where not exists (select 1 from public.sim_dossiers
                    where parent_id is null and nom = 'Contrats de remplacement');


-- Verification ------------------------------------------------------------------
select nom, couleur, ouvert_associes
  from public.sim_dossiers
 where parent_id is null
 order by nom;
