-- =====================================================================
-- Etape 22 / MOD2-C : lecture du journal d'activite
--
-- L'ecran « Journal d'activite » a besoin de deux choses que le SELECT
-- brut ne donne pas :
--   * le NOM de l'auteur (activity_log ne porte qu'un identifiant) ;
--   * une PROJECTION COMPACTE des lignes touchees -- une entree de
--     61 gardes pese plusieurs dizaines de kilo-octets en lignes
--     completes, et l'ecran n'a besoin que de cinq champs.
--
-- Ce script ne change rien a ce qui est ENREGISTRE. Il ajoute une voie
-- de lecture, plus une correction de MOD2-A (section 1).
--
-- A executer une seule fois sur le projet ydihrgnixthrraprclox.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Correction d'un defaut latent de MOD2-A
--
-- journaliser() agrege « rows_before » et « rows_after » par deux
-- requetes distinctes sur les tables de transition. L'ordre des lignes
-- n'y est PAS garanti : rien n'assure que la 3e ligne de rows_before
-- corresponde a la 3e de rows_after.
--
-- Sans effet visible aujourd'hui (l'ecran apparie par identifiant), mais
-- MOD2-D restaurera en comparant l'etat attendu a l'etat courant : un
-- appariement par position y serait faux, et faux SILENCIEUSEMENT. On
-- ordonne donc les deux agregats par id.
--
-- Le reste de la fonction est identique a MOD2-A.
-- ---------------------------------------------------------------------

create or replace function agenda.journaliser()
returns trigger
language plpgsql
security definer
set search_path to 'agenda', 'public'
as $function$
declare
  seuil_detail constant integer := 500;

  lignes_avant jsonb;
  lignes_apres jsonb;
  identifiants uuid[];
  nombre       integer := 0;
  tronque      boolean := false;
begin
  if TG_OP = 'INSERT' then
    select coalesce(jsonb_agg(to_jsonb(n) order by n.id), '[]'::jsonb),
           coalesce(array_agg(n.id order by n.id), '{}'::uuid[]),
           count(*)
      into lignes_apres, identifiants, nombre
      from new_rows n;

  elsif TG_OP = 'DELETE' then
    select coalesce(jsonb_agg(to_jsonb(o) order by o.id), '[]'::jsonb),
           coalesce(array_agg(o.id order by o.id), '{}'::uuid[]),
           count(*)
      into lignes_avant, identifiants, nombre
      from old_rows o;

  else -- UPDATE : les deux etats, ordonnes pareil pour rester appariables.
    select coalesce(jsonb_agg(to_jsonb(o) order by o.id), '[]'::jsonb),
           coalesce(array_agg(o.id order by o.id), '{}'::uuid[]),
           count(*)
      into lignes_avant, identifiants, nombre
      from old_rows o;

    select coalesce(jsonb_agg(to_jsonb(n) order by n.id), '[]'::jsonb)
      into lignes_apres
      from new_rows n;
  end if;

  if nombre = 0 then
    return null;
  end if;

  if nombre > seuil_detail then
    lignes_avant := null;
    lignes_apres := null;
    identifiants := '{}'::uuid[];
    tronque      := true;
  end if;

  insert into agenda.activity_log (
    txid, actor_id, table_name, operation,
    row_count, target_ids, rows_before, rows_after, payload_truncated
  )
  values (
    (pg_current_xact_id()::text)::bigint,
    auth.uid(),
    TG_TABLE_NAME,
    TG_OP,
    nombre,
    identifiants,
    lignes_avant,
    lignes_apres,
    tronque
  );

  return null;
end;
$function$;

-- ---------------------------------------------------------------------
-- 2. La projection compacte
--
-- Reduit une liste de lignes completes a un objet « identifiant -> les
-- quelques champs qui parlent ». L'appariement se fait donc par
-- IDENTIFIANT et non par position -- robuste quel que soit l'ordre.
--
-- Le vocabulaire de sortie est en francais : ces cles sont lues par
-- l'ecran, pas par la base.
-- ---------------------------------------------------------------------

