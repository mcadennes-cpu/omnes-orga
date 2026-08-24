-- =====================================================================
-- Etape 22 / MOD2-E : retrouver l'action qu'on vient de faire
--
-- Le bandeau ephemere doit proposer « Annuler » juste apres une action.
-- Il lui faut donc le txid de ce qui vient d'etre ecrit.
--
-- POURQUOI UNE RECHERCHE APRES COUP, ET NON UN RETOUR DES ECRITURES
-- Faire remonter le txid par chaque chemin d'ecriture supposerait de
-- toucher a tous : les .insert()/.update() de supabase-js ne le rendent
-- pas, et les fonctions existantes (supprimer_gardes, ouvrir_semaines...)
-- devraient changer de signature. Une lecture ciblee juste apres l'action
-- coute un aller-retour et ne modifie rien.
--
-- LE RISQUE, ET POURQUOI IL EST ACCEPTABLE
-- Entre l'action et cet appel il s'ecoule quelques millisecondes ; la
-- fenetre est bornee et l'entree doit etre de l'utilisateur courant. Si
-- malgre tout le mauvais txid etait retenu, restaurer_action ne pourrait
-- pas faire de degat silencieux : elle compare l'etat courant a l'etat
-- attendu et refuse en cas d'ecart (MOD2-D).
--
-- SECURITY INVOKER : la policy de lecture du journal s'applique, donc
-- seuls les coordinateurs obtiennent quelque chose -- comme le bandeau,
-- qui ne s'adresse qu'a eux.
--
-- A executer une seule fois sur le projet ydihrgnixthrraprclox.
-- =====================================================================

create or replace function agenda.derniere_action(p_secondes integer default 20)
returns jsonb
language sql
stable
set search_path to 'agenda', 'public'
as $function$
  select jsonb_build_object(
           'txid',        l.txid,
           'occurred_at', l.occurred_at,
           'table_name',  l.table_name,
           'operation',   l.operation,
           'row_count',   l.row_count)
    from agenda.activity_log l
   where l.actor_id = (select auth.uid())
     and l.undone_at is null
     and l.occurred_at > now() - make_interval(secs => least(greatest(p_secondes, 1), 120))
   order by l.id desc
   limit 1;
$function$;

revoke all on function agenda.derniere_action(integer) from public, anon;
grant execute on function agenda.derniere_action(integer) to authenticated;

comment on function agenda.derniere_action(integer) is
  'Derniere ecriture journalisee de l''utilisateur courant, dans une fenetre de quelques secondes. Sert au bandeau ephemere a proposer « Annuler ». Renvoie NULL si rien de recent.';

-- =====================================================================
-- Controle
--
--   select proname, prosecdef from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='agenda' and proname='derniere_action';
--   -- attendu : prosecdef = false
-- =====================================================================
