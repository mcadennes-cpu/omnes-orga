-- =============================================================================
-- 16quater-9 - Retour arriere de 16quater-1 (sondages a choix multiple)
-- =============================================================================
--
-- A N'UTILISER QU'EN CAS DE PROBLEME. Remet la regle « un vote par personne
-- et par sondage ».
--
-- ATTENTION : si des personnes ont coche plusieurs options, la contrainte
-- UNIQUE (poll_id, user_id) ne peut pas etre reposee. Le script s'arrete
-- alors SANS RIEN CHANGER (tout est dans une transaction) : il faut d'abord
-- decider quels votes garder.
--
-- =============================================================================

begin;

do $$ begin
  if exists (
    select 1 from public.discussion_poll_votes
     group by poll_id, user_id having count(*) > 1
  ) then
    raise exception 'Des votes multiples existent : retour arriere impossible sans perte. Rien n''a ete modifie.';
  end if;
end $$;

drop trigger if exists discussion_polls_garde_multiple on public.discussion_polls;
drop function if exists public.discussion_polls_garde_multiple();
drop trigger if exists discussion_poll_votes_choix_unique on public.discussion_poll_votes;
drop function if exists public.discussion_poll_votes_choix_unique();

alter table public.discussion_poll_votes
  drop constraint if exists discussion_poll_votes_option_id_user_id_key;
drop index if exists public.idx_discussion_poll_votes_poll_user;
alter table public.discussion_poll_votes
  add constraint discussion_poll_votes_poll_id_user_id_key unique (poll_id, user_id);

alter table public.discussion_polls drop column if exists multiple;

commit;
