-- =====================================================================
-- Etape 22 / 6B-2 (MOD-1) : le roulement actuel devient un plan
--
-- Cree le plan « Roulement V1 » et y verse les regles de
-- rotation_assignment_rules. L'ancien roulement cesse d'etre un cas
-- particulier : il devient un plan comme un autre, avec sa periode de
-- validite, et le V2 pourra prendre le relais au 04/01/2027.
--
-- RIEN N'EST SUPPRIME. rotation_settings et rotation_assignment_rules
-- restent en place et continuent de faire tourner le module jusqu'a 6C,
-- ou le code basculera sur les plans. A aucun moment on ne se prive d'un
-- retour en arriere.
--
-- --------------------------------------------------------------------
-- CE QU'ON MIGRE, ET CE QU'ON LAISSE
-- --------------------------------------------------------------------
-- 268 regles sur 282. Les 14 ecartees sont les regles « J3 Dijon » du
-- samedi et du dimanche, creees les 11-15/12/2025.
--
-- Ce ne sont PAS des regles de roulement erronees : avant septembre
-- 2026, le creneau de week-end de Dijon n'existait pas, et la garde
-- etait enregistree sur un creneau de journee. Verifie dans les gardes :
--   . « J3 Dijon » le week-end : 68 gardes, janvier -> aout 2026
--   . « WE1 Dijon » le week-end : 36 gardes, septembre 2026 -> janvier 2027
-- La bascule faite, ces 14 regles ne correspondent plus a aucune garde
-- ouverte. Les reprendre reintroduirait un doublon de representation
-- dans un plan tout neuf.
--
-- Verifie case par case le 01/08/2026 : les 14 sont ENTIEREMENT
-- REDONDANTES avec les 14 regles « WE1 Dijon », qui couvrent exactement
-- les memes cases (7 semaines x samedi + dimanche).
--   . 12 sur 14 : MEME medecin des deux cotes -- doublon exact.
--   .  2 sur 14 : S6 samedi et dimanche, ou « J3 Dijon » porte Caroline
--      Chauvet et « WE1 Dijon » Laurene Daudin. C'est la trace de la
--      reattribution de la garde S6 : seule la regle du nouveau creneau a
--      ete mise a jour, l'ancienne est restee figee sur sa valeur
--      d'origine -- qui se trouve etre celle du fichier de decembre.
-- Aucune information n'est donc perdue en les ecartant.
--
-- --------------------------------------------------------------------
-- POURQUOI L'ETAT DE LA BASE ET NON LE FICHIER DE DECEMBRE
-- --------------------------------------------------------------------
-- Les deux different de 13 cases (hors les 14 ci-dessus). On reprend
-- l'etat de la base parce que c'est LUI qui produit le planning
-- d'aujourd'hui : la migration reste ainsi a comportement constant, et
-- toute difference constatee apres 6C sera un vrai probleme et non un
-- changement qu'on aurait introduit soi-meme (meme discipline qu'en 7C).
--
-- Ces 13 divergences n'ont pas a etre reportees dans le fichier : le
-- roulement V2 les a deja toutes tranchees, en faveur du fichier. Elles
-- devront en revanche apparaitre a l'ecran de differentiel de 6F, au
-- moment d'activer le V2 -- treize changements silencieux seraient
-- exactement la surprise que ce dispositif existe pour eviter.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Controles prealables -- le script echoue si l'un d'eux ne passe pas
-- ---------------------------------------------------------------------
do $$
declare
  n integer;
begin
  -- Aucun plan ne doit deja exister : ce script n'est pas rejouable.
  select count(*) into n from agenda.rotation_plans;
  if n > 0 then
    raise exception 'ARRET : % plan(s) existent deja. Ce script ne doit tourner qu''une fois.', n;
  end if;

  -- Toutes les semaines doivent tenir dans le cycle de 8.
  select count(*) into n from agenda.rotation_assignment_rules where rotation_week not between 1 and 8;
  if n > 0 then
    raise exception 'ARRET : % regle(s) portent une semaine hors du cycle de 8.', n;
  end if;

  -- Tous les medecins references doivent exister (la FK est en RESTRICT).
  select count(*) into n
    from agenda.rotation_assignment_rules r
    left join public.profiles p on p.id = r.doctor_id
   where p.id is null;
  if n > 0 then
    raise exception 'ARRET : % regle(s) referencent un profil inexistant.', n;
  end if;

  -- Le cycle en base doit bien etre celui qu'on s'apprete a figer.
  select cycle_length_weeks into n from agenda.rotation_settings limit 1;
  if n is distinct from 8 then
    raise exception 'ARRET : rotation_settings annonce un cycle de % semaines, pas 8.', n;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Le plan
