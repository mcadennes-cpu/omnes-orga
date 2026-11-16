-- =============================================================================
-- 24A-1 - Module Signatures : tables, index et verrous
-- =============================================================================
--
-- OBJECTIF :
--
--   Poser le moteur de signature electronique SIMPLE (etape 24), generique :
--   avenants, PV, feuilles de presence, puis contrats de remplacement (25).
--
--     - public.signature_demandes   : une demande = un PDF a faire signer.
--     - public.signature_signataires: la liste ordonnee des signataires et,
--                                     pour chacun, la preuve de sa signature.
--     - public.signature_codes      : les codes a usage unique envoyes par
--                                     mail. INVISIBLES pour l'application
--                                     (RLS sans policy, cf. 24A-2) : seule
--                                     l'Edge Function `signature` y touche.
--     - public.signature_journal    : journal append-only et CHAINE (chaque
--                                     ligne porte l'empreinte de la
--                                     precedente) : toute retouche apres
--                                     coup se voit.
--
--   CYCLE DE VIE D'UNE DEMANDE :
--
--     brouillon --(envoi)--> en_cours --(dernier signataire)--> terminee
--                                     \--(annulation, motif)--> annulee
--
--   Le brouillon est prepare par l'application (createur = super_admin).
--   Tout le reste (envoi, code, signature, refus, relance, annulation,
--   scellement) passe par l'Edge Function, via les fonctions de 24C-1.
--
--   LES VERROUS (declencheurs) S'APPLIQUENT A TOUT LE MONDE, Edge Function
--   comprise : un bug du serveur ne peut pas reecrire un document envoye ni
--   une signature donnee. Seul l'administrateur de la base (role postgres)
--   pourrait desactiver un declencheur -- c'est pour cela que le journal est
--   chaine : la retouche resterait visible.
--
--   CHOIX DES REGLES DE SUPPRESSION :
--     - createur_id, profil_id, acteur_id : ON DELETE RESTRICT. Un medecin
--       qui part n'efface ni ses demandes ni ses signatures (preuves).
--     - signataires -> demande : CASCADE, mais le verrou n'autorise la
--       suppression d'une demande QUE en brouillon (rien n'a ete signe).
--     - journal -> demande : RESTRICT. Le journal commence a l'envoi : une
--       demande envoyee ne peut donc plus jamais etre supprimee.
--
-- COMMENT EXECUTER CE SCRIPT :
--
--   D'abord sur l'environnement de test (yjttfdwjbyufpavwxcpy), puis en
--   production apres une sauvegarde 23-16 --go. Executer 24A-1 puis 24A-2
--   (tant que 24A-2 n'est pas passe, les tables sont inaccessibles depuis
--   l'application : RLS activee sans policy).
--
-- COMMENT VERIFIER :
--
--   Le SELECT final liste les 4 tables et leur nombre de declencheurs
--   (demandes 2, signataires 1, codes 0, journal 3).
--
-- POUR ANNULER (tant qu'aucune demande n'a ete envoyee) :
--
--   drop table if exists public.signature_journal;
--   alter table if exists public.signature_signataires
--     drop constraint if exists signature_signataires_code_id_fkey;
--   drop table if exists public.signature_codes;
--   drop table if exists public.signature_signataires;
--   drop table if exists public.signature_demandes;
--   drop function if exists public.signature_demandes_verrou();
--   drop function if exists public.signature_signataires_verrou();
--   drop function if exists public.signature_journal_interdit();
--   drop function if exists public.signature_journal_chainer();
--   drop function if exists public.signature_journal_ligne(public.signature_journal);
--   drop function if exists public.signature_verifier_journal(uuid);
--
-- IDEMPOTENCE : create ... if not exists / create or replace / drop trigger
--   if exists : le script peut etre rejoue sans erreur.
--
-- =============================================================================


-- 1) Les demandes ------------------------------------------------------------
create table if not exists public.signature_demandes (
  id                uuid primary key default gen_random_uuid(),
  type              text not null default 'autre'
                      check (type in ('avenant', 'pv', 'feuille_presence',
                                      'contrat_remplacement', 'autre')),
  titre             text not null check (length(btrim(titre)) between 1 and 200),
  description       text check (description is null or length(description) <= 2000),
  statut            text not null default 'brouillon'
                      check (statut in ('brouillon', 'en_cours', 'terminee', 'annulee')),
  ordre_impose      boolean not null default false,
  -- Document source : depose en brouillon, FIGE a l'envoi.
  -- Le chemin est impose (pas de pointeur vers le fichier d'une autre demande).
  source_chemin     text check (source_chemin is null or source_chemin = id::text || '/source.pdf'),
  source_nom        text check (source_nom is null or length(source_nom) <= 255),
  source_taille     bigint check (source_taille is null or (source_taille > 0 and source_taille <= 20971520)),
  source_empreinte  text check (source_empreinte is null or source_empreinte ~ '^[0-9a-f]{64}$'),
  -- Document final scelle (page de preuve ajoutee).
  final_chemin      text check (final_chemin is null or final_chemin = id::text || '/final.pdf'),
  final_empreinte   text check (final_empreinte is null or final_empreinte ~ '^[0-9a-f]{64}$'),
  -- Champs propres au type (etape 25 : remplace, remplacant, dates...).
  metadonnees       jsonb not null default '{}'::jsonb check (jsonb_typeof(metadonnees) = 'object'),
  createur_id       uuid not null references public.profiles(id) on delete restrict,
  envoyee_at        timestamptz,
  terminee_at       timestamptz,
  annulee_at        timestamptz,
  motif_annulation  text check (motif_annulation is null or length(motif_annulation) <= 1000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Un brouillon n'a ni envoi, ni empreinte figee, ni document final.
  constraint signature_demandes_brouillon_vierge check (
    statut <> 'brouillon' or (envoyee_at is null and final_chemin is null
      and final_empreinte is null and terminee_at is null and annulee_at is null)),
  -- Hors brouillon : le document source et son empreinte sont obligatoires.
  constraint signature_demandes_envoi_complet check (
    statut = 'brouillon' or (source_chemin is not null and source_nom is not null
      and source_empreinte is not null and envoyee_at is not null)),
  constraint signature_demandes_terminee_complete check (
    statut <> 'terminee' or (final_chemin is not null and final_empreinte is not null
      and terminee_at is not null)),
  constraint signature_demandes_annulee_complete check (
    statut <> 'annulee' or (annulee_at is not null and motif_annulation is not null))
);


-- 2) Les signataires ---------------------------------------------------------
create table if not exists public.signature_signataires (
  id                    uuid primary key default gen_random_uuid(),
  demande_id            uuid not null references public.signature_demandes(id) on delete cascade,
  profil_id             uuid not null references public.profiles(id) on delete restrict,
  ordre                 smallint not null check (ordre between 1 and 50),
  qualite               text check (qualite is null or length(qualite) <= 100),
  statut                text not null default 'en_attente'
                          check (statut in ('en_attente', 'signe', 'refuse')),
  -- Identite figee a l'envoi : la fiche peut changer ensuite, pas la preuve.
  nom_fige              text,
  email_fige            text,
  -- Premiere ouverture du document (le bouton Signer n'apparait qu'apres).
  consulte_at           timestamptz,
  -- Preuve de la signature.
  signe_at              timestamptz,
  ip                    inet,
  user_agent            text,
  consentement_texte    text,
  consentement_version  text,
  empreinte_validee     text check (empreinte_validee is null or empreinte_validee ~ '^[0-9a-f]{64}$'),
  code_id               uuid,   -- cle etrangere posee apres signature_codes (section 3)
  -- Refus.
  refuse_at             timestamptz,
  motif_refus           text check (motif_refus is null or length(motif_refus) <= 1000),
  -- Relances.
  derniere_relance_at   timestamptz,
  nb_relances           integer not null default 0 check (nb_relances >= 0),
  created_at            timestamptz not null default now(),

  constraint signature_signataires_un_par_profil unique (demande_id, profil_id),
  constraint signature_signataires_ordre_unique  unique (demande_id, ordre),
  constraint signature_signataires_signe_complet check (
    statut <> 'signe' or (signe_at is not null and consentement_texte is not null
      and consentement_version is not null and empreinte_validee is not null
      and code_id is not null and nom_fige is not null and email_fige is not null)),
  constraint signature_signataires_refus_complet check (
    statut <> 'refuse' or (refuse_at is not null and motif_refus is not null))
);


-- 3) Les codes a usage unique (jamais lus par l'application) ----------------
create table if not exists public.signature_codes (
  id                  uuid primary key default gen_random_uuid(),
  signataire_id       uuid not null references public.signature_signataires(id) on delete restrict,
  -- HMAC-SHA256(code, secret de l'Edge Function), en hexadecimal. Jamais le
  -- code en clair, et pas un simple hachage : un code a 6 chiffres se
  -- retrouverait en essayant le million de possibilites.
  code_hmac           text not null check (code_hmac ~ '^[0-9a-f]{64}$'),
  email_destinataire  text not null,
  resend_message_id   text,
  envoye_at           timestamptz not null default now(),
  expire_at           timestamptz not null,
  essais              smallint not null default 0 check (essais between 0 and 5),
  utilise_at          timestamptz,
  invalide_at         timestamptz,
  constraint signature_codes_expiration check (expire_at > envoye_at)
);

-- Un seul code actif (ni utilise, ni invalide) par signataire.
create unique index if not exists signature_codes_un_actif
  on public.signature_codes (signataire_id)
  where utilise_at is null and invalide_at is null;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'signature_signataires_code_id_fkey') then
    alter table public.signature_signataires
      add constraint signature_signataires_code_id_fkey
      foreign key (code_id) references public.signature_codes(id) on delete restrict;
  end if;
end $$;


-- 4) Le journal (append-only, chaine) ---------------------------------------
create table if not exists public.signature_journal (
  id                    bigint generated always as identity primary key,
  demande_id            uuid not null references public.signature_demandes(id) on delete restrict,
  signataire_id         uuid references public.signature_signataires(id) on delete restrict,
  acteur_id             uuid references public.profiles(id) on delete restrict,
  evenement             text not null check (evenement in (
                          'envoi', 'consultation', 'code_envoye', 'code_faux',
                          'code_bloque', 'signature', 'refus', 'relance',
                          'annulation', 'scellement')),
  details               jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  ip                    inet,
  user_agent            text,
  created_at            timestamptz not null default clock_timestamp(),
  empreinte_precedente  text,
  empreinte             text not null
);


