-- =============================================================================
-- 25A-1 - Module Contrats (fusion SIM + Signatures) : structure
-- =============================================================================
--
-- OBJECTIF (etape 25, cadrage du 17/11/2026) :
--
--   Le SIM devient le module « Contrats », ouvert aux quatre roles medecins.
--   Trois manieres de voir un fichier du SIM :
--     - membre SIM (super_admin, associe_gerant) : tout, comme avant ;
--     - associe : les dossiers OUVERTS aux associes (et leurs sous-dossiers) ;
--     - toute personne CONCERNEE par un fichier (ses propres contrats).
--   Les documents signes y sont classes automatiquement au scellement.
--
--   Ce script ne pose QUE la structure (colonnes, table, declencheurs).
--   Les droits sont dans 25A-2, le classement dans 25A-3, les donnees dans
--   25A-4. Il ne change RIEN a ce que voit qui que ce soit.
--
-- CONTENU :
--   1. sim_dossiers.ouvert_associes   : dossier visible par les associes
--                                       (herite par les sous-dossiers) ;
--   2. sim_fichiers_concernes         : qui est concerne par quel fichier,
--                                       avec un archivage personnel ;
--   3. sim_fichiers.signature_demande_id : le PDF scelle classe dans le SIM
--                                       (un seul par demande) ;
--   4. signature_demandes.sim_dossier_id : le dossier de destination ;
--   5. verrou des demandes : la destination reste modifiable apres cloture
--      (sinon un dossier vise par une demande close ne pourrait plus jamais
--      etre supprime : la cle etrangere « on delete set null » modifie la
--      demande, ce que le verrou refusait) ;
--   6. verrous du SIM : un fichier signe ne se renomme ni ne se supprime
--      (sauf super_admin) ; seul le super_admin ouvre un dossier aux
--      associes.
--
-- COMMENT EXECUTER : sur le test, puis en production apres la sauvegarde
--   23-16. Rejouable (if not exists / create or replace).
--
-- POUR ANNULER : 25A-9-retour-arriere.sql (apres 25A-2 et 25A-3).
--
-- =============================================================================


-- 1) Dossier ouvert aux associes ------------------------------------------------
alter table public.sim_dossiers
  add column if not exists ouvert_associes boolean not null default false;


-- 2) Personnes concernees par un fichier ---------------------------------------
-- Une table plutot qu'un tableau dans sim_fichiers : cles etrangeres, index
-- sur la personne (« mes contrats » est la requete frequente), et une RLS
-- simple ligne par ligne. archive_at : archivage PERSONNEL (chacun range ses
-- contrats termines sans rien changer pour les autres).
create table if not exists public.sim_fichiers_concernes (
  fichier_id  uuid not null references public.sim_fichiers(id) on delete cascade,
  profil_id   uuid not null references public.profiles(id) on delete restrict,
  archive_at  timestamptz,
  ajoute_par  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (fichier_id, profil_id)
);
create index if not exists sim_fichiers_concernes_profil_idx
  on public.sim_fichiers_concernes (profil_id);


-- 3) PDF scelle classe dans le SIM ---------------------------------------------
alter table public.sim_fichiers
  add column if not exists signature_demande_id uuid
    references public.signature_demandes(id) on delete restrict;
create unique index if not exists sim_fichiers_signature_demande_uidx
  on public.sim_fichiers (signature_demande_id)
  where signature_demande_id is not null;


-- 4) Dossier de destination d'une demande ---------------------------------------
alter table public.signature_demandes
  add column if not exists sim_dossier_id uuid
    references public.sim_dossiers(id) on delete set null;
create index if not exists signature_demandes_sim_dossier_idx
  on public.signature_demandes (sim_dossier_id);

-- L'appli choisit la destination en preparant le brouillon (les policies de
-- 24A-2 limitent deja l'ecriture au createur d'un brouillon).
grant insert (sim_dossier_id) on public.signature_demandes to authenticated;
grant update (sim_dossier_id) on public.signature_demandes to authenticated;


