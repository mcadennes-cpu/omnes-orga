Projet Omnès Médecins (React/Vite + Supabase, PWA). Branche
feature/module-agenda.

Lis d'abord CLAUDE.md (le rythme de travail a changé le 17/11/2026 : un plan
validé au départ, puis on enchaîne sans valider chaque sous-étape), puis dans
docs/cabinet-medical-app.md :
- module 6 « SIM » ;
- module 9 « Signatures » ;
- la matrice des accès ;
- le chantier D (couche RESTRICTIVE `exiger_compte_actif`) ;
- les « Limitations connues ».

Charge les skills workflow-mentorat-omnes et design-system-omnes. Lis le code
de `src/features/sim/`, `src/pages/Sim.jsx`, `src/pages/SimFolder.jsx`,
`src/features/signatures/`, `src/pages/Signatures.jsx`,
`src/pages/SignatureDetail.jsx`, `supabase/functions/signature/index.ts` et
les scripts `docs/sql/9A-*`, `24A-1`, `24A-2`, `24B-1`, `24C-1`, `24F-1`.

## OÙ ON EN EST (mesuré le 17/11/2026)

- **Signatures (étape 24)** : en production depuis le 16/11 (`main` =
  a0a0df5).
  - Moteur : tables `signature_demandes` / `_signataires` / `_codes` /
    `_journal`, bucket privé `signatures`, Edge Function `signature`
    (codes par mail via Resend, scellement pdf-lib + certificat).
  - Tuile marine « Signatures », routes `/signatures` et `/signatures/:id`.
  - **0 demande en prod** : rien à migrer.
  - Les mails et push du moteur pointent vers `/signatures/:id` (index.ts,
    lignes ~277, 472, 665, 695) : ces liens doivent continuer à marcher.
  - Reste ouvert : relecture juriste du consentement et du certificat avant
    le premier vrai document.
- **SIM (étape 9)** : Drive réservé aux super_admin (2) et associe_gerant (3),
  via `is_sim_member()`. Tuile olive, invisible pour les autres.
  - 59 fichiers en prod, tous dans des dossiers, sur 3 niveaux au plus.
  - Racines : `Asso 1901 OMNES MEDECINS`, `Contrats d'exercice médecins`
    (dont `Historique / Avenant Mireille`), `Documents cabinets`, `SAS SIM`
    (dont `Contrats commerciaux médecins`, 8 fichiers, et `Contrats types`),
    `SCI CAMAXATO`, `SCI OMNES IMMO`.
  - Le dossier contient aussi de la comptabilité : c'est un espace
    confidentiel.
- **Comptes actifs** : associe 5, associe_gerant 3, super_admin 2,
  remplacant 24, poste_bureau 1.

## OBJECTIF

Fusionner le module Signatures dans le module SIM. Le SIM range déjà les
contrats de toutes les entités ; les avenants et mises à jour signés doivent
donc y arriver directement. Et **chaque personne concernée doit pouvoir voir
ses propres contrats**, sans voir le reste du SIM.

Le moteur de signature (tables, fonctions SQL, Edge Function, preuves,
journal chaîné) **ne change pas sur le fond** : c'est le classement, la
visibilité et les écrans qui changent.

## PROPOSITION DE PLAN (à vérifier dans le code, puis à soumettre à Matthieu)

1. **Données et droits (SQL, avec les scripts dans docs/sql/25A-*)**
   - `sim_fichiers_concernes (fichier_id, profil_id)` : les personnes qui
     voient un fichier sans être membres SIM. Une table plutôt qu'un tableau,
     pour avoir les clés étrangères, l'index et une RLS simple.
   - `signature_demandes.sim_dossier_id` : le dossier SIM de destination,
     choisi à la création.
   - `sim_fichiers.signature_demande_id` (unique) : le PDF scellé classé dans
     le SIM. Un trigger le protège : pas de renommage ni de suppression, sauf
     super_admin.
   - **RLS** :
     - `sim_fichiers` et le bucket `sim` en lecture : `is_sim_member()` OU
       personne concernée (fonction SECURITY DEFINER) ;
     - `sim_dossiers` reste réservé aux membres : un non-membre ne voit
       jamais l'arborescence ;
     - garder la couche `exiger_compte_actif` ; poste_bureau toujours exclu.
