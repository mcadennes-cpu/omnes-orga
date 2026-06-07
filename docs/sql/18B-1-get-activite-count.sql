-- =============================================================================
-- 18B-1 - get_activite_count(p_user_id) : compteur "en attente" pour un user
-- =============================================================================
--
-- OBJECTIF :
--   Version PARAMETREE (par user_id) de get_mon_activite, qui renvoie juste le
--   NOMBRE d'elements en attente d'un utilisateur donne. Sert a l'Edge Function
--   send-notification pour poser la pastille (App Badge) sur l'icone de la PWA
--   au moment du push, meme app fermee.
--
--   Le total renvoye est IDENTIQUE a items.length cote app (memes 4 sources,
--   meme perimetre), donc la pastille ne "saute" pas entre l'app ouverte
--   (Phase 1, useMonActivite) et la reception d'un push (Phase 2, ici).
--
--   4 termes additionnes :
--     1. cartes Discussion ouvertes/non archivees avec des messages non lus
--     2. cartes Immobilier ouvertes/non archivees avec des messages non lus
--     3. sondages Discussion ouverts non votes
--     4. sondages de presence d'evenements a venir non repondus
--
-- SECURITE :
--   SECURITY DEFINER + search_path fige. La fonction prend le user_id en
--   parametre (et NON auth.uid()) car elle est appelee par l'Edge Function avec
--   la SERVICE_ROLE_KEY (ou auth.uid() serait null). Execute reserve a
--   service_role : l'app n'appelle jamais cette fonction (elle utilise
--   get_mon_activite, scopee a auth.uid()). On evite ainsi qu'un utilisateur
--   authentifie lise le compteur d'un autre.
--
-- NOTE - duplication assumee :
--   Cette fonction reprend la logique de perimetre de get_mon_activite (18A-1).
--   Les deux sont a garder synchronisees si le perimetre change un jour.
--
-- COMMENT EXECUTER : SQL Editor > New query > coller > Save > Run.
-- POUR ANNULER : drop function if exists public.get_activite_count(uuid);
-- IDEMPOTENCE : create or replace -> rejouable.
-- =============================================================================

create or replace function public.get_activite_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- 1) cartes Discussion avec du non-lu
    (
      select count(*)
        from discussion_board_members bm
        join discussion_boards b
          on b.id = bm.board_id and b.archived = false
        join discussion_cards c
          on c.board_id = b.id and c.archived = false and c.status = 'open'
       where bm.user_id = p_user_id
         and exists (
           select 1 from discussion_messages m
            where m.card_id = c.id
              and m.author_id <> p_user_id
              and m.created_at > coalesce(
                    (select cr.last_read_at
                       from discussion_card_reads cr
                      where cr.card_id = c.id and cr.user_id = p_user_id),
                    '-infinity'::timestamptz)
         )
    )
    +
    -- 2) cartes Immobilier avec du non-lu
    (
      select count(*)
        from immobilier_board_members bm
        join immobilier_boards b
          on b.id = bm.board_id and b.archive = false
        join immobilier_cards c
          on c.board_id = b.id and c.archive = false and c.statut = 'ouvert'
       where bm.user_id = p_user_id
         and exists (
           select 1 from immobilier_messages m
            where m.card_id = c.id
              and m.auteur_id <> p_user_id
              and m.created_at > coalesce(
                    (select cr.last_read_at
                       from immobilier_card_reads cr
                      where cr.card_id = c.id and cr.user_id = p_user_id),
                    '-infinity'::timestamptz)
         )
    )
    +
    -- 3) sondages Discussion ouverts non votes
    (
      select count(*)
        from discussion_board_members bm
        join discussion_boards b
          on b.id = bm.board_id and b.archived = false
        join discussion_cards c
          on c.board_id = b.id and c.archived = false and c.status = 'open'
        join discussion_polls p
          on p.card_id = c.id and p.closed = false
       where bm.user_id = p_user_id
         and not exists (
           select 1 from discussion_poll_votes pv
            where pv.poll_id = p.id and pv.user_id = p_user_id
         )
    )
    +
    -- 4) sondages de presence des evenements a venir non repondus
    (
      select count(*)
        from evenements e
       where e.sondage_actif = true
         and coalesce(e.date_fin, e.date_debut) >= current_date
         and not exists (
           select 1 from evenement_reponses r
            where r.evenement_id = e.id and r.user_id = p_user_id
         )
    );
$$;

revoke execute on function public.get_activite_count(uuid) from public;
grant  execute on function public.get_activite_count(uuid) to service_role;
