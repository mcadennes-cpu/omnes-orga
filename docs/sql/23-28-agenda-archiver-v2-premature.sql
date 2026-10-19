-- =====================================================================
-- Etape 22 / module Agenda
-- 23-28 : archiver le plan "Roulement V2 - 9 associes", jamais entre en
-- vigueur, avant son remplacement par une version corrigee
--
-- Contexte : remplacement du V2 par un plan legerement modifie (quelques
-- creneaux changes), a effective_from identique (04/01/2027). Le V2 n'a
-- encore produit aucune vraie garde -- aucune semaine n'a ete ouverte
-- au-dela du 03/01/2027 : l'archiver ne touche a rien de reel.
--
-- Pourquoi un script a part plutot que l'ecran d'activation habituel :
-- agenda.activer_plan_roulement() fermerait le plan sortant en lui
-- donnant effective_to = p_effective_from - 1. Si le sortant est le V2
-- lui-meme (effective_from = 2027-01-04) et qu'on l'active a nouveau a
-- la meme date, cela donnerait effective_to = 2027-01-03, soit AVANT
-- son propre effective_from -- rejete par la contrainte
-- rotation_plans_periode_coherente (effective_to >= effective_from).
--
-- Le statut "archived" est exactement le cas documente en 6F pour "un
-- plan qui n'a jamais servi" : contrairement a un plan ferme en cours
-- de service, l'archiver ici ne retire aucune date de l'historique
-- puisqu'aucune date n'a jamais ete couverte par ce plan en pratique.
--
-- Prealable : sauvegarde 23-16 executee avant ce script.
-- Idempotent : reexecutable sans dommage (la clause WHERE status =
-- 'active' rend une deuxieme execution sans effet).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Etat avant
-- ---------------------------------------------------------------------
select id, name, status, start_date, effective_from, effective_to,
       (select count(*) from agenda.rotation_plan_rules r where r.plan_id = p.id) as regles
  from agenda.rotation_plans p
 where id in ('207af665-92bd-4d97-b204-09b10f0b59fe', '0e9a0889-17da-4bd9-b09b-e29ea3ad7b6d')
 order by effective_from;

-- ---------------------------------------------------------------------
-- 1. Archivage du V2
-- ---------------------------------------------------------------------
update agenda.rotation_plans
   set status = 'archived'
 where id = '0e9a0889-17da-4bd9-b09b-e29ea3ad7b6d'
   and status = 'active';

-- ---------------------------------------------------------------------
-- 2. Etat apres
-- ---------------------------------------------------------------------
select id, name, status, start_date, effective_from, effective_to
  from agenda.rotation_plans
 where id in ('207af665-92bd-4d97-b204-09b10f0b59fe', '0e9a0889-17da-4bd9-b09b-e29ea3ad7b6d')
 order by effective_from;
