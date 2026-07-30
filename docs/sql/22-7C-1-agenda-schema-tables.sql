-- =====================================================================
-- Etape 22 / 7C-1 : schema "agenda" dans le projet OMNES ORGA
-- Cree les 14 tables du module, leurs contraintes et leurs 55 index,
-- la colonne is_agenda_coordinator et la vue agenda.profiles.
--
-- Ne cree NI les fonctions/triggers (7C-2) NI les policies RLS (7C-3).
-- N'expose PAS le schema dans l'API : tant que "agenda" n'est pas ajoute
-- aux schemas exposes, ces objets sont invisibles de l'exterieur et
-- l'appli principale n'est pas affectee (pas de redemarrage PostgREST).
--
-- Ecarts assumes par rapport au schema Planning d'origine (cf. 7A,
-- docs/migration-agenda-etape7.md) :
--   * table "events" non reprise (0 ligne, aucune reference dans le code)
--   * table "profiles" remplacee par une VUE sur public.profiles
--   * CHECK (location in ('Dijon','Beaune')) NON reconduit : il figeait
--     les sites en dur alors que la table sites est configurable
--   * les 4 cles etrangeres qui pointaient vers auth.users pointent
--     desormais vers public.profiles, comme toutes les autres
-- =====================================================================

create schema if not exists agenda;

-- Le module exige une session : anon n'a aucun besoin d'acces.
grant usage on schema agenda to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Designation explicite du/des coordinateur(s) d'agenda.
-- Le role applicatif ne peut pas la deriver : Matthieu et Charlotte sont
-- tous deux super_admin sur Orga, une seule est coordinatrice.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_agenda_coordinator boolean not null default false;

-- =====================================================================
-- 1. Tables de configuration
-- =====================================================================