-- 5) Index ---------------------------------------------------------------------
create index if not exists signature_demandes_createur_idx   on public.signature_demandes (createur_id);
create index if not exists signature_demandes_statut_idx     on public.signature_demandes (statut);
create index if not exists signature_signataires_demande_idx on public.signature_signataires (demande_id);
create index if not exists signature_signataires_profil_idx  on public.signature_signataires (profil_id);
create index if not exists signature_journal_demande_idx     on public.signature_journal (demande_id, id);


-- 6) RLS activee (policies en 24A-2 ; signature_codes n'en aura AUCUNE) ------
alter table public.signature_demandes    enable row level security;
alter table public.signature_signataires enable row level security;
alter table public.signature_codes       enable row level security;
alter table public.signature_journal     enable row level security;


-- 7) Verrou des demandes -------------------------------------------------------
--    SECURITY DEFINER : il lit signature_signataires sans dependre des droits
--    de l'appelant (et sans repasser par ses policies).
create or replace function public.signature_demandes_verrou()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.statut <> 'brouillon' then
      raise exception 'Demande % envoyee : suppression interdite', old.id
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.id <> old.id or new.createur_id <> old.createur_id
     or new.created_at <> old.created_at then
    raise exception 'Identifiant, createur et date de creation sont immuables'
      using errcode = 'check_violation';
  end if;

  if old.statut in ('terminee', 'annulee') then
    raise exception 'Demande % close (%) : plus aucune modification', old.id, old.statut
      using errcode = 'check_violation';
  end if;

  if old.statut = 'brouillon' then
    if new.statut not in ('brouillon', 'en_cours') then
      raise exception 'Un brouillon ne peut que partir en signature'
        using errcode = 'check_violation';
    end if;
    if new.statut = 'en_cours' and not exists (
         select 1 from public.signature_signataires where demande_id = new.id) then
      raise exception 'Envoi impossible : aucun signataire'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- old.statut = 'en_cours' : le contenu est FIGE.
  if new.type is distinct from old.type
     or new.titre is distinct from old.titre
     or new.description is distinct from old.description
     or new.ordre_impose is distinct from old.ordre_impose
     or new.source_chemin is distinct from old.source_chemin
     or new.source_nom is distinct from old.source_nom
     or new.source_taille is distinct from old.source_taille
     or new.source_empreinte is distinct from old.source_empreinte
     or new.metadonnees is distinct from old.metadonnees
     or new.envoyee_at is distinct from old.envoyee_at then
    raise exception 'Demande % envoyee : son contenu est fige', old.id
      using errcode = 'check_violation';
  end if;

  if new.statut not in ('en_cours', 'terminee', 'annulee') then
    raise exception 'Transition de statut interdite : % -> %', old.statut, new.statut
      using errcode = 'check_violation';
  end if;

  if new.statut = 'en_cours' and (new.final_chemin is not null or new.final_empreinte is not null) then
    raise exception 'Le document final ne se pose qu''a la cloture'
      using errcode = 'check_violation';
  end if;

  if new.statut = 'terminee' and exists (
       select 1 from public.signature_signataires
        where demande_id = new.id and statut <> 'signe') then
    raise exception 'Cloture impossible : tous les signataires n''ont pas signe'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists signature_demandes_verrou on public.signature_demandes;
