-- =====================================================================
-- Etape 22 / MOD2-D (complement) : le journal expose les annulations
--
-- Remplace agenda.journal_activite de 22-MOD2C-1 en y ajoutant deux
-- colonnes : undone_at et le nom de qui a annule. Sans elles, l'ecran ne
-- peut ni afficher « action annulee », ni masquer le bouton -- il
-- proposerait de defaire ce qui l'est deja.
--
-- Le reste de la fonction est inchange (meme pagination, meme projection,
-- toujours SECURITY INVOKER pour rester soumise a la policy de lecture).
--
-- ⚠ Il faut SUPPRIMER puis recreer : « create or replace » refuse de
-- changer le type de retour d'une fonction (« cannot change return type of
-- existing function »). La suppression emporte les droits, qui sont donc
-- reposes en fin de script -- sans quoi la fonction deviendrait
-- inappelable depuis l'application, sans autre symptome qu'un 404.
--
-- A executer une seule fois sur le projet ydihrgnixthrraprclox.
-- =====================================================================

drop function if exists agenda.journal_activite(integer, bigint);

create function agenda.journal_activite(
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
  undone_at         timestamptz,
  undone_par        text,
  avant             jsonb,
  apres             jsonb
)
language sql
stable
set search_path to 'agenda', 'public'
as $function$
  select l.id, l.txid, l.occurred_at, l.actor_id,
         nullif(trim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')), '') as actor_nom,
         l.table_name, l.operation, l.row_count, l.payload_truncated,
         l.undone_at,
         nullif(trim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, '')), '') as undone_par,
         agenda.journal_extrait(l.table_name, l.rows_before) as avant,
         agenda.journal_extrait(l.table_name, l.rows_after)  as apres
    from agenda.activity_log l
    left join public.profiles a on a.id = l.actor_id
    left join public.profiles u on u.id = l.undone_by
   where (p_avant_id is null or l.id < p_avant_id)
   order by l.id desc
   limit least(greatest(coalesce(p_limite, 60), 1), 200);
$function$;

revoke all on function agenda.journal_activite(integer, bigint) from public, anon;
grant execute on function agenda.journal_activite(integer, bigint) to authenticated;

comment on function agenda.journal_activite(integer, bigint) is
  'Lecture paginee du journal : auteur resolu, lignes projetees sur les champs utiles, etat d''annulation. SECURITY INVOKER, la policy de lecture du journal s''applique.';

-- =====================================================================
-- Controle
--
--   select proname, prosecdef from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='agenda' and proname='journal_activite';
--   -- attendu : prosecdef = false (la lecture reste soumise a la RLS)
-- =====================================================================
