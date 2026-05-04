-- =============================================================================
-- 4B-2 - Enrichissement de 3 profils medecins fictifs (donnees de test)
-- =============================================================================
--
-- OBJECTIF :
--
--   Enrichir 3 profils medecins fictifs avec leurs donnees metier (nom,
--   prenom, specialite, telephone, jours_disponibles, role, notes_internes).
--   Ces 3 profils servent de donnees de test pour valider l'affichage des
--   cartes du Trombinoscope avant de coder le formulaire CRUD.
--
-- PRE-REQUIS :
--
--   Les 3 utilisateurs Auth doivent exister dans Supabase Authentication
--   AVANT d'executer ce script. Emails :
--     - dr.dupont@fictif.local
--     - dr.martin@fictif.local
--     - dr.bernard@fictif.local
--   Mot de passe (dev uniquement) : medecin1234
--   Cocher "Auto Confirm User" a la creation.
--
--   Le trigger on_auth_user_created (cf 2E-trigger-auto-creation-profil.sql)
--   auto-cree alors une ligne dans profiles avec les valeurs par defaut
--   (nom et prenom vides, role=remplacant, actif=true). Ce script vient
--   ensuite enrichir ces 3 lignes avec les vraies donnees metier.
--
-- COMMENT EXECUTER CE SCRIPT :
--
--   Supabase > SQL Editor > "+ New query".
--   Save as snippet : "4B-2 - Enrichissement profils medecins fictifs".
--   Run. Le SELECT a la fin doit retourner 3 lignes avec les noms Bernard,
--   Dupont, Martin et leurs infos respectives.
--
-- COMMENT VERIFIER :
--
--   Le SELECT en fin de script doit afficher 3 lignes. Aller ensuite dans
--   Table Editor > public.profiles et verifier que les 3 lignes sont bien
--   enrichies (rafraichir la table si besoin avec l'icone refresh).
--
-- POUR ANNULER / REINITIALISER :
--
--   Ne pas annuler ces UPDATE en production. En developpement uniquement :
--     DELETE FROM public.profiles WHERE email LIKE '%@fictif.local';
--   Puis aller dans Authentication > Users et supprimer manuellement les
--   3 utilisateurs fictifs.
--
-- NOTE :
--
--   Ces 3 medecins sont fictifs (domaine .local non routable) pour les
--   besoins du developpement. A SUPPRIMER avant la mise en production.
--   Une fois la production lancee, les vrais medecins du cabinet creeront
--   leurs comptes via le formulaire d'inscription, et leurs profils seront
--   enrichis via le formulaire de modification du Trombinoscope (a coder
--   en sous-bloc 4D).
--
-- IDEMPOTENCE :
--
--   Le script utilise UPDATE (pas INSERT), donc rejouable sans creer de
--   doublons. Si les 3 profils n'existent pas encore (utilisateurs Auth pas
--   crees), les UPDATE n'affecteront aucune ligne (0 rows affected) sans
--   lever d'erreur -- mais le SELECT a la fin retournera 0 ligne dans ce
--   cas, ce qui est le signal d'un probleme.
--
-- =============================================================================


UPDATE public.profiles
SET
  nom = 'Dupont',
  prenom = 'Sophie',
  specialite = 'Gynecologie medicale',
  telephone = '06 12 34 56 78',
  jours_disponibles = 'Lundi, Mardi, Jeudi',
  role = 'associe',
  notes_internes = 'Prefere etre contactee par SMS le matin'
WHERE email = 'dr.dupont@fictif.local';

UPDATE public.profiles
SET
  nom = 'Martin',
  prenom = 'Pierre',
  specialite = 'Medecine du sport, traumatologie',
  telephone = '06 23 45 67 89',
  jours_disponibles = 'Mardi, Mercredi, Vendredi',
  role = 'associe',
  notes_internes = NULL
WHERE email = 'dr.martin@fictif.local';

UPDATE public.profiles
SET
  nom = 'Bernard',
  prenom = 'Claire',
  specialite = 'Medecine generale',
  telephone = '06 34 56 78 90',
  jours_disponibles = 'Lundi, Mercredi, Jeudi, Vendredi',
  role = 'associe_gerant',
  notes_internes = 'Coordinatrice du planning des remplacements'
WHERE email = 'dr.bernard@fictif.local';


-- Verification : afficher les 3 profils mis a jour
SELECT email, prenom, nom, role, specialite, jours_disponibles, notes_internes
FROM public.profiles
WHERE email LIKE '%@fictif.local'
ORDER BY nom;
