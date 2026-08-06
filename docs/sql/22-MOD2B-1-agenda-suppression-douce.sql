-- =====================================================================
-- Etape 22 / MOD2-B : suppression douce des gardes et des series
--
-- Supprimer cesse d'effacer : la ligne reste, marquee d'un deleted_at.
-- Restaurer devient trivial (MOD2-D) et surtout SANS RISQUE : une
-- reinsertion apres DELETE recree un identifiant neuf et casse les liens
-- vers les demandes et la serie -- c'est exactement ce qui avait rendu la
-- reparation de l'incident du 29/07 partielle.
--
-- Ce script fait quatre choses, dans cet ordre :
--   1. les colonnes deleted_at ;
--   2. la contrainte unique_shift convertie en index PARTIEL ;
--   3. les policies RLS, qui portent tout le filtrage ;
--   4. les fonctions security definer, que la RLS ne protege PAS.
--
-- A executer une seule fois sur le projet ydihrgnixthrraprclox.
-- Suppose MOD2-A deja passee (le journal enregistre les suppressions
-- douces comme des UPDATE, avec l'etat d'avant et d'apres).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les colonnes
-- ---------------------------------------------------------------------

alter table agenda.shifts            add column deleted_at timestamptz;
alter table agenda.fixed_duty_series add column deleted_at timestamptz;

comment on column agenda.shifts.deleted_at is
  'Suppression douce : non nul = garde supprimee. Filtree par la policy de lecture, donc invisible du module sans qu''aucune requete n''ait a le demander.';

comment on column agenda.fixed_duty_series.deleted_at is
  'Suppression douce de la serie. Supprimer une serie effacait jusqu''ici sa definition en plus de ses gardes, sans laisser de trace.';

-- ---------------------------------------------------------------------
-- 2. unique_shift devient un index partiel
--
-- ⚠ LE POINT QUI REND LE RESTE POSSIBLE.
-- La contrainte portait sur (date, location, room, shift_type). Avec un
-- deleted_at et rien d'autre, une garde supprimee CONTINUERAIT d'occuper
-- son creneau : le coordinateur ne pourrait plus en recreer une au meme
-- endroit le meme jour. Le bug n'apparaitrait qu'au premier « je
-- supprime puis je recree » en usage reel.
--
-- Une contrainte UNIQUE ne peut pas etre partielle en SQL ; un index
-- unique, si. On perd le nom de contrainte, on garde la garantie -- sur
-- les seules lignes vivantes.
--
-- Verifie avant d'ecrire ce script : aucun upsert du module ni aucune
-- fonction SQL ne s'appuie sur unique_shift (le seul onConflict du
-- module porte sur undo_buffer.user_id). Un ON CONFLICT infere par
-- PostgREST aurait casse ici, un index partiel n'etant pas inferable.
-- ---------------------------------------------------------------------

alter table agenda.shifts drop constraint unique_shift;

create unique index unique_shift
  on agenda.shifts (date, location, room, shift_type)
  where deleted_at is null;

-- ---------------------------------------------------------------------
-- 3. Les policies RLS
--
-- POURQUOI FILTRER ICI ET NON DANS LES REQUETES
-- Le filtre applicatif (.is('deleted_at', null)) demanderait de modifier
-- une quarantaine de requetes reparties dans le module, avec la
-- certitude d'en oublier une -- et un oubli se verrait comme une garde
-- fantome dans le planning. Exprime une fois dans la policy de lecture,
-- le module ne voit tout simplement plus les lignes supprimees, sans
-- qu'on touche a une seule requete.
--
-- ⚠ LE PIEGE DU WITH CHECK
-- Les policies UPDATE d'origine n'ont pas de WITH CHECK : PostgreSQL
-- reutilise alors l'expression USING pour valider la ligne APRES
-- modification. Si on se contentait d'ajouter « deleted_at is null » a
-- USING, la suppression douce elle-meme serait rejetee -- la nouvelle
-- ligne ayant justement un deleted_at non nul. Il faut donc un WITH
-- CHECK explicite, qui ne parle pas de deleted_at.
--
-- Effet de bord voulu : USING portant sur la ligne d'AVANT, une ligne
-- deja supprimee n'est plus modifiable. La restauration ne peut donc pas
-- passer par le module -- elle passera par restaurer_action() en
-- security definer (MOD2-D). C'est le comportement souhaite : on ne
-- ressuscite pas une garde par un PATCH, mais par une porte qui verifie
-- d'abord que l'etat le permet encore.
-- ---------------------------------------------------------------------