create table agenda.sites (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text,
  is_active  boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table agenda.shift_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  time_range text not null,
  is_active  boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table agenda.rooms (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references agenda.sites(id) on delete restrict,
  name       text not null,
  is_active  boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (site_id, name)
);

-- =====================================================================
-- 2. Series de gardes fixes
-- =====================================================================

create table agenda.fixed_duty_series (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text default ''::text,
  start_date      date not null,
  end_date        date,
  number_of_weeks integer,
  is_active       boolean default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint valid_duration check (
    (end_date is not null and end_date > start_date)
    or (number_of_weeks is not null and number_of_weeks > 0)
    or (end_date is not null and number_of_weeks is not null)
  )
);

create table agenda.fixed_duty_patterns (
  id                uuid primary key default gen_random_uuid(),
  series_id         uuid not null references agenda.fixed_duty_series(id) on delete cascade,
  weekday           integer not null check (weekday >= 0 and weekday <= 6),
  site_id           uuid not null references agenda.sites(id) on delete cascade,
  room_id           uuid not null references agenda.rooms(id) on delete cascade,
  slot_id           uuid not null references agenda.shift_types(id) on delete cascade,
  default_doctor_id uuid references public.profiles(id) on delete set null,
  is_open           boolean default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (series_id, weekday, site_id, room_id, slot_id)
);

-- =====================================================================
-- 3. Gardes et demandes
-- =====================================================================

-- Note : location / room / shift_type (texte) coexistent avec les cles
-- etrangeres. Denormalisation heritee de Bolt, encore lue et ecrite par
-- une dizaine de fichiers du module : conservee a l'identique pour la
-- migration, a nettoyer dans un chantier dedie (cf. 7A, ecart n.2).
create table agenda.shifts (
  id                   uuid primary key default gen_random_uuid(),
  date                 date not null,
  location             text not null,
  room                 text not null,
  shift_type           text not null,
  status               text not null default 'free'::text
                       check (status in ('free', 'pending', 'assigned')),
  assigned_doctor_id   uuid references public.profiles(id) on delete set null,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  site_id              uuid references agenda.sites(id) on delete restrict,
  room_id              uuid references agenda.rooms(id) on delete restrict,
  shift_type_id        uuid references agenda.shift_types(id) on delete restrict,
  series_id            uuid references agenda.fixed_duty_series(id) on delete set null,
  series_instance_date date,
  coordinator_note     text,
  constraint unique_shift unique (date, location, room, shift_type)
);

create table agenda.requests (
  id             uuid primary key default gen_random_uuid(),
  shift_id       uuid not null references agenda.shifts(id) on delete cascade,
  doctor_id      uuid not null references public.profiles(id) on delete cascade,
  status         text not null default 'pending'::text
                 check (status in ('pending', 'on_hold', 'approved', 'rejected', 'cancelled')),
  requested_at   timestamptz default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.profiles(id) on delete set null,
  rejection_note text
);

-- =====================================================================
-- 4. Roulement
-- =====================================================================

create table agenda.rotation_settings (
  id                 uuid primary key default gen_random_uuid(),
  start_date         date not null default (date_trunc('week', current_date))::date,
  cycle_length_weeks integer not null default 8
                     check (cycle_length_weeks >= 1 and cycle_length_weeks <= 52),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  updated_by         uuid references public.profiles(id) on delete set null
);

create table agenda.rotation_assignment_rules (
  id            uuid primary key default gen_random_uuid(),
  doctor_id     uuid not null references public.profiles(id) on delete cascade,
  site_id       uuid not null references agenda.sites(id) on delete cascade,
  room_id       uuid references agenda.rooms(id) on delete cascade,
  shift_type_id uuid not null references agenda.shift_types(id) on delete cascade,
  weekday       smallint not null check (weekday >= 0 and weekday <= 6),
  rotation_week smallint not null check (rotation_week >= 1),
  created_at    timestamptz default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz default now(),
  unique (site_id, room_id, shift_type_id, weekday, rotation_week)
);

-- =====================================================================
-- 5. Modeles de semaine
-- =====================================================================

create table agenda.week_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table agenda.week_template_items (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references agenda.week_templates(id) on delete cascade,
  weekday       integer not null check (weekday >= 0 and weekday <= 6),
  site_id       uuid not null references agenda.sites(id) on delete cascade,
  room_id       uuid not null references agenda.rooms(id) on delete cascade,
  shift_type_id uuid not null references agenda.shift_types(id) on delete cascade,
  is_open       boolean default true,
  created_at    timestamptz default now()
);

create table agenda.opening_week_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table agenda.opening_week_template_items (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references agenda.opening_week_templates(id) on delete cascade,
  weekday       integer not null check (weekday >= 0 and weekday <= 6),
  site_id       uuid not null references agenda.sites(id) on delete cascade,
  room_id       uuid not null references agenda.rooms(id) on delete cascade,
  shift_type_id uuid not null references agenda.shift_types(id) on delete cascade,
  is_open       boolean default true
);

-- =====================================================================
-- 6. Buffer d'annulation (structure seule, donnees non migrees)
-- =====================================================================

create table agenda.undo_buffer (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.profiles(id) on delete cascade,
  description text not null,
  payload     jsonb not null,
  created_at  timestamptz default now()
);

-- =====================================================================
-- 7. Index (55 : les 58 d'origine moins les 3 de profiles, devenue vue)
-- =====================================================================

create index idx_sites_is_active on agenda.sites (is_active);
create index idx_shift_types_is_active on agenda.shift_types (is_active);
create index idx_rooms_is_active on agenda.rooms (is_active);
create index idx_rooms_site_id on agenda.rooms (site_id);

create index idx_fixed_duty_series_active on agenda.fixed_duty_series (is_active);
create index idx_fixed_duty_series_created_by on agenda.fixed_duty_series (created_by);
create index idx_fixed_duty_series_dates on agenda.fixed_duty_series (start_date, end_date);

create index idx_fixed_duty_patterns_default_doctor_id on agenda.fixed_duty_patterns (default_doctor_id);
create index idx_fixed_duty_patterns_lookup on agenda.fixed_duty_patterns (series_id, weekday, site_id, room_id);
create index idx_fixed_duty_patterns_room_id on agenda.fixed_duty_patterns (room_id);
create index idx_fixed_duty_patterns_series on agenda.fixed_duty_patterns (series_id);
create index idx_fixed_duty_patterns_site_id on agenda.fixed_duty_patterns (site_id);
create index idx_fixed_duty_patterns_slot_id on agenda.fixed_duty_patterns (slot_id);

create index idx_shifts_assigned_doctor on agenda.shifts (assigned_doctor_id);
create index idx_shifts_created_by on agenda.shifts (created_by);
create index idx_shifts_date on agenda.shifts (date);
create index idx_shifts_date_location on agenda.shifts (date, location);
create index idx_shifts_location on agenda.shifts (location);
create index idx_shifts_room_id on agenda.shifts (room_id);
create index idx_shifts_series on agenda.shifts (series_id) where (series_id is not null);
create index idx_shifts_series_date on agenda.shifts (series_id, date) where (series_id is not null);
create index idx_shifts_shift_type_id on agenda.shifts (shift_type_id);
create index idx_shifts_site_id on agenda.shifts (site_id);
create index idx_shifts_status on agenda.shifts (status);
create index idx_shifts_status_date on agenda.shifts (status, date);

-- Regle metier : un medecin ne peut pas avoir deux gardes assignees le meme jour.
create unique index unique_doctor_per_day on agenda.shifts (assigned_doctor_id, date)
  where (assigned_doctor_id is not null and status = 'assigned'::text);

create index idx_active_requests on agenda.requests (shift_id, requested_at desc)
  where (status = 'pending'::text);
create index idx_requests_doctor on agenda.requests (doctor_id);
create index idx_requests_doctor_status on agenda.requests (doctor_id, status);
create index idx_requests_on_hold on agenda.requests (shift_id, requested_at desc)
  where (status = 'on_hold'::text);
create index idx_requests_reviewed_by on agenda.requests (reviewed_by);
create index idx_requests_shift on agenda.requests (shift_id);
create index idx_requests_status on agenda.requests (status);
create index idx_requests_status_created on agenda.requests (status, requested_at desc);

-- Regle metier : une seule demande active par medecin et par garde
-- (un medecin peut redemander apres un refus).
create unique index unique_active_doctor_shift_request on agenda.requests (shift_id, doctor_id)
  where (status in ('pending', 'on_hold', 'approved'));

create index idx_rotation_settings_updated_by on agenda.rotation_settings (updated_by);
create index idx_rotation_assignment_rules_created_by on agenda.rotation_assignment_rules (created_by);
create index idx_rotation_assignment_rules_room_id on agenda.rotation_assignment_rules (room_id);
create index idx_rotation_assignment_rules_shift_type_id on agenda.rotation_assignment_rules (shift_type_id);
create index idx_rotation_rules_doctor on agenda.rotation_assignment_rules (doctor_id);
create index idx_rotation_rules_lookup on agenda.rotation_assignment_rules
  (site_id, room_id, shift_type_id, weekday, rotation_week);

create index idx_week_templates_created_by on agenda.week_templates (created_by);
create index idx_week_template_items_room_id on agenda.week_template_items (room_id);
create index idx_week_template_items_shift_type_id on agenda.week_template_items (shift_type_id);
create index idx_week_template_items_site_id on agenda.week_template_items (site_id);
create index idx_week_template_items_template_id on agenda.week_template_items (template_id);
create index idx_week_template_items_weekday on agenda.week_template_items (weekday);

create index idx_opening_week_templates_created_by on agenda.opening_week_templates (created_by);
create index idx_opening_week_template_items_room_id on agenda.opening_week_template_items (room_id);
create index idx_opening_week_template_items_shift_type_id on agenda.opening_week_template_items (shift_type_id);
create index idx_opening_week_template_items_site_id on agenda.opening_week_template_items (site_id);
create index idx_opening_week_template_items_template_id on agenda.opening_week_template_items (template_id);
create unique index idx_opening_week_template_items_unique on agenda.opening_week_template_items
  (template_id, weekday, site_id, room_id, shift_type_id);

create index idx_undo_buffer_user_id on agenda.undo_buffer (user_id);

-- =====================================================================
-- 8. RLS activee partout, sans policy : tout est ferme jusqu'a 7C-3.
-- =====================================================================

alter table agenda.sites                       enable row level security;
alter table agenda.shift_types                 enable row level security;
alter table agenda.rooms                       enable row level security;
alter table agenda.fixed_duty_series           enable row level security;
alter table agenda.fixed_duty_patterns         enable row level security;
alter table agenda.shifts                      enable row level security;
alter table agenda.requests                    enable row level security;
alter table agenda.rotation_settings           enable row level security;
alter table agenda.rotation_assignment_rules   enable row level security;
alter table agenda.week_templates              enable row level security;
alter table agenda.week_template_items         enable row level security;
alter table agenda.opening_week_templates      enable row level security;
alter table agenda.opening_week_template_items enable row level security;
alter table agenda.undo_buffer                 enable row level security;

grant select, insert, update, delete on all tables in schema agenda to authenticated;
grant all on all tables in schema agenda to service_role;

-- =====================================================================
-- 9. Vue agenda.profiles : point unique de traduction Orga -> agenda.
--    Le module lit partout une table "profiles" au format Planning.
--    security_invoker : les RLS de public.profiles continuent de
--    s'appliquer a l'appelant.
-- =====================================================================

create view agenda.profiles with (security_invoker = true) as
  select id,
         email,
         trim(coalesce(prenom, '') || ' ' || coalesce(nom, ''))       as full_name,
         case when is_agenda_coordinator then 'coordinator'
              else 'doctor' end                                        as role,
         actif                                                         as is_active
  from public.profiles;

grant select on agenda.profiles to authenticated;
grant select on agenda.profiles to service_role;

-- =====================================================================
-- 10. Controles
-- =====================================================================

select
  (select count(*) from information_schema.tables
     where table_schema = 'agenda' and table_type = 'BASE TABLE')      as tables_creees,
  (select count(*) from information_schema.views
     where table_schema = 'agenda')                                    as vues_creees,
  (select count(*) from pg_indexes where schemaname = 'agenda')        as index_total,
  (select count(*) from pg_tables
     where schemaname = 'agenda' and rowsecurity)                      as tables_avec_rls,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'is_agenda_coordinator')                      as colonne_coordinateur;
