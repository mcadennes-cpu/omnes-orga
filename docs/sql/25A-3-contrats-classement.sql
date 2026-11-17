-- =============================================================================
-- 25A-3 - Module Contrats : classement d'un document signe dans le SIM
-- =============================================================================
--
-- OBJECTIF : une fonction serveur, appelee par l'Edge Function `signature`
--   (action « classer ») APRES avoir copie le PDF scelle dans le bucket
--   `sim` sous le nom `{id de la demande}`.
--
--   En UNE transaction : la ligne sim_fichiers (dans le dossier choisi a la
--   creation, auteur = createur de la demande) et les personnes concernees
--   (les signataires). Meme principe que les autres gestes du moteur
--   (24C-1) : jamais deux ecritures separees depuis l'Edge Function.
--
-- POURQUOI UN GESTE SEPARE DU SCELLEMENT : `signature_sceller` refuse une
--   demande deja terminee. Si le classement echouait juste apres le
--   scellement, on ne pourrait plus le relancer. Ici, le classement est
--   REJOUABLE : l'identifiant du fichier est celui de la demande, et un
--   second appel renvoie simplement le fichier deja classe.
--
-- POURQUOI COPIER LE PDF plutot que pointer vers le bucket `signatures` :
--   le PDF classe suit les droits du SIM (les gerants le voient meme s'ils
--   n'ont pas signe), et l'original scelle reste intact comme preuve.
--
-- COMMENT EXECUTER : apres 25A-1 et 25A-2, sur le test, puis en production.
-- POUR ANNULER : 25A-9-retour-arriere.sql.
--
-- =============================================================================


create or replace function public.signature_classer_sim(
  p_demande_id uuid, p_nom text, p_taille bigint)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.signature_demandes;
  v_id uuid;
begin
  select * into d from public.signature_demandes where id = p_demande_id for update;
  if not found then raise exception 'Demande introuvable'; end if;
  if d.statut <> 'terminee' then
    raise exception 'Seul un document entierement signe peut etre classe';
  end if;

  -- Deja classe : on renvoie le fichier existant (rejouable sans doublon).
  select id into v_id from public.sim_fichiers where signature_demande_id = p_demande_id;
  if found then return v_id; end if;

  insert into public.sim_fichiers
         (id, nom, dossier_id, taille_octets, mime_type, auteur_id, signature_demande_id)
  values (p_demande_id, left(p_nom, 255), d.sim_dossier_id, p_taille,
          'application/pdf', d.createur_id, p_demande_id)
  returning id into v_id;

  insert into public.sim_fichiers_concernes (fichier_id, profil_id)
  select v_id, s.profil_id
    from public.signature_signataires s
   where s.demande_id = p_demande_id
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.signature_classer_sim(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.signature_classer_sim(uuid, text, bigint) to service_role;


-- Verification ------------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('authenticated', p.oid, 'execute') as appli,
       has_function_privilege('service_role', p.oid, 'execute') as serveur
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname = 'signature_classer_sim';
