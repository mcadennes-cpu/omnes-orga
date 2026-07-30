-- =====================================================================
-- Etape 22 / 7C-3 : policies RLS du schema "agenda"
--
-- Traduit les 61 policies de Planning (65 moins les 4 de profiles,
-- devenue une vue qui herite des RLS de public.profiles).
-- Resultat : 57 policies, les 4 doublons SELECT ayant ete fusionnes.
--
-- Le mapping des roles ne passe plus par profiles.role = 'coordinator'
-- (qui n'existe pas cote Orga) mais par deux fonctions centralisees.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Deux fonctions, plutot que le meme EXISTS recopie 57 fois
--
-- SECURITY DEFINER : la fonction lit public.profiles pour le compte de
-- l'appelant, sans dependre des policies de cette table -- ce qui evite
-- toute recursion entre policies.
-- STABLE : le resultat ne change pas pendant une requete, PostgreSQL
-- peut donc l'evaluer une seule fois au lieu d'une fois par ligne.
-- ---------------------------------------------------------------------

create or replace function agenda.peut_acceder()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid())
       and actif
       -- PHASE BETA : retirer la ligne ci-dessous pour ouvrir a tous.
       and agenda_beta_access
  );
$$;

comment on function agenda.peut_acceder() is
  'Acces au module Agenda : compte actif + acces beta. Sortie de beta = retirer la condition agenda_beta_access de cette fonction (une seule ligne, au lieu de reprendre les 57 policies).';

create or replace function agenda.est_coordinateur()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid())
       and actif
       and agenda_beta_access
       and is_agenda_coordinator
  );
$$;

comment on function agenda.est_coordinateur() is
  'Coordinateur de l''agenda. Designation explicite : le role applicatif ne peut pas la deriver (Matthieu et Charlotte sont tous deux super_admin, une seule est coordinatrice).';

grant execute on function agenda.peut_acceder() to authenticated;
grant execute on function agenda.est_coordinateur() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Configuration : sites, salles, creneaux
--
-- Lecture ouverte a tous. Les policies d'origine s'appelaient "voir les
-- ... actifs" mais leur condition (is_active OR auth.uid() IS NOT NULL)
-- etait toujours vraie pour un utilisateur connecte : elles ne
-- filtraient rien. Comportement conserve volontairement -- un vrai
-- filtre masquerait le site ou la salle des gardes passees dont le lieu
-- a depuis ete desactive.
--
-- Suppression conditionnee a l'absence de gardes rattachees.
-- ---------------------------------------------------------------------

create policy "Lecture des sites" on agenda.sites
  for select to authenticated using (agenda.peut_acceder());
create policy "Le coordinateur cree des sites" on agenda.sites
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur modifie les sites" on agenda.sites
  for update to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur supprime un site sans garde" on agenda.sites
  for delete to authenticated using (
    agenda.est_coordinateur()
    and not exists (select 1 from agenda.shifts where shifts.site_id = sites.id)
  );

create policy "Lecture des salles" on agenda.rooms
  for select to authenticated using (agenda.peut_acceder());
create policy "Le coordinateur cree des salles" on agenda.rooms
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur modifie les salles" on agenda.rooms
  for update to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur supprime une salle sans garde" on agenda.rooms
  for delete to authenticated using (
    agenda.est_coordinateur()
    and not exists (select 1 from agenda.shifts where shifts.room_id = rooms.id)
  );

create policy "Lecture des creneaux" on agenda.shift_types
  for select to authenticated using (agenda.peut_acceder());
create policy "Le coordinateur cree des creneaux" on agenda.shift_types
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur modifie les creneaux" on agenda.shift_types
  for update to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur supprime un creneau sans garde" on agenda.shift_types
  for delete to authenticated using (
    agenda.est_coordinateur()
    and not exists (select 1 from agenda.shifts where shifts.shift_type_id = shift_types.id)
  );

