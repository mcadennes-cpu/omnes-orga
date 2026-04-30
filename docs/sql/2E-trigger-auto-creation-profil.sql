-- =============================================================================
-- 2E - Trigger : creation automatique d'une ligne dans public.profiles
--                a chaque nouvelle inscription dans auth.users
-- =============================================================================
--
-- COMMENT EXECUTER CE SCRIPT :
--
--   1. Va sur https://app.supabase.com et ouvre le projet "OMNES ORGA"
--   2. Dans le menu de gauche, clique sur l'icone "SQL Editor" (>_)
--   3. Clique sur le bouton "+ New query" en haut a droite
--   4. Copie-colle TOUT le contenu de ce fichier (sauf l'entete commentee si tu
--      veux, mais ce n'est pas obligatoire) dans l'editeur
--   5. Clique sur le bouton vert "Run" (en bas a droite, ou raccourci Cmd+Enter)
--   6. Tu dois voir le message "Success. No rows returned"
--   7. Pour verifier : va dans "Database" > "Triggers" dans la sidebar.
--      Le trigger "on_auth_user_created" doit apparaitre sur auth.users.
--
-- COMMENT TESTER :
--
--   Apres execution, cree un nouveau compte via le formulaire de l'app (Login).
--   Ensuite, dans Supabase :
--     Database > Tables > public.profiles
--   Une nouvelle ligne doit etre apparue avec le bon id et email.
--
-- POUR ANNULER (si besoin) :
--
--   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--   DROP FUNCTION IF EXISTS public.handle_new_user();
--
-- =============================================================================


-- 1) Fonction declenchee a chaque insertion dans auth.users.
--    SECURITY DEFINER permet a la fonction de s'executer avec les droits du
--    proprietaire (postgres) afin d'ecrire dans public.profiles meme si
--    l'utilisateur courant (le nouvel inscrit) n'a pas encore le droit
--    d'inserer via les policies RLS.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nom, prenom, role, actif)
  values (
    new.id,
    new.email,
    '',            -- nom : a completer plus tard par l'utilisateur
    '',            -- prenom : a completer plus tard par l'utilisateur
    'remplacant',  -- role par defaut, conformement aux specs (cabinet-medical-app.md)
    true           -- compte actif des la creation
  );
  return new;
end;
$$;


-- 2) Trigger : appelle la fonction ci-dessus apres chaque insertion dans
--    auth.users. Le trigger est cree (ou recree) de facon idempotente : on
--    le supprime d'abord s'il existe, pour pouvoir rejouer ce script sans erreur.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
