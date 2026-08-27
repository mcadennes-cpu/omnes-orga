-- =====================================================================
-- Correction 23-7 : un troisieme compte beta, non coordinateur
--
-- LE MANQUE
-- Les 2 seuls comptes ayant agenda_beta_access -- Matthieu et Charlotte --
-- sont AUSSI coordinateurs depuis 6A. Il n'existe donc aucun profil
-- permettant de verifier ce que voit un MEDECIN. Releve des MOD2-A, ou
-- le premier jet du test passait a vide en affichant OK : le medecin
-- choisi etait bloque en amont par peut_acceder(), pas par la policy
-- qu'on croyait tester. Exactement le genre de test qui rassure a tort.
--
-- Faute de ce compte, le harnais 22-MOD2-outil-test.py fabrique la
-- situation a chaque execution : il ouvre l'acces a un associe, teste,
-- puis le referme (atexit). Cela fonctionne, mais cela ECRIT dans la
-- table des profils sept fois par campagne de test.
--
-- CE QUE CE SCRIPT NE FAIT PAS : exposer le module a un associe.
-- Le module n'existe aujourd'hui que sur la branche feature/module-agenda,
-- absente de main : l'application deployee n'a AUCUNE entree agenda.
-- Cocher cette colonne ne montre donc rien a personne -- la tuile
-- « Planning » ne peut pas s'afficher dans une application qui ne
-- contient pas le module. Le drapeau ne sert ici qu'aux tests, qui
-- passent par PostgREST avec un jeton signe, jamais par un navigateur.
--
-- Le jour ou l'on voudra un vrai testeur humain avant la bascule, il
-- faudra deployer la branche (previsualisation Vercel) -- c'est une
-- decision distincte.
--
-- POURQUOI CE COMPTE
-- Airelle Sauvage est deja celui que le harnais emprunte a chaque
-- execution (premier associe actif non coordinateur par ordre
-- alphabetique). Le designer explicitement laisse la sortie des tests
-- inchangee -- « Medecin : Airelle SAUVAGE » -- donc comparable aux
-- campagnes precedentes. A l'etape 8, tout le monde passera a true.
--
-- A executer une seule fois sur le projet ydihrgnixthrraprclox.
-- =====================================================================

update public.profiles
   set agenda_beta_access = true
 where actif
   and coalesce(is_agenda_coordinator, false) = false
   and prenom = 'Airelle' and nom = 'SAUVAGE';

-- =====================================================================
-- Controles
--
-- 1. Trois comptes beta, dont un seul non coordinateur :
--
--   select trim(coalesce(prenom,'')||' '||coalesce(nom,'')) as nom,
--          is_agenda_coordinator as coordinateur
--     from public.profiles where agenda_beta_access order by nom;
--   -- attendu : Airelle SAUVAGE (false), Charlotte FRANZINO (true),
--   --           Matthieu CADENNES (true)
--
-- 2. Les coordinateurs n'ont pas bouge :
--
--   select count(*) from public.profiles where is_agenda_coordinator;
--   -- attendu : 2
-- =====================================================================
