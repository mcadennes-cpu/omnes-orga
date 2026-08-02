-- =====================================================================
-- Etape 22 / MOD-1 / sous-etape 6H-1
-- Ouvrir les N prochaines semaines directement depuis le plan
--
-- CE QUE CELA REMPLACE
-- --------------------
-- Aujourd'hui, ouvrir des semaines demande : disposer d'une semaine de
-- reference bien formee, l'enregistrer comme « modele de semaine », puis
-- la dupliquer -- et uniquement sur un calendrier vide. Trois etapes et
-- une condition, alors que le plan de roulement decrit deja toutes les
-- cases des associes.
--
-- Il ne manquait qu'une chose au plan : les creneaux HORS ROULEMENT
-- (J5, J6, J7/J8 de Dijon), ceux qui vont aux remplacants. Le plan ne
-- les connait pas, et ne doit pas les connaitre -- rotation = associes,
-- demandes = remplacants. La fonction `creneaux_hors_plan` les deduit de
-- ce qui est ouvert d'habitude ; l'ecran les propose coches.
--
-- DEUX CONSTATS RELEVES DANS LES DONNEES (2026-08-02), qui fondent la
-- conception :
--
--   1. La salle se derive du creneau, sans exception. Sur les 367 gardes
--      couvertes par le plan des neuf dernieres semaines, 367 utilisent
--      `shift_types.default_room_id`. La premisse de 6B-3 se verifie.
--
--   2. L'habituel se separe de l'accidentel par la frequence. Onze cases
--      hors roulement reviennent 7 a 9 fois sur 9 semaines (donc chaque
--      semaine) ; quatre autres n'apparaissent qu'une ou deux fois, et ce
--      sont des accidents de saisie (un creneau de week-end pose un
--      mercredi). Un seuil a la moitie des semaines de reference les
--      separe proprement.
--
-- Idempotent : reexecutable sans dommage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les creneaux ouverts d'habitude que le plan ne couvre pas
--
-- Lecture seule. Sert a PRE-COCHER l'ecran, jamais a decider seule : une
-- deduction sur l'historique reproduirait fidelement une anomalie
-- passee. Le coordinateur garde la main, c'est la meme philosophie que
-- l'ecran de correspondance de 6E-3.
-- ---------------------------------------------------------------------
create or replace function agenda.creneaux_hors_plan(
  p_semaines_reference integer default 9
)
returns table (
  weekday        integer,
  site_id        uuid,
  site_nom       text,
  shift_type_id  uuid,
  creneau_nom    text,
  room_id        uuid,
  salle_nom      text,
  occurrences    bigint,
  habituel       boolean
)
language sql
stable
security definer
set search_path = agenda, public
as $$
  with reference as (
    -- Les semaines completes deja ouvertes, en remontant depuis la
    -- derniere garde generee (et non depuis aujourd'hui : le calendrier
    -- est ouvert en avance, la fenetre utile est a la fin).
    select s.*, extract(dow from s.date)::integer as jour
      from agenda.shifts s
     where s.date > (select max(date) from agenda.shifts)
                    - (p_semaines_reference * 7 - 1)
  ),
  couvert as (
    select distinct r.site_id, r.shift_type_id, r.weekday
      from agenda.rotation_plan_rules r
      join agenda.rotation_plans p on p.id = r.plan_id
     where p.status = 'active'
  )
  select sh.jour, sh.site_id, si.name, sh.shift_type_id, st.name,
         st.default_room_id, ro.name,
         count(*),
         count(*) >= ceil(p_semaines_reference / 2.0)
    from reference sh
    left join couvert c
           on c.site_id = sh.site_id
          and c.shift_type_id = sh.shift_type_id
          and c.weekday = sh.jour
    join agenda.sites si       on si.id = sh.site_id
    join agenda.shift_types st on st.id = sh.shift_type_id
    left join agenda.rooms ro  on ro.id = st.default_room_id
   where c.site_id is null
     and st.is_active
   group by sh.jour, sh.site_id, si.name, sh.shift_type_id, st.name,
            st.default_room_id, ro.name
   order by sh.jour, si.name, st.name;
$$;