drop policy "Lecture du planning" on agenda.shifts;
create policy "Lecture du planning" on agenda.shifts
  for select to authenticated
  using (agenda.peut_acceder() and deleted_at is null);

drop policy "Le coordinateur modifie les gardes" on agenda.shifts;
create policy "Le coordinateur modifie les gardes" on agenda.shifts
  for update to authenticated
  using (agenda.est_coordinateur() and deleted_at is null)
  with check (agenda.est_coordinateur());

drop policy "Le coordinateur lit les series" on agenda.fixed_duty_series;
create policy "Le coordinateur lit les series" on agenda.fixed_duty_series
  for select to authenticated
  using (agenda.est_coordinateur() and deleted_at is null);

drop policy "Le coordinateur modifie les series" on agenda.fixed_duty_series;
create policy "Le coordinateur modifie les series" on agenda.fixed_duty_series
  for update to authenticated
  using (agenda.est_coordinateur() and deleted_at is null)
  with check (agenda.est_coordinateur());

-- La suppression REELLE n'est plus permise a personne.
--
-- C'est le seul moyen de rendre la garantie effective : tant que le
-- DELETE reste ouvert, il suffit d'un chemin de code oublie pour perdre
-- une garde definitivement. Les quatre points de suppression du module
-- sont convertis en UPDATE dans le meme lot (y compris l'annulation de
-- « dupliquer un modele de semaine », qui supprimait les gardes creees).
--
-- Reste possible en service_role / postgres : migrations, script 7F,
-- menage administratif. C'est voulu.
drop policy "Le coordinateur supprime des gardes" on agenda.shifts;
drop policy "Le coordinateur supprime des series" on agenda.fixed_duty_series;

revoke delete on agenda.shifts            from authenticated;
revoke delete on agenda.fixed_duty_series from authenticated;

-- Une demande ne peut plus naitre sur une garde supprimee.
--
-- Sans cela, un medecin pourrait poster une demande citant l'identifiant
-- d'une garde qu'il ne voit plus : la verification de cle etrangere
-- s'execute avec les droits du proprietaire et ignore la RLS, et le
-- declencheur metier update_shift_status ferait alors repasser la garde
-- supprimee en « pending ». On ferme a la porte d'entree plutot que de
-- toucher a update_shift_status, coeur metier migre a iso-comportement.
drop policy "Un medecin cree sa propre demande" on agenda.requests;
create policy "Un medecin cree sa propre demande" on agenda.requests
  for insert to authenticated with check (
    agenda.peut_acceder()
    and doctor_id = (select auth.uid())
    and exists (select 1 from agenda.shifts s
                 where s.id = shift_id and s.deleted_at is null)
  );

drop policy "Le coordinateur cree une demande pour un medecin" on agenda.requests;
create policy "Le coordinateur cree une demande pour un medecin" on agenda.requests
  for insert to authenticated with check (
    agenda.est_coordinateur()
    and exists (select 1 from agenda.shifts s
                 where s.id = shift_id and s.deleted_at is null)
  );

