-- =====================================================================
-- Reparation 23-2 : remettre le creneau « J6 Beaune »
--
-- POURQUOI CE SCRIPT EXISTE
-- Le creneau a ete supprime le 24/08/2026 en testant l'ecran de
-- suppression refait par MOD2-F-2. Suppression volontaire, sur la copie
-- de travail, mais a remettre (demande de Matthieu le jour meme).
--
-- IL N'Y A AUCUNE TRACE DE CETTE SUPPRESSION.
-- MOD2-A a pose des declencheurs de journal sur shifts, requests,
-- fixed_duty_series et rotation_plans -- PAS sur shift_types, sites ni
-- rooms. Le journal ne peut donc rien rendre ici, et restaurer_action
-- non plus. La ligne est reconstruite depuis le script qui l'avait
-- creee : 22-6A-2-agenda-creneaux-beaune.sql, ligne 52.
--
-- CE QUI EST CERTAIN, CE QUI EST DEDUIT
--   . name, time_range, is_active, sort_order : repris a l'identique du
--     script d'origine. Certains.
--   . default_room_id : le script d'origine ne le posait pas, il a ete
--     renseigne plus tard. Sa valeur est DEDUITE, pas retrouvee -- voir
--     le bloc 2, qui est retirable.
--
-- La suppression n'a emporte aucune garde ni aucune regle de roulement :
-- les deux verrous (policy RLS « sans garde », cle etrangere
-- rotation_plan_rules en RESTRICT) l'interdisaient. Mesure faite avant
-- la suppression : 0 garde, 0 regle.
--
-- A executer une seule fois sur le projet ydihrgnixthrraprclox.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Garde-fou : ne rien faire si le creneau est deja revenu
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from agenda.shift_types where name = 'J6 Beaune') then
    raise exception 'J6 Beaune existe deja -- script inutile, rien execute.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. La ligne, telle que 22-6A-2 l'avait creee
--
-- sort_order = 19 : la suite des trois autres creneaux Beaune ajoutes le
-- meme jour (J4 = 16, J7 = 17, J8 = 18). L'ordre d'affichage general est
-- deja melange -- dette cosmetique connue, hors perimetre ici.
--
-- J6 va EN PRATIQUE aux remplacants, mais ce n'est PAS une regle dure
-- (arbitrage de Matthieu du 01/08/2026) : rien ne doit empecher d'y
-- assigner un associe.
-- ---------------------------------------------------------------------
insert into agenda.shift_types (name, time_range, is_active, sort_order)
values ('J6 Beaune', '08:00-14:00', true, 19);

-- ---------------------------------------------------------------------
-- 2. Salle par defaut  << BLOC RETIRABLE >>
--
-- DEDUCTION, a lire avant d'executer. Les creneaux Beaune prennent une
-- salle par defaut distincte, dans leur ordre de creation :
--   J4 Beaune -> Salle 3, J7 Beaune -> Salle 4, J8 Beaune -> Salle 5.
-- Salle 6 est la seule salle de Beaune que plus aucun creneau ne prend
-- par defaut depuis la suppression. J6 Beaune la prenait donc tres
-- probablement -- mais ce n'est pas prouve.
--
-- Retirer ce bloc laisse default_room_id a NULL, ce qui est sans danger :
-- la colonne est nullable et la valeur ne sert qu'a prefixer le
-- formulaire de creation de garde.
--
-- La salle est retrouvee par son nom et son site, pas par un identifiant
-- en dur : un id copie dans un script vieillit mal.
-- ---------------------------------------------------------------------
update agenda.shift_types t
   set default_room_id = r.id
  from agenda.rooms r
  join agenda.sites s on s.id = r.site_id
 where t.name = 'J6 Beaune'
   and s.name = 'Beaune'
   and r.name = 'Salle 6';

-- =====================================================================
-- Controle
--
--   select t.name, t.time_range, t.is_active, t.sort_order, r.name as salle
--     from agenda.shift_types t
--     left join agenda.rooms r on r.id = t.default_room_id
--    where t.name = 'J6 Beaune';
--   -- attendu : J6 Beaune | 08:00-14:00 | true | 19 | Salle 6
--
--   -- et les 9 creneaux de Beaune sont de retour :
--   select count(*) from agenda.shift_types where name ilike '%beaune%';
--   -- attendu : 9
-- =====================================================================
