-- =============================================================================
-- 25A-9 - Module Contrats : retour arriere complet de 25A-1 a 25A-4
-- =============================================================================
--
-- Remet le SIM et le moteur de signature dans l'etat du 16/11/2026 (9A-4,
-- 9A-5, 24A-1). A n'utiliser qu'en cas de probleme, AVANT qu'un document
-- signe ait ete classe : un fichier classe (signature_demande_id non nul)
-- bloque la suppression de la colonne -- le script s'arrete alors, sans
-- rien avoir modifie (une seule transaction).
--
-- Les dossiers crees par 25A-4 ne sont supprimes que s'ils sont vides ;
-- le dossier renomme reprend son nom.
--
-- =============================================================================

begin;

do $$
begin
  if exists (select 1 from public.sim_fichiers where signature_demande_id is not null) then
    raise exception 'Des documents signes sont deja classes dans le SIM : retour arriere refuse';
  end if;
end $$;

-- 25A-4 : donnees
update public.sim_dossiers set nom = 'Contrats d''exercice médecins'
 where id = '9328e7bd-5e8b-4533-93f8-e7d8dfc16cdc' and nom = 'Contrats médecins/SIM';
delete from public.sim_dossiers d
 where d.parent_id is null
   and d.nom in ('Contrat d''exercice en commun', 'Contrats de remplacement')
   and not exists (select 1 from public.sim_dossiers e where e.parent_id = d.id)
   and not exists (select 1 from public.sim_fichiers f where f.dossier_id = d.id);

-- 25A-3 : classement
drop function if exists public.signature_classer_sim(uuid, text, bigint);

-- 25A-2 : droits
drop policy if exists sim_storage_suppression_signe on storage.objects;
drop policy if exists sim_storage_lecture on storage.objects;
create policy sim_storage_select_member on storage.objects
  for select to authenticated
  using ( bucket_id = 'sim' and public.is_sim_member() );

drop policy if exists sim_fichiers_lecture on public.sim_fichiers;
create policy sim_fichiers_select_member on public.sim_fichiers
  for select to authenticated
  using ( public.is_sim_member() );

drop policy if exists sim_dossiers_lecture on public.sim_dossiers;
create policy sim_dossiers_select_member on public.sim_dossiers
  for select to authenticated
  using ( public.is_sim_member() );

drop table if exists public.sim_fichiers_concernes;

drop function if exists public.sim_peut_voir_fichier(uuid);
drop function if exists public.sim_peut_voir_dossier(uuid);
drop function if exists public.sim_dossier_ouvert_associes(uuid);
drop function if exists public.sim_fichier_du_chemin(text);
drop function if exists public.sim_fichier_est_signe(uuid);
drop function if exists public.sim_profil_medecin(uuid);

-- 25A-1 : structure
drop trigger if exists sim_fichiers_verrou on public.sim_fichiers;
drop trigger if exists sim_dossiers_verrou on public.sim_dossiers;
drop function if exists public.sim_fichiers_verrou();
drop function if exists public.sim_dossiers_verrou();

alter table public.signature_demandes drop column if exists sim_dossier_id;
alter table public.sim_fichiers drop column if exists signature_demande_id;
alter table public.sim_dossiers drop column if exists ouvert_associes;

-- Verrou des demandes : version 24A-1 (sans l'exception de la destination).
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

commit;