2. **Classement automatique au scellement (Edge Function)**
   - Après `signature_sceller`, l'Edge Function copie `final.pdf` dans le
     bucket `sim`. Elle crée la ligne `sim_fichiers` dans le dossier choisi
     (auteur = créateur de la demande), avec comme concernés les signataires.
   - Elle doit être rejouable sans doublon (unique sur
     `signature_demande_id`).
   - Pourquoi copier plutôt que pointer vers le bucket `signatures` : le PDF
     classé suit alors les droits du SIM (les gérants le voient même s'ils
     n'ont pas signé), et l'original scellé reste intact comme preuve.
3. **Écrans**
   - La tuile « Signatures » disparaît. La tuile SIM devient visible à tous
     les rôles médicaux, avec un badge « À signer ».
   - Membre SIM : le Drive actuel, plus un onglet ou segment « Signatures »
     (À signer / En cours / Terminées).
   - Non-membre : une page « Mes documents » (fichiers où il est concerné,
     liste à plat) et « À signer ».
   - Routes conseillées : `/sim/signatures/:id`, avec redirection des
     anciennes `/signatures` et `/signatures/:id` (les liens déjà envoyés
     par mail ou push restent valables). Mettre à jour les liens dans
     index.ts.
   - Dans le menu ⋮ d'un PDF du SIM (super_admin) : « Faire signer ». Cela
     crée un brouillon avec ce PDF comme source et son dossier comme
     destination.
   - Dans le menu ⋮ d'un fichier (membres) : « Personnes concernées », pour
     rattacher après coup les contrats déjà présents (contrats d'exercice,
     contrats commerciaux médecins, avenant Mireille…).
   - Fil « En attente » et badge : `get_mon_activite` peut garder
     `module = 'signatures'`. Seuls `Home.jsx` (tuile cible, clic) et
     `useMonActivite.js` changent.
4. **Tests et bascule**
   - Nouvelle suite `25A-x` sur les droits SIM : un non-membre ne voit que
     ses fichiers, ni les dossiers, ni les blobs des autres ; un concerné
     inactif ne voit rien.
   - Rejouer `24A-3` et les suites existantes (`OMNES_CIBLE=test`).
   - Essai réel sur l'environnement de test avec le build (`vite build
     --mode test` + `vite preview`, pas `npm run dev`).
   - Puis en prod : sauvegarde `23-16`, scripts, suites, déploiement de la
     fonction, push `main`, chaque écriture en prod après le « go » de
     Matthieu.
5. **Doc** : fusionner les sections 6 et 9 de cabinet-medical-app.md, mettre
   à jour la matrice des accès et le plan. **Renuméroter** : la fusion
   devient l'étape 25, les contrats de remplacement passent en étape 26.

## QUESTIONS DE CADRAGE À POSER À MATTHIEU AVANT DE CODER

1. **Qui voit la tuile SIM** : tous les médecins (associés et remplaçants,
   qui signeront leurs contrats de remplacement à l'étape 26), ou seulement
   les associés ?
2. **Nom de la tuile** : on garde « SIM » ? Le contenu dépasse la SAS (Asso
   1901, SCI…), et un remplaçant ne sait pas forcément ce qu'est la SIM.
   Pistes : « Documents », « Contrats & documents ».
3. **Ce que voit un concerné** : seulement ses fichiers, à plat (conseillé),
   ou aussi le nom du dossier où ils sont rangés ?
4. **Qui crée une demande** : toujours super_admin seul, ou aussi
   associe_gerant maintenant que c'est dans le SIM ?
5. **Rattrapage** : qui rattache les contrats déjà présents à leurs
   titulaires (Matthieu, Charlotte), et faut-il prévenir la personne (push)
   quand un document est classé pour elle ?

Commence par : (1) lire le code et la doc cités, (2) me résumer en 10 lignes
ce que tu as compris, (3) me poser les questions de cadrage (et celles que
tu aurais en plus), (4) me proposer le plan définitif, en signalant ce que tu
corriges dans la proposition ci-dessus. Ne code rien avant mon accord sur le
plan ; ensuite, enchaîne.

Règles : jamais de npm install sans mon accord ; accents dans l'UI et la doc,
pas dans le code, le SQL ni les commits ; reference-agenda/ en lecture
seule ; le schéma `agenda` est la production ; ne jamais lancer
`22-8A-1 ... --go`.
