-- =====================================================================
-- Etape 22 / MOD-1 / sous-etape 6E-2
-- La porte d'entree unique des plans de roulement
--
-- 6B a pose le verrou : aucune policy insert / update / delete n'existe
-- sur rotation_plans ni rotation_plan_rules, pas meme pour un
-- coordinateur. C'etait volontaire -- l'ecriture directe par
-- l'application est ce qui a fait deriver la base du fichier pendant
-- sept mois. Ce script pose la SEULE porte : une fonction
-- `security definer` qui lit le JSON produit par 6E-1 et cree un plan
-- en brouillon.
--
-- Ce que ce script ajoute :
--   1. agenda.rotation_import_mappings -- la memoire des correspondances
--      entre les codes du fichier (« CB », « J1 ») et les enregistrements
--      de la base. Pre-remplit l'ecran de 6E-3 pour que seules les
--      ambiguites demandent une action.
--   2. agenda.importer_plan_roulement(...) -- la fonction d'import, avec
--      un mode « verifier seulement » qui produit le rapport sans rien
--      ecrire.
--
-- Idempotent : reexecutable sans dommage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La memoire des correspondances
--
-- Le fichier de roulement ne contient que des codes : « CB », « Beaune »,
-- « J1 ». Aucun nom complet, aucun email, aucun identifiant. La
-- correspondance vers les comptes ne peut donc pas etre devinee -- elle
-- se decide une fois, a l'ecran, puis se memorise ici.
--
-- Pourquoi une table plutot qu'une constante dans le code : elle doit
-- survivre a l'arrivee d'un dixieme associe ou d'un troisieme site sans
-- livraison de code. C'est exactement le cas d'usage « association d'un
-- nouveau medecin » de MOD-1.
--
-- target_id designe trois tables differentes selon `kind` : une cle
-- etrangere est donc impossible. Le controle est fait par trigger
-- (section 3) -- une reference polymorphe non verifiee finirait par
-- pointer dans le vide.
-- ---------------------------------------------------------------------
create table if not exists agenda.rotation_import_mappings (
  id         uuid primary key default gen_random_uuid(),

  kind       text not null,
  file_code  text not null,          -- le code tel qu'il est ecrit dans le fichier
  file_site  text,                   -- renseigne pour les creneaux seulement
  target_id  uuid not null,          -- profiles.id / sites.id / shift_types.id

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,

  constraint rotation_import_mappings_kind_valide
    check (kind in ('doctor', 'site', 'shift_type')),

  -- Un creneau se resout par un COUPLE (site, code) : « J1 » n'existe
  -- qu'a Beaune, « J5 » qu'a Dijon, et la table shift_types n'a pas de
  -- colonne site -- le site vit dans le nom (« J1 Beaune »). Les
  -- medecins et les sites, eux, se resolvent par leur seul code.
  constraint rotation_import_mappings_site_si_creneau
    check ((kind = 'shift_type') = (file_site is not null))
);

-- Comparaison insensible a la casse : le fichier ecrit « Beaune » en
-- en-tete mais le parseur a deja vu « beaune » en minuscules dans un nom
-- de creneau. Deux correspondances qui ne different que par la casse
-- seraient un piege silencieux.
create unique index if not exists rotation_import_mappings_unique
  on agenda.rotation_import_mappings
     (kind, lower(file_code), coalesce(lower(file_site), ''));

drop trigger if exists set_rotation_import_mappings_updated_at
  on agenda.rotation_import_mappings;
create trigger set_rotation_import_mappings_updated_at
  before update on agenda.rotation_import_mappings
  for each row execute function agenda.set_updated_at();

comment on table agenda.rotation_import_mappings is
  'Correspondances memorisees entre les codes du fichier de roulement et '
  'les enregistrements de la base. Alimentee par agenda.importer_plan_roulement.';

-- ---------------------------------------------------------------------
-- 2. Le controle de la reference polymorphe
--
-- Verifie que target_id pointe bien dans la table qu'annonce `kind`.
-- Sans cela, rien n'empecherait de faire pointer un code medecin vers un
-- site : l'import creerait alors des regles absurdes, et l'erreur ne se
-- verrait qu'a l'ecran du roulement, longtemps apres.
-- ---------------------------------------------------------------------
create or replace function agenda.valider_correspondance_import()
returns trigger
language plpgsql
security definer
set search_path = agenda, public
as $$
declare
  existe boolean;
