-- =====================================================================
-- Etape 22 / MOD-1 / sous-etape 6H-2
-- Jours feries et ouverture pilotee par une semaine type
--
-- POURQUOI CETTE REVISION, APRES 6H-1
-- ------------------------------------
-- Deux remarques de Matthieu (02/08/2026) ont mis au jour deux defauts.
--
-- 1. « Il y a 2 creneaux de WE1 le vendredi, a mon avis c'est un bug. »
--    Ce n'en etait pas un -- WE1 Beaune et WE1 Dijon sont deux creneaux
--    distincts -- mais le releve a revele bien pire. Les 18 gardes de
--    week-end posees en semaine tombent TOUTES sur un jour ferie :
--    Paques, 1er Mai, 8 Mai, Ascension, Pentecote, 14 Juillet, 11
--    Novembre, Noel, Jour de l'An. Neuf feries, zero exception.
--
--    Le cabinet traite un ferie comme un jour de week-end, et cela
--    REMPLACE la journee : le vendredi 18/12 porte 10 gardes, le
--    vendredi 25/12 en porte 2 (WE1 sur chaque site) et rien d'autre.
--
--    La deduction par frequence de 6H-1 avait classe ces cases en
--    « accidents de saisie ». C'etait faux : elle voyait « 2 fois sur 9
--    semaines » sans pouvoir comprendre pourquoi. Un chiffre sans cause
--    n'est pas un diagnostic.
--
-- 2. « Je trouverais ca plus simple de montrer un tableau avec une
--    semaine type d'ouverture. » Une liste de cases a cocher ne montre
--    pas ce qui sera FERME -- or c'est ce que Charlotte doit verifier.
--    Et le cabinet ouvre plus de creneaux l'hiver que l'ete : il y a
--    donc plusieurs semaines types, qu'il faut pouvoir reconnaitre.
--
-- CE QUE CELA CHANGE
-- ------------------
-- La separation devient franche, et c'est la bonne :
--     la SEMAINE TYPE dit quelles cases ouvrent (l'offre),
--     le PLAN DE ROULEMENT dit qui les occupe (l'affectation).
--
-- Les semaines types reutilisent `opening_week_templates`, qui existe
-- depuis l'origine et contient deja « Semaine type hiver » et « semaine
-- hiver WE non doublee ». Le concept etait juste, il lui manquait un
-- ecran qui le montre.
--
-- Idempotent : reexecutable sans dommage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les jours feries francais
--
-- Huit dates fixes et trois calees sur Paques. Le calcul de Paques est
-- l'algorithme gregorien anonyme (Meeus/Butcher) -- il n'existe pas de
-- table des feries en base, et en coder une reviendrait a la maintenir
-- chaque annee.
--
-- Alsace-Moselle a deux feries de plus ; le cabinet est en Cote-d'Or,
-- ils ne s'appliquent pas.
-- ---------------------------------------------------------------------
create or replace function agenda.paques(p_annee integer)
returns date
language sql
immutable
as $$
  with c as (
    select p_annee % 19 as a, p_annee / 100 as b, p_annee % 100 as c
  ), d as (
    select c.*, c.b / 4 as d, c.b % 4 as e, (c.b + 8) / 25 as f from c
  ), e as (
    select d.*, (d.b - d.f + 1) / 3 as g from d
  ), f as (
    select e.*, (19 * e.a + e.b - e.d - e.g + 15) % 30 as h,
           e.c / 4 as i, e.c % 4 as k from e
  ), g as (
    select f.*, (32 + 2 * f.e + 2 * f.i - f.h - f.k) % 7 as l from f
  ), h as (
    select g.*, (g.a + 11 * g.h + 22 * g.l) / 451 as m from g
  )
  select make_date(p_annee,
                   (h.h + h.l - 7 * h.m + 114) / 31,
                   ((h.h + h.l - 7 * h.m + 114) % 31) + 1)
    from h;
$$;

create or replace function agenda.jours_feries(p_annee integer)
returns table (jour date, nom text)
language sql
immutable
as $$
  select * from (values
    (make_date(p_annee, 1, 1),   'Jour de l''An'),
    (agenda.paques(p_annee) + 1, 'Lundi de Paques'),
    (make_date(p_annee, 5, 1),   'Fete du Travail'),
    (make_date(p_annee, 5, 8),   'Victoire 1945'),
    (agenda.paques(p_annee) + 39,'Ascension'),
    (agenda.paques(p_annee) + 50,'Lundi de Pentecote'),
    (make_date(p_annee, 7, 14),  'Fete nationale'),
    (make_date(p_annee, 8, 15),  'Assomption'),
    (make_date(p_annee, 11, 1),  'Toussaint'),
    (make_date(p_annee, 11, 11), 'Armistice 1918'),
    (make_date(p_annee, 12, 25), 'Noel')
  ) as f(jour, nom)
  order by 1;
$$;

revoke all on function agenda.jours_feries(integer) from public, anon;
grant execute on function agenda.jours_feries(integer) to authenticated;

-- Les feries d'une periode, pour l'ecran comme pour la generation.
create or replace function agenda.feries_entre(p_debut date, p_fin date)
returns table (jour date, nom text)
language sql
stable
as $$
  select f.jour, f.nom
    from generate_series(extract(year from p_debut)::integer,
                         extract(year from p_fin)::integer) as a(annee),
         lateral agenda.jours_feries(a.annee) f
   where f.jour between p_debut and p_fin
   order by f.jour;
$$;

revoke all on function agenda.feries_entre(date, date) from public, anon;
grant execute on function agenda.feries_entre(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 1bis. Le jour ferie devient une colonne de la semaine type
--
-- Premiere tentative : « un ferie ouvre les creneaux du DIMANCHE ». Le
-- test l'a invalidee -- elle produisait 5 gardes sur le lundi de Paques
-- (WE1 des deux sites, les deux doublons WE2, et le vestige J3 Dijon),
-- la ou les 9 feries releves en base n'en portent que 2 : WE1 sur chaque
-- site, jamais de doublon.
--
-- Plutot que de deviner une regle (« WE1 oui, WE2 non ») qui serait a
-- redecouvrir a chaque evolution des creneaux, le ferie devient une
-- COLONNE de la grille, reglee par la coordinatrice. `weekday = 7` la
-- porte -- valeur libre dans les deux conventions de jour du module.
-- ---------------------------------------------------------------------
alter table agenda.opening_week_template_items
  drop constraint if exists opening_week_template_items_weekday_check;

alter table agenda.opening_week_template_items
  add constraint opening_week_template_items_weekday_check
  check (weekday between 0 and 7);

comment on column agenda.opening_week_template_items.weekday is
  '0 = lundi .. 6 = dimanche (convention heritee), 7 = jour ferie. '
  'Attention : rotation_plan_rules.weekday utilise 0 = dimanche.';

-- ---------------------------------------------------------------------
-- 1ter. Ce qu'un jour ferie ouvre d'habitude
--
-- Deduit des feries PASSES, et pris a la MAJORITE, pas en union : sur
-- les 12 feries presents en base, 11 portent exactement WE1 sur chaque
-- site, mais le Jour de l'An 2026 -- le plus ancien, anterieur a la
-- pratique actuelle -- a ete ouvert comme une journee ordinaire (8
-- creneaux). L'union ferait revivre ce cas unique a chaque ferie.
--
-- Fonction a part, et non sous-requete : imbriquee dans `semaine_type`,
-- la version correlee relancait le calcul des feries pour chaque ligne
-- de `shifts` et depassait le delai d'execution.
-- ---------------------------------------------------------------------
create or replace function agenda.creneaux_ferie_habituels()
returns table (site_id uuid, shift_type_id uuid)
language sql
stable
security definer
set search_path = agenda, public
as $$
  with bornes as (
    select min(date) as debut, max(date) as fin from agenda.shifts
  ),
  feries as (
    select f.jour from bornes b, lateral agenda.feries_entre(b.debut, b.fin) f
  ),
  gardes as (
    select s.site_id, s.shift_type_id, s.date
      from agenda.shifts s join feries f on f.jour = s.date
  )
  select g.site_id, g.shift_type_id
    from gardes g
   group by g.site_id, g.shift_type_id
  having count(distinct g.date)
         >= (select ceil(count(distinct date) / 2.0) from gardes);
$$;

revoke all on function agenda.creneaux_ferie_habituels() from public, anon;
grant execute on function agenda.creneaux_ferie_habituels() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Une semaine type, sous la forme que l'ecran affiche
--
-- Convention de jour : 0 = dimanche, comme `rotation_plan_rules` et
-- comme Date.getDay(). ⚠ `opening_week_template_items` utilise l'AUTRE
-- convention (0 = lundi), heritee de l'ancienne application. La
-- conversion se fait ici, une fois, plutot que dans chaque appelant --
-- c'est exactement le genre d'ecart qui produit un decalage d'un jour
-- passe inapercu.
--
-- `couvert_par_le_plan` distingue les cases que le roulement occupe de
-- celles qui reviennent aux remplacants. L'ecran verrouille les
-- premieres : ne pas les ouvrir priverait un associe de sa garde.
-- ---------------------------------------------------------------------
create or replace function agenda.semaine_type(p_template_id uuid)
returns table (
  weekday             integer,
  site_id             uuid,
  site_nom            text,
  shift_type_id       uuid,
  creneau_nom         text,
  salle_nom           text,
  ouvert              boolean,
  couvert_par_le_plan boolean
)
language sql
stable
security definer
set search_path = agenda, public
as $$
  with cases as (
    -- Toutes les combinaisons (jour, site, creneau) qui existent soit
    -- dans la semaine type, soit dans le plan en vigueur : l'ecran doit
    -- montrer les deux, y compris une case du plan absente du modele.
    -- (0 = lundi) -> (0 = dimanche) : lundi 0->1, samedi 5->6, dimanche 6->0.
    -- 7 (jour ferie) traverse sans conversion.
    select case when i.weekday = 7 then 7 else (i.weekday + 1) % 7 end as weekday,
           i.site_id, i.shift_type_id, bool_or(i.is_open) as ouvert
      from agenda.opening_week_template_items i
     where i.template_id = p_template_id
     group by 1, 2, 3
    union
    select r.weekday, r.site_id, r.shift_type_id, true
      from agenda.rotation_plan_rules r
      join agenda.rotation_plans p on p.id = r.plan_id
     where p.status = 'active'
       and (p.effective_to is null or p.effective_to >= current_date)
    union
    -- Le jour ferie, quand le modele n'en porte pas encore : ce que les
    -- feries passes montrent, plutot qu'une regle inventee.
    select 7, v.site_id, v.shift_type_id, true
      from agenda.creneaux_ferie_habituels() v
     where not exists (select 1 from agenda.opening_week_template_items i
                        where i.template_id = p_template_id and i.weekday = 7)
  ),
  fusion as (
    select weekday, site_id, shift_type_id, bool_or(ouvert) as ouvert
      from cases group by 1, 2, 3
  ),
  plan as (
    select distinct r.site_id, r.shift_type_id, r.weekday
      from agenda.rotation_plan_rules r
      join agenda.rotation_plans p on p.id = r.plan_id
     where p.status = 'active'
       and (p.effective_to is null or p.effective_to >= current_date)
  )
  select f.weekday, f.site_id, si.name, f.shift_type_id, st.name, ro.name,
         f.ouvert,
         exists (select 1 from plan pl
                  where pl.site_id = f.site_id
                    and pl.shift_type_id = f.shift_type_id
                    and pl.weekday = f.weekday)
    from fusion f
    join agenda.sites si       on si.id = f.site_id
    join agenda.shift_types st on st.id = f.shift_type_id
    left join agenda.rooms ro  on ro.id = st.default_room_id
   where st.is_active
   order by si.name, st.sort_order, f.weekday;
$$;

revoke all on function agenda.semaine_type(uuid) from public, anon;
grant execute on function agenda.semaine_type(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Ouvrir des semaines -- version pilotee par la semaine type
--
-- Remplace la signature de 6H-1 : `p_hors_plan` (le complement) devient
-- `p_ouvertures` (l'offre complete). La semaine type dit ce qui ouvre,
-- le plan dit qui l'occupe.
--
-- LES JOURS FERIES sont traites a part : la journee prend la colonne
-- « Ferie » de la semaine type (weekday 7), et les gardes restent
-- LIBRES. Le roulement ne couvre pas les feries -- il n'en a aucune
-- notion -- et les deux derniers releves en base (25/12 et 01/01) sont
-- effectivement sans affectation. Les attribuer d'office reviendrait a
-- inventer une regle que le cabinet n'a jamais posee.
-- ---------------------------------------------------------------------
drop function if exists agenda.ouvrir_semaines(date, integer, jsonb, boolean);

create or replace function agenda.ouvrir_semaines(
  p_debut              date,
  p_semaines           integer,
  p_ouvertures         jsonb,
  p_verifier_seulement boolean default false
)
returns jsonb
language plpgsql
set search_path = agenda, public
as $$
declare
  v_fin      date;
  v_existant integer;
  v_cree     integer := 0;
  v_rapport  jsonb;
begin
  if not agenda.est_coordinateur() then
    raise exception 'Ouverture de semaines reservee aux coordinateurs';
  end if;

  if extract(dow from p_debut) <> 1 then
    raise exception 'L''ouverture doit commencer un lundi (% n''en est pas un)', p_debut;
  end if;

  if p_semaines is null or p_semaines < 1 or p_semaines > 52 then
    raise exception 'Nombre de semaines invalide : % (attendu entre 1 et 52)', p_semaines;
  end if;

  if jsonb_typeof(p_ouvertures) <> 'array' or jsonb_array_length(p_ouvertures) = 0 then
    raise exception 'Aucune case a ouvrir : la semaine type est vide';
  end if;

  v_fin := p_debut + (p_semaines * 7 - 1);

  select count(*) into v_existant
    from agenda.shifts where date between p_debut and v_fin;
  if v_existant > 0 then
    raise exception
      'La periode du % au % contient deja % garde(s) : l''ouverture ne se fait que sur un calendrier vide',
      p_debut, v_fin, v_existant;
  end if;

  drop table if exists tmp_ouverture;
  create temporary table tmp_ouverture (
    date date, site_id uuid, room_id uuid, shift_type_id uuid,
    doctor_id uuid, ferie text
  ) on commit drop;

  -- a) Les jours ORDINAIRES : les cases de la semaine type, avec le
  --    medecin que le plan du jour designe (le cas echeant).
  insert into tmp_ouverture (date, site_id, room_id, shift_type_id, doctor_id, ferie)
  select j.jour::date, (o ->> 'site_id')::uuid, st.default_room_id,
         (o ->> 'shift_type_id')::uuid, r.doctor_id, null
    from generate_series(p_debut, v_fin, interval '1 day') as j(jour)
    cross join lateral jsonb_array_elements(p_ouvertures) as o
    join agenda.shift_types st on st.id = (o ->> 'shift_type_id')::uuid
    left join agenda.rotation_plans p on p.id = agenda.plan_applicable(j.jour::date)
    left join agenda.rotation_plan_rules r
           on r.plan_id       = p.id
          and r.site_id       = (o ->> 'site_id')::uuid
          and r.shift_type_id = (o ->> 'shift_type_id')::uuid
          and r.weekday       = extract(dow from j.jour)::integer
          and r.rotation_week =
              ((((date_trunc('week', j.jour)::date - p.start_date) / 7)
                % p.cycle_length_weeks + p.cycle_length_weeks)
               % p.cycle_length_weeks) + 1
   where (o ->> 'weekday')::integer = extract(dow from j.jour)::integer
     and st.is_active
     and not exists (select 1 from agenda.feries_entre(p_debut, v_fin) f
                      where f.jour = j.jour::date);

  -- b) Les jours FERIES : la colonne « Ferie » de la grille, sans
  --    affectation.
  insert into tmp_ouverture (date, site_id, room_id, shift_type_id, doctor_id, ferie)
  select f.jour, (o ->> 'site_id')::uuid, st.default_room_id,
         (o ->> 'shift_type_id')::uuid, null, f.nom
    from agenda.feries_entre(p_debut, v_fin) f
    cross join lateral jsonb_array_elements(p_ouvertures) as o
    join agenda.shift_types st on st.id = (o ->> 'shift_type_id')::uuid
   where (o ->> 'weekday')::integer = 7        -- la colonne « Ferie »
     and st.is_active;

  select jsonb_build_object(
           'debut', p_debut, 'fin', v_fin, 'semaines', p_semaines,
           'total', count(*),
           'affectees', count(*) filter (where doctor_id is not null),
           'libres', count(*) filter (where doctor_id is null),
           'sur_feries', count(*) filter (where ferie is not null),
           'feries', (select coalesce(jsonb_agg(jsonb_build_object('jour', jour, 'nom', nom)
                                                order by jour), '[]'::jsonb)
                        from agenda.feries_entre(p_debut, v_fin)))
    into v_rapport
    from tmp_ouverture;

  if p_verifier_seulement then
    return v_rapport || jsonb_build_object('ok', true, 'ecrit', false);
  end if;

  if (v_rapport ->> 'total')::integer = 0 then
    raise exception 'Aucune case a ouvrir sur cette periode';
  end if;

  insert into agenda.shifts
    (date, location, room, shift_type, status,
     site_id, room_id, shift_type_id, assigned_doctor_id, created_by)
  select t.date, si.name, coalesce(ro.name, 'Inconnue'),
         coalesce(nullif(st.time_range, ''), st.name),
         case when t.doctor_id is null then 'free' else 'assigned' end,
         t.site_id, t.room_id, t.shift_type_id, t.doctor_id, (select auth.uid())
    from tmp_ouverture t
    join agenda.sites si       on si.id = t.site_id
    join agenda.shift_types st on st.id = t.shift_type_id
    left join agenda.rooms ro  on ro.id = t.room_id;

  get diagnostics v_cree = row_count;
  return v_rapport || jsonb_build_object('ok', true, 'ecrit', true, 'creees', v_cree);
end;
$$;

revoke all on function agenda.ouvrir_semaines(date, integer, jsonb, boolean) from public, anon;
grant execute on function agenda.ouvrir_semaines(date, integer, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Enregistrer une semaine type depuis la grille de l'ecran
-- ---------------------------------------------------------------------
create or replace function agenda.enregistrer_semaine_type(
  p_nom        text,
  p_ouvertures jsonb
)
returns uuid
language plpgsql
security definer
set search_path = agenda, public
as $$
declare
  v_id uuid;
begin
  if not agenda.est_coordinateur() then
    raise exception 'Enregistrement d''une semaine type reserve aux coordinateurs';
  end if;
  if coalesce(trim(p_nom), '') = '' then
    raise exception 'La semaine type doit porter un nom';
  end if;

  insert into agenda.opening_week_templates (name, created_by)
  values (trim(p_nom), (select auth.uid()))
  returning id into v_id;

  -- Retour a la convention 0 = lundi de la table d'origine.
  insert into agenda.opening_week_template_items
    (template_id, weekday, site_id, room_id, shift_type_id, is_open)
  select v_id,
         case when (o ->> 'weekday')::integer = 7 then 7
              when (o ->> 'weekday')::integer = 0 then 6
              else (o ->> 'weekday')::integer - 1 end,
         (o ->> 'site_id')::uuid, st.default_room_id,
         (o ->> 'shift_type_id')::uuid, true
    from jsonb_array_elements(p_ouvertures) as o
    join agenda.shift_types st on st.id = (o ->> 'shift_type_id')::uuid;

  return v_id;
end;
$$;

revoke all on function agenda.enregistrer_semaine_type(text, jsonb) from public, anon;
grant execute on function agenda.enregistrer_semaine_type(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Verifications -- les feries calcules face aux 9 releves en base
-- ---------------------------------------------------------------------
with observes (jour) as (
  values (date '2026-04-06'), (date '2026-05-01'), (date '2026-05-08'),
         (date '2026-05-14'), (date '2026-05-25'), (date '2026-07-14'),
         (date '2026-11-11'), (date '2026-12-25'), (date '2027-01-01')
)
select 'feries calcules vs observes' as controle,
       count(*) as observes,
       count(*) filter (where exists (select 1 from agenda.feries_entre(o.jour, o.jour))) as reconnus
  from observes o;
