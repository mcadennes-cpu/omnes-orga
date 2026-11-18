-- =============================================================================
-- 16quater-1 - Discussion : sondages a choix multiple
-- =============================================================================
--
-- OBJECTIF (etape 16 quater, demande du 18/11/2026) :
--
--   Le sondage de Charlotte sur les jours feries 2027 ne permettait de cocher
--   qu'une seule date. On ajoute un reglage par sondage :
--     - multiple = false (defaut) : un seul choix par personne, comme avant ;
--     - multiple = true           : on coche autant d'options qu'on veut.
--   Les sondages existants restent a choix unique tant qu'on ne les convertit
--   pas.
--
-- CONTENU :
--   1. discussion_polls.multiple ;
--   2. la regle « une ligne par personne et par sondage » devient « une ligne
--      par personne et par OPTION » (on ne coche pas deux fois la meme date) ;
--   3. un declencheur qui garde « un seul choix » pour les sondages a choix
--      unique : la base refuse un 2e vote meme si l'ecran se trompait ;
--   4. un declencheur qui refuse de repasser un sondage en choix unique tant
--      que quelqu'un y a coche plusieurs options.
--
--   Rien a changer dans les policies : elles verifient deja que l'option
--   appartient au sondage et que le sondage est ouvert. Rien a changer non
--   plus dans « Mon activite » (18A-1 / 18B-1 / 24F-1) : elles regardent
--   seulement s'il existe AU MOINS un vote de la personne.
--
-- COMMENT EXECUTER : sur le test, puis en production apres la sauvegarde
--   23-16. Rejouable (if not exists / create or replace / drop if exists).
--
-- POUR ANNULER : 16quater-9-retour-arriere.sql.
--
-- =============================================================================


-- 1) Reglage du sondage ---------------------------------------------------------
alter table public.discussion_polls
  add column if not exists multiple boolean not null default false;


-- 2) Une ligne par personne et par option --------------------------------------
-- L'ancienne contrainte UNIQUE (poll_id, user_id) empechait tout 2e choix.
-- On la remplace par UNIQUE (option_id, user_id). L'index (poll_id, user_id)
-- qu'elle portait sert encore (« ai-je vote ? », ecran et accueil) : on le
-- recree en index simple.
alter table public.discussion_poll_votes
  drop constraint if exists discussion_poll_votes_poll_id_user_id_key;

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'discussion_poll_votes_option_id_user_id_key'
  ) then
    alter table public.discussion_poll_votes
      add constraint discussion_poll_votes_option_id_user_id_key
      unique (option_id, user_id);
  end if;
end $$;

create index if not exists idx_discussion_poll_votes_poll_user
  on public.discussion_poll_votes(poll_id, user_id);


-- 3) Choix unique garanti par la base -------------------------------------------
-- SECURITY DEFINER : le declencheur doit voir TOUS les votes de la personne,
-- quelle que soit la RLS. Le verrou consultatif (poll, personne) evite que
-- deux clics simultanes passent tous les deux le controle.
create or replace function public.discussion_poll_votes_choix_unique()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_multiple boolean;
begin
  select p.multiple into v_multiple
    from public.discussion_polls p where p.id = new.poll_id;
  if coalesce(v_multiple, false) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.poll_id::text || ':' || new.user_id::text));

  if exists (
    select 1 from public.discussion_poll_votes v
     where v.poll_id = new.poll_id
       and v.user_id = new.user_id
       and v.id <> new.id
  ) then
    raise exception 'Ce sondage n''accepte qu''un seul choix par personne.'
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists discussion_poll_votes_choix_unique on public.discussion_poll_votes;
create trigger discussion_poll_votes_choix_unique
  before insert or update of poll_id, user_id, option_id
  on public.discussion_poll_votes
  for each row execute function public.discussion_poll_votes_choix_unique();


-- 4) Pas de retour au choix unique si des votes multiples existent -------------
create or replace function public.discussion_polls_garde_multiple()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.multiple and not new.multiple and exists (
    select 1 from public.discussion_poll_votes v
     where v.poll_id = new.id
     group by v.user_id
    having count(*) > 1
  ) then
    raise exception 'Des participants ont deja coche plusieurs reponses : le sondage ne peut plus repasser en choix unique.';
  end if;
  return new;
end;
$$;

drop trigger if exists discussion_polls_garde_multiple on public.discussion_polls;
create trigger discussion_polls_garde_multiple
  before update of multiple on public.discussion_polls
  for each row execute function public.discussion_polls_garde_multiple();


-- Verification ------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'discussion_polls'
      and column_name = 'multiple')                                   as colonne_multiple,
  (select count(*) from pg_constraint
    where conname = 'discussion_poll_votes_poll_id_user_id_key')      as ancienne_contrainte,
  (select count(*) from pg_constraint
    where conname = 'discussion_poll_votes_option_id_user_id_key')    as nouvelle_contrainte,
  (select count(*) from pg_trigger
    where tgname in ('discussion_poll_votes_choix_unique',
                     'discussion_polls_garde_multiple'))              as declencheurs,
  (select count(*) from public.discussion_polls where multiple)       as sondages_multiples;