-- ---------------------------------------------------------------------
-- 3 bis. Les deux portes de suppression
--
-- ⚠ POURQUOI UNE PORTE, ET NON UN SIMPLE UPDATE DEPUIS LE MODULE
-- Trouve en testant, pas en relisant : PostgreSQL applique la policy de
-- LECTURE a la ligne d'APRES lors d'un UPDATE. Une ligne ne peut pas
-- sortir de sa propre visibilite -- c'est une protection deliberee du
-- moteur (sans elle, on pourrait faire disparaitre une ligne de la vue
-- d'autrui a volonte). Or notre policy de lecture masque justement les
-- gardes supprimees : elle interdit donc de les supprimer.
--
-- Assouplir la lecture pour contourner reviendrait a montrer les gardes
-- supprimees au coordinateur, et a devoir filtrer dans les ~40 requetes
-- du module -- exactement ce qu'on voulait eviter. On passe donc par
-- deux fonctions security definer, qui contournent la RLS par
-- construction. C'est la quatrieme et la cinquieme porte du module,
-- apres les trois du roulement (import, activation, suppression de
-- brouillon).
--
-- ISO-COMPORTEMENT ASSUME : ces fonctions verifient le role coordinateur
-- et rien d'autre -- exactement ce que faisait la policy DELETE qu'elles
-- remplacent. Le garde-fou « on ne supprime pas une garde attribuee ou
-- demandee » reste ou il est aujourd'hui, dans l'interface. Le
-- descendre en base est souhaitable mais releve d'une decision
-- fonctionnelle (que faire des gardes attribuees qui sortent d'une serie
-- raccourcie ?), pas d'un changement de stockage. A reprendre a part.
-- ---------------------------------------------------------------------

create or replace function agenda.supprimer_gardes(p_shift_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'agenda', 'public'
as $function$
declare
  v_supprimees integer;
begin
  if not agenda.est_coordinateur() then
    raise exception 'Suppression de gardes reservee aux coordinateurs';
  end if;

  update agenda.shifts
     set deleted_at = now(), updated_at = now()
   where id = any(p_shift_ids)
     and deleted_at is null;

  get diagnostics v_supprimees = row_count;
  return jsonb_build_object('ok', true, 'supprimees', v_supprimees);
end;
$function$;

comment on function agenda.supprimer_gardes(uuid[]) is
  'Suppression douce d''une ou plusieurs gardes. Passe par une fonction car la policy de lecture, qui masque les gardes supprimees, interdit a un UPDATE de rendre une ligne invisible.';

create or replace function agenda.supprimer_serie(p_series_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'agenda', 'public'
as $function$
declare
  v_supprimees integer;
begin
  if not agenda.est_coordinateur() then
    raise exception 'Suppression de series reservee aux coordinateurs';
  end if;

  update agenda.shifts
     set deleted_at = now(), updated_at = now()
   where series_id = p_series_id
     and deleted_at is null;
  get diagnostics v_supprimees = row_count;

  update agenda.fixed_duty_series
     set deleted_at = now()
   where id = p_series_id
     and deleted_at is null;

  return jsonb_build_object('ok', true, 'supprimees', v_supprimees);
end;
$function$;

comment on function agenda.supprimer_serie(uuid) is
  'Suppression douce d''une serie et de toutes ses gardes. La definition de la serie survit desormais a sa suppression -- elle etait effacee sans trace.';

revoke all on function agenda.supprimer_gardes(uuid[]) from public, anon;
revoke all on function agenda.supprimer_serie(uuid)   from public, anon;
grant execute on function agenda.supprimer_gardes(uuid[]) to authenticated;
grant execute on function agenda.supprimer_serie(uuid)    to authenticated;

-- ---------------------------------------------------------------------
-- 4. Les fonctions SECURITY DEFINER
--
-- ⚠ LA RLS NE LES PROTEGE PAS. Une fonction security definer s'execute
-- avec les droits de son proprietaire et contourne les policies : le
-- filtre pose en section 3 leur est invisible. Chacune doit donc exclure
-- les lignes supprimees explicitement. C'est le meme angle mort qui
-- avait produit une fuite de lecture en 6G.
--
-- Inventaire etabli en interrogeant pg_proc, pas en relisant les
-- scripts : ouvrir_semaines est en security INVOKER (la RLS la couvre
-- donc, y compris son controle « la periode contient deja des gardes »),
-- update_shift_status est laissee telle quelle -- voir plus bas.
-- ---------------------------------------------------------------------

-- Les trois fonctions ci-dessous sont les definitions VIVANTES, reprises
-- telles quelles depuis pg_get_functiondef et modifiees par substitution
-- ciblee -- pas reecrites de memoire. Seules les lignes portant
-- « deleted_at is null » different de l'existant.

-- 4a. Les creneaux habituellement ouverts un jour ferie : une garde
--     supprimee ne doit pas compter comme une habitude du cabinet.
CREATE OR REPLACE FUNCTION agenda.creneaux_ferie_habituels()
 RETURNS TABLE(site_id uuid, shift_type_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'agenda', 'public'
AS $function$
  with bornes as (
    select min(date) as debut, max(date) as fin from agenda.shifts
     where deleted_at is null
  ),
  feries as (
    select f.jour from bornes b, lateral agenda.feries_entre(b.debut, b.fin) f
  ),
  gardes as (
    select s.site_id, s.shift_type_id, s.date
      from agenda.shifts s join feries f on f.jour = s.date
     where s.deleted_at is null
  )
  select g.site_id, g.shift_type_id
    from gardes g
   group by g.site_id, g.shift_type_id
  having count(distinct g.date)
         >= (select ceil(count(distinct date) / 2.0) from gardes);
$function$;

-- 4b. Les creneaux ouverts hors plan de roulement. Meme raison -- et la
--     borne « derniere garde generee » doit elle aussi ignorer les
--     supprimees, sinon la fenetre de reference se decale.
CREATE OR REPLACE FUNCTION agenda.creneaux_hors_plan(p_semaines_reference integer DEFAULT 9)
 RETURNS TABLE(weekday integer, site_id uuid, site_nom text, shift_type_id uuid, creneau_nom text, room_id uuid, salle_nom text, occurrences bigint, habituel boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'agenda', 'public'
AS $function$
  with reference as (
    -- Les semaines completes deja ouvertes, en remontant depuis la
    -- derniere garde generee (et non depuis aujourd'hui : le calendrier
    -- est ouvert en avance, la fenetre utile est a la fin).
    select s.*, extract(dow from s.date)::integer as jour
      from agenda.shifts s
     where s.deleted_at is null
       and s.date > (select max(date) from agenda.shifts where deleted_at is null)
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
$function$;

-- 4c. L'enregistrement d'une modification souhaitee du roulement (6G)
--     doit refuser une garde supprimee.
CREATE OR REPLACE FUNCTION agenda.enregistrer_modification_souhaitee(p_shift_id uuid, p_doctor_souhaite_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agenda', 'public'
AS $function$
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

  select * into v_shift from agenda.shifts where id = p_shift_id and deleted_at is null;
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
$function$;

-- 4d. update_shift_status : VOLONTAIREMENT NON MODIFIEE.
--     C'est le coeur metier migre a iso-comportement en 7C-2 ; le
--     toucher pour 7 instructions UPDATE porterait un risque sans
--     commune mesure avec le gain. Le seul chemin par lequel elle
--     pourrait reveiller une garde supprimee -- une demande creee sur
--     cette garde -- est ferme en section 3, a la porte d'entree.

-- =====================================================================
-- 5. Controles a passer apres execution
--
--   -- l'index partiel a bien remplace la contrainte
--   select indexdef from pg_indexes
--    where schemaname='agenda' and indexname='unique_shift';
--   -- attendu : ... WHERE (deleted_at IS NULL)
--
--   select conname from pg_constraint
--    where conrelid='agenda.shifts'::regclass and conname='unique_shift';
--   -- attendu : aucune ligne
--
--   -- plus aucune policy ni aucun droit de suppression
--   select tablename, policyname, cmd from pg_policies
--    where schemaname='agenda' and cmd='DELETE';
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema='agenda' and table_name in ('shifts','fixed_duty_series')
--      and privilege_type='DELETE';
--
-- Le test fonctionnel, par le chemin du navigateur, est dans
-- 22-MOD2A-2-test-journal-activite.py (bloc 6) et 22-MOD2B-2-*.py.
-- =====================================================================

-- =====================================================================
-- CE QUE CE SCRIPT NE FAIT PAS, ET QU'IL FAUT SAVOIR
--
-- * Les demandes d'une garde supprimee SUBSISTENT. La cle etrangere
--   requests.shift_id est en « on delete cascade » : elle ne se declenche
--   plus, puisqu'il n'y a plus de DELETE. En pratique l'interface refuse
--   de supprimer une garde « assigned » ou « pending », donc seules des
--   demandes deja closes (rejected / cancelled) peuvent subsister -- de
--   l'historique, qu'il est legitime de garder.
--
-- * Les gardes deja supprimees par le passe ne reviennent pas. La
--   suppression douce ne vaut que pour l'avenir ; les ~46 gardes perdues
--   le 29/07 restent perdues.
--
-- * Le script de resynchronisation 7F doit etre relu avant tout nouvel
--   usage : une recopie complete depuis Planning ecraserait l'etat de
--   suppression douce. Il est de toute facon voue a disparaitre a la
--   bascule (etape 8).
-- =====================================================================