create trigger signature_demandes_verrou
  before update or delete on public.signature_demandes
  for each row execute function public.signature_demandes_verrou();

drop trigger if exists signature_demandes_set_updated_at on public.signature_demandes;
create trigger signature_demandes_set_updated_at
  before update on public.signature_demandes
  for each row execute function public.set_updated_at();


-- 8) Verrou des signataires ---------------------------------------------------
create or replace function public.signature_signataires_verrou()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_statut_demande text;
  v_ligne          public.signature_signataires;
begin
  v_ligne := case when tg_op = 'DELETE' then old else new end;
  select statut into v_statut_demande
    from public.signature_demandes where id = v_ligne.demande_id;

  if tg_op = 'DELETE' then
    -- Demande introuvable = suppression en cascade d'un brouillon : permis.
    if v_statut_demande is not null and v_statut_demande <> 'brouillon' then
      raise exception 'Demande envoyee : un signataire ne peut plus etre retire'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if v_statut_demande is null then
    raise exception 'Demande % introuvable', new.demande_id
      using errcode = 'foreign_key_violation';
  end if;

  if tg_op = 'UPDATE' and (new.id <> old.id or new.demande_id <> old.demande_id
                           or new.created_at <> old.created_at) then
    raise exception 'Identifiant, demande et date de creation sont immuables'
      using errcode = 'check_violation';
  end if;

  if v_statut_demande = 'brouillon' then
    -- Le signataire doit etre un compte actif d'un role medecin (liste
    -- blanche : poste_bureau ne signe jamais, un role ajoute plus tard non plus).
    if not exists (select 1 from public.profiles
                    where id = new.profil_id and actif
                      and role in ('super_admin', 'associe_gerant', 'associe', 'remplacant')) then
      raise exception 'Signataire refuse : compte inactif ou role non autorise'
        using errcode = 'check_violation';
    end if;
    if new.statut <> 'en_attente' or new.consulte_at is not null or new.signe_at is not null
       or new.ip is not null or new.user_agent is not null
       or new.consentement_texte is not null or new.consentement_version is not null
       or new.empreinte_validee is not null or new.code_id is not null
       or new.refuse_at is not null or new.motif_refus is not null
       or new.derniere_relance_at is not null or new.nb_relances <> 0 then
      raise exception 'Brouillon : aucune preuve ne peut etre pre-remplie'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- Demande envoyee (ou close).
  if tg_op = 'INSERT' then
    raise exception 'Demande envoyee : aucun signataire ne peut etre ajoute'
      using errcode = 'check_violation';
  end if;

  if v_statut_demande in ('terminee', 'annulee') then
    raise exception 'Demande close : signataires figes'
      using errcode = 'check_violation';
  end if;

  if old.statut in ('signe', 'refuse') then
    raise exception 'Signataire % deja %, ligne figee', old.id, old.statut
      using errcode = 'check_violation';
  end if;

  if new.profil_id <> old.profil_id or new.ordre <> old.ordre
     or new.qualite is distinct from old.qualite
     or new.nom_fige is distinct from old.nom_fige
     or new.email_fige is distinct from old.email_fige then
    raise exception 'Demande envoyee : identite et ordre des signataires figes'
      using errcode = 'check_violation';
  end if;

  if old.consulte_at is not null and new.consulte_at is distinct from old.consulte_at then
    raise exception 'La date de premiere consultation ne se modifie pas'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists signature_signataires_verrou on public.signature_signataires;
