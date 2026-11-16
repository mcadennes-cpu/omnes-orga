-- =============================================================================
-- 24A-2 - Module Signatures : fonctions de controle, RLS et droits par colonne
-- =============================================================================
--
-- OBJECTIF :
--
--   Ouvrir les tables de 24A-1 a l'application, au strict necessaire.
--
--   MATRICE (depuis l'application, role authenticated) :
--
--   | Table                 | Lire                         | Ecrire                                   |
--   |-----------------------|------------------------------|------------------------------------------|
--   | signature_demandes    | createur, signataires (hors  | super_admin createur, EN BROUILLON       |
--   |                       | brouillon), super_admin      | seulement (creer, modifier, supprimer)   |
--   | signature_signataires | idem (sans ip ni user_agent) | createur du brouillon                    |
--   | signature_codes       | personne                     | personne                                 |
--   | signature_journal     | idem (sans ip ni user_agent) | personne                                 |
--
--   Tout le reste (envoi, signature, refus, relance, annulation, scellement)
--   passe par l'Edge Function `signature` (cle service_role) et les
--   fonctions de 24C-1.
--
--   TROIS COUCHES, comme ailleurs dans l'appli :
--     1. fonctions SECURITY DEFINER a liste blanche (lecon du chantier D :
--        une policy ne relit jamais sa propre table) ;
--     2. policies permissives + la policy restrictive « compte actif » du
--        chantier D (exiger_compte_actif), posee ici sur les 4 tables ;
--     3. droits PAR COLONNE : l'appli ne peut meme pas nommer les colonnes
--        statut, empreintes, preuves. Une policy trop large ne suffirait donc
--        pas a falsifier une signature.
--
--   CONSEQUENCE POUR LE CODE : sur signature_signataires et signature_journal,
--   `select('*')` est refuse (ip et user_agent ne sont pas lisibles). Les
--   hooks listent leurs colonnes explicitement.
--
--   anon (non connecte) : aucun droit sur ces 4 tables (point reste ouvert du
--   chantier D, regle d'emblee pour ce module).
--
-- COMMENT EXECUTER : apres 24A-1, sur le test puis en production.
--
-- COMMENT VERIFIER : le SELECT final liste 11 policies
--   (demandes 5, signataires 5, journal 2, codes 0 -- dont 3 restrictives).
--
-- POUR ANNULER :
--   drop policy ... (les 11 noms ci-dessous) ;
--   drop function public.peut_creer_signature(), public.peut_voir_signature(uuid),
--                 public.est_createur_brouillon(uuid);
--
-- IDEMPOTENCE : create or replace + drop policy if exists.
--
-- =============================================================================


-- 1. Fonctions de controle ----------------------------------------------------

-- Creer une demande : super_admin actif (Charlotte pour les contrats,
-- Matthieu pour l'association -- cadrage du 16/11/2026).
create or replace function public.peut_creer_signature()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid())
       and actif
       and role = 'super_admin'
  );
$$;

-- Voir une demande : compte actif d'un role medecin ET (createur, ou
-- signataire d'une demande deja envoyee, ou super_admin).
-- Un signataire ne voit pas les brouillons (rien a signer tant que ce
-- n'est pas envoye). poste_bureau : exclu par la liste blanche.
create or replace function public.peut_voir_signature(p_demande_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid())
       and p.actif
       and p.role in ('super_admin', 'associe_gerant', 'associe', 'remplacant')
       and (
         p.role = 'super_admin'
         or exists (select 1 from public.signature_demandes d
                     where d.id = p_demande_id and d.createur_id = p.id)
         or exists (select 1 from public.signature_signataires s
                      join public.signature_demandes d on d.id = s.demande_id
                     where s.demande_id = p_demande_id
                       and s.profil_id = p.id
                       and d.statut <> 'brouillon')
       )
  );
$$;

-- Preparer un brouillon : le createur, toujours super_admin actif.
create or replace function public.est_createur_brouillon(p_demande_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.peut_creer_signature()
     and exists (select 1 from public.signature_demandes
                  where id = p_demande_id
                    and createur_id = (select auth.uid())
                    and statut = 'brouillon');
$$;

revoke all on function public.peut_creer_signature()        from public, anon;
revoke all on function public.peut_voir_signature(uuid)     from public, anon;
revoke all on function public.est_createur_brouillon(uuid)  from public, anon;
grant execute on function public.peut_creer_signature()       to authenticated, service_role;
grant execute on function public.peut_voir_signature(uuid)    to authenticated, service_role;
grant execute on function public.est_createur_brouillon(uuid) to authenticated, service_role;


-- 2. Droits de table et de colonne ---------------------------------------------
revoke all on public.signature_demandes    from anon, authenticated;
revoke all on public.signature_signataires from anon, authenticated;
revoke all on public.signature_codes       from anon, authenticated;
revoke all on public.signature_journal     from anon, authenticated;

grant all on public.signature_demandes, public.signature_signataires,
             public.signature_codes, public.signature_journal to service_role;

-- Demandes : lecture complete ; ecriture limitee aux champs d'un brouillon.
grant select on public.signature_demandes to authenticated;
grant insert (type, titre, description, ordre_impose, metadonnees, createur_id)
  on public.signature_demandes to authenticated;
grant update (type, titre, description, ordre_impose, metadonnees,
              source_chemin, source_nom, source_taille)
  on public.signature_demandes to authenticated;
grant delete on public.signature_demandes to authenticated;

-- Signataires : tout sauf ip et user_agent en lecture ; composition du
-- brouillon en ecriture.
grant select (id, demande_id, profil_id, ordre, qualite, statut, nom_fige,
              email_fige, consulte_at, signe_at, consentement_texte,
              consentement_version, empreinte_validee, refuse_at, motif_refus,
              derniere_relance_at, nb_relances, created_at)
  on public.signature_signataires to authenticated;
grant insert (demande_id, profil_id, ordre, qualite)
  on public.signature_signataires to authenticated;
grant update (profil_id, ordre, qualite)
  on public.signature_signataires to authenticated;
grant delete on public.signature_signataires to authenticated;

-- Journal : lecture sans ip ni user_agent ; aucune ecriture.
grant select (id, demande_id, signataire_id, acteur_id, evenement, details,
              created_at, empreinte_precedente, empreinte)
  on public.signature_journal to authenticated;

-- signature_codes : rien pour authenticated (deja revoque ci-dessus).


-- 3. Policies -----------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('signature_demandes', 'signature_signataires',
                                'signature_codes', 'signature_journal')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- signature_demandes
create policy signature_demandes_lecture on public.signature_demandes
  for select to authenticated
  using (public.peut_voir_signature(id));

create policy signature_demandes_creation on public.signature_demandes
  for insert to authenticated
  with check (public.peut_creer_signature()
              and createur_id = (select auth.uid())
              and statut = 'brouillon');

create policy signature_demandes_modification on public.signature_demandes
  for update to authenticated
  using (public.est_createur_brouillon(id))
  with check (createur_id = (select auth.uid()) and statut = 'brouillon');

create policy signature_demandes_suppression on public.signature_demandes
  for delete to authenticated
  using (public.est_createur_brouillon(id));

-- signature_signataires
create policy signature_signataires_lecture on public.signature_signataires
  for select to authenticated
  using (public.peut_voir_signature(demande_id));

create policy signature_signataires_ajout on public.signature_signataires
  for insert to authenticated
  with check (public.est_createur_brouillon(demande_id));

create policy signature_signataires_modification on public.signature_signataires
  for update to authenticated
  using (public.est_createur_brouillon(demande_id))
  with check (public.est_createur_brouillon(demande_id));

create policy signature_signataires_retrait on public.signature_signataires
  for delete to authenticated
  using (public.est_createur_brouillon(demande_id));

-- signature_journal
create policy signature_journal_lecture on public.signature_journal
  for select to authenticated
  using (public.peut_voir_signature(demande_id));

-- Couche restrictive « compte actif » (meme forme que 23-21, chantier D).
create policy exiger_compte_actif on public.signature_demandes
  as restrictive for all to authenticated
  using (public.est_actif()) with check (public.est_actif());
create policy exiger_compte_actif on public.signature_signataires
  as restrictive for all to authenticated
  using (public.est_actif()) with check (public.est_actif());
create policy exiger_compte_actif on public.signature_journal
  as restrictive for all to authenticated
  using (public.est_actif()) with check (public.est_actif());
-- signature_codes : aucune policy du tout (RLS activee = tout est ferme).


-- Verification -------------------------------------------------------------------
select tablename, policyname, permissive, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('signature_demandes', 'signature_signataires',
                     'signature_codes', 'signature_journal')
 order by tablename, policyname;