revoke all on function agenda.creneaux_hors_plan(integer) from public, anon;
grant execute on function agenda.creneaux_hors_plan(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Ouvrir les semaines
--
-- `security invoker` -- volontairement, contrairement aux fonctions
-- d'import et d'activation. Celles-la devaient franchir un verrou (aucune
-- policy d'ecriture sur les plans) ; ici, les coordinateurs ont deja le
-- droit d'ecrire dans `shifts`. La fonction tourne donc sous les droits de
-- l'appelant et la RLS s'applique normalement : pas de privilege accorde
-- sans necessite.
--
-- Le gain de fond n'est pas seulement ergonomique. L'ancienne duplication
-- faisait UNE REQUETE D'EXISTENCE PAR CASE ET PAR JOUR -- environ 380
-- allers-retours enchaines pour 8 semaines -- alors qu'elle venait de
-- verifier que la periode etait vide. Ici tout tient en une insertion.
-- ---------------------------------------------------------------------
create or replace function agenda.ouvrir_semaines(
  p_debut              date,
  p_semaines           integer,
  p_hors_plan          jsonb default '[]'::jsonb,
  p_verifier_seulement boolean default false
)
returns jsonb
language plpgsql
set search_path = agenda, public
as $$
declare
  v_fin       date;
  v_existant  integer;
  v_cree      integer := 0;
  v_rapport   jsonb;
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

  v_fin := p_debut + (p_semaines * 7 - 1);

  -- Periode vide exigee, comme l'ancienne duplication : rouvrir par-dessus
  -- des gardes existantes ecraserait des affectations et des demandes en
  -- cours. Le message dit ou regarder.
  select count(*) into v_existant
    from agenda.shifts where date between p_debut and v_fin;

  if v_existant > 0 then
    raise exception
      'La periode du % au % contient deja % garde(s) : l''ouverture ne se fait que sur un calendrier vide',
      p_debut, v_fin, v_existant;
  end if;

  -- --- Les cases a creer -------------------------------------------------
  drop table if exists tmp_ouverture;
  create temporary table tmp_ouverture (
    date          date,
    site_id       uuid,
    room_id       uuid,
    shift_type_id uuid,
    doctor_id     uuid,
    origine       text
  ) on commit drop;

  -- a) Les cases du plan. Chaque jour resout SON plan : une periode a
  --    cheval sur deux roulements applique le bon de part et d'autre.
  --    La semaine de rotation reprend exactement l'arithmetique de
  --    getRotationWeek() cote code -- lundi de la semaine visee, ecart en
  --    semaines depuis l'ancrage, modulo le cycle, +1.
  insert into tmp_ouverture (date, site_id, room_id, shift_type_id, doctor_id, origine)
  select j.jour, r.site_id, st.default_room_id, r.shift_type_id, r.doctor_id, 'plan'
    from generate_series(p_debut, v_fin, interval '1 day') as j(jour)
    join agenda.rotation_plans p
      on p.id = agenda.plan_applicable(j.jour::date)
    join agenda.rotation_plan_rules r
      on r.plan_id = p.id
     and r.weekday = extract(dow from j.jour)::integer
     and r.rotation_week =
         ((((date_trunc('week', j.jour)::date - p.start_date) / 7)
           % p.cycle_length_weeks + p.cycle_length_weeks)
          % p.cycle_length_weeks) + 1
    join agenda.shift_types st on st.id = r.shift_type_id
   where st.is_active;

  -- b) Les creneaux hors roulement retenus a l'ecran, sans medecin : ce
  --    sont les cases des remplacants, que le circuit demandes traite.
  insert into tmp_ouverture (date, site_id, room_id, shift_type_id, doctor_id, origine)
  select j.jour, (e ->> 'site_id')::uuid, st.default_room_id,
         (e ->> 'shift_type_id')::uuid, null, 'hors_plan'
    from generate_series(p_debut, v_fin, interval '1 day') as j(jour)
    cross join lateral jsonb_array_elements(p_hors_plan) as e
    join agenda.shift_types st on st.id = (e ->> 'shift_type_id')::uuid
   where (e ->> 'weekday')::integer = extract(dow from j.jour)::integer
     and st.is_active;

  select jsonb_build_object(
           'debut', p_debut, 'fin', v_fin, 'semaines', p_semaines,
           'total', count(*),
           'affectees', count(*) filter (where doctor_id is not null),
           'libres', count(*) filter (where doctor_id is null),
           'depuis_le_plan', count(*) filter (where origine = 'plan'),
           'hors_plan', count(*) filter (where origine = 'hors_plan'))
    into v_rapport
    from tmp_ouverture;

  if p_verifier_seulement then
    return v_rapport || jsonb_build_object('ok', true, 'ecrit', false);
  end if;

  if (v_rapport ->> 'total')::integer = 0 then
    raise exception
      'Aucune case a ouvrir sur cette periode : verifier qu''un plan de roulement y est en vigueur';
  end if;

  -- --- L'insertion, en une seule fois -----------------------------------
  -- Les colonnes texte (location, room, shift_type) sont `not null` et
  -- doublent les identifiants : heritage de l'ancienne base, alimente ici
  -- comme le faisait la duplication de modele.
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

comment on function agenda.ouvrir_semaines(date, integer, jsonb, boolean) is
  'Ouvre N semaines a partir d''un lundi : les cases du plan de roulement en '
  'vigueur (medecin pre-affecte) plus les creneaux hors roulement choisis. '
  'p_verifier_seulement produit le rapport sans ecrire.';

-- ---------------------------------------------------------------------
-- 3. Verifications
-- ---------------------------------------------------------------------
select 'creneaux hors plan deduits' as controle,
       count(*) as cases,
       count(*) filter (where habituel) as habituelles
  from agenda.creneaux_hors_plan(9);
