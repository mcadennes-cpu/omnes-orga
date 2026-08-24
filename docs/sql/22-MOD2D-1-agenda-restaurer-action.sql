-- =====================================================================
-- Etape 22 / MOD2-D : restaurer une action depuis le journal
--
-- La sixieme porte du module, apres les trois du roulement (import,
-- activation, suppression de brouillon) et les deux de la suppression
-- douce (supprimer_gardes, supprimer_serie).
--
-- ⚠ CE QUI DISTINGUE CETTE PORTE DES AUTRES : elle REFUSE plutot que
-- d'ecraser. Le defaut n°3 de MOD-2 etait « aucune verification de
-- coherence avant d'annuler : l'etat actuel n'est pas compare a l'etat
-- attendu ». C'est le coeur de cette fonction, pas un ajout.
--
-- ON RESTAURE UNE TRANSACTION, PAS UNE LIGNE DE JOURNAL
-- Une action de l'utilisateur peut produire plusieurs ecritures : valider
-- une demande ecrit dans « requests », ce qui reveille update_shift_status
-- qui ecrit dans « shifts ». Defaire l'une sans l'autre laisserait le
-- planning incoherent. L'unite de restauration est donc le txid.
--
-- A executer une seule fois sur le projet ydihrgnixthrraprclox.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les champs qui comptent
--
-- Comparer la ligne entiere serait trop strict : updated_at bouge a
-- chaque ecriture et ferait echouer toute restauration. On compare -- et
-- on restaure -- les seuls champs que les actions du coordinateur
-- modifient.
-- ---------------------------------------------------------------------

create or replace function agenda.champs_restaurables(p_table text)
returns text[]
language sql
immutable
as $function$
  select case p_table
    when 'shifts'   then array['status', 'assigned_doctor_id', 'deleted_at', 'coordinator_note']
    when 'requests' then array['status']
    else array[]::text[]
  end;
$function$;

-- ---------------------------------------------------------------------
-- 2. La porte
--
-- p_verifier_seulement = true (defaut) : produit le rapport sans rien
-- ecrire. C'est ce que l'ecran appelle avant d'afficher sa confirmation,
-- pour que le coordinateur voie l'ecart AVANT de decider.
--
-- Le defaut est volontairement le mode inoffensif : un appel maladroit ne
-- peut rien casser.
-- ---------------------------------------------------------------------