--
-- start_date et cycle repris de rotation_settings, pour que la
-- numerotation des semaines soit IDENTIQUE a celle d'aujourd'hui : c'est
-- la condition de la migration a comportement constant.
--
-- effective_to reste NULL : le plan court jusqu'a nouvel ordre. C'est
-- l'activation du V2 (6F) qui le fermera au 03/01/2027.
--
-- source_file_name et imported_at restent NULL, volontairement : ce plan
-- ne vient PAS d'un fichier. Il est le releve d'un etat construit a la
-- main dans l'application pendant sept mois. C'est precisement ce que
-- MOD-1 vient faire cesser.
-- ---------------------------------------------------------------------
insert into agenda.rotation_plans
  (name, start_date, cycle_length_weeks, status, effective_from, effective_to,
   source_file_name, imported_at, created_by, notes)
select
  'Roulement V1 - decembre 2025',
  rs.start_date,
  rs.cycle_length_weeks,
  'active',
  rs.start_date,
  null,
  null,
  null,
  (select id from public.profiles where email = 'direction.omnes@gmail.com'),
  'Plan de reprise, cree le 01/08/2026 (etape 6B-2). Ne provient pas d''un '
  || 'fichier : releve de rotation_assignment_rules, qui etait la seule source '
  || 'vivante du roulement. 268 regles sur 282 reprises ; les 14 regles '
  || '« J3 Dijon » du week-end sont ecartees (ancienne facon d''enregistrer la '
  || 'garde de week-end a Dijon, avant la creation du creneau WE1 Dijon en '
  || 'septembre 2026). Diverge de planning-actuel_2025-12.xlsx sur 13 cases, '
  || 'toutes tranchees par le roulement V2 en faveur du fichier.'
from agenda.rotation_settings rs;

-- ---------------------------------------------------------------------
-- 2. Les regles
-- ---------------------------------------------------------------------
insert into agenda.rotation_plan_rules
  (plan_id, doctor_id, site_id, room_id, shift_type_id, weekday, rotation_week, created_at)
select
  (select id from agenda.rotation_plans where name = 'Roulement V1 - decembre 2025'),
  r.doctor_id, r.site_id, r.room_id, r.shift_type_id, r.weekday, r.rotation_week,
  r.created_at            -- on conserve la date de saisie d'origine
from agenda.rotation_assignment_rules r
join agenda.shift_types st on st.id = r.shift_type_id
where not (st.name = 'J3 Dijon' and r.weekday in (0, 6));

-- ---------------------------------------------------------------------
-- Verifications
-- ---------------------------------------------------------------------
select p.name, p.start_date, p.cycle_length_weeks as cycle, p.status,
       p.effective_from, p.effective_to,
       (select count(*) from agenda.rotation_plan_rules r where r.plan_id = p.id) as regles
  from agenda.rotation_plans p;

-- Comptage attendu : 282 source, 14 ecartees, 268 migrees, 0 perdue.
select (select count(*) from agenda.rotation_assignment_rules)                   as source,
       (select count(*) from agenda.rotation_assignment_rules r
          join agenda.shift_types st on st.id = r.shift_type_id
         where st.name = 'J3 Dijon' and r.weekday in (0, 6))                     as ecartees,
       (select count(*) from agenda.rotation_plan_rules)                         as migrees,
       (select count(*) from agenda.rotation_assignment_rules)
     - (select count(*) from agenda.rotation_assignment_rules r
          join agenda.shift_types st on st.id = r.shift_type_id
         where st.name = 'J3 Dijon' and r.weekday in (0, 6))
     - (select count(*) from agenda.rotation_plan_rules)                         as ecart_a_zero;

-- Conformite case par case : chaque regle migree doit exister a
-- l'identique dans la source, et reciproquement (hors les 14 ecartees).
-- Attendu : 0 des deux cotes.
select
  (select count(*) from agenda.rotation_plan_rules n
    where not exists (
      select 1 from agenda.rotation_assignment_rules o
       where o.doctor_id = n.doctor_id and o.site_id = n.site_id
         and o.room_id = n.room_id and o.shift_type_id = n.shift_type_id
         and o.weekday = n.weekday and o.rotation_week = n.rotation_week)) as migree_sans_source,
  (select count(*) from agenda.rotation_assignment_rules o
     join agenda.shift_types st on st.id = o.shift_type_id
    where not (st.name = 'J3 Dijon' and o.weekday in (0, 6))
      and not exists (
      select 1 from agenda.rotation_plan_rules n
       where n.doctor_id = o.doctor_id and n.site_id = o.site_id
         and n.room_id = o.room_id and n.shift_type_id = o.shift_type_id
         and n.weekday = o.weekday and n.rotation_week = o.rotation_week)) as source_sans_migree;

-- Repartition par medecin, a comparer avec le tableau de 7B-1.
select p.prenom || ' ' || p.nom as medecin, count(*) as cases
  from agenda.rotation_plan_rules r
  join public.profiles p on p.id = r.doctor_id
 group by 1 order by 2 desc, 1;
