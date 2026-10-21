-- =====================================================================
-- Etape 22 / module Agenda
-- 23-30 : retirer la semaine du 05/04/2027 au 11/04/2027, ouverte en trop
--
-- Constat (21/10/2026) : l'ouverture lancee ce jour a couvert 14 semaines
-- (04/01 -> 11/04/2027) au lieu de 13 (04/01 -> 04/04/2027, souhaite par
-- Matthieu). La semaine en trop compte 56 gardes (31 affectees par le
-- roulement, 25 libres), aucune demande de remplacant.
--
-- Suppression DOUCE, identique a agenda.supprimer_gardes() (bouton
-- « Supprimer » de l'appli) : deleted_at = now(). Les lignes restent en
-- base ; le journal (trigger journaliser_shifts_update) trace l'operation,
-- sans auteur puisque le script tourne hors session. L'interface ne permet
-- pas de le faire elle-meme : une garde a la fois, et refus des gardes
-- affectees.
--
-- Verrous : la semaine visee ET l'horodatage de creation de cette
-- ouverture -- une garde creee autrement sur ces dates ne serait pas
-- touchee. Le script s'arrete si une demande existe sur ces gardes.
--
-- Prealable : sauvegarde 23-16 executee avant ce script.
-- Idempotent : deleted_at is null exclut les gardes deja retirees.
-- =====================================================================

-- 0. Etat avant (56 attendues : 31 assigned, 25 free)
select status, count(*)
  from agenda.shifts
 where date between '2027-04-05' and '2027-04-11'
   and deleted_at is null
 group by status;

-- 1. Garde-fou : aucune demande sur ces gardes
do $$
begin
  if exists (
    select 1
      from agenda.requests r
      join agenda.shifts s on s.id = r.shift_id
     where s.date between '2027-04-05' and '2027-04-11'
       and s.deleted_at is null
  ) then
    raise exception 'Des demandes existent sur la semaine du 05/04/2027 : arret';
  end if;
end $$;

-- 2. Suppression douce
update agenda.shifts
   set deleted_at = now(), updated_at = now()
 where date between '2027-04-05' and '2027-04-11'
   and deleted_at is null
   and created_at = '2026-10-21 08:22:22.51168+00';

-- 3. Etat apres : plus aucune garde vivante apres le 04/04/2027
select count(*) as gardes_vivantes_apres_0404
  from agenda.shifts
 where date > '2027-04-04'
   and deleted_at is null;
