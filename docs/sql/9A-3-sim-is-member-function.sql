-- docs/sql/9A-3-sim-is-member-function.sql
-- Etape 9A-3 : fonction is_sim_member()
--
-- Repond a la question "l'utilisateur authentifie courant a-t-il acces a SIM ?".
-- Acces SIM = role super_admin OU associe_gerant.
--
-- SECURITY DEFINER : la fonction s'execute avec les droits de son proprietaire,
-- ce qui lui permet de lire public.profiles sans etre bloquee par la RLS et
-- sans creer de recursion de policy. Pattern identique a is_board_member (etape 7A).

create or replace function public.is_sim_member()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'associe_gerant')
  );
$$;

-- Autorise les utilisateurs authentifies a appeler la fonction.
grant execute on function public.is_sim_member() to authenticated;