create or replace function agenda.restaurer_action(
  p_txid               bigint,
  p_verifier_seulement boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'agenda', 'public'
as $function$
declare
  e            record;
  v_ligne      jsonb;
  v_actuelle   jsonb;
  v_id         uuid;
  v_champ      text;
  v_conflits   jsonb := '[]'::jsonb;
  v_prevu      integer := 0;
  v_touchees   integer := 0;
  v_nb_entrees integer;
begin
  if not agenda.est_coordinateur() then
    raise exception 'Restauration reservee aux coordinateurs';
  end if;

  select count(*) into v_nb_entrees from agenda.activity_log where txid = p_txid;
  if v_nb_entrees = 0 then
    raise exception 'Action introuvable dans le journal';
  end if;

  -- --- a) Eligibilite ------------------------------------------------
  for e in select * from agenda.activity_log where txid = p_txid order by id loop
    if e.undone_at is not null then
      raise exception 'Cette action a deja ete annulee le %',
        to_char(e.undone_at at time zone 'Europe/Paris', 'DD/MM/YYYY a HH24:MI');
    end if;
    if e.payload_truncated then
      raise exception 'Action trop volumineuse pour etre annulee (% lignes)', e.row_count;
    end if;
    if e.table_name not in ('shifts', 'requests') then
      raise exception 'Seules les gardes et les demandes se restaurent ici (table %)', e.table_name;
    end if;
    if e.operation = 'DELETE' then
      raise exception 'Une suppression reelle ne peut pas etre annulee : la ligne n''existe plus';
    end if;
  end loop;

  -- --- b) Garde-fou de coherence -------------------------------------
  -- L'etat actuel est-il toujours celui que l'action avait laisse ? Si
  -- quelqu'un est passe depuis -- un medecin a demande la garde, le
  -- coordinateur l'a reattribuee -- on ne touche a RIEN et on le dit.
  for e in select * from agenda.activity_log where txid = p_txid order by id loop
    for v_ligne in select jsonb_array_elements(e.rows_after) loop
      v_id := (v_ligne ->> 'id')::uuid;
      v_prevu := v_prevu + 1;

      if e.table_name = 'shifts' then
        select to_jsonb(s) into v_actuelle from agenda.shifts s where s.id = v_id;
      else
        select to_jsonb(r) into v_actuelle from agenda.requests r where r.id = v_id;
      end if;

      if v_actuelle is null then
        v_conflits := v_conflits || jsonb_build_object(
          'id', v_id, 'table', e.table_name, 'motif', 'ligne disparue');
        continue;
      end if;

      foreach v_champ in array agenda.champs_restaurables(e.table_name) loop
        if coalesce(v_ligne ->> v_champ, '') is distinct from coalesce(v_actuelle ->> v_champ, '') then
          v_conflits := v_conflits || jsonb_build_object(
            'id',      v_id,
            'table',   e.table_name,
            'jour',    v_actuelle ->> 'date',
            'champ',   v_champ,
            'attendu', v_ligne ->> v_champ,
            'actuel',  v_actuelle ->> v_champ);
        end if;
      end loop;
    end loop;
  end loop;

  if p_verifier_seulement or jsonb_array_length(v_conflits) > 0 then
    return jsonb_build_object(
      'ok',        jsonb_array_length(v_conflits) = 0,
      'ecrit',     false,
      'lignes',    v_prevu,
      'conflits',  v_conflits);
  end if;

  -- --- c) Restauration -----------------------------------------------
  -- Les demandes AVANT les gardes : restaurer une demande reveille
  -- update_shift_status, qui ecrit dans shifts. En traitant les gardes en
  -- dernier, c'est l'etat que NOUS posons qui fait foi.
  for e in select * from agenda.activity_log
            where txid = p_txid
            order by case table_name when 'requests' then 0 else 1 end, id loop

    if e.operation = 'INSERT' then
      -- Defaire une creation : les gardes passent en suppression douce,
      -- les demandes sont retirees (elles n'ont pas de deleted_at).
      if e.table_name = 'shifts' then
        update agenda.shifts
           set deleted_at = now(), updated_at = now()
         where id in (select (jsonb_array_elements(e.rows_after) ->> 'id')::uuid)
           and deleted_at is null;
      else
        delete from agenda.requests
         where id in (select (jsonb_array_elements(e.rows_after) ->> 'id')::uuid);
      end if;
      get diagnostics v_touchees = row_count;

    else -- UPDATE : remettre les valeurs d'avant
      if e.table_name = 'shifts' then
        update agenda.shifts s
           set status             = (b ->> 'status'),
               assigned_doctor_id = nullif(b ->> 'assigned_doctor_id', '')::uuid,
               deleted_at         = nullif(b ->> 'deleted_at', '')::timestamptz,
               coordinator_note   = (b ->> 'coordinator_note'),
               updated_at         = now()
          from jsonb_array_elements(e.rows_before) b
         where s.id = (b ->> 'id')::uuid;
      else
        update agenda.requests r
           set status = (b ->> 'status')
          from jsonb_array_elements(e.rows_before) b
         where r.id = (b ->> 'id')::uuid;
      end if;
      get diagnostics v_touchees = row_count;
    end if;
  end loop;

  update agenda.activity_log
     set undone_at = now(), undone_by = auth.uid()
   where txid = p_txid;

  return jsonb_build_object(
    'ok', true, 'ecrit', true, 'lignes', v_prevu, 'conflits', '[]'::jsonb);
end;
$function$;

revoke all on function agenda.restaurer_action(bigint, boolean) from public, anon;
grant execute on function agenda.restaurer_action(bigint, boolean) to authenticated;

comment on function agenda.restaurer_action(bigint, boolean) is
  'Defait une action du journal, identifiee par sa transaction. Compare d''abord l''etat courant a l''etat attendu et REFUSE en cas d''ecart, sans rien ecrire. p_verifier_seulement produit le rapport seul.';

-- ---------------------------------------------------------------------
-- 3. Ce que l'ecran peut proposer
--
-- Evite N appels de verification pour afficher une liste : renvoie, pour
-- les transactions demandees, si un bouton « Restaurer » a un sens.
-- L'eligibilite seulement -- la coherence, elle, se verifie au clic, car
-- elle depend de l'etat au moment ou l'on agit.
-- ---------------------------------------------------------------------

create or replace function agenda.actions_restaurables(p_txids bigint[])
returns table (txid bigint, restaurable boolean, motif text)
language sql
stable
set search_path to 'agenda', 'public'
as $function$
  select l.txid,
         bool_and(l.undone_at is null
                  and not l.payload_truncated
                  and l.table_name in ('shifts', 'requests')
                  and l.operation <> 'DELETE') as restaurable,
         case
           when bool_or(l.undone_at is not null)      then 'deja annulee'
           when bool_or(l.payload_truncated)          then 'trop volumineuse'
           when bool_or(l.operation = 'DELETE')       then 'suppression reelle'
           when bool_or(l.table_name not in ('shifts', 'requests'))
                                                      then 'hors perimetre'
           else null
         end as motif
    from agenda.activity_log l
   where l.txid = any(p_txids)
   group by l.txid;
$function$;

revoke all on function agenda.actions_restaurables(bigint[]) from public, anon;
grant execute on function agenda.actions_restaurables(bigint[]) to authenticated;

-- =====================================================================
-- 4. Controles a passer apres execution
--
--   select proname, prosecdef from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='agenda'
--      and proname in ('restaurer_action','actions_restaurables');
--   -- attendu : restaurer_action = true (elle doit ecrire malgre la RLS),
--   --           actions_restaurables = false (lecture, donc soumise a la RLS)
--
-- Le test fonctionnel est dans 22-MOD2D-2-test-restauration.py.
-- =====================================================================