-- ---------------------------------------------------------------------
-- 3. Gardes
--
-- Tout le monde voit tout le planning : c'est l'objet meme d'un planning
-- de cabinet (savoir qui est de garde). Les deux policies SELECT
-- d'origine, redondantes, sont fusionnees en une.
-- ---------------------------------------------------------------------

create policy "Lecture du planning" on agenda.shifts
  for select to authenticated using (agenda.peut_acceder());
create policy "Le coordinateur cree des gardes" on agenda.shifts
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur modifie les gardes" on agenda.shifts
  for update to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur supprime des gardes" on agenda.shifts
  for delete to authenticated using (agenda.est_coordinateur());

-- ---------------------------------------------------------------------
-- 4. Demandes
--
-- Un medecin ne voit que ses propres demandes ; le coordinateur voit
-- tout. Un medecin ne peut creer une demande que pour lui-meme, et ne
-- peut la modifier que pour l'annuler (WITH CHECK impose 'cancelled').
--
-- La policy d'origine exigeait en plus role = 'doctor' a la creation :
-- redondant, un coordinateur etant deja couvert par sa propre policy.
-- ---------------------------------------------------------------------

create policy "Lecture de ses demandes" on agenda.requests
  for select to authenticated using (
    agenda.peut_acceder()
    and (doctor_id = (select auth.uid()) or agenda.est_coordinateur())
  );
create policy "Un medecin cree sa propre demande" on agenda.requests
  for insert to authenticated with check (
    agenda.peut_acceder() and doctor_id = (select auth.uid())
  );
create policy "Le coordinateur cree une demande pour un medecin" on agenda.requests
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur traite les demandes" on agenda.requests
  for update to authenticated using (agenda.est_coordinateur());
create policy "Un medecin annule sa demande en cours" on agenda.requests
  for update to authenticated
  using (
    agenda.peut_acceder()
    and doctor_id = (select auth.uid())
    and status in ('pending', 'on_hold')
  )
  with check (
    doctor_id = (select auth.uid())
    and status = 'cancelled'
  );

-- ---------------------------------------------------------------------
-- 5. Roulement
--
-- Un medecin peut consulter les regles qui le concernent ; le
-- coordinateur voit et gere tout.
-- ---------------------------------------------------------------------

create policy "Lecture des parametres du roulement" on agenda.rotation_settings
  for select to authenticated using (agenda.peut_acceder());
create policy "Le coordinateur cree les parametres du roulement" on agenda.rotation_settings
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur modifie les parametres du roulement" on agenda.rotation_settings
  for update to authenticated using (agenda.est_coordinateur());

create policy "Le coordinateur lit toutes les regles de roulement" on agenda.rotation_assignment_rules
  for select to authenticated using (agenda.est_coordinateur());
create policy "Un medecin lit les regles qui le concernent" on agenda.rotation_assignment_rules
  for select to authenticated using (
    agenda.peut_acceder() and doctor_id = (select auth.uid())
  );
create policy "Le coordinateur cree des regles de roulement" on agenda.rotation_assignment_rules
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur modifie les regles de roulement" on agenda.rotation_assignment_rules
  for update to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur supprime des regles de roulement" on agenda.rotation_assignment_rules
  for delete to authenticated using (agenda.est_coordinateur());

-- ---------------------------------------------------------------------
-- 6. Series de gardes fixes -- reserve au coordinateur
-- ---------------------------------------------------------------------

create policy "Le coordinateur lit les series" on agenda.fixed_duty_series
  for select to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur cree des series" on agenda.fixed_duty_series
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur modifie les series" on agenda.fixed_duty_series
  for update to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur supprime des series" on agenda.fixed_duty_series
  for delete to authenticated using (agenda.est_coordinateur());

create policy "Le coordinateur lit les motifs de serie" on agenda.fixed_duty_patterns
  for select to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur cree des motifs de serie" on agenda.fixed_duty_patterns
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur modifie les motifs de serie" on agenda.fixed_duty_patterns
  for update to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur supprime des motifs de serie" on agenda.fixed_duty_patterns
  for delete to authenticated using (agenda.est_coordinateur());

