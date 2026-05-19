-- docs/sql/9A-4-sim-rls-policies.sql
-- Etape 9A-4 : RLS + 8 policies sur sim_dossiers et sim_fichiers
--
-- Modele de droits :
--   SELECT / INSERT  -> etre membre SIM (super_admin ou associe_gerant)
--   UPDATE / DELETE  -> super_admin (tout) OU associe_gerant + auteur de la ligne
--
-- Le cloisonnement est porte par la RLS : un associe ou un remplacant ne voit
-- AUCUNE ligne (is_sim_member() renvoie false pour eux).

-- ============================================================
-- sim_dossiers
-- ============================================================
alter table public.sim_dossiers enable row level security;

create policy sim_dossiers_select_member
  on public.sim_dossiers for select
  to authenticated
  using ( public.is_sim_member() );

create policy sim_dossiers_insert_member
  on public.sim_dossiers for insert
  to authenticated
  with check ( public.is_sim_member() and auteur_id = auth.uid() );

create policy sim_dossiers_update_owner
  on public.sim_dossiers for update
  to authenticated
  using (
    public.is_sim_member()
    and (
      auteur_id = auth.uid()
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'super_admin'
      )
    )
  )
  with check (
    public.is_sim_member()
    and (
      auteur_id = auth.uid()
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'super_admin'
      )
    )
  );

create policy sim_dossiers_delete_owner
  on public.sim_dossiers for delete
  to authenticated
  using (
    public.is_sim_member()
    and (
      auteur_id = auth.uid()
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'super_admin'
      )
    )
  );

-- ============================================================
-- sim_fichiers
-- ============================================================
alter table public.sim_fichiers enable row level security;

create policy sim_fichiers_select_member
  on public.sim_fichiers for select
  to authenticated
  using ( public.is_sim_member() );

create policy sim_fichiers_insert_member
  on public.sim_fichiers for insert
  to authenticated
  with check ( public.is_sim_member() and auteur_id = auth.uid() );

create policy sim_fichiers_update_owner
  on public.sim_fichiers for update
  to authenticated
  using (
    public.is_sim_member()
    and (
      auteur_id = auth.uid()
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'super_admin'
      )
    )
  )
  with check (
    public.is_sim_member()
    and (
      auteur_id = auth.uid()
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'super_admin'
      )
    )
  );

create policy sim_fichiers_delete_owner
  on public.sim_fichiers for delete
  to authenticated
  using (
    public.is_sim_member()
    and (
      auteur_id = auth.uid()
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'super_admin'
      )
    )
  );
