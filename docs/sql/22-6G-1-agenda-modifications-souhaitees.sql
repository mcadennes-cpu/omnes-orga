-- =====================================================================
-- Etape 22 / MOD-1 / sous-etape 6G-1
-- Les modifications souhaitees du roulement
--
-- LA CONTREPARTIE DU VERROU
-- -------------------------
-- Depuis 6B, l'application n'ecrit plus jamais le plan de roulement :
-- c'est le fichier qui fait foi. Le principe est juste, mais il ne tient
-- au quotidien que si Charlotte dispose d'un CHEMIN DE RETOUR vers le
-- fichier. Sans lui, le moindre ajustement permanent demanderait de
-- rouvrir Numbers seance tenante -- et le verrou finirait contourne,
-- exactement comme la double verite qu'on vient d'eliminer.
--
-- Elle enregistre donc le souhait DEPUIS LA GARDE, au moment ou elle le
-- constate. Un ecran les recapitule, elle les reporte dans le fichier
-- quand elle le decide, et l'import suivant les rend effectifs.
--
-- ⚠ CE N'EST PAS UNE FILE D'ATTENTE D'ECRITURE. Rien ici ne modifie le
-- plan, jamais, meme apres report. C'est un carnet de notes structure :
-- la seule facon de changer le roulement reste le fichier, puis 6E.
--
-- POURQUOI LA BASE TRADUIT LA GARDE EN CASE DE ROULEMENT
-- ------------------------------------------------------
-- « La garde du lundi 18/01/2027 » doit devenir « S3 · lundi · J2 Dijon »
-- pour etre reportable dans le fichier. Ce calcul -- plan applicable a la
-- date, puis semaine de rotation -- est celui qui a produit les defauts
-- les plus subtils de MOD-1. Il vit deja dans `ouvrir_semaines` et dans
-- `getRotationWeek` cote code ; on ne l'ecrira pas une troisieme fois
-- dans un composant React. La fonction le fait, une bonne fois.
--
-- Idempotent : reexecutable sans dommage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La table
--
-- La case du roulement est DENORMALISEE (semaine, jour, site, creneau) :
-- elle doit survivre a la suppression de la garde d'origine, qui n'est
-- que le pretexte de la saisie. `shift_id` garde le lien quand il existe,
-- en `on delete set null`.
--
-- `plan_id` enregistre le plan EN VIGUEUR AU MOMENT DU SOUHAIT : sans
-- lui, une modification notee sous le V1 deviendrait illisible une fois
-- le V2 en place -- « S3 lundi » ne designe pas la meme chose d'un plan
-- a l'autre.
-- ---------------------------------------------------------------------
create table if not exists agenda.rotation_plan_changes (
  id            uuid primary key default gen_random_uuid(),

  plan_id       uuid not null references agenda.rotation_plans(id) on delete cascade,
  shift_id      uuid references agenda.shifts(id) on delete set null,

  -- La case visee, en termes de roulement.
  rotation_week integer not null,
  weekday       integer not null,
  site_id       uuid not null references agenda.sites(id)       on delete restrict,
  shift_type_id uuid not null references agenda.shift_types(id) on delete restrict,

  -- Qui le plan y place aujourd'hui, et qui devrait y etre.
  -- NULL du cote souhaite = « personne » (fermer la case du roulement).
  doctor_actuel_id   uuid references public.profiles(id) on delete set null,
  doctor_souhaite_id uuid references public.profiles(id) on delete set null,

  note        text,
  status      text not null default 'pending',

  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  reported_at timestamptz,
  reported_by uuid references public.profiles(id) on delete set null,

  constraint rotation_plan_changes_statut_valide
    check (status in ('pending', 'reported', 'abandoned')),

  constraint rotation_plan_changes_weekday_valide
    check (weekday between 0 and 6),

  constraint rotation_plan_changes_semaine_positive
    check (rotation_week >= 1),

  -- Un souhait qui ne change rien n'a pas lieu d'etre.
  constraint rotation_plan_changes_utile
    check (doctor_actuel_id is distinct from doctor_souhaite_id)
);

-- Une seule modification EN ATTENTE par case : reenregistrer sur la meme
-- case remplace le souhait precedent plutot que d'empiler des doublons.
-- Index partiel -- les modifications reportees ou abandonnees restent en
-- historique et n'entrent pas dans la contrainte.
create unique index if not exists rotation_plan_changes_une_par_case
  on agenda.rotation_plan_changes
     (plan_id, rotation_week, weekday, site_id, shift_type_id)
  where status = 'pending';