begin
  if new.kind = 'doctor' then
    select exists (select 1 from public.profiles where id = new.target_id) into existe;
  elsif new.kind = 'site' then
    select exists (select 1 from agenda.sites where id = new.target_id) into existe;
  else
    select exists (select 1 from agenda.shift_types where id = new.target_id) into existe;
  end if;

  if not existe then
    raise exception
      'Correspondance % : la cible % n''existe pas dans la table attendue',
      new.kind, new.target_id;
  end if;

  return new;
end;
$$;

drop trigger if exists valider_correspondance_import
  on agenda.rotation_import_mappings;
create trigger valider_correspondance_import
  before insert or update on agenda.rotation_import_mappings
  for each row execute function agenda.valider_correspondance_import();

-- ---------------------------------------------------------------------
-- 3. RLS -- lecture par les coordinateurs, ecriture par la fonction seule
--
-- Meme principe qu'en 6B : aucune policy d'ecriture. L'ecran de
-- correspondance LIT cette table pour se pre-remplir, mais n'y ecrit
-- jamais directement -- la memorisation se fait au moment de l'import,
-- dans la fonction, une fois les correspondances effectivement
-- utilisees. Une seule porte, la meme pour tout.
--
-- Lecture reservee aux coordinateurs : contrairement au roulement, cette
-- table n'interesse qu'eux, et elle expose la structure du fichier.
-- ---------------------------------------------------------------------
alter table agenda.rotation_import_mappings enable row level security;

drop policy if exists "Lire les correspondances d'import"
  on agenda.rotation_import_mappings;
create policy "Lire les correspondances d'import"
  on agenda.rotation_import_mappings for select
  to authenticated
  using (agenda.est_coordinateur());

revoke all on agenda.rotation_import_mappings from authenticated;
grant select on agenda.rotation_import_mappings to authenticated;

-- ---------------------------------------------------------------------
-- 4. Amorcage des correspondances connues
--
-- Les MEDECINS : le code se derive du nom -- initiale du prenom, puis
-- initiale de chaque mot du nom. Regle deja utilisee par la grille de
-- 6D, verifiee sur les 9 associes (« Imane EL GARI » -> IEG). On
-- n'amorce que les medecins deja presents dans le plan actif : un
-- dixieme associe passera par l'ecran de correspondance, c'est
-- precisement sa raison d'etre.
--
-- Pourquoi deriver plutot qu'ecrire les 9 lignes a la main : une liste
-- de noms recopiee dans un script est une source de verite de plus. La
-- verification de la section 6 controle que la derivation produit bien
-- les 9 codes attendus.
-- ---------------------------------------------------------------------
insert into agenda.rotation_import_mappings (kind, file_code, target_id)
select 'doctor',
       upper(left(pr.prenom, 1) ||
             (select string_agg(left(m.mot, 1), '' order by m.ord)
                from regexp_split_to_table(pr.nom, '\s+')
                     with ordinality as m(mot, ord))),
       pr.id
  from public.profiles pr
 where exists (select 1
                 from agenda.rotation_plan_rules r
                 join agenda.rotation_plans p on p.id = r.plan_id
                where r.doctor_id = pr.id and p.status = 'active')
on conflict do nothing;

-- Les SITES : le fichier ecrit le nom du site tel qu'il est en base.
insert into agenda.rotation_import_mappings (kind, file_code, target_id)
select 'site', si.name, si.id
  from agenda.sites si
 where si.is_active
on conflict do nothing;

-- Les CRENEAUX : source de verite `desiderata.yaml`, section
-- `correspondance_agenda`. Cette table ne peut pas se deriver -- « Garde »
-- devient « WE1 beaune 08h-20h », et les irregularites de saisie des noms
-- en base (« WE 2 Dijon », « beaune » en minuscules) interdisent toute
-- regle mecanique.
--
-- Le bloc echoue avec la liste des manquants si un creneau attendu est
-- absent de la base, plutot que d'amorcer une table incomplete : une
-- correspondance absente se rattrape a l'ecran, mais il faut le savoir.
do $$
declare
  v_manquants text;