create trigger signature_signataires_verrou
  before insert or update or delete on public.signature_signataires
  for each row execute function public.signature_signataires_verrou();


-- 9) Journal : contenu canonique d'une ligne, chainage, interdiction ----------
--    La forme canonique sert a calculer ET a re-verifier l'empreinte.
--    jsonb::text est deterministe (cles triees par Postgres).
create or replace function public.signature_journal_ligne(j public.signature_journal)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select concat_ws('|',
    coalesce(j.empreinte_precedente, ''),
    j.id::text,
    j.demande_id::text,
    coalesce(j.signataire_id::text, ''),
    coalesce(j.acteur_id::text, ''),
    j.evenement,
    j.details::text,
    coalesce(host(j.ip), ''),
    coalesce(j.user_agent, ''),
    to_char(j.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
$$;

create or replace function public.signature_journal_chainer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Un verrou par demande : deux ecritures simultanees ne peuvent pas
  -- s'accrocher au meme maillon precedent.
  perform pg_advisory_xact_lock(hashtextextended('signature_journal:' || new.demande_id::text, 0));

  select j.empreinte into new.empreinte_precedente
    from public.signature_journal j
   where j.demande_id = new.demande_id
   order by j.id desc
   limit 1;

  new.created_at := clock_timestamp();   -- horloge serveur, jamais celle du client
  new.empreinte := encode(extensions.digest(public.signature_journal_ligne(new), 'sha256'), 'hex');
  return new;
end;
$$;

create or replace function public.signature_journal_interdit()
returns trigger
language plpgsql
as $$
begin
  raise exception 'signature_journal est en ajout seul : % interdit', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists signature_journal_chainer on public.signature_journal;
create trigger signature_journal_chainer
  before insert on public.signature_journal
  for each row execute function public.signature_journal_chainer();

drop trigger if exists signature_journal_interdit_ligne on public.signature_journal;
create trigger signature_journal_interdit_ligne
  before update or delete on public.signature_journal
  for each row execute function public.signature_journal_interdit();

drop trigger if exists signature_journal_interdit_vidage on public.signature_journal;
create trigger signature_journal_interdit_vidage
  before truncate on public.signature_journal
  for each statement execute function public.signature_journal_interdit();


-- 10) Re-verification de la chaine d'une demande ------------------------------
--     Renvoie le nombre de maillons casses (0 = journal intact).
create or replace function public.signature_verifier_journal(p_demande_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ordonne as (
    select j,
           lag(j.empreinte) over (order by j.id) as attendue_precedente
      from public.signature_journal j
     where j.demande_id = p_demande_id
  )
  select count(*)::integer
    from ordonne
   where (j).empreinte_precedente is distinct from attendue_precedente
      or (j).empreinte <> encode(extensions.digest(public.signature_journal_ligne(j), 'sha256'), 'hex');
$$;

revoke all on function public.signature_verifier_journal(uuid) from public, anon;
grant execute on function public.signature_verifier_journal(uuid) to service_role;


-- Verification ------------------------------------------------------------------
select c.relname as table_name,
       (select count(*) from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal) as declencheurs,
       c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('signature_demandes', 'signature_signataires', 'signature_codes', 'signature_journal')
 order by c.relname;
