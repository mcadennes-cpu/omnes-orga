-- ============================================================================
-- 11A-1 — Réécriture RLS de profiles_compta (étape 11 — RIB des médecins)
-- ============================================================================
-- SELECT  -> super_admin / associe_gerant / associe
-- INSERT  -> super_admin uniquement
-- UPDATE  -> super_admin uniquement
-- DELETE  -> super_admin uniquement
-- Idempotent : peut être rejoué sans erreur.
-- ============================================================================

-- 1. Fonctions SECURITY DEFINER ---------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
  );
$$;

create or replace function public.can_read_compta()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'associe_gerant', 'associe')
  );
$$;

-- 2. Suppression de TOUTES les anciennes policies ---------------------------

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles_compta'
  loop
    execute format(
      'drop policy if exists %I on public.profiles_compta;',
      pol.policyname
    );
  end loop;
end $$;

-- 3. RLS + 4 nouvelles policies ---------------------------------------------

alter table public.profiles_compta enable row level security;

create policy compta_select_reader
  on public.profiles_compta
  for select
  to authenticated
  using ( public.can_read_compta() );

create policy compta_insert_super_admin
  on public.profiles_compta
  for insert
  to authenticated
  with check ( public.is_super_admin() );

create policy compta_update_super_admin
  on public.profiles_compta
  for update
  to authenticated
  using ( public.is_super_admin() )
  with check ( public.is_super_admin() );

create policy compta_delete_super_admin
  on public.profiles_compta
  for delete
  to authenticated
  using ( public.is_super_admin() );