create index if not exists rotation_plan_changes_a_reporter_idx
  on agenda.rotation_plan_changes (plan_id, status);

drop trigger if exists set_rotation_plan_changes_updated_at
  on agenda.rotation_plan_changes;
create trigger set_rotation_plan_changes_updated_at
  before update on agenda.rotation_plan_changes
  for each row execute function agenda.set_updated_at();

comment on table agenda.rotation_plan_changes is
  'Modifications du roulement souhaitees par la coordination, a reporter dans le '
  'fichier avant le prochain import. Ne modifie jamais le plan : c''est un carnet, '
  'pas une file d''ecriture.';

-- ---------------------------------------------------------------------
-- 2. RLS -- lecture et ecriture pour les coordinateurs
--
-- Contrairement aux plans, cette table N'EST PAS verrouillee : c'est un
-- carnet de travail de la coordination, pas la verite du roulement. Rien
-- de ce qu'on y ecrit ne peut deriver -- le plan reste hors d'atteinte.
-- ---------------------------------------------------------------------
alter table agenda.rotation_plan_changes enable row level security;

drop policy if exists "Lire les modifications souhaitees"     on agenda.rotation_plan_changes;
drop policy if exists "Creer une modification souhaitee"      on agenda.rotation_plan_changes;
drop policy if exists "Modifier une modification souhaitee"   on agenda.rotation_plan_changes;
drop policy if exists "Supprimer une modification souhaitee"  on agenda.rotation_plan_changes;

create policy "Lire les modifications souhaitees"
  on agenda.rotation_plan_changes for select
  to authenticated using (agenda.est_coordinateur());

create policy "Creer une modification souhaitee"
  on agenda.rotation_plan_changes for insert
  to authenticated with check (agenda.est_coordinateur());

create policy "Modifier une modification souhaitee"
  on agenda.rotation_plan_changes for update
  to authenticated using (agenda.est_coordinateur());

create policy "Supprimer une modification souhaitee"
  on agenda.rotation_plan_changes for delete
  to authenticated using (agenda.est_coordinateur());

revoke all on agenda.rotation_plan_changes from authenticated;
grant select, insert, update, delete on agenda.rotation_plan_changes to authenticated;

-- ---------------------------------------------------------------------
-- 3. Enregistrer un souhait depuis une garde
--
-- L'appelant fournit la garde et le medecin souhaite. La fonction en
-- deduit la case du roulement et le medecin que le plan y place.
-- ---------------------------------------------------------------------
create or replace function agenda.enregistrer_modification_souhaitee(
  p_shift_id           uuid,
  p_doctor_souhaite_id uuid,
  p_note               text default null
)
returns jsonb
language plpgsql
security definer
set search_path = agenda, public
as $$
declare
  v_shift    agenda.shifts;
  v_plan     agenda.rotation_plans;
  v_semaine  integer;
  v_weekday  integer;
  v_actuel   uuid;
  v_id       uuid;
begin
  if not agenda.est_coordinateur() then
    raise exception 'Enregistrement d''une modification souhaitee reserve aux coordinateurs';
  end if;

  select * into v_shift from agenda.shifts where id = p_shift_id;
  if v_shift.id is null then
    raise exception 'Garde introuvable';
  end if;

  select * into v_plan
    from agenda.rotation_plans where id = agenda.plan_applicable(v_shift.date);
  if v_plan.id is null then
    raise exception
      'Aucun plan de roulement en vigueur au % : cette garde ne correspond a aucune case du roulement',
      v_shift.date;
  end if;

  -- Meme arithmetique que `ouvrir_semaines` et que getRotationWeek().
  v_weekday := extract(dow from v_shift.date)::integer;
  v_semaine := ((((date_trunc('week', v_shift.date)::date - v_plan.start_date) / 7)
                 % v_plan.cycle_length_weeks + v_plan.cycle_length_weeks)
                % v_plan.cycle_length_weeks) + 1;

  -- Qui le PLAN place sur cette case -- et non qui tient la garde
  -- aujourd'hui : un remplacement ponctuel ne change pas le roulement,
  -- et c'est bien au roulement que le souhait s'adresse.
  select r.doctor_id into v_actuel
    from agenda.rotation_plan_rules r
   where r.plan_id       = v_plan.id
     and r.rotation_week = v_semaine
     and r.weekday       = v_weekday
     and r.site_id       = v_shift.site_id
     and r.shift_type_id = v_shift.shift_type_id
   limit 1;

  if v_actuel is not distinct from p_doctor_souhaite_id then
    raise exception
      'Le roulement place deja ce medecin sur cette case : il n''y a rien a reporter';
  end if;

  insert into agenda.rotation_plan_changes
    (plan_id, shift_id, rotation_week, weekday, site_id, shift_type_id,
     doctor_actuel_id, doctor_souhaite_id, note, created_by)
  values
    (v_plan.id, p_shift_id, v_semaine, v_weekday, v_shift.site_id, v_shift.shift_type_id,
     v_actuel, p_doctor_souhaite_id, nullif(trim(p_note), ''), (select auth.uid()))
  on conflict (plan_id, rotation_week, weekday, site_id, shift_type_id)
    where status = 'pending'
    do update set doctor_souhaite_id = excluded.doctor_souhaite_id,
                  doctor_actuel_id   = excluded.doctor_actuel_id,
                  note               = excluded.note,
                  shift_id           = excluded.shift_id,
                  updated_at         = now()
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'id', v_id,
    'plan', v_plan.name,
    'case', jsonb_build_object('semaine', v_semaine, 'weekday', v_weekday));
