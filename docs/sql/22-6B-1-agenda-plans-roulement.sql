-- =====================================================================
-- Etape 22 / 6B-1 (MOD-1) : plans de roulement versionnes
--
-- Remplace le couple rotation_settings + rotation_assignment_rules, dont
-- les 4 defauts sont documentes dans integration-agenda.md :
--   1. aucune historisation (modifier le roulement ecrase l'ancien) ;
--   2. changer la duree du cycle decale RETROACTIVEMENT toutes les
--      semaines, passees comprises ;
--   3. saisie case par case uniquement, aucun import en masse ;
--   4. contrainte UNIQUE trop rigide : un seul medecin par case, ce qui
--      rend le "Doublon" du week-end inexprimable.
--
-- PRINCIPE DIRECTEUR (Matthieu, 01/08/2026) : UNE SEULE VERITE. Le plan
-- vient du fichier de roulement valide ; l'application ne le modifie
-- jamais. Les RLS ci-dessous n'accordent donc AUCUNE ecriture, pas meme
-- aux coordinateurs -- voir la section RLS pour le detail.
--
-- Ce script ne cree que le schema. La migration du roulement actuel dans
-- un plan "Roulement V1" est l'objet de 22-6B-2. Les anciennes tables
-- restent en place et continuent de faire tourner le module jusqu'a 6C :
-- a aucun moment on ne se prive d'un retour en arriere.
--
-- Comme les scripts de 7C, celui-ci n'est PAS idempotent : les
-- instructions partant en un seul appel, PostgreSQL les traite en une
-- transaction unique -- un echec en cours de route annule tout.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les plans
--
-- start_date  = ancrage du cycle : la semaine calendaire qui vaut S1.
-- effective_from / effective_to = periode pendant laquelle le plan
--               s'applique reellement.
--
-- LES DEUX SONT DISTINCTS, et le roulement V2 le demontre : ancre au
-- lundi 30/11/2026 pour que le 04/01/2027 tombe en S6 (et non en S1,
-- ce qui romprait la numerotation que les medecins lisent), mais en
-- vigueur seulement a partir du 04/01/2027. Ses semaines S1 a S5 ne
-- seront donc jamais jouees lors de son premier passage.
--
-- C'est aussi ce qui corrige le defaut n.2 : chaque plan calcule ses
-- semaines depuis SON PROPRE start_date. Changer la duree du cycle
-- n'affecte plus retroactivement les plans anterieurs.
-- ---------------------------------------------------------------------
create table agenda.rotation_plans (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  start_date         date not null,
  cycle_length_weeks integer not null default 8,
  status             text not null default 'draft',
  effective_from     date,
  effective_to       date,
  source_file_name   text,
  imported_at        timestamptz,
  notes              text,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint rotation_plans_statut_valide
    check (status in ('draft', 'active', 'archived')),

  constraint rotation_plans_cycle_positif
    check (cycle_length_weeks between 1 and 52),

  -- Le calcul de la semaine de roulement prend le LUNDI de la semaine
  -- visee (cf. getRotationWeek). Un start_date qui ne serait pas un
  -- lundi decalerait silencieusement tout le plan.
  constraint rotation_plans_debut_un_lundi
    check (extract(dow from start_date) = 1),

  constraint rotation_plans_periode_coherente
    check (effective_from is null or effective_to is null
           or effective_to >= effective_from),

  -- Un brouillon peut ne pas encore avoir de date d'entree en vigueur ;
  -- un plan actif ou archive en a forcement une.
  constraint rotation_plans_date_requise_hors_brouillon
    check (status = 'draft' or effective_from is not null)
);

-- ---------------------------------------------------------------------
-- 2. Les regles d'un plan
--
-- doctor_id fait partie de la cle d'unicite (defaut n.4 corrige) : deux
-- medecins peuvent desormais occuper la meme case -- c'est exactement le
-- "Doublon" du week-end, aujourd'hui inexprimable.
--
-- ON DELETE RESTRICT sur les references metier, la ou l'ancienne table
-- utilisait CASCADE : un plan est un DOCUMENT HISTORIQUE, il ne doit pas
-- se vider silencieusement parce qu'un medecin ou un creneau a ete
-- supprime. Le depart d'un medecin se traite en desactivant son compte,
-- pas en le supprimant (cf. le cas d'usage "depart d'un medecin").
-- ---------------------------------------------------------------------
create table agenda.rotation_plan_rules (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references agenda.rotation_plans(id) on delete cascade,
  doctor_id     uuid not null references public.profiles(id)       on delete restrict,
  site_id       uuid not null references agenda.sites(id)          on delete restrict,
  room_id       uuid not null references agenda.rooms(id)          on delete restrict,
  shift_type_id uuid not null references agenda.shift_types(id)    on delete restrict,
  weekday       integer not null,
  rotation_week integer not null,
  created_at    timestamptz not null default now(),

  -- 0 = dimanche, comme Date.getDay() en JavaScript : c'est la convention
  -- de l'ancienne table et du code du module, conservee a l'identique.
  constraint rotation_plan_rules_weekday_valide
    check (weekday between 0 and 6),

  constraint rotation_plan_rules_semaine_positive
    check (rotation_week >= 1),

  constraint rotation_plan_rules_unique
    unique (plan_id, site_id, room_id, shift_type_id, weekday, rotation_week, doctor_id)
);

-- ---------------------------------------------------------------------
-- 3. Index
--
-- La contrainte d'unicite couvre deja les recherches commencant par
-- plan_id. On ajoute les deux acces qui ne le sont pas : la case du
-- roulement (le plus frequent -- « qui travaille en S3 le mardi ? ») et
-- le medecin (« quelles sont les cases du Dr X ? »).
-- ---------------------------------------------------------------------
create index rotation_plan_rules_case_idx
  on agenda.rotation_plan_rules (plan_id, rotation_week, weekday);

create index rotation_plan_rules_doctor_idx
  on agenda.rotation_plan_rules (doctor_id);

create index rotation_plans_periode_idx
  on agenda.rotation_plans (effective_from, effective_to)
  where status = 'active';

-- ---------------------------------------------------------------------
-- 4. Horodatage
-- ---------------------------------------------------------------------
create trigger set_rotation_plans_updated_at
  before update on agenda.rotation_plans
  for each row execute function agenda.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Garde-fou : une regle ne peut pas viser une semaine hors du cycle
--
-- Non exprimable en CHECK : la borne (cycle_length_weeks) vit dans une
-- autre table. Sans ce controle, une regle en S9 d'un cycle de 8 serait
-- acceptee et ne se declencherait JAMAIS -- une affectation perdue en
-- silence, exactement le genre de defaut que MOD-1 corrige.
-- ---------------------------------------------------------------------
create function agenda.valider_regle_plan()
returns trigger
language plpgsql
security definer
set search_path = agenda
as $$
declare
  cycle integer;
begin
  select cycle_length_weeks into cycle
    from agenda.rotation_plans where id = new.plan_id;

  if new.rotation_week > cycle then
    raise exception
      'Semaine S% hors du cycle : ce plan compte % semaines',
      new.rotation_week, cycle;
  end if;

  return new;
end;
$$;

create trigger valider_regle_plan
  before insert or update on agenda.rotation_plan_rules
  for each row execute function agenda.valider_regle_plan();

-- ---------------------------------------------------------------------
-- 6. Garde-fou : deux plans actifs ne peuvent pas se recouvrir
--
-- Sinon « quel roulement s'appliquait en mars ? » n'aurait pas de
-- reponse unique -- or c'est precisement ce que MOD-1 vient corriger.
-- Un trigger plutot qu'une contrainte d'exclusion : btree_gist n'est pas
-- installe sur le projet, et l'ajouter pour cette seule regle serait
-- disproportionne.
--
-- Les brouillons sont libres de se recouvrir : ils ne s'appliquent pas.
-- ---------------------------------------------------------------------
create function agenda.valider_periode_plan()
returns trigger
language plpgsql
security definer
set search_path = agenda
as $$
declare
  conflit text;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select name into conflit
    from agenda.rotation_plans
   where id <> new.id
     and status = 'active'
     -- Deux intervalles se recouvrent si chacun commence avant la fin de
     -- l'autre. effective_to NULL = ouvert, donc toujours "apres".
     and (new.effective_to is null or effective_from <= new.effective_to)
     and (effective_to     is null or new.effective_from <= effective_to)
   limit 1;

  if conflit is not null then
    raise exception
      'La periode de ce plan recouvre celle du plan actif « % »', conflit;
  end if;

  return new;
end;
$$;

create trigger valider_periode_plan
  before insert or update on agenda.rotation_plans
  for each row execute function agenda.valider_periode_plan();

-- ---------------------------------------------------------------------
-- 7. Quel plan s'applique a une date donnee ?
--
-- Point d'entree unique du calcul, cote base comme cote code (6C). Ne
-- jamais rechercher un plan "actif" sans passer par une date : plusieurs
-- plans actifs coexistent dans le temps, c'est tout l'objet du
-- versionnement.
-- ---------------------------------------------------------------------
create function agenda.plan_applicable(d date)
returns uuid
language sql
stable
security definer
set search_path = agenda
as $$
  select id
    from agenda.rotation_plans
   where status = 'active'
     and effective_from <= d
     and (effective_to is null or d <= effective_to)
   order by effective_from desc
   limit 1;
$$;

-- ---------------------------------------------------------------------
-- 8. RLS -- lecture seule pour TOUT LE MONDE
--
-- C'est ici que le principe « une seule verite » devient effectif.
-- Aucune policy insert / update / delete n'est creee : ni un medecin, ni
-- un coordinateur ne peut ecrire dans un plan depuis l'application. La
-- seule porte d'entree sera la fonction d'import de 6E, en
-- security definer, reservee aux coordinateurs.
--
-- Pourquoi dans la base et pas seulement dans l'interface : c'est la
-- lecon de 7C-3. Ce qui n'est protege que par l'ecran finit par etre
-- contourne -- et la derive de 41 regles modifiees + 24 ajoutees montre
-- a quelle vitesse.
--
-- Lecture ouverte a tous ceux qui accedent au module : le roulement
-- n'est pas confidentiel, chaque medecin doit pouvoir consulter sa
-- propre place dans le cycle.
-- ---------------------------------------------------------------------
alter table agenda.rotation_plans      enable row level security;
alter table agenda.rotation_plan_rules enable row level security;

create policy "Lire les plans de roulement"
  on agenda.rotation_plans for select
  to authenticated
  using (agenda.peut_acceder());

create policy "Lire les regles des plans"
  on agenda.rotation_plan_rules for select
  to authenticated
  using (agenda.peut_acceder());

-- Droits accordes a `authenticated` seulement, jamais a `anon` : le
-- module exige une session (choix pose en 7C-1). SELECT uniquement --
-- le verrou est ainsi pose a deux niveaux, privileges et policies.
grant select on agenda.rotation_plans      to authenticated;
grant select on agenda.rotation_plan_rules to authenticated;

-- ---------------------------------------------------------------------
-- Verifications
-- ---------------------------------------------------------------------
select t.table_name,
       (select count(*) from information_schema.columns c
         where c.table_schema = 'agenda' and c.table_name = t.table_name) as colonnes,
       (select count(*) from pg_policies p
         where p.schemaname = 'agenda' and p.tablename = t.table_name)    as policies,
       (select count(*) from pg_indexes i
         where i.schemaname = 'agenda' and i.tablename = t.table_name)    as index,
       (select relrowsecurity from pg_class cl
          join pg_namespace n on n.oid = cl.relnamespace
         where n.nspname = 'agenda' and cl.relname = t.table_name)        as rls_active
  from information_schema.tables t
 where t.table_schema = 'agenda'
   and t.table_name in ('rotation_plans', 'rotation_plan_rules')
 order by t.table_name;
