-- =============================================================================
-- 24C-1 - Module Signatures : fonctions serveur (transitions d'etat)
-- =============================================================================
--
-- OBJECTIF :
--
--   Chaque geste qui compte (envoyer, signer, refuser, relancer, annuler,
--   sceller) est UNE fonction SQL, executee en UNE transaction : soit tout
--   est ecrit (statut + preuve + journal), soit rien. L'Edge Function
--   `signature` ne fait que ce que SQL ne sait pas faire : verifier le jeton
--   de connexion, recalculer l'empreinte du PDF, calculer le HMAC du code,
--   envoyer le mail, fabriquer le PDF scelle.
--
--   POURQUOI PAS DES ECRITURES DIRECTES DEPUIS L'EDGE FUNCTION : l'API REST
--   ne sait pas enchainer plusieurs ecritures dans une meme transaction. Un
--   plantage entre « signataire signe » et « ligne de journal » laisserait
--   une signature sans trace.
--
--   DROITS : ces fonctions sont reservees a service_role (l'Edge Function),
--   sauf signature_marquer_consulte, appelee directement par l'appli et
--   bornee a auth.uid(). Chaque fonction re-verifie que l'acteur a le droit
--   d'agir (defense en profondeur : l'Edge Function verifie deja).
--
--   CONCURRENCE : les fonctions verrouillent la LIGNE DE LA DEMANDE
--   (`for update`) avant tout. Deux signataires qui signent a la meme seconde
--   passent donc l'un apres l'autre, et le second voit bien que le premier a
--   signe (sinon personne ne declencherait le scellement).
--
-- COMMENT EXECUTER : apres 24A-1 et 24A-2, sur le test puis en production.
--
-- POUR ANNULER : drop function des 10 fonctions listees dans le SELECT final.
--
-- IDEMPOTENCE : create or replace.
--
-- =============================================================================


-- 0. Outils internes -------------------------------------------------------------

-- Le compte est-il actif et d'un role medecin ?
create or replace function public.signature_compte_medecin_actif(p_profil_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles
                  where id = p_profil_id and actif
                    and role in ('super_admin', 'associe_gerant', 'associe', 'remplacant'));
$$;

-- Est-ce le tour de ce signataire ? Toujours vrai si l'ordre n'est pas
-- impose ; sinon, tous les signataires d'ordre inferieur ont signe.
create or replace function public.signature_est_son_tour(p_signataire_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select not d.ordre_impose
           or not exists (select 1 from public.signature_signataires autre
                           where autre.demande_id = s.demande_id
                             and autre.ordre < s.ordre
                             and autre.statut <> 'signe')
      from public.signature_signataires s
      join public.signature_demandes d on d.id = s.demande_id
     where s.id = p_signataire_id), false);
$$;