end;
$$;

revoke all on function agenda.enregistrer_modification_souhaitee(uuid, uuid, text)
  from public, anon;
grant execute on function agenda.enregistrer_modification_souhaitee(uuid, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 4. Le recapitulatif, pret a reporter dans le fichier
--
-- Rend la case en termes du FICHIER (« S3 », « Lundi », « J2 », le site a
-- part) et les medecins en initiales, parce que c'est ainsi que le
-- fichier de roulement s'ecrit. La derivation du code de creneau reprend
-- celle de la grille de 6D.
-- ---------------------------------------------------------------------
create or replace function agenda.modifications_souhaitees(
  p_status text default 'pending'
)
returns table (
  id             uuid,
  plan_nom       text,
  plan_id        uuid,
  rotation_week  integer,
  weekday        integer,
  jour_nom       text,
  site_nom       text,
  creneau_nom    text,
  creneau_code   text,
  actuel_nom     text,
  souhaite_nom   text,
  note           text,
  status         text,
  cree_le        timestamptz,
  cree_par       text
)
language plpgsql
stable
security definer
set search_path = agenda, public
as $$
begin
  -- ⚠ `security definer` contourne la policy de lecture : le controle doit
  -- donc etre explicite ici. Sans lui, n'importe quel medecin pouvait lire le
  -- carnet de la coordination -- qui elle souhaite deplacer, et pourquoi.
  -- Releve par le test de bout en bout, invisible a la relecture du code.
  if not agenda.est_coordinateur() then
    raise exception 'Consultation des modifications souhaitees reservee aux coordinateurs';
  end if;

  return query
  select c.id, p.name, p.id, c.rotation_week, c.weekday,
         (array['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'])[c.weekday + 1],
         si.name, st.name,
         trim(regexp_replace(
           regexp_replace(st.name, si.name, '', 'i'),
           '\d{1,2}\s*h\s*-\s*\d{1,2}\s*h', '', 'i')),
         pa.prenom || ' ' || pa.nom,
         ps.prenom || ' ' || ps.nom,
         c.note, c.status, c.created_at,
         pc.prenom || ' ' || pc.nom
    from agenda.rotation_plan_changes c
    join agenda.rotation_plans p on p.id = c.plan_id
    join agenda.sites si         on si.id = c.site_id
    join agenda.shift_types st   on st.id = c.shift_type_id
    left join public.profiles pa on pa.id = c.doctor_actuel_id
    left join public.profiles ps on ps.id = c.doctor_souhaite_id
    left join public.profiles pc on pc.id = c.created_by
   where c.status = p_status
   order by p.effective_from desc nulls last, c.rotation_week,
            case when c.weekday = 0 then 7 else c.weekday end,
            si.name, st.sort_order;
end;
$$;

revoke all on function agenda.modifications_souhaitees(text) from public, anon;
grant execute on function agenda.modifications_souhaitees(text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Verifications
-- ---------------------------------------------------------------------
select 'policies de la table' as controle, cmd, count(*) as n
  from pg_policies
 where schemaname = 'agenda' and tablename = 'rotation_plan_changes'
 group by cmd order by cmd;