-- 5) Verrou des demandes : seule retouche du moteur ----------------------------
-- Copie A L'IDENTIQUE de la production (pg_get_functiondef du 17/11/2026),
-- sauf le bloc « demande close » : une modification qui ne touche QUE la
-- destination (et updated_at, pose par l'autre declencheur) est toleree.
-- La destination sert au rangement, pas a la preuve : le document, les
-- signataires et les empreintes restent figes.
create or replace function public.signature_demandes_verrou()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
    -- 25A-1 : seule la destination (rangement) peut encore bouger.
    if (to_jsonb(new) - 'sim_dossier_id' - 'updated_at')
       = (to_jsonb(old) - 'sim_dossier_id' - 'updated_at') then
      return new;
    end if;
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
$function$;


-- 6) Verrous du SIM --------------------------------------------------------------
-- Pourquoi des declencheurs et pas seulement la RLS : la RLS dit QUI peut
-- modifier une ligne, pas QUELLE colonne. Un gerant auteur d'un dossier peut
-- le renommer (RLS) mais ne doit pas l'ouvrir aux associes (declencheur).
-- auth.uid() nul = serveur (Edge Function, scripts) : jamais bloque.

-- Fichiers : un fichier signe est une piece du dossier de preuve.
create or replace function public.sim_fichiers_verrou()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_appli boolean := (select auth.uid()) is not null;
begin
  if tg_op = 'INSERT' then
    if v_appli and new.signature_demande_id is not null then
      raise exception 'Seul le serveur classe un document signe'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.signature_demande_id is distinct from old.signature_demande_id then
      raise exception 'Le lien vers la demande de signature est immuable'
        using errcode = 'check_violation';
    end if;
    if v_appli and old.signature_demande_id is not null
       and not public.is_super_admin()
       and (new.nom is distinct from old.nom or new.dossier_id is distinct from old.dossier_id) then
      raise exception 'Document signe : seul un super_admin peut le renommer ou le deplacer'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- DELETE
  if v_appli and old.signature_demande_id is not null and not public.is_super_admin() then
    raise exception 'Document signe : seul un super_admin peut le supprimer'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists sim_fichiers_verrou on public.sim_fichiers;
create trigger sim_fichiers_verrou
  before insert or update or delete on public.sim_fichiers
  for each row execute function public.sim_fichiers_verrou();

-- Dossiers : ouvrir (ou fermer) un dossier aux associes = super_admin seul.
create or replace function public.sim_dossiers_verrou()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is not null and not public.is_super_admin()
     and new.ouvert_associes is distinct from
         (case when tg_op = 'INSERT' then false else old.ouvert_associes end) then
    raise exception 'Seul un super_admin ouvre un dossier aux associes'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists sim_dossiers_verrou on public.sim_dossiers;
create trigger sim_dossiers_verrou
  before insert or update on public.sim_dossiers
  for each row execute function public.sim_dossiers_verrou();

revoke all on function public.sim_fichiers_verrou() from public, anon, authenticated;
revoke all on function public.sim_dossiers_verrou() from public, anon, authenticated;


-- Verification -------------------------------------------------------------------
select 'colonne' as quoi, table_name || '.' || column_name as detail
  from information_schema.columns
 where table_schema = 'public'
   and (table_name, column_name) in (('sim_dossiers', 'ouvert_associes'),
                                     ('sim_fichiers', 'signature_demande_id'),
                                     ('signature_demandes', 'sim_dossier_id'))
union all
select 'table', table_name from information_schema.tables
 where table_schema = 'public' and table_name = 'sim_fichiers_concernes'
union all
select 'declencheur', event_object_table || ' ' || trigger_name || ' ' || event_manipulation
  from information_schema.triggers
 where trigger_name in ('sim_fichiers_verrou', 'sim_dossiers_verrou');