-- 1. Envoi : fige le document et l'identite des signataires --------------------
create or replace function public.signature_envoyer(
  p_demande_id uuid, p_acteur_id uuid, p_empreinte text, p_taille bigint,
  p_ip inet, p_user_agent text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.signature_demandes;
  v_nb integer;
begin
  select * into d from public.signature_demandes where id = p_demande_id for update;
  if not found then raise exception 'Demande introuvable'; end if;
  if d.statut <> 'brouillon' then raise exception 'Demande deja envoyee'; end if;
  if d.createur_id <> p_acteur_id then raise exception 'Seul le createur peut envoyer'; end if;
  if not exists (select 1 from public.profiles
                  where id = p_acteur_id and actif and role = 'super_admin') then
    raise exception 'Envoi reserve a un super_admin actif';
  end if;
  if d.source_chemin is null or d.source_nom is null then
    raise exception 'Aucun document depose';
  end if;
  if p_empreinte !~ '^[0-9a-f]{64}$' then raise exception 'Empreinte invalide'; end if;

  -- Identite figee (pendant que la demande est encore en brouillon).
  update public.signature_signataires s
     set nom_fige = btrim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')),
         email_fige = p.email
    from public.profiles p
   where p.id = s.profil_id and s.demande_id = p_demande_id;
  get diagnostics v_nb = row_count;
  if v_nb = 0 then raise exception 'Aucun signataire'; end if;

  if exists (select 1 from public.signature_signataires s
              where s.demande_id = p_demande_id
                and not public.signature_compte_medecin_actif(s.profil_id)) then
    raise exception 'Un signataire n''est plus actif';
  end if;
  if exists (select 1 from public.signature_signataires s
              where s.demande_id = p_demande_id and coalesce(s.email_fige, '') = '') then
    raise exception 'Un signataire n''a pas d''adresse mail';
  end if;

  update public.signature_demandes
     set statut = 'en_cours', source_empreinte = p_empreinte,
         source_taille = p_taille, envoyee_at = now()
   where id = p_demande_id;

  insert into public.signature_journal (demande_id, acteur_id, evenement, details, ip, user_agent)
  values (p_demande_id, p_acteur_id, 'envoi',
          jsonb_build_object('titre', d.titre, 'type', d.type,
                             'empreinte', p_empreinte, 'taille', p_taille,
                             'nb_signataires', v_nb, 'ordre_impose', d.ordre_impose),
          p_ip, p_user_agent);

  return jsonb_build_object('nb_signataires', v_nb);
end;
$$;


-- 2. Consultation : premiere ouverture du document par un signataire -----------
--    Appelee DIRECTEMENT par l'appli (pas d'IP ici, ce n'est pas une preuve
--    de consentement, seulement « a ouvert le document »).
create or replace function public.signature_marquer_consulte(p_demande_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  s public.signature_signataires;
begin
  if v_uid is null or not public.signature_compte_medecin_actif(v_uid) then
    return;
  end if;
  perform 1 from public.signature_demandes
   where id = p_demande_id and statut = 'en_cours' for update;
  if not found then return; end if;

  select * into s from public.signature_signataires
   where demande_id = p_demande_id and profil_id = v_uid;
  if not found or s.statut <> 'en_attente' or s.consulte_at is not null then
    return;
  end if;

  update public.signature_signataires set consulte_at = now() where id = s.id;
  insert into public.signature_journal (demande_id, signataire_id, acteur_id, evenement)
  values (p_demande_id, s.id, v_uid, 'consultation');
end;
$$;


-- 3. Code : preparation (avant envoi du mail), puis confirmation d'envoi -------
create or replace function public.signature_preparer_code(
  p_signataire_id uuid, p_acteur_id uuid, p_code_hmac text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.signature_signataires;
  v_code_id uuid;
  v_recents integer;
begin
  select * into s from public.signature_signataires where id = p_signataire_id;
  if not found then raise exception 'Signataire introuvable'; end if;
  perform 1 from public.signature_demandes
   where id = s.demande_id and statut = 'en_cours' for update;
  if not found then raise exception 'Demande non ouverte a la signature'; end if;

  if s.profil_id <> p_acteur_id then raise exception 'Ce n''est pas votre signature'; end if;
  if not public.signature_compte_medecin_actif(p_acteur_id) then raise exception 'Compte inactif'; end if;
  if s.statut <> 'en_attente' then raise exception 'Deja traite'; end if;
  if s.consulte_at is null then raise exception 'Ouvrez le document avant de signer'; end if;
  if not public.signature_est_son_tour(s.id) then raise exception 'Ce n''est pas encore votre tour'; end if;
  if exists (select 1 from public.signature_signataires
              where demande_id = s.demande_id and statut = 'refuse') then
    raise exception 'Demande bloquee par un refus';
  end if;

  -- Anti-abus : 5 codes par heure et par signataire au plus.
  select count(*) into v_recents from public.signature_codes
   where signataire_id = s.id and envoye_at > now() - interval '1 hour';
  if v_recents >= 5 then
    return jsonb_build_object('resultat', 'trop_de_codes');
  end if;

  update public.signature_codes set invalide_at = now()
   where signataire_id = s.id and utilise_at is null and invalide_at is null;

  insert into public.signature_codes (signataire_id, code_hmac, email_destinataire, expire_at)
  values (s.id, p_code_hmac, s.email_fige, now() + interval '10 minutes')
  returning id into v_code_id;

  return jsonb_build_object('resultat', 'pret', 'code_id', v_code_id,
                            'email', s.email_fige, 'demande_id', s.demande_id);
end;
$$;

create or replace function public.signature_confirmer_code(
  p_code_id uuid, p_envoye boolean, p_message_id text, p_ip inet, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.signature_codes;
  s public.signature_signataires;
begin
  select * into c from public.signature_codes where id = p_code_id for update;
  if not found then raise exception 'Code introuvable'; end if;
  select * into s from public.signature_signataires where id = c.signataire_id;

  if not p_envoye then
    -- Le mail n'est pas parti : le code ne doit pas rester actif.
    update public.signature_codes set invalide_at = now() where id = c.id;
    return;
  end if;

  update public.signature_codes set resend_message_id = p_message_id where id = c.id;
  insert into public.signature_journal (demande_id, signataire_id, acteur_id, evenement, details, ip, user_agent)
  values (s.demande_id, s.id, s.profil_id, 'code_envoye',
          jsonb_build_object('email', c.email_destinataire, 'message_id', p_message_id,
                             'expire_at', c.expire_at),
          p_ip, p_user_agent);
end;
$$;


-- 4. Signature : verifie le code, l'empreinte, puis enregistre la preuve -------
create or replace function public.signature_signer(
  p_signataire_id uuid, p_acteur_id uuid, p_code_hmac text, p_empreinte text,
  p_consentement_texte text, p_consentement_version text,
  p_ip inet, p_user_agent text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.signature_signataires;
  d public.signature_demandes;
  c public.signature_codes;
  v_restants integer;
begin
  select * into s from public.signature_signataires where id = p_signataire_id;
  if not found then raise exception 'Signataire introuvable'; end if;
  select * into d from public.signature_demandes where id = s.demande_id for update;
  if d.statut <> 'en_cours' then raise exception 'Demande non ouverte a la signature'; end if;
  -- Relire le signataire APRES le verrou (un appel concurrent a pu signer).
  select * into s from public.signature_signataires where id = p_signataire_id;

  if s.profil_id <> p_acteur_id then raise exception 'Ce n''est pas votre signature'; end if;
  if not public.signature_compte_medecin_actif(p_acteur_id) then raise exception 'Compte inactif'; end if;
  if s.statut <> 'en_attente' then raise exception 'Deja traite'; end if;
  if s.consulte_at is null then raise exception 'Ouvrez le document avant de signer'; end if;
  if not public.signature_est_son_tour(s.id) then raise exception 'Ce n''est pas encore votre tour'; end if;
  if exists (select 1 from public.signature_signataires
              where demande_id = s.demande_id and statut = 'refuse') then
    raise exception 'Demande bloquee par un refus';
  end if;
  if coalesce(btrim(p_consentement_texte), '') = '' or coalesce(p_consentement_version, '') = '' then
    raise exception 'Consentement manquant';
  end if;

  select * into c from public.signature_codes
   where signataire_id = s.id and utilise_at is null and invalide_at is null
   for update;
  if not found then
    return jsonb_build_object('resultat', 'aucun_code');
  end if;
  if c.expire_at < now() then
    update public.signature_codes set invalide_at = now() where id = c.id;
    return jsonb_build_object('resultat', 'expire');
  end if;

  if c.code_hmac <> p_code_hmac then
    update public.signature_codes set essais = essais + 1 where id = c.id
    returning 5 - essais into v_restants;
    insert into public.signature_journal (demande_id, signataire_id, acteur_id, evenement, details, ip, user_agent)
    values (s.demande_id, s.id, p_acteur_id, 'code_faux',
            jsonb_build_object('essais_restants', v_restants), p_ip, p_user_agent);
    if v_restants <= 0 then
      update public.signature_codes set invalide_at = now() where id = c.id;
      insert into public.signature_journal (demande_id, signataire_id, acteur_id, evenement, ip, user_agent)
      values (s.demande_id, s.id, p_acteur_id, 'code_bloque', p_ip, p_user_agent);
      return jsonb_build_object('resultat', 'bloque');
    end if;
    return jsonb_build_object('resultat', 'code_faux', 'essais_restants', v_restants);
  end if;

  -- Le document que le serveur vient de relire doit etre celui envoye.
  if p_empreinte is distinct from d.source_empreinte then
    return jsonb_build_object('resultat', 'document_altere');
  end if;

  update public.signature_codes set utilise_at = now() where id = c.id;

  update public.signature_signataires
     set statut = 'signe', signe_at = now(), ip = p_ip, user_agent = p_user_agent,
         consentement_texte = p_consentement_texte,
         consentement_version = p_consentement_version,
         empreinte_validee = p_empreinte, code_id = c.id
   where id = s.id;

  insert into public.signature_journal (demande_id, signataire_id, acteur_id, evenement, details, ip, user_agent)
  values (s.demande_id, s.id, p_acteur_id, 'signature',
          jsonb_build_object('empreinte', p_empreinte, 'consentement_version', p_consentement_version,
                             'code_id', c.id),
          p_ip, p_user_agent);

  return jsonb_build_object(
    'resultat', 'signe',
    'derniere', not exists (select 1 from public.signature_signataires
                             where demande_id = s.demande_id and statut <> 'signe'),
    'demande_id', s.demande_id);
end;
$$;


-- 5. Refus ------------------------------------------------------------------------
create or replace function public.signature_refuser(
  p_signataire_id uuid, p_acteur_id uuid, p_motif text, p_ip inet, p_user_agent text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.signature_signataires;
begin
  select * into s from public.signature_signataires where id = p_signataire_id;
  if not found then raise exception 'Signataire introuvable'; end if;
  perform 1 from public.signature_demandes
   where id = s.demande_id and statut = 'en_cours' for update;
  if not found then raise exception 'Demande non ouverte a la signature'; end if;
  select * into s from public.signature_signataires where id = p_signataire_id;

  if s.profil_id <> p_acteur_id then raise exception 'Ce n''est pas votre signature'; end if;
  if not public.signature_compte_medecin_actif(p_acteur_id) then raise exception 'Compte inactif'; end if;
  if s.statut <> 'en_attente' then raise exception 'Deja traite'; end if;
  if length(btrim(coalesce(p_motif, ''))) < 3 then raise exception 'Motif obligatoire'; end if;

  update public.signature_codes set invalide_at = now()
   where signataire_id = s.id and utilise_at is null and invalide_at is null;
  update public.signature_signataires
     set statut = 'refuse', refuse_at = now(), motif_refus = btrim(p_motif)
   where id = s.id;
  insert into public.signature_journal (demande_id, signataire_id, acteur_id, evenement, details, ip, user_agent)
  values (s.demande_id, s.id, p_acteur_id, 'refus',
          jsonb_build_object('motif', btrim(p_motif)), p_ip, p_user_agent);

  return jsonb_build_object('demande_id', s.demande_id);
end;
$$;


-- 6. Relance : renvoie les profils a notifier ----------------------------------
create or replace function public.signature_relancer(
  p_demande_id uuid, p_acteur_id uuid, p_ip inet, p_user_agent text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.signature_demandes;
  v_ids uuid[];
begin
  select * into d from public.signature_demandes where id = p_demande_id for update;
  if not found or d.statut <> 'en_cours' then raise exception 'Demande non ouverte a la signature'; end if;
  if not exists (select 1 from public.profiles
                  where id = p_acteur_id and actif
                    and (role = 'super_admin' or id = d.createur_id)) then
    raise exception 'Relance reservee au createur ou a un super_admin';
  end if;

  -- Pas plus d'une relance par heure et par signataire.
  select array_agg(s.profil_id) into v_ids
    from public.signature_signataires s
   where s.demande_id = p_demande_id and s.statut = 'en_attente'
     and public.signature_est_son_tour(s.id)
     and (s.derniere_relance_at is null or s.derniere_relance_at < now() - interval '1 hour');

  if v_ids is null then
    return jsonb_build_object('relances', 0, 'profils', '[]'::jsonb);
  end if;

  update public.signature_signataires
     set nb_relances = nb_relances + 1, derniere_relance_at = now()
   where demande_id = p_demande_id and profil_id = any(v_ids);

  insert into public.signature_journal (demande_id, acteur_id, evenement, details, ip, user_agent)
  values (p_demande_id, p_acteur_id, 'relance',
          jsonb_build_object('profils', to_jsonb(v_ids)), p_ip, p_user_agent);

  return jsonb_build_object('relances', cardinality(v_ids), 'profils', to_jsonb(v_ids));
end;
$$;


-- 7. Annulation ---------------------------------------------------------------------
create or replace function public.signature_annuler(
  p_demande_id uuid, p_acteur_id uuid, p_motif text, p_ip inet, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.signature_demandes;
begin
  select * into d from public.signature_demandes where id = p_demande_id for update;
  if not found or d.statut <> 'en_cours' then raise exception 'Seule une demande en cours peut etre annulee'; end if;
  if not exists (select 1 from public.profiles
                  where id = p_acteur_id and actif
                    and (role = 'super_admin' or id = d.createur_id)) then
    raise exception 'Annulation reservee au createur ou a un super_admin';
  end if;
  if length(btrim(coalesce(p_motif, ''))) < 3 then raise exception 'Motif obligatoire'; end if;

  update public.signature_codes c set invalide_at = now()
    from public.signature_signataires s
   where s.id = c.signataire_id and s.demande_id = p_demande_id
     and c.utilise_at is null and c.invalide_at is null;
  update public.signature_demandes
     set statut = 'annulee', annulee_at = now(), motif_annulation = btrim(p_motif)
   where id = p_demande_id;
  insert into public.signature_journal (demande_id, acteur_id, evenement, details, ip, user_agent)
  values (p_demande_id, p_acteur_id, 'annulation',
          jsonb_build_object('motif', btrim(p_motif)), p_ip, p_user_agent);
end;
$$;


-- 8. Scellement : pose le PDF final ------------------------------------------------
create or replace function public.signature_sceller(
  p_demande_id uuid, p_final_empreinte text, p_journal_empreinte text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.signature_demandes;
  v_dernier text;
begin
  select * into d from public.signature_demandes where id = p_demande_id for update;
  if not found or d.statut <> 'en_cours' then raise exception 'Demande non scellable'; end if;
  if exists (select 1 from public.signature_signataires
              where demande_id = p_demande_id and statut <> 'signe') then
    raise exception 'Tous les signataires n''ont pas signe';
  end if;
  -- La page de preuve cite le dernier maillon du journal : il ne doit pas
  -- avoir bouge entre la fabrication du PDF et sa pose.
  select empreinte into v_dernier from public.signature_journal
   where demande_id = p_demande_id order by id desc limit 1;
  if v_dernier is distinct from p_journal_empreinte then
    raise exception 'Le journal a change pendant le scellement, recommencer';
  end if;

  update public.signature_demandes
     set statut = 'terminee', final_chemin = p_demande_id::text || '/final.pdf',
         final_empreinte = p_final_empreinte, terminee_at = now()
   where id = p_demande_id;
  insert into public.signature_journal (demande_id, evenement, details)
  values (p_demande_id, 'scellement',
          jsonb_build_object('empreinte_finale', p_final_empreinte,
                             'journal_cite', p_journal_empreinte));
end;
$$;


-- 9. Droits ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.signature_compte_medecin_actif(uuid)',
    'public.signature_est_son_tour(uuid)',
    'public.signature_envoyer(uuid, uuid, text, bigint, inet, text)',
    'public.signature_marquer_consulte(uuid)',
    'public.signature_preparer_code(uuid, uuid, text)',
    'public.signature_confirmer_code(uuid, boolean, text, inet, text)',
    'public.signature_signer(uuid, uuid, text, text, text, text, inet, text)',
    'public.signature_refuser(uuid, uuid, text, inet, text)',
    'public.signature_relancer(uuid, uuid, inet, text)',
    'public.signature_annuler(uuid, uuid, text, inet, text)',
    'public.signature_sceller(uuid, text, text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Seule exception : la consultation, appelee par l'appli et bornee a auth.uid().
grant execute on function public.signature_marquer_consulte(uuid) to authenticated;


-- Verification -----------------------------------------------------------------------
select p.proname,
       has_function_privilege('authenticated', p.oid, 'execute') as appli,
       has_function_privilege('service_role', p.oid, 'execute') as serveur
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'signature\_%'
 order by p.proname;