-- ---------------------------------------------------------------------
-- 7. Modeles de semaine -- reserve au coordinateur
-- ---------------------------------------------------------------------

create policy "Le coordinateur lit les modeles" on agenda.week_templates
  for select to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur cree des modeles" on agenda.week_templates
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur modifie les modeles" on agenda.week_templates
  for update to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur supprime des modeles" on agenda.week_templates
  for delete to authenticated using (agenda.est_coordinateur());

create policy "Le coordinateur lit le contenu des modeles" on agenda.week_template_items
  for select to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur cree le contenu des modeles" on agenda.week_template_items
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur modifie le contenu des modeles" on agenda.week_template_items
  for update to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur supprime le contenu des modeles" on agenda.week_template_items
  for delete to authenticated using (agenda.est_coordinateur());

-- Modeles de semaine d'ouverture : lecture ouverte (deux policies SELECT
-- d'origine redondantes, fusionnees).
create policy "Lecture des modeles d'ouverture" on agenda.opening_week_templates
  for select to authenticated using (agenda.peut_acceder());
create policy "Le coordinateur cree des modeles d'ouverture" on agenda.opening_week_templates
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur modifie les modeles d'ouverture" on agenda.opening_week_templates
  for update to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur supprime des modeles d'ouverture" on agenda.opening_week_templates
  for delete to authenticated using (agenda.est_coordinateur());

create policy "Lecture du contenu des modeles d'ouverture" on agenda.opening_week_template_items
  for select to authenticated using (agenda.peut_acceder());
create policy "Le coordinateur cree le contenu des modeles d'ouverture" on agenda.opening_week_template_items
  for insert to authenticated with check (agenda.est_coordinateur());
create policy "Le coordinateur modifie le contenu des modeles d'ouverture" on agenda.opening_week_template_items
  for update to authenticated using (agenda.est_coordinateur());
create policy "Le coordinateur supprime le contenu des modeles d'ouverture" on agenda.opening_week_template_items
  for delete to authenticated using (agenda.est_coordinateur());

-- ---------------------------------------------------------------------
-- 8. Buffer d'annulation -- chacun le sien, coordinateur uniquement
-- ---------------------------------------------------------------------

create policy "Le coordinateur lit son buffer d'annulation" on agenda.undo_buffer
  for select to authenticated using (
    agenda.est_coordinateur() and user_id = (select auth.uid())
  );
create policy "Le coordinateur cree son buffer d'annulation" on agenda.undo_buffer
  for insert to authenticated with check (
    agenda.est_coordinateur() and user_id = (select auth.uid())
  );
create policy "Le coordinateur modifie son buffer d'annulation" on agenda.undo_buffer
  for update to authenticated using (
    agenda.est_coordinateur() and user_id = (select auth.uid())
  );
create policy "Le coordinateur supprime son buffer d'annulation" on agenda.undo_buffer
  for delete to authenticated using (
    agenda.est_coordinateur() and user_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------
-- 9. Designation de la coordinatrice
-- ---------------------------------------------------------------------

update public.profiles
   set is_agenda_coordinator = true
 where upper(nom) = 'FRANZINO';

-- ---------------------------------------------------------------------
-- 10. Controles
-- ---------------------------------------------------------------------

select
  (select count(*) from pg_policies where schemaname = 'agenda')          as policies,
  (select count(distinct tablename) from pg_policies
    where schemaname = 'agenda')                                          as tables_couvertes,
  (select count(*) from pg_tables
    where schemaname = 'agenda' and rowsecurity)                          as tables_avec_rls,
  (select count(*) from public.profiles where is_agenda_coordinator)      as coordinateurs,
  (select string_agg(prenom || ' ' || nom, ', ')
     from public.profiles where is_agenda_coordinator)                    as qui,
  (select count(*) from public.profiles
    where is_agenda_coordinator and not agenda_beta_access)               as coordinateur_sans_acces_beta;