create or replace function agenda.journal_extrait(p_table text, p_lignes jsonb)
returns jsonb
language sql
immutable
as $function$
  select case
    when p_lignes is null then null
    else coalesce((
      select jsonb_object_agg(x ->> 'id', case p_table
        when 'shifts' then jsonb_build_object(
          'jour',      x ->> 'date',
          'statut',    x ->> 'status',
          'medecin',   x ->> 'assigned_doctor_id',
          'site',      x ->> 'location',
          'creneau',   x ->> 'shift_type',
          'supprimee', (x ->> 'deleted_at') is not null)
        when 'requests' then jsonb_build_object(
          'garde',   x ->> 'shift_id',
          'medecin', x ->> 'doctor_id',
          'statut',  x ->> 'status')
        when 'fixed_duty_series' then jsonb_build_object(
          'nom',       x ->> 'name',
          'supprimee', (x ->> 'deleted_at') is not null)
        when 'rotation_plans' then jsonb_build_object(
          'nom',    x ->> 'name',
          'statut', x ->> 'status')
        else '{}'::jsonb
      end)
      from jsonb_array_elements(p_lignes) x
    ), '{}'::jsonb)
  end;
$function$;

-- ---------------------------------------------------------------------
-- 3. La voie de lecture
--
-- SECURITY INVOKER (le defaut) : la fonction s'execute avec les droits
-- de l'appelant, donc la policy « Le coordinateur lit le journal »
-- s'applique telle quelle. Un medecin qui l'appellerait recevrait une
-- liste vide -- pas une erreur, et surtout pas les donnees.
--
-- C'est volontairement l'INVERSE des portes d'ecriture : celles-ci
-- doivent contourner la RLS pour agir, celle-ci doit s'y soumettre pour
-- ne rien laisser fuir. Une fonction de lecture en security definer
-- serait exactement le defaut trouve en 6G.
--
-- p_avant_id pagine « vers le passe » par identifiant plutot que par
-- date : deux entrees peuvent partager la meme seconde.
-- ---------------------------------------------------------------------

create or replace function agenda.journal_activite(
  p_limite    integer default 60,
  p_avant_id  bigint  default null
)
returns table (
  id                bigint,
  txid              bigint,
  occurred_at       timestamptz,
  actor_id          uuid,
  actor_nom         text,
  table_name        text,
  operation         text,
  row_count         integer,
  payload_truncated boolean,
  avant             jsonb,
  apres             jsonb
)
language sql
stable
set search_path to 'agenda', 'public'
as $function$
  select l.id, l.txid, l.occurred_at, l.actor_id,
         nullif(trim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')), '') as actor_nom,
         l.table_name, l.operation, l.row_count, l.payload_truncated,
         agenda.journal_extrait(l.table_name, l.rows_before) as avant,
         agenda.journal_extrait(l.table_name, l.rows_after)  as apres
    from agenda.activity_log l
    left join public.profiles p on p.id = l.actor_id
   where (p_avant_id is null or l.id < p_avant_id)
   order by l.id desc
   limit least(greatest(coalesce(p_limite, 60), 1), 200);
$function$;

revoke all on function agenda.journal_activite(integer, bigint) from public, anon;
grant execute on function agenda.journal_activite(integer, bigint) to authenticated;

comment on function agenda.journal_activite(integer, bigint) is
  'Lecture paginee du journal, auteur resolu et lignes projetees sur les champs utiles. SECURITY INVOKER : la policy de lecture du journal s''applique.';

-- =====================================================================
-- 4. Controles a passer apres execution
--
--   -- la fonction est bien en security invoker
--   select proname, prosecdef from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='agenda' and proname='journal_activite';
--   -- attendu : prosecdef = false
--
-- Le test fonctionnel, par le chemin du navigateur, est dans
-- 22-MOD2C-2-test-lecture-journal.py.
-- =====================================================================
