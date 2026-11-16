-- =============================================================================
-- 24F-1 - Fil « En attente » et pastilles : les documents a signer
-- =============================================================================
--
-- OBJECTIF :
--
--   Ajouter une 5e source aux deux fonctions du socle « non-lus » (18A, 18D) :
--   les demandes de signature qui attendent MA signature, c'est-a-dire :
--     - je suis signataire, statut en_attente ;
--     - la demande est en cours (envoyee, ni terminee ni annulee) ;
--     - c'est mon tour (toujours vrai si l'ordre n'est pas impose) ;
--     - personne n'a refuse (une demande bloquee n'attend plus rien de moi).
--
--   Les DEUX fonctions sont reecrites ensemble : elles dupliquent le meme
--   perimetre (limitation connue) et doivent rester alignees, sans quoi la
--   pastille de l'icone et la liste « En attente » diraient deux choses.
--
--   COLONNES : le type de retour de get_mon_activite ne peut pas changer sans
--   la supprimer et la recreer (ce qui ferait perdre ses droits). On reutilise
--   donc les colonnes existantes : module = 'signatures', item_type =
--   'signature', card_id = identifiant de la DEMANDE, board_titre = nature du
--   document. ref_at = derniere relance, sinon date d'envoi.
--
--   Les 4 branches existantes sont recopiees A L'IDENTIQUE de la production
--   (pg_get_functiondef du 16/11/2026) ; seule la branche 5 est nouvelle.
--
-- COMMENT EXECUTER : apres 24A-1 a 24C-1 (elle lit signature_est_son_tour),
--   sur le test puis en production.
--
-- POUR ANNULER : rejouer 18A-1 et 18B-1 (versions a 4 branches).
--
-- =============================================================================


create or replace function public.get_mon_activite()
 returns table(item_type text, module text, board_id uuid, board_titre text, card_id uuid, evenement_id uuid, couleur text, titre text, non_lus integer, ref_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$

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
    )

  union all

  -- 5) Documents a signer (etape 24) ----------------------------------------
  --    card_id = identifiant de la demande ; board_titre = nature du document.
  select
    'signature'::text,
    'signatures'::text,
    null::uuid,
    case d.type
      when 'avenant' then 'Avenant'
      when 'pv' then 'Procès-verbal'
      when 'feuille_presence' then 'Feuille de présence'
      when 'contrat_remplacement' then 'Contrat de remplacement'
      else 'Document'
    end,
    d.id,
    null::uuid,
    'marine'::text,
    d.titre,
    0,
    coalesce(s.derniere_relance_at, d.envoyee_at)
  from signature_signataires s
  join signature_demandes d
    on d.id = s.demande_id and d.statut = 'en_cours'
  where s.profil_id = auth.uid()
    and s.statut = 'en_attente'
    and signature_est_son_tour(s.id)
    and not exists (
      select 1 from signature_signataires r
       where r.demande_id = d.id and r.statut = 'refuse'
    );

$function$;


create or replace function public.get_activite_count(p_user_id uuid)
 returns integer
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
    )
    +
    -- 5) documents a signer (etape 24) -- meme perimetre que get_mon_activite
    (
      select count(*)
        from signature_signataires s
        join signature_demandes d
          on d.id = s.demande_id and d.statut = 'en_cours'
       where s.profil_id = p_user_id
         and s.statut = 'en_attente'
         and signature_est_son_tour(s.id)
         and not exists (
           select 1 from signature_signataires r
            where r.demande_id = d.id and r.statut = 'refuse'
         )
    );
$function$;


-- Verification : les droits d'origine sont conserves par create or replace.
select p.proname,
       has_function_privilege('authenticated', p.oid, 'execute') as appli,
       has_function_privilege('service_role', p.oid, 'execute') as serveur
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('get_mon_activite', 'get_activite_count');