begin
  create temporary table tmp_creneaux_attendus
    (file_site text, file_code text, nom_en_base text) on commit drop;

  insert into tmp_creneaux_attendus values
    ('Beaune', 'J1',      'J1 Beaune'),
    ('Beaune', 'J2',      'J2 Beaune'),
    ('Beaune', 'J3',      'J3 Beaune'),
    ('Beaune', 'J4',      'J4 Beaune'),
    ('Beaune', 'J6',      'J6 Beaune'),
    ('Beaune', 'J7',      'J7 Beaune'),
    ('Beaune', 'J8',      'J8 Beaune'),
    ('Beaune', 'Garde',   'WE1 beaune 08h-20h'),
    ('Beaune', 'Doublon', 'WE2 beaune 08h-20h'),
    ('Dijon',  'J2',      'J2 Dijon'),
    ('Dijon',  'J3',      'J3 Dijon'),
    ('Dijon',  'J4',      'J4 Dijon'),
    ('Dijon',  'J5',      'J5 Dijon'),
    ('Dijon',  'J6',      'J6 Dijon'),
    ('Dijon',  'J7',      'J7 Dijon'),
    ('Dijon',  'J8',      'J8 Dijon'),
    ('Dijon',  'Garde',   'WE1 Dijon'),
    ('Dijon',  'Doublon', 'WE 2 Dijon');

  select string_agg(a.nom_en_base, ', ' order by a.nom_en_base)
    into v_manquants
    from tmp_creneaux_attendus a
    left join agenda.shift_types st on st.name = a.nom_en_base
   where st.id is null;

  if v_manquants is not null then
    raise exception 'Creneaux attendus absents de la base : %', v_manquants;
  end if;

  insert into agenda.rotation_import_mappings (kind, file_code, file_site, target_id)
  select 'shift_type', a.file_code, a.file_site, st.id
    from tmp_creneaux_attendus a
    join agenda.shift_types st on st.name = a.nom_en_base
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------
-- 5. La fonction d'import
--
-- Entree : le JSON produit par 6E-1, tel quel, plus les trois tables de
-- correspondance arretees a l'ecran (code -> uuid).
--
-- Les correspondances sont passees en parametre plutot que relues ici :
-- l'ecran de 6E-3 part de la memoire (section 1), laisse le coordinateur
-- trancher les ambiguites, et transmet le resultat. La fonction revalide
-- tout de son cote -- un ecran ne protege rien, c'est la lecon de 7C-3.
--
-- p_verifier_seulement : produit le rapport sans rien ecrire. C'est ce
-- que l'ecran appelle pour afficher le recapitulatif avant que le
-- coordinateur ne confirme.
--
-- Le plan est cree en BROUILLON, sans date d'entree en vigueur : c'est
-- 6F qui l'activera, apres l'ecran de differentiel. Un import ne change
-- donc jamais le planning en cours.
-- ---------------------------------------------------------------------
create or replace function agenda.importer_plan_roulement(
  p_payload             jsonb,
  p_medecins            jsonb,                  -- {"CB": "uuid", ...}
  p_sites               jsonb,                  -- {"Beaune": "uuid", ...}
  p_creneaux            jsonb,                  -- {"Beaune|J1": "uuid", ...}
  p_verifier_seulement  boolean default false,
  p_memoriser           boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = agenda, public
as $$
declare
  v_nom          text;
  v_cycle        integer;
  v_date_debut   date;
  v_source       text;
  v_manquants    jsonb;
  v_plan_id      uuid;
  v_regles       integer;
  v_affectations integer;
begin
  -- --- 5.1 Qui appelle -------------------------------------------------
  if not agenda.est_coordinateur() then
    raise exception 'Import du roulement reserve aux coordinateurs';
  end if;

  -- --- 5.2 L'entete du plan --------------------------------------------
  v_nom        := p_payload -> 'plan' ->> 'nom';
  v_cycle      := (p_payload -> 'plan' ->> 'cycle_semaines')::integer;
  v_date_debut := (p_payload -> 'plan' ->> 'date_debut')::date;
  v_source     := p_payload -> 'plan' ->> 'source';

  if v_nom is null or v_cycle is null or v_date_debut is null then
    raise exception
      'JSON incomplet : plan.nom, plan.cycle_semaines et plan.date_debut sont requis';
  end if;

  if jsonb_typeof(p_payload -> 'affectations') <> 'array' then
    raise exception 'JSON incomplet : plan.affectations doit etre un tableau';
  end if;

  v_affectations := jsonb_array_length(p_payload -> 'affectations');
  if v_affectations = 0 then
    raise exception 'Le fichier ne contient aucune affectation';
  end if;

  -- Le controle existe deja en contrainte de table, mais l'erreur y est
  -- illisible. Ici le message dit ce qu'il faut corriger.
  if extract(dow from v_date_debut) <> 1 then
    raise exception
      'La date de debut (%) doit etre un lundi : toute la numerotation des semaines en depend',
      v_date_debut;
  end if;

  -- --- 5.3 Les affectations, mises a plat -------------------------------
  -- `drop` puis `create`, plutot que `if not exists` suivi d'un `delete` :
  -- Supabase active pg_safeupdate pour le role `authenticated`, qui refuse
  -- tout DELETE sans clause WHERE. Le defaut ne se voyait pas par la voie
  -- d'administration -- le role postgres n'a pas ce garde-fou -- mais l'import
  -- echouait des le premier appel depuis le navigateur.
  drop table if exists tmp_affectations;
  create temporary table tmp_affectations (
    medecin  text, semaine integer, jour text, site text, creneau text,
    weekday  integer
  ) on commit drop;

  insert into tmp_affectations (medecin, semaine, jour, site, creneau, weekday)
  select a ->> 'medecin',
         (a ->> 'semaine')::integer,
         a ->> 'jour',
         a ->> 'site',
         a ->> 'creneau',
         -- 0 = dimanche, comme Date.getDay() : convention de la table.
         case lower(a ->> 'jour')
           when 'dimanche' then 0 when 'lundi'    then 1
           when 'mardi'    then 2 when 'mercredi' then 3
           when 'jeudi'    then 4 when 'vendredi' then 5
           when 'samedi'   then 6
         end
    from jsonb_array_elements(p_payload -> 'affectations') a;

  -- --- 5.4 Ce que les correspondances ne couvrent pas --------------------
  -- Un import partiel serait pire qu'un import refuse : il produirait un
  -- roulement troue, et le trou ne se verrait qu'a l'usage.
  select jsonb_strip_nulls(jsonb_build_object(
    'jours',    (select jsonb_agg(distinct jour)    from tmp_affectations where weekday is null),
    'medecins', (select jsonb_agg(distinct medecin) from tmp_affectations
                  where p_medecins -> medecin is null),
    'sites',    (select jsonb_agg(distinct site)    from tmp_affectations
                  where p_sites -> site is null),
    'creneaux', (select jsonb_agg(distinct site || '|' || creneau) from tmp_affectations
                  where p_creneaux -> (site || '|' || creneau) is null)
  )) into v_manquants;

  if v_manquants <> '{}'::jsonb then
    if p_verifier_seulement then
      return jsonb_build_object('ok', false, 'manquants', v_manquants,
                                'affectations', v_affectations);
    end if;
    raise exception 'Correspondances manquantes : %', v_manquants;
  end if;

  -- Une semaine hors du cycle serait une affectation qui ne se declenche
  -- jamais. Le trigger de 6B le refuse deja ligne a ligne ; ici on le dit
  -- avant d'ecrire quoi que ce soit.
  if exists (select 1 from tmp_affectations where semaine > v_cycle or semaine < 1) then
    raise exception
      'Le fichier contient des semaines hors du cycle de % semaines', v_cycle;
  end if;

  if p_verifier_seulement then
    return jsonb_build_object(
      'ok', true,
      'plan', jsonb_build_object('nom', v_nom, 'cycle_semaines', v_cycle,
                                 'date_debut', v_date_debut, 'source', v_source),
      'affectations', v_affectations,
      'medecins', (select count(distinct medecin) from tmp_affectations),
      'sites',    (select count(distinct site)    from tmp_affectations),
      'creneaux', (select count(distinct site || '|' || creneau) from tmp_affectations));
  end if;

  -- --- 5.5 Ecriture -----------------------------------------------------
  insert into agenda.rotation_plans
    (name, start_date, cycle_length_weeks, status,
     effective_from, source_file_name, imported_at, created_by)
  values
    (v_nom, v_date_debut, v_cycle, 'draft',
     null, v_source, now(), (select auth.uid()))
  returning id into v_plan_id;

  insert into agenda.rotation_plan_rules
    (plan_id, doctor_id, site_id, shift_type_id, weekday, rotation_week)
  select v_plan_id,
         (p_medecins ->> t.medecin)::uuid,
         (p_sites    ->> t.site)::uuid,
         (p_creneaux ->> (t.site || '|' || t.creneau))::uuid,
         t.weekday,
         t.semaine
    from tmp_affectations t;

  get diagnostics v_regles = row_count;

  -- --- 5.6 Memorisation -------------------------------------------------
  -- Les correspondances effectivement utilisees deviennent la memoire du
  -- prochain import. On memorise APRES l'ecriture, jamais avant : une
  -- correspondance qui n'a servi a rien n'a pas a etre retenue.
  if p_memoriser then
    insert into agenda.rotation_import_mappings (kind, file_code, target_id, created_by)
    select distinct 'doctor', t.medecin, (p_medecins ->> t.medecin)::uuid, (select auth.uid())
      from tmp_affectations t
    on conflict (kind, lower(file_code), coalesce(lower(file_site), ''))
      do update set target_id = excluded.target_id, updated_at = now();

    insert into agenda.rotation_import_mappings (kind, file_code, target_id, created_by)
    select distinct 'site', t.site, (p_sites ->> t.site)::uuid, (select auth.uid())
      from tmp_affectations t
    on conflict (kind, lower(file_code), coalesce(lower(file_site), ''))
      do update set target_id = excluded.target_id, updated_at = now();

    insert into agenda.rotation_import_mappings
      (kind, file_code, file_site, target_id, created_by)
    select distinct 'shift_type', t.creneau, t.site,
           (p_creneaux ->> (t.site || '|' || t.creneau))::uuid, (select auth.uid())
      from tmp_affectations t
    on conflict (kind, lower(file_code), coalesce(lower(file_site), ''))
      do update set target_id = excluded.target_id, updated_at = now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'plan_id', v_plan_id,
    'nom', v_nom,
    'statut', 'draft',
    'cycle_semaines', v_cycle,
    'date_debut', v_date_debut,
    'regles', v_regles,
    'affectations_lues', v_affectations);
