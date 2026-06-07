-- =============================================================================
-- 18A-1 - Socle "Ce qui m'attend" : fonction d'agregation des non-lus
-- =============================================================================
--
-- OBJECTIF :
--   UNE seule fonction RPC qui renvoie, pour l'utilisateur courant (auth.uid()),
--   la liste a plat de tout ce qui l'attend :
--     - messages non lus dans les cartes OUVERTES et NON ARCHIVEES des tableaux
--       Discussion et Immobilier dont il est membre (hors ses propres messages) ;
--     - sondages Discussion ouverts, sur cartes ouvertes, ou il n'a pas vote ;
--     - sondages de presence des evenements A VENIR (sondage_actif = true) ou il
--       n'a pas encore repondu.
--
--   Le frontend deduit de cette liste UNIQUE les deux usages :
--     - somme par module  -> pastilles des tuiles d'accueil
--     - tri par ref_at    -> section "Ce qui m'attend"
--
--   AUCUNE table creee : on agrege les tables de suivi existantes
--   (discussion_card_reads, immobilier_card_reads, discussion_poll_votes,
--    evenement_reponses). Rien a maintenir par trigger.
--
-- SECURITE :
--   SECURITY DEFINER + search_path fige (meme pattern que is_board_member).
--   La fonction ne lit QUE les donnees de auth.uid() : chaque branche est
--   filtree sur l'appartenance de l'appelant et sur ses propres lectures/votes.
--   Dans une fonction SECURITY DEFINER, auth.uid() renvoie bien le CALLER
--   (lecture du claim JWT de la requete, independant du role definer).
--   Execute reserve au role authenticated (revoque de public/anon).
--
-- COMMENT EXECUTER :
--   SQL Editor > New query > coller > Save "18A-1 - get_mon_activite" > Run.
--
-- COMMENT VERIFIER :
--   Dans le SQL Editor, auth.uid() est NULL par defaut (pas de session) :
--   un simple "select * from public.get_mon_activite();" renverra donc VIDE.
--   Pour tester, deux options :
--
--   a) Simuler un utilisateur le temps de la requete (les DEUX lignes dans le
--      MEME batch : le set_config est local a la transaction) :
--        select set_config('request.jwt.claims',
--          json_build_object('sub', 'COLLE-ICI-UN-UUID-DE-PROFILE')::text, true);
--        select * from public.get_mon_activite();
--
--   b) Depuis l'app connectee (console du navigateur, ou un composant jetable) :
--        const { data, error } = await supabase.rpc('get_mon_activite');
--        console.log(error, data);
--
-- POUR ANNULER :
--   drop function if exists public.get_mon_activite();
--
-- IDEMPOTENCE : create or replace -> rejouable sans risque.
-- =============================================================================

create or replace function public.get_mon_activite()
returns table (
  item_type    text,        -- 'message' | 'sondage'
  module       text,        -- 'discussion' | 'immobilier' | 'evenements'
  board_id     uuid,        -- tableau parent (null pour un evenement)
  board_titre  text,        -- null pour un evenement
  card_id      uuid,        -- carte parente (null pour un evenement)
  evenement_id uuid,        -- evenement (null sinon)
  couleur      text,        -- couleur DS (du tableau, ou de l'evenement)
  titre        text,        -- libelle : titre de carte / question / titre d'evenement
  non_lus      integer,     -- nb de messages non lus (0 pour un sondage)
  ref_at       timestamptz  -- date de reference pour le tri du feed
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$

  -- 1) Messages non lus Discussion ------------------------------------------
  --    Carte ouverte + non archivee, dans un tableau non archive ou je suis
  --    membre. On compte les messages des AUTRES posterieurs a ma derniere
  --    lecture de la carte (ou tous si je n'ai jamais ouvert la carte).
  select
    'message'::text,
    'discussion'::text,
    b.id,
    b.title,
    c.id,
    null::uuid,
    b.color,
    c.title,
    count(m.id)::int,
    max(m.created_at)
  from discussion_board_members bm
  join discussion_boards b
    on b.id = bm.board_id and b.archived = false
  join discussion_cards c
    on c.board_id = b.id and c.archived = false and c.status = 'open'
  join discussion_messages m
    on m.card_id = c.id
   and m.author_id <> auth.uid()
   and m.created_at > coalesce(
         (select cr.last_read_at
            from discussion_card_reads cr
           where cr.card_id = c.id and cr.user_id = auth.uid()),
         '-infinity'::timestamptz)
  where bm.user_id = auth.uid()
  group by b.id, b.title, c.id, b.color, c.title

  union all

  -- 2) Messages non lus Immobilier ------------------------------------------
  select
    'message'::text,
    'immobilier'::text,
    b.id,
    b.titre,
    c.id,
    null::uuid,
    b.couleur,
    c.titre,
    count(m.id)::int,
    max(m.created_at)
  from immobilier_board_members bm
  join immobilier_boards b
    on b.id = bm.board_id and b.archive = false
  join immobilier_cards c
    on c.board_id = b.id and c.archive = false and c.statut = 'ouvert'
  join immobilier_messages m
    on m.card_id = c.id
   and m.auteur_id <> auth.uid()
   and m.created_at > coalesce(
         (select cr.last_read_at
            from immobilier_card_reads cr
           where cr.card_id = c.id and cr.user_id = auth.uid()),
         '-infinity'::timestamptz)
  where bm.user_id = auth.uid()
  group by b.id, b.titre, c.id, b.couleur, c.titre

  union all

  -- 3) Sondages Discussion en attente de mon vote ---------------------------
  --    Sondage ouvert, sur carte ouverte non archivee, dans un tableau non
  --    archive ou je suis membre, et je n'ai pas de ligne de vote.
  select
    'sondage'::text,
    'discussion'::text,
    b.id,
    b.title,
    c.id,
    null::uuid,
    b.color,
    p.question,
    0,
    p.created_at
  from discussion_board_members bm
  join discussion_boards b
    on b.id = bm.board_id and b.archived = false
  join discussion_cards c
    on c.board_id = b.id and c.archived = false and c.status = 'open'
  join discussion_polls p
    on p.card_id = c.id and p.closed = false
  where bm.user_id = auth.uid()
    and not exists (
      select 1 from discussion_poll_votes pv
       where pv.poll_id = p.id and pv.user_id = auth.uid()
    )

  union all

  -- 4) Sondages de presence des evenements a venir --------------------------
  --    Evenement avec sondage actif, pas encore passe (date_fin si multi-jours,
  --    sinon date_debut, >= aujourd'hui), et je n'ai pas encore repondu.
  --    Pas de filtre d'appartenance : tous les roles voient/repondent aux
  --    evenements (y compris remplacant).
  select
    'sondage'::text,
    'evenements'::text,
    null::uuid,
    null::text,
    null::uuid,
    e.id,
    e.couleur,
    e.titre,
    0,
    e.date_debut::timestamptz
  from evenements e
  where e.sondage_actif = true
    and coalesce(e.date_fin, e.date_debut) >= current_date
    and not exists (
      select 1 from evenement_reponses r
       where r.evenement_id = e.id and r.user_id = auth.uid()
    );

$$;

-- Hygiene des droits : seul un utilisateur authentifie peut appeler la RPC.
revoke execute on function public.get_mon_activite() from public;
grant  execute on function public.get_mon_activite() to authenticated;