end;
$$;

revoke all on function agenda.importer_plan_roulement(jsonb, jsonb, jsonb, jsonb, boolean, boolean)
  from public, anon;
grant execute on function agenda.importer_plan_roulement(jsonb, jsonb, jsonb, jsonb, boolean, boolean)
  to authenticated;

comment on function agenda.importer_plan_roulement(jsonb, jsonb, jsonb, jsonb, boolean, boolean) is
  'Seule porte d''ecriture des plans de roulement. Cree un plan en brouillon '
  'a partir du JSON de 6E-1. p_verifier_seulement produit le rapport sans ecrire.';

-- ---------------------------------------------------------------------
-- 6. Verifications
-- ---------------------------------------------------------------------
select 'correspondances amorcees' as controle, kind, count(*) as n
  from agenda.rotation_import_mappings
 group by kind
 order by kind;

-- Les 9 codes attendus, d'apres desiderata.yaml. Si la derivation des
-- initiales devait un jour produire autre chose, c'est ici que cela se
-- verrait.
select 'codes medecins derives' as controle,
       string_agg(file_code, ', ' order by file_code) as codes,
       string_agg(file_code, ', ' order by file_code)
         = 'AS, CB, CC, IEG, LD, MC, MY, TE, XB' as conforme
  from agenda.rotation_import_mappings
 where kind = 'doctor';

select 'ecriture directe encore fermee' as controle, cmd, count(*) as policies
  from pg_policies
 where schemaname = 'agenda'
   and tablename in ('rotation_plans', 'rotation_plan_rules', 'rotation_import_mappings')
 group by cmd
 order by cmd;
