# Intégration OMNÈS PLANNING → Omnès-Orga
> Fichier de référence projet · À fournir à Claude Code en début de session
> Complète le fichier `cabinet-medical-app.md` (appli principale)

---

## Contexte

Le cabinet dispose de **deux applications** :

1. **Omnès-Orga** (appli principale) — React + Vite + Tailwind + Supabase, hébergée sur Vercel. Terminée, en cours de test par les 10 associés. Usage **mobile-first**. 4 rôles : `super_admin`, `associe_gerant`, `associe`, `remplacant`.
2. **OMNÈS PLANNING** (agenda de gardes) — créée avec Bolt.new, même stack (React 18 + Vite + TypeScript + Tailwind + Supabase), déployée sur bolt.host, **projet Supabase séparé**. Utilisée activement par tout le cabinet. 2 rôles : `coordinator`, `doctor`.

**Objectif :** intégrer l'agenda comme un **8e module** d'Omnès-Orga, avec l'UI refondue à la charte Omnès, sans jamais interrompre l'agenda actuel qui reste en production pendant tout le développement.

---

## Contraintes impératives

1. **Zéro interruption** : l'agenda Bolt actuel reste utilisé par tout le cabinet jusqu'à la bascule finale.
2. **Accès bêta** : pendant le développement, le module Agenda dans Omnès-Orga n'est visible que par 2 personnes (le super_admin + 1 testeur désigné). Les autres utilisateurs ne voient pas l'icône.
3. **Migration des comptes maintenant** : la fusion des utilisateurs se fait avant la création des ~20 comptes remplaçants dans Omnès-Orga (il n'y a que ~10 comptes associés à faire correspondre).
4. **Double optimisation d'écran** :
   - Vues **coordinateur** (gestion des demandes, création de gardes, paramètres, planning du jour) → pensées **desktop d'abord**, responsive mobile en secours.
   - Vues **médecin** (calendrier, mes gardes) → pensées **mobile-first**, comme le reste d'Omnès-Orga.

---

## Ce que contient le code source de l'agenda (dépôt `Omnes.planning`)

~11 700 lignes TypeScript, 45 composants, 34 migrations SQL, 15 tables.

### Tables Supabase (projet Planning)

| Table | Rôle | À migrer ? |
|---|---|---|
| `profiles` | Utilisateurs (coordinator/doctor) | ❌ Remplacée par la table `profiles` d'Omnès-Orga |
| `shifts` | Gardes (date, site, salle, créneau, statut free/pending/assigned) | ✅ avec données |
| `requests` | Demandes de gardes (pending/approved/rejected/on_hold/cancelled) | ✅ avec données |
| `sites` | Sites configurables (Dijon, Beaune…) | ✅ avec données |
| `rooms` | Salles par site | ✅ avec données |
| `shift_types` | Créneaux horaires configurables | ✅ avec données |
| `fixed_duty_series` + `fixed_duty_patterns` | Séries de gardes fixes récurrentes | ✅ avec données |
| `rotation_settings` + `rotation_assignment_rules` | Rotations automatiques | ✅ avec données |
| `week_templates` + `week_template_items` | Modèles de semaines | ✅ avec données |
| `opening_week_templates` + `opening_week_template_items` | Modèles de semaines d'ouverture | ✅ avec données |
| `undo_buffer` | Buffer d'annulation | ✅ structure seule (données jetables) |

Toutes les colonnes `doctor_id`, `assigned_doctor_id`, `created_by`, `reviewed_by` référencent `profiles.id` → à **remapper** vers les nouveaux id lors de la migration (voir section Migration).

### Composants à SUPPRIMER (gérés par Omnès-Orga)

- `LoginPage.tsx` — l'auth existe déjà
- `PasswordChangeModal.tsx` — mots de passe gérés par l'appli principale
- `CreateUserModal.tsx`, `EditUserModal.tsx`, `DeleteUserModal.tsx`, `UsersView.tsx` — gestion des comptes déjà en place
- Fonctions Edge `create-user` et `update-admin-credentials` — inutiles
- `Navigation.tsx` — remplacée par une navigation interne au module, intégrée au layout Omnès-Orga
- Config PWA de l'agenda (`manifest.json`…) — Omnès-Orga a la sienne

### Composants à PORTER (cœur du module)

- Vues : `EnhancedCalendarView`, `MyScheduleView`, `DailyScheduleView`, `RequestsView`, `RequestsCalendarView`, `DoctorWeekSummaryView`, `SettingsView`
- Sous-vues calendrier : `calendar/MonthView`, `calendar/WeekView`, `calendar/DayView`, `calendar/CalendarFilters`
- Paramètres : `settings/SitesManagement`, `settings/RoomsManagement`, `settings/ShiftTypesManagement`, `settings/RotationManagement`
- Modals : `ShiftDetailModal` (⚠️ 1 132 lignes — **à découper en sous-composants** lors du portage), `CreateShiftModal`, `ShiftRequestModal`, `CancelRequestModal`, `RejectReasonModal`, `AssignDoctorModal`, `BulkAssignPrevalidatedModal`, `EditSeriesModal`, `SeriesActionModal`, `EditValidatedShiftModal`, `ConflictErrorModal`, modals de templates de semaine, `ExportPlanningModal`
- Lib : `shiftValidation.ts`, `rotationUtils.ts`, `weekTemplateUtils.ts`, `undoUtils.ts`, `exportUtils.ts`
- `UndoButton`, `RequestCard`, `ShiftRow`

Destination proposée : `src/modules/agenda/` dans le projet Omnès-Orga.

---

## Mapping des rôles

| Rôle Omnès-Orga | Équivalent agenda | Droits agenda |
|---|---|---|
| `super_admin` | coordinator | Tout : création gardes, demandes, paramètres |
| `associe_gerant` | doctor* | Calendrier, demandes de gardes, mes gardes |
| `associe` | doctor | Calendrier, demandes de gardes, mes gardes |
| `remplacant` | doctor | Calendrier, demandes de gardes, mes gardes |

*\* Décision à confirmer : les associés gérants doivent-ils avoir les droits coordinateur sur l'agenda ? Par défaut NON — seul(s) le(s) coordinateur(s) désigné(s). Prévoir éventuellement une colonne `is_agenda_coordinator boolean` dans `profiles` pour découpler le rôle "coordinateur d'agenda" du rôle applicatif.*

Toutes les policies RLS des tables migrées doivent être réécrites avec ce mapping (remplacer les checks `role = 'coordinator'` par le nouveau critère).

---

## Accès bêta (module caché)

Ajouter une colonne dans `profiles` d'Omnès-Orga :

```sql
ALTER TABLE profiles ADD COLUMN agenda_beta_access boolean DEFAULT false;
```

- L'icône "Agenda" sur la grille d'accueil ne s'affiche que si `agenda_beta_access = true` (à activer manuellement pour le super_admin + 1 testeur).
- Les policies RLS des tables agenda incluent aussi ce critère pendant la phase bêta.
- À la sortie de bêta : passer tout le monde à `true` (ou supprimer la condition), en un seul UPDATE.

---

## UI — Refonte à la charte Omnès

- Palette : navy `#1C3D52`, teal `#2A8FA8`, ambre `#E8A135`, olive `#6B7A3A`, rouge-orangé `#D4503A`, rose-fuchsia `#D94F7E` (déjà dans le `tailwind.config` d'Omnès-Orga — réutiliser les tokens existants, ne pas redéfinir de couleurs en dur).
- Icônes lucide-react fines sur fonds pastel arrondis, cohérentes avec les 7 modules existants.
- Statuts des gardes : conserver la logique 🟢 libre / 🟡 en attente / ⚫ assigné mais dans la palette Omnès (ex. teal = libre, ambre = en attente, navy = assigné).
- **Vues médecin** (calendrier mensuel, mes gardes) : mobile-first, grandes zones tactiles, navigation par mois au swipe si simple à faire.
- **Vues coordinateur** (demandes, planning du jour, paramètres, création en masse) : layout desktop large (tableaux, colonnes), responsive dégradé sur mobile.

---

## Migration des données (bascule finale)

### Préalable : table de correspondance des emails

⚠️ Les emails correspondent **presque** entre les deux applis, mais certains associés ont deux adresses. Avant migration :

1. Exporter la liste `email, full_name, id` des `profiles` du projet Planning.
2. Exporter la même liste depuis Omnès-Orga.
3. Construire manuellement un fichier `mapping.csv` : `old_profile_id, new_profile_id, email_planning, email_orga` — les cas ambigus (double email) sont tranchés à la main.

### Script de migration

1. Export des données du projet Supabase Planning (`pg_dump` ou export CSV par table via le dashboard).
2. Création des tables dans le projet Omnès-Orga (reprendre les migrations en adaptant `profiles` → nouvelle table + nouvelles RLS).
3. Import des données en remplaçant chaque référence utilisateur via `mapping.csv`.
4. Vérifications : nombre de gardes identique, chaque garde assignée pointe vers un profil existant, aucune demande orpheline.
5. Bascule un soir : annonce au cabinet, activation du module pour tous, mise hors service de l'ancienne appli Bolt (page de redirection).

---

## Plan de développement étape par étape

1. ✓ **Étape 1 — FAITE (23/07/2026)** — Copier `src/modules/agenda/` dans Omnès-Orga, créer un second client Supabase `supabaseAgenda` pointant vers le projet Planning existant (variables `VITE_AGENDA_SUPABASE_URL` / `VITE_AGENDA_SUPABASE_ANON_KEY`). Le module lit/écrit les vraies données actuelles → test réaliste immédiat, sans toucher à l'appli Bolt. Détail dans « Suivi d'avancement » ci-dessous.
2. ✓ **Étape 2 — FAITE (23/07/2026)** — Colonne `agenda_beta_access`, tuile « Planning » conditionnelle sur la grille d'accueil, route `/planning` vers le module (chargement lazy). Détail dans « Suivi d'avancement » ci-dessous.
3. ✓ **Étape 3 — FAITE (23/07/2026)** — Supprimer du module tout ce qui est listé en "à SUPPRIMER", brancher l'utilisateur connecté d'Omnès-Orga (adaptateur : profil Orga → format attendu par le module, mapping des rôles). Détail dans « Suivi d'avancement » ci-dessous.
4. ✓ **Étape 4 — FAITE (23-24/07/2026)** — Refonte UI complète vue par vue + découpage de `ShiftDetailModal`. Détail dans « Suivi d'avancement » ci-dessous.
5. ✓ **Étape 5 — FAITE (24-29/07/2026)** — Tests en bêta à 2 utilisateurs pendant l'usage réel (les données sont partagées avec l'appli Bolt : tout ce qui se passe dans l'une se voit dans l'autre). Principal résultat : l'incident « des gardes sautent » du 29/07, diagnostiqué et corrigé des deux côtés.
6. ✓ **Étape 6 — FAITE (01-26/08/2026)** — Modifications fonctionnelles souhaitées : MOD-1 (roulement, 01-03/08) et MOD-2 (annulation, 03-26/08). **⚠️ Exécutée APRÈS l'étape 7** — voir l'encadré ci-dessous. Deux reliquats volontairement reportés : **6C-4** (suppression de `rotation_settings` / `rotation_assignment_rules`, après la bascule) et la remise en place de **J6 Beaune**. Détail dans « Suivi d'avancement ».
7. **Étape 7 — EN COURS (à partir du 30/07/2026)** — Migration des données vers le projet Supabase principal (voir section Migration), remplacement de `supabaseAgenda` par le client unique.
8. ⏳ **Étape 8 — BASCULE FAITE LE 17/09/2026 (module ouvert à tous à 14h00)** — Bolt archivé et mis en pause à 14h19 ; reste l'annonce au cabinet et les chantiers « après J » ; détail en 8H. **8I** : un médecin créé dans l'appli est désormais ouvert au Planning automatiquement. Préparation commencée le 26/08/2026 — Ouverture à tous, activation des 26 comptes remplaçants, extinction de l'appli Bolt. **8A-1 (resynchronisation différentielle) est faite et éprouvée** ; l'ordre des opérations du soir de la bascule est arrêté et testé. **8C-1 est faite** : les 26 remplaçants (plus une associée jamais connectée) garderont le mot de passe qu'ils utilisent sur Bolt, ce qui retire les 26 réinitialisations du soir de la bascule. **8D est faite** : retouches d'UI des vues médecin (couleur de nuit, liseré en L, avatar, onglet d'accueil par rôle), décidées sur téléphone en direct. **8A-2 est faite** : la resynchronisation recopiait depuis Bolt le libellé d'horaire des gardes et avait défait, le 26/08, la correction de J2 Beaune posée par 6A-1 — réparé (23-8) et corrigé dans le script. **8C-2 est faite** : Dr Vincent D'ALESIO, remplaçant créé dans Bolt le 03/09 et qui bloquait la resynchronisation, est intégré comme les autres — **27 remplaçants** attendent désormais l'activation. **8E-1 est faite** : `main` est fusionnée dans la branche — l'annuaire de la branche lisait une colonne supprimée en base et aurait cassé en production ; le plan de mise en production et du soir de la bascule est arrêté le 17/09, avec ses décisions ouvertes. **8F-1 est faite** : le script de 6C-4 (`23-10`) est écrit et répété en `rollback` sur la vraie base, prêt pour le soir J. **8F-2 est faite** : découverte que `actif = false` ne protège rien dans Orga ; les 6 remplaçants qui ne travaillent plus au cabinet et le compte fictif Essai DUPONT sont bloqués (`23-11`) — **21 remplaçants** seront ouverts, la liste compte **30 médecins**. **8F-3 est faite** : prouvé sur un compte jetable qu'un mot de passe Bolt de 6 caractères ouvre Orga, et qu'un compte bloqué ne peut plus se connecter. **8F-4 est faite** : le script d'ouverture (`23-12`) est prêt et répété en `rollback`, avec son retour arrière. **8F-5 est faite** : les suites de test qui écrivent se bloquent d'elles-mêmes une fois le module ouvert ; le soir J, elles tournent une dernière fois avant l'ouverture. **8G est faite** : le code du module est en production (`0c5736f`), la tuile n'apparaît qu'aux 3 porteurs du drapeau, prévenus de rester sur Bolt jusqu'au soir J. Détail dans « Suivi d'avancement ».

> **⚠️ Inversion de l'ordre d'exécution des étapes 6 et 7 (décidée le 30/07/2026).**
> Les numéros sont conservés (MOD-1 et MOD-2 restent « l'étape 6 » dans toute la
> doc), mais **l'étape 7 est réalisée en premier**.
>
> **Pourquoi** : MOD-1 exige deux nouvelles tables (`rotation_plans` /
> `rotation_plan_rules`) et la suppression d'une contrainte `UNIQUE` ; MOD-2
> exige un journal d'activité et une colonne `deleted_at`. Or la règle du projet
> interdit toute migration structurelle sur la base Planning tant que l'appli
> Bolt tourne dessus en production. **Les deux chantiers de l'étape 6 supposent
> donc la maîtrise du schéma, que seule l'étape 7 apporte.** Le plan initial les
> avait mis dans le mauvais ordre.
>
> **Conséquences** : la bêta cesse de s'exercer sur les données vivantes (le
> module travaillera sur une copie dans la base Orga) ; il faut prévoir une
> **re-synchronisation du delta** le soir de la bascule, puisque Bolt continue
> d'être utilisé pendant tout le développement (sous-étape 7F).

### Suivi d'avancement

- ✓ **Étape 1 — FAITE (23/07/2026)** — branche `feature/module-agenda`, commits `10861b0` (1A) et `4915e1a` (1B).
  - **1A — Second client Supabase** : `src/modules/agenda/lib/supabase.ts` lit `VITE_AGENDA_SUPABASE_URL` / `VITE_AGENDA_SUPABASE_ANON_KEY` et exporte `supabaseAgenda` **plus un alias `supabase`** — les composants copiés gardent ainsi leurs imports d'origine intacts. Les types du domaine (`Shift`, `Request`, `Site`…) sont repris tels quels dans ce même fichier. `storageKey: 'sb-agenda-auth'` isole la session auth Planning de celle d'Omnès-Orga dans le localStorage. Client factice + `hasValidConfig` si les variables manquent (comportement d'origine). Clés vérifiées par requêtes réelles : les tables répondent 200 (`[]` sans session — la RLS filtre les anonymes) ; le 401 sur `/rest/v1/` racine est **normal** (endpoint du schéma OpenAPI réservé à la clé service_role sur les projets Supabase récents), ne pas s'en inquiéter lors de futurs tests.
  - **1B — Copie du module** : 50 fichiers copiés depuis `reference-agenda/src/` (App.tsx, ErrorBoundary.tsx, 41 composants dont calendar/ et settings/, 6 libs métier), y compris les composants « à SUPPRIMER » — leur suppression est le travail de l'étape 3, pas de la 1. Non copiés : `main.tsx` (point d'entrée, remplacé par le routage Orga en étape 2), `index.css` (dupliquerait les directives Tailwind), `vite-env.d.ts`. Configs adaptées : glob `content` Tailwind élargi à `{js,jsx,ts,tsx}`, `globalIgnores` ESLint étendu à `reference-agenda` et `src/modules/agenda`.
  - **Choix d'implémentation** : TypeScript conservé tel quel (Vite compile le `.tsx` nativement ; en contrepartie aucune vérification de types `tsc` — assumé jusqu'à la refonte). Lint du module reporté à l'étape 4. Classe CSS `.brand-title` non portée (utilisée uniquement par LoginPage/Navigation, supprimés en étape 3).
  - **Vérifications** : `npm run build` passe ; les 50 fichiers compilent via esbuild ; les 47 icônes lucide-react utilisées existent toutes en v1.14 (l'agenda utilisait la v0.344 — risque levé).
  - **État en fin d'étape** : module présent mais invisible (aucune route ni icône avant l'étape 2). Attention : tant qu'il n'est importé nulle part, `vite build` ne compile pas ses fichiers (hors graphe d'imports). Par ailleurs `npm run lint` remonte ~144 problèmes **préexistants** dans le code principal (src/features, src/hooks, dev-dist…), sans lien avec le module — dette à traiter à part.

- ✓ **Étape 2 — FAITE (23/07/2026)** — branche `feature/module-agenda`.
  - **2A — Colonne bêta** : script `docs/sql/22-2A-agenda-beta-access.sql` exécuté sur le projet OMNES ORGA (API Management) : `profiles.agenda_beta_access boolean NOT NULL DEFAULT false` + activation pour le rôle `super_admin`. Il y a **deux** comptes super_admin, tous deux activés : Matthieu + Charlotte Franzino — validé par Matthieu, Charlotte est la testeuse désignée de la bêta. Le duo bêta est donc déjà au complet.
  - **2B — Tuile conditionnelle** : entrée `agenda` dans `MODULES` (`src/lib/modules.js`) — label affiché **« Planning »** (le nom que le cabinet utilise déjà ; l'identifiant interne reste `agenda` partout : dossier du module, colonne SQL, docs), icône `CalendarClock`, couleur `canard`, `poste_bureau` exclu des rôles. Mécanisme générique `betaFlag: 'agenda_beta_access'` : `getVisibleModules(role, profile)` masque tout module dont le flag du profil est faux. Sortie de bêta = supprimer cette seule ligne.
  - **2C — Route** : `/planning` (alignée sur le label plutôt que sur l'identifiant interne), page `src/pages/Agenda.jsx` dans le bloc `ProtectedRoute`. Garde d'accès : redirection vers l'accueil si `agenda_beta_access` est faux, **après** la fin du chargement du profil (sinon un F5 sur `/planning` éjecterait un utilisateur légitime pendant le fetch). Module chargé via `React.lazy()` + `Suspense` → chunk séparé (~223 kB, 42 kB gzip) téléchargé uniquement à l'ouverture de la route ; le module entre enfin dans le graphe d'imports de `vite build` (102 modules transformés).
  - **Correction annexe — collision du token `fuchsia`** : la définition de marque `fuchsia: '#D94F7E'` du `tailwind.config.js` écrasait toute la gamme standard Tailwind `fuchsia-50..950`, rendant transparents les `bg-fuchsia-100` du module (DailyScheduleView, MyScheduleView). Résolu par `fuchsia: { ...colors.fuchsia, DEFAULT: '#D94F7E' }` : l'appli principale (`bg-fuchsia`, `text-fuchsia`, `bg-fuchsia/15`) est inchangée, la gamme standard est restaurée pour le module.
  - **Limitation connue (transitoire)** : le logo `/logo-omnes-couleur.png` référencé par LoginPage/Navigation est en 404 (asset du `public/` de l'appli Bolt, volontairement non copié) — sans objet dès l'étape 3, ces deux composants disparaissent.
  - **État en fin d'étape** : tuile « Planning » visible pour les 2 comptes bêta → clic → page de login de l'agenda (identifiants **Planning**, pas Omnès-Orga) → agenda complet sur les données réelles. Testé et validé par Matthieu en local. Le branchement sur l'utilisateur Omnès-Orga est l'objet de l'étape 3.

- ✓ **Étape 3 — FAITE (23/07/2026)** — branche `feature/module-agenda`. Composants « à SUPPRIMER » retirés, auth Planning découplée de l'écran de login d'origine, profil Orga branché sur le module. Testé et validé par Matthieu en local.
  - **3A — Suppressions** : 5 fichiers effacés (`UsersView`, `CreateUserModal`, `EditUserModal`, `DeleteUserModal`, `PasswordChangeModal`, ~900 lignes) — gestion des comptes et des mots de passe, désormais du ressort de l'appli principale. `App.tsx` et `Navigation.tsx` nettoyés de la vue `users` et de la logique `must_change_password`. Le champ `must_change_password` reste dans le type `Profile` (la colonne existe toujours côté base Planning), simplement inutilisé.
  - **3B — Pont d'authentification** : la mécanique de session Planning est extraite dans un hook `hooks/useAgendaSession.ts` (getSession + onAuthStateChange + chargement du profil + `signIn`/`signOut`, avec garde `cancelled` contre les écritures d'état après démontage). La `LoginPage` d'origine est remplacée par `components/PlanningLinkPage.tsx` : **écran de liaison** à la charte Omnès (carte `rounded-card`, pastille canard, CTA marine). **Pourquoi une liaison et pas une simple auto-connexion** : les deux projets Supabase sont indépendants et on s'interdit de modifier la base Planning (prod Bolt) ; ses policies RLS exigent donc un jeton d'auth **du projet Planning**, que la session Omnès-Orga ne fournit pas. La liaison est une saisie **unique par navigateur** (session persistée sous `sb-agenda-auth`, rafraîchie automatiquement) ; elle disparaîtra à l'étape 7 avec la migration des données. L'écran d'erreur de configuration d'`App.tsx` a été refait en français, aux couleurs Omnès, avec les **bons** noms de variables (`VITE_AGENDA_*`) et le rappel « redémarrer le serveur ».
  - **3C — Adaptateur utilisateur** : `lib/userAdapter.ts` matérialise le mapping des rôles (`super_admin` → `coordinator`, tout le reste → `doctor`) et la fonction `buildAgendaUser(planningProfile, orgaProfile)`. **Décision clé assumée** : pendant la bêta, l'identité effective (id, rôle) vient du profil **Planning** (imposé par la RLS) ; l'adaptateur retourne donc ce profil, mais **avertit en console** si le rôle attendu d'après le profil Orga diverge. `Agenda.jsx` passe désormais `orgaProfile` en prop ; à l'étape 7, `buildAgendaUser` sera l'**unique point** à basculer pour construire l'utilisateur à partir du seul profil Orga. Bonus UX : l'écran de liaison pré-remplit le champ e-mail avec l'adresse Orga (modifiable — certains associés ont deux adresses).
  - **3D — Navigation interne** : `Navigation.tsx` remplacée par `components/AgendaHeader.tsx`, header sticky au pattern Omnès (bouton retour `ChevronLeft` vers l'accueil, filigrane `HeaderWatermark` canard, onglets en pills défilant en `hide-scrollbar` sur mobile, actif = canard plein). Onglets filtrés par rôle (coordinator : Calendrier / Demandes / Paramètres ; doctor : Calendrier / Mes gardes / Planning du jour) — **libellés et ordre revus en 8B-2** : le coordinateur voit désormais Validation / Ouvertures / Journal / Paramètres, le médecin Ouvertures / Mes gardes / Planning du jour. L'ancien « Déconnexion » devient **« Délier le compte Planning »** (icône lien barré) : vocabulaire distinct de la déconnexion Omnès-Orga car il ne délie que la session Planning de ce navigateur. La disparition de `Navigation.tsx` supprime les dernières références au logo 404 (`/logo-omnes-couleur.png`) et à la classe `.brand-title` non portée.
  - **Vérifications** : `npm run build` passe à chaque sous-étape ; rendu des nouveaux écrans (liaison + header) contrôlé en prévisualisation isolée avant branchement. Commits `9e1f721` (3A), `9c8bbbe` (3B).
  - **État en fin d'étape** : ouverture de `/planning` → si aucune session Planning dans le navigateur, écran de liaison (e-mail Orga pré-rempli) → une fois relié, agenda complet avec le nouveau header Omnès. Le module reste **client** de la base Planning (données réelles partagées avec l'appli Bolt). La refonte visuelle des vues internes (calendrier, demandes…) reste l'objet de l'étape 4.

- ✓ **Étape 4 — FAITE (23-24/07/2026)** — branche `feature/module-agenda`. Refonte UI complète du module à la charte Omnès, vue par vue, + découpage de `ShiftDetailModal`. **Comportement fonctionnel gelé** : aucune logique métier modifiée ; `alert()` / `confirm()` / sondage de l'UndoButton conservés (réservés à MOD-2, étape 6). Testé et validé par Matthieu au fil des sous-étapes. Commits `4A` → `4H` puis nettoyage `bea22ab`.
  - **Socle partagé (4A)** : `lib/statusStyles.ts` (source unique des 4 statuts → tokens Omnès), `components/ui/StatusBadge.tsx`, `components/ui/BottomSheet.tsx`, `components/ui/Segmented.tsx`, shell `App.tsx` aux tokens. La primitive `BottomSheet` est devenue **responsive** en cours d'étape (voir plus bas).
  - **Mapping couleur des statuts** (décidé avec Matthieu) : libre → `canard`, demandes → `ocre` (avec dégradé selon le nombre de demandes côté coordinateur), pré-validé → `marine`, assigné/validé → **vert**. L'olive de la marque tirant trop sur le kaki, on a retenu un vert « statut » standard (`green-100`), aligné sur l'app Bolt d'origine. Dans la **grille coordinateur**, une garde **libre = sans couleur** (blanc), à la demande de Matthieu (capture comparée à l'app d'origine).
  - **Couleur par horaire** (`lib/horaireStyles.ts`, ajout demandé par Matthieu) : dans les **vues perso médecin** (« Mes gardes », « Planning du jour »), chaque garde est teintée selon son créneau — 08:00-14:00 olive, 08:00-16:00 ocre, journée (→18:30) canard, après-midi/soir (14:00+) marine, week-end brique. La grille **coordinateur** reste colorée par **statut** (besoins distincts : triage vs planning personnel). Détection du week-end par la date, du créneau par lecture de la plage horaire (robuste aux formats).
  - **Vues refondues** : 4B calendrier médecin (`EnhancedCalendarView`, `MonthView`, `DoctorWeekSummaryView`, `CalendarFilters` — bascules via `Segmented`) ; 4C « Mes gardes » (`MyScheduleView`) ; 4D demandes coordinateur (`RequestsCalendarView` + `AssignDoctorModal`, `BulkAssignPrevalidatedModal`, `ConflictErrorModal`) ; 4E « Planning du jour » (`DailyScheduleView` — **avatar médecin** via le composant `<Avatar>` de l'appli : initiales colorées déterministes en bêta, vraies photos automatiques à l'étape 7) ; 4F calendrier coordinateur + création (`WeekView`, `CreateShiftModal`, modèles de semaine, `ExportPlanningModal`, `UndoButton` restylé) ; 4H paramètres (`SettingsView` + `Sites`/`Rooms`/`ShiftTypes`/`RotationManagement`).
  - **Découpage de `ShiftDetailModal` (4G)** : **1 132 → 767 lignes** (parent = logique métier seule) + **6 sous-composants** dans `components/shiftDetail/` (`ShiftInfoRows`, `CoordinatorNoteEditor` autonome, `PendingRequestsList`, `CancelAssignmentModal`, `ApplyToRotationWeekModal`, `DeletionBlockedModal`). `EditSeriesModal`, `SeriesActionModal`, `EditValidatedShiftModal` convertis en modales responsives.
  - **Modales responsives** : ~15 modales converties à la primitive `BottomSheet` = **feuille par le bas sur mobile / dialogue centré à coins arrondis sur ordinateur** (`md:`). Décision prise après retour de Matthieu (Charlotte, coordinatrice, travaille sur ordinateur). **Déviation assumée** au design-system (« bottom-sheet obligatoire, pas de modale centrée ») : on **étend** la primitive (toujours une feuille sur mobile) plutôt que de la violer — à acter dans le skill `design-system-omnes` si confirmé.
  - **Nettoyage** : suppression de **6 composants morts** hérités de l'empilement Bolt (`ShiftRequestModal`, `RequestCard`, `RejectReasonModal`, `CalendarView`, `DayView`, `ShiftRow` — ~1 070 lignes), + retrait du câblage mort de `ShiftRequestModal` dans `EnhancedCalendarView`.
  - **Ajustements visuels (26/07/2026)** — retouches côté vues médecin après revue de Matthieu :
    - **Couleurs des créneaux** (`horaireStyles.ts`) revues pour évoquer le jour/la nuit : J1 (08:00-16:00) → **olive**, J6 (08:00-14:00) → **ocre/jaune** ; journée (08:00-18:30) canard et J2 (14:00+) marine inchangés ; week-end brique inchangé.
    - **Cartes de garde découpées en deux bandes** dans « Mes gardes » et « Planning du jour » : en-tête (la **date** pour « Mes gardes », le **nom du médecin** pour « Planning du jour ») sur **bande pleine « teinte soutenue » à la couleur du créneau**, infos lieu/salle/horaire sur **fond blanc** dessous. Le champ de style unique est désormais `bandClass` (les anciennes versions pastel `cardClass`/`accentText`, devenues mortes après le découpage, ont été retirées).
    - **« Planning du jour »** : passage à **une pastille par garde** (au lieu d'un regroupement par médecin), **avatar seul à gauche** (pattern `MedecinCard` du trombinoscope). Un médecin ne devant normalement pas cumuler deux gardes le même jour, un éventuel doublon apparaît en deux pastilles distinctes.
    - **« Mes gardes »** : suppression de l'**accordéon multi-gardes** (cas anormal) — chaque garde est une carte, un jour à plusieurs gardes s'affiche en plusieurs cartes de même date. Simplifie le composant (état d'expansion, regroupement et tri par date supprimés).
  - **Rôles en bêta (clarifié par Matthieu)** : le rôle effectif dans le module vient du **compte Planning relié**, pas du rôle Orga (`buildAgendaUser` retourne le profil Planning). Matthieu = `doctor` (Planning), Charlotte = `coordinator` (Planning) — **tous deux `super_admin` sur Orga**. Pour tester une vue : relier le compte Planning correspondant. **Conséquence pour l'étape 7** : `mapOrgaRoleToAgenda` (`super_admin` → coordinateur) est insuffisant (les deux sont super_admin, un seul est coordinateur) → il faudra une **désignation explicite** du/des coordinateur(s) d'agenda (colonne `is_agenda_coordinator` déjà évoquée), et non un mapping depuis le rôle applicatif.
  - **Dette technique repérée** (hors refonte visuelle, à traiter plus tard — origine : appli Bolt construite par empilement de prompts sans plan) :
    - **Logique dupliquée** : bloc « rendre sa demande à l'ancien médecin » copié dans `handleApprove` et `handleSetOnHold` de `ShiftDetailModal` ; logique « appliquer à la semaine de roulement » en double (`AssignDoctorModal` + `ShiftDetailModal`). Factorisable mais touche au comportement → à faire prudemment (idéalement avec des tests). **→ FAIT (26/07), voir « Dette technique traitée » ci-dessous.**
    - **`ShiftDetailModal`** : les handlers async pourraient migrer dans un hook `useShiftDetail` pour alléger le parent (767 lignes, presque toutes de la logique). **→ FAIT (26/07), voir « Dette technique traitée » ci-dessous.**
    - **`alert()` / `confirm()` / sondage undo (2 s)** : UX datée, déjà prévue en refonte dans **MOD-2 (étape 6)**.
    - **`must_change_password`** : champ mort conservé dans le type `Profile` (colonne encore présente côté base Planning), inutilisé depuis l'étape 3.
    - **TypeScript** : plusieurs `any` (shifts transformés, `pendingRequests`) ; pas de vérification `tsc` sur le module (assumé depuis l'étape 1). **→ décidé le 26/07 : reporté en chantier dédié** (activer `tsc` demande d'installer `typescript` + `@types/*` et un effort de correction sur tout le module ; à grouper avec la refonte propre, MOD-1/MOD-2 réécrivant déjà de gros morceaux).
      - **⚠️ Élément nouveau au dossier (03/08/2026)** : un `useState` ajouté dans `ShiftDetailModal` **sans l'import correspondant** est parti en écran blanc chez Matthieu. **Rien ne l'a arrêté** — `npm run build` passe (esbuild ne vérifie pas les identifiants) et le module est hors ESLint. *Le build n'est donc pas un filet pour cette classe de faute.* Le lint réel du module suppose `typescript-eslint` (nouvelle dépendance) **et** d'élargir `files: ['**/*.{js,jsx}']` dans `eslint.config.js`, qui n'inclut pas les `.tsx` — les deux verrous se cumulent. En attendant, un contrôle jetable (hooks utilisés sans import, sur les 50+ fichiers) est passé : aucun autre cas.
    - ✓ **RÉSOLU (26/08/2026) — les gardes passées restées `free` / `pending`.** Relevées à 125 le 03/08, elles étaient **155** au 26/08 : le compte grossit d'une vingtaine par mois, mécaniquement. Script `23-5-agenda-cloture-gardes-non-pourvues.sql`, exécuté. Détail ci-dessous dans « Ce que sont ces gardes ».
  - **Points réévalués le 26/07 (finalement laissés en l'état)** : gestion d'erreur « éparpillée » dans `AssignDoctorModal` (le `setLoading(false)` hors `finally` est **volontaire** — il évite de modifier l'état après `onClose()` ; conversion cosmétique + risquée, écartée) ; `rotationDebug.ts` (**déjà neutralisé en prod** : le debug ne s'active qu'avec `?debugRotation=1` ou `VITE_DEBUG_ROTATION=true`, aucun `console.log` sinon — rien à corriger).
  - **Dette technique traitée (26/07/2026)** — option 2 du plan, refacto **à iso-comportement** (comportement fonctionnel gelé ; le module écrit dans la **vraie base Planning de prod**, chaque action vérifiée via un « Site TEST » + dates futures puis supprimée) :
    - **A — bloc « rendre sa demande à l'ancien médecin »** factorisé dans un helper `revertPreviousDoctorRequest` (`ShiftDetailModal`/`useShiftDetail`), appelé par `handleApprove` et `handleSetOnHold`. Commit `612fffa`.
    - **B (minimal) — calcul de roulement** : extraction de `getRotationSlot(date, settings)` dans `rotationUtils` (encapsule `getRotationWeek` + `date.getDay()`), utilisé dans les deux « appliquer à la semaine de roulement ». **Volontairement limité** : le `upsert` de `rotation_assignment_rules` et la recherche des gardes candidates ne sont **pas** factorisés, car **MOD-1 (étape 6) remplacera ces tables** (`rotation_plans`/`rotation_plan_rules`) — inutile de polir du code voué à être réécrit. La **divergence** entre les deux appelants (`AssignDoctorModal` vérifie les conflits garde par garde, pas `ShiftDetailModal`) est **conservée**. Commit `c5cae13`.
    - **C — hook `useShiftDetail`** : état + effet d'ouverture + handlers async sortis de `ShiftDetailModal` (**741 → 238 lignes**, présentation seule) vers `hooks/useShiftDetail.ts`. Seule addition volontaire (validée avec Matthieu) : une garde `cancelled` sur les **chargements d'ouverture** (lecture seule) pour ignorer les réponses arrivant après fermeture de la fenêtre.
    - **Objectif de fond** : ce refacto s'inscrit dans la volonté de **recoder proprement** l'appli héritée de Bolt au fil des étapes (structure, factorisation, dette), pas seulement de la re-styliser.
  - ✓ **RÉSOLU (29/07/2026) — « des gardes sautent »** : le mystère signalé par Matthieu en usage réel est élucidé, corrigé et les données réparées. Ce n'était **ni** la garde `cancelled` (lecture seule), **ni** la double écriture concurrente avec Bolt : c'était un **défaut de périmètre** dans `handleCancelAssignment('rotation')`.
    - **Cause** : la fonction fait deux opérations avec **deux filtres différents**. La suppression de la règle filtre correctement sur `doctor_id + site_id + room_id + shift_type_id + weekday + rotation_week`. Mais la libération des gardes ne filtrait que sur `site_id + room_id + shift_type_id + date >= aujourd'hui` — sans `weekday`, sans `rotation_week`, sans `doctor_id`. Supprimer une règle qui ne couvre **qu'une case** du roulement libérait donc **toutes** les gardes futures du créneau, tous jours et toutes semaines confondus.
    - **Pourquoi ce défaut existait** : la semaine de roulement n'est pas une colonne, elle se **calcule** depuis la date (`getRotationWeek`). Elle n'est donc pas exprimable dans un `WHERE` SQL, et l'auteur d'origine avait élargi le filtre plutôt que de faire le tri côté client.
    - **Constat** : le 29/07/2026 à 08:06:22 UTC, un seul clic a libéré **100 gardes J5 Dijon**, du 05/08 au 31/12/2026, sur les 5 jours ouvrés. Trois vagues antérieures identifiées avec la même signature (23/07 : J8 Dijon, WE 2 Dijon, J7 Dijon), et des demandes approuvées orphelines remontant à janvier 2026 — le bug tournait depuis des mois.
    - **Correctif** (commit `120c798`) : helper `findRotationSlotShifts` dans `useShiftDetail`, partagé par l'action **et** par le compteur d'avertissement (plus de divergence possible entre ce qui est annoncé et ce qui est fait). Il restreint au maximum côté base puis ne retient que les gardes de la **même case** du roulement ; l'écriture porte sur une **liste d'identifiants explicite** (`.in('id', …)`), plus sur un filtre ouvert. Vérifié sur les données réelles : le clic à l'origine de l'incident libère désormais **2 gardes au lieu de 67**. Libellé du bouton corrigé au passage (il annonçait « toutes les futures gardes »).
    - **Réparation des données** (script `docs/sql/23-1-agenda-restaure-gardes-liberees.sql`) : 8 gardes rendues aux remplaçants + 2 sans conflit (trace = demande `approved`), 6 gardes de roulement rendues au Dr Mireille YUAN, **1 règle de roulement recréée** (lundi S8 — supprimée par l'incident, son existence prouvée par les gardes passées), 42 gardes remises en `pending` (le déclencheur `update_shift_status` ne réagit qu'aux écritures sur `requests` : l'`UPDATE` en masse sur `shifts` avait laissé les demandes en attente invisibles au coordinateur), et 15 demandes approuvées fantômes closes en `cancelled` (médecin déjà affecté ailleurs ce jour-là — arbitré avec Matthieu). Contrôles finaux : 0 orphelines, 0 incohérence de statut, 0 double réservation.
    - **Limite assumée** : ~46 gardes libérées n'ont **aucune trace** en base (ni demande, ni règle de roulement) — soit elles étaient déjà libres, soit assignées en direct par le coordinateur, chemin qui n'écrit rien d'exploitable. Elles n'ont pas pu être reconstituées.
    - ✓ **Appli Bolt corrigée (30/07/2026)** : le **même défaut** existait dans `src/components/ShiftDetailModal.tsx` de l'appli Bolt (ligne 450), toujours en production. Matthieu a reporté le correctif et vérifié le comportement sur le Site TEST. Les deux applications sont désormais alignées ; le point est clos. Marche à suivre conservée dans `docs/correctif-bolt-roulement.md` à titre de trace.
    - **Leçon pour MOD-2** : cet incident valide la priorité du **journal d'activité** et de la **suppression douce** (`deleted_at`). Le diagnostic n'a été possible qu'en recoupant `updated_at` à la seconde près avec les demandes et les règles de roulement — un journal aurait donné la réponse en une requête. Toujours reporté à MOD-2 / étape 7 (interdit de créer une table dans la base Planning tant qu'on en est client).

- ✓ **Étape 6 / MOD-1 — FAITE (01-03/08/2026)** — 6A à 6H livrées et validées en réel par Matthieu. Seule **6C-4** reste ouverte (suppression des anciennes tables `rotation_settings` / `rotation_assignment_rules`), volontairement reportée après la bascule : le script de resynchronisation 7F les recopie encore. Le détail vit dans la section « MOD-1 » plus bas — sous-étapes numérotées 1 à 21.
  - **Ce que MOD-1 a livré** : le roulement est verrouillé en écriture (trois portes d'entrée en `security definer` : import, activation, suppression de brouillon), les plans sont versionnés dans le temps sans décalage rétroactif, le fichier de roulement se convertit en JSON canonique côté Python, l'import se fait par un écran avec correspondances mémorisées et rapport d'anomalies, l'activation passe par un différentiel obligatoire, et l'ouverture des semaines se pilote depuis le plan et une semaine type — jours fériés compris.
  - **Le V2 est en base et en vigueur au 04/01/2027** : V1 fermé au 03/01/2027 (266 règles), V2 actif à partir du 04/01 (264 règles). Différentiel mesuré entre les deux : **93 changements**.
  - **Ce que les allers-retours avec Matthieu ont corrigé**, et qu'aucune relecture de code n'aurait trouvé : le trou fonctionnel des **jours fériés** (18 gardes de week-end en semaine, toutes sur un férié), la **contamination par le V1** dans les requêtes « cette case est-elle au roulement ? » (deux plans actifs coexistent depuis 6F), et surtout le **modèle d'ouverture** lui-même — l'offre ouvre chaque semaine, le roulement s'y pose quand ses règles tombent. Trois réglages successifs avant de retrouver le fonctionnement historique du cabinet.

- ✓ **Étape 6 / MOD-2 — FAITE (03-26/08/2026).** Arbitrée le 03/08 ; MOD2-A à MOD2-C livrées le 06/08, MOD2-D et MOD2-E le 24/08, MOD2-F les 24-26/08 — **toutes validées en usage réel par Matthieu** au fil des sous-étapes. **MOD2-G est abandonné** (décision du 24/08, après avoir eu le bandeau en main : il porte déjà un « Annuler » visible, un raccourci clavier n'ajouterait qu'un second chemin vers le même geste, sur des écrans où l'on saisit aussi du texte). Les **six** suites de test totalisent **110 contrôles**.
  - **Les six problèmes de MOD-2 sont clos**, chacun par une pièce distincte : le niveau unique d'annulation (le journal conserve tout), l'absence de péremption (le bandeau disparaît), l'absence de vérification (`restaurer_action` refuse au lieu d'écraser), la couverture réelle de 2 actions sur 6 (le déclencheur n'oublie rien), l'UX datée (plus un seul `alert()` ni `confirm()`), et l'ambiguïté du mot « Annuler » (MOD2-F-1).
  - ✓ **RÉSOLU (26/08/2026) — les 155 gardes passées restées ouvertes, et 38 demandes orphelines.** Script `docs/sql/23-5-agenda-cloture-gardes-non-pourvues.sql`, exécuté et **ré-exécutable** (chaque mois en ajoute une vingtaine).
    - **Ce que sont ces gardes** : depuis MOD-1, l'offre ouvre chaque semaine et le roulement s'y pose quand ses règles tombent. Une garde restée `free` est donc **un créneau ouvert que personne n'a fini par couvrir** — l'application d'origine n'avait aucun état pour ça. Ce ne sont pas des déchets : **c'est le taux de couverture du cabinet**, entre 6 et 11 % des créneaux selon le mois, **19 % en août** (congés), **0 % en juin 2026** — mois intégralement couvert, vérifié et non un trou de données. Le vendredi (43) et le mercredi (37) concentrent les manques ; aucun dimanche.
    - **Décision de Matthieu : suppression douce plutôt qu'un statut « non pourvue ».** La machinerie existe depuis MOD2-B : le `deleted_at` les fait disparaître de **toutes** les requêtes du module par la policy de lecture, sans toucher une seule requête applicative — et elles restent en base, donc **interrogeables pour un bilan de couverture**. Un statut neuf aurait touché la contrainte de statut, `statusStyles.ts`, les badges, les filtres, les policies et `update_shift_status`, pour une information que la suppression douce conserve déjà. Contrepartie assumée : le journal dit « a supprimé » là où le sens exact est « non pourvue ».
    - **38 demandes orphelines closes au passage.** 37 gardes passées portaient une demande **approuvée** alors qu'elles étaient libres et sans médecin : approuver puis libérer la garde ne referme pas la demande. **Ce n'est pas un reliquat de l'incident du 29/07** — vérifié : elles s'étalent sur une trentaine de dates entre décembre 2025 et avril 2026, pas sur les quatre dates de l'incident, et **plus aucun cas depuis avril 2026**. Même arbitrage que le 29/07 pour les 15 fantômes : la garde n'a pas eu lieu pour ce médecin, la demande n'a plus d'objet. Sans cette clôture, un futur bilan par médecin les compterait comme des gardes obtenues. Plus une 38ᵉ demande encore `pending`.
    - **L'ordre des blocs n'est pas indifférent**, et c'est ce que le journal a confirmé en réel : `update_shift_status` ne réagit qu'aux demandes dont l'état d'**avant** est `pending` ou `on_hold`. Les 37 approuvées n'activent donc aucune branche ; la 38ᵉ, si — la trace montre bien `requests UPDATE 37`, puis **`shifts UPDATE 1`** (le déclencheur), puis `requests UPDATE 1`, puis `shifts UPDATE 155`. On laisse le déclencheur s'exercer **avant** de poser le `deleted_at`, plutôt que de le laisser réveiller une garde qu'on vient de clore.
    - ⚠ **Deux contrôles ont dû être bornés**, faute de quoi ils crient au loup : il existe **31 gardes `assigned` supprimées** et **50 gardes `free` supprimées**, toutes datées du **06/08/2026 à 13:23** et portant sur des dates de **janvier 2027** — reliquat de l'annulation de duplication, déjà documenté sous « le second index unique oublié par MOD2-B ». Elles n'ont rien à voir avec ce script. Le contrôle « aucune garde attribuée touchée » se borne donc à la fenêtre d'exécution, et le bilan de couverture à `date < current_date`. **Sans ce bornage, le bilan compterait comme « non pourvues » 50 gardes qui n'ont jamais eu lieu.**
    - **Reste ouvert, mineur** : la clôture est **manuelle et à rejouer**. L'automatiser (tâche planifiée) n'a pas été tranché — à voir à l'étape 8, quand le rythme réel sera connu.
    - ⚠ **Corrigé le 26/08, après la resynchronisation différentielle** : le script se lance **après** la resynchronisation, jamais avant (règle inscrite en tête du fichier), et son bloc de clôture des demandes orphelines n'exige plus que la garde soit encore ouverte — sans quoi il ne pouvait nettoyer qu'une seule fois. Le décompte des non pourvues est passé de 155 à **156** après resynchronisation (août : 30 → 31).
  - ✓ **REMIS (26/08/2026) — le créneau « J6 Beaune »**, supprimé le 24/08 en validant l'écran refait par MOD2-F-2 (suppression volontaire, sur la copie de travail). Script `docs/sql/23-2-agenda-restaure-j6-beaune.sql` exécuté : `08:00-14:00`, actif, rang 19, Salle 6 — Beaune repasse à 9 créneaux. La ligne a été reconstruite depuis `22-6A-2` (ligne 52), le script qui l'avait créée onze mois plus tôt ; seul le `default_room_id` est **déduit** et non retrouvé (Salle 6 était la seule salle de Beaune que plus aucun créneau ne prenait par défaut). La suppression n'avait emporté ni garde ni règle de roulement — les deux verrous l'interdisaient (0 garde, 0 règle mesurées avant).
    - **C'est cet incident qui a produit MOD2-F-4**, et la remise en place en a été la démonstration en réel : les deux écritures du script ont été journalisées, alors que la suppression d'origine n'avait laissé aucune trace deux jours plus tôt. L'`actor_id` est `NULL`, ce qui est correct et signifiant — le script passe par l'API d'administration, pas par une session utilisateur, exactement le cas prévu par MOD2-A pour la resynchronisation 7F.
  - ✓ **RÉSOLU (26/08/2026) — `is_agenda_coordinator` excluait d'être médecin.** Relevé par Matthieu le jour même en cherchant à tester les demandes : il ne se voyait pas dans la liste des médecins à qui attribuer une garde. Scripts `23-3-agenda-designation-medecins.sql` (exécuté) et `23-4-test-designation-medecins.py` (**15 contrôles**). Les sept suites totalisent **125 contrôles**.
    - **La cause** : la vue `agenda.profiles` calcule `role` avec `case when is_agenda_coordinator then 'coordinator' else 'doctor' end` — un rôle **unique**, donc exclusif. Trois écrans s'en servaient pour lister « les médecins » (`AssignDoctorModal` et le filtre par médecin de `RequestsCalendarView` / `EnhancedCalendarView`). Être coordinateur excluait donc mécaniquement d'être médecin, alors que Matthieu est l'un des 9 associés du roulement (`MC`) : **156 gardes attribuées et 55 règles de roulement** à son nom, sans pouvoir s'en voir attribuer une à la main.
    - **Un second défaut, symétrique, trouvé en corrigeant** : la même liste laissait passer **« Poste Bureau »**, compte de bureau partagé qui n'a jamais tenu de garde. Le décompte reste à 36 après correction, mais ce n'est pas la même liste — Matthieu entre, le poste de bureau sort. Charlotte reste dehors, et c'est juste : elle coordonne sans exercer (0 garde, 0 règle — mesuré, pas supposé).
    - **C'était la moitié manquante du découplage entamé en 7A.** `is_agenda_coordinator` avait bien détaché « coordinateur d'agenda » du rôle applicatif ; le sens inverse était resté couplé. Le rôle Orga ne pouvait pas servir de rattrapage : Matthieu et Charlotte sont tous deux `super_admin` et un seul exerce. D'où une **colonne explicite** `is_agenda_doctor`, sur le modèle de `is_agenda_coordinator`, plutôt qu'une déduction.
    - **La désignation porte sur des faits, pas sur des noms** : le rôle Orga pour les associés, associés gérants et remplaçants ; et pour départager les deux `super_admin`, le critère est *tenir des gardes ou des règles de roulement*. Un nom écrit en dur dans un script aurait mal vieilli.
    - **`role` n'a pas été touché** : il porte les **permissions**, et toutes les policies RLS ainsi que `est_coordinateur()` s'appuient dessus. La vue **ajoute** une colonne. `create or replace` conserve les droits (leçon de MOD2-D) et `security_invoker = true` est reposé explicitement — l'oublier aurait transformé la vue en fuite.
    - **Le contrôle qui compte** dans la suite de test : *« personne qui tient des gardes n'est hors liste »* — c'est lui qui aurait attrapé le défaut d'origine, et qui l'attrapera si un compte est ajouté sans être désigné. Vérifié aussi qu'aucun droit n'est accordé au passage : la colonne dit qui peut **tenir** une garde, elle n'ouvre aucune porte.
  - ✓ **MOD2-F — FAITE (24-26/08/2026)** — **Le vocabulaire est levé et il ne reste plus un seul `alert()` ni `confirm()`.** Quatre sous-étapes, la dernière n'était pas au découpage initial.
    - **F-1 — vocabulaire.** « Annuler » est désormais réservé à *défaire une action*, le geste du bandeau. « Annuler l'assignation » devient **« Libérer la garde »** (`ShiftDetailModal` + `CancelAssignmentModal`, titre, corps et trois boutons), et dans le journal une demande `cancelled` se lit **« a retiré »** et non « a annulé » — le même mot que le bouton côté médecin. Le côté médecin disait déjà « Retirer » partout : la moitié du travail annoncé était déjà faite. **Décision de Matthieu** : les ~21 « Annuler » de **pied de modale restent** — c'est la convention universelle du dialogue, et le contexte (bouton présent seulement pendant la saisie) lève l'ambiguïté seul. Le renommer en « Fermer » aurait laissé croire que la saisie était conservée.
    - **F-2 — les trois écrans de paramètres.** Nouveau composant `components/ui/ConfirmSheet.tsx`, posé sur `BottomSheet` — donc **responsive**, feuille sur mobile et dialogue centré sur ordinateur. *Pourquoi ne pas réutiliser le `ConfirmModal` de l'appli principale* : il est en feuille du bas **pure**, sans variante ordinateur, alors que ces écrans sont ceux de Charlotte, qui travaille sur ordinateur — c'est la raison même qui avait fait rendre `BottomSheet` responsive à l'étape 4.
      - ⚠ **Le piège, trouvé par Matthieu en testant et non en relisant : une policy RLS qui refuse ne lève AUCUNE erreur — elle supprime zéro ligne, en silence.** Les trois tables portent une policy « supprime un *X* sans garde ». Le code lisait `if (error) throw` : pas d'erreur, donc succès annoncé. **Le nouvel écran annonçait donc une suppression qui n'avait pas eu lieu.** Le `confirm()` d'origine avait le même angle mort ; comme il n'annonçait rien en cas de succès, l'échec passait simplement pour de l'inaction — F-2 l'a rendu visible en le transformant en mensonge. C'est la même famille que le piège de MOD2-B : le mécanisme de sécurité ne dit pas non, il fait semblant de n'avoir rien à faire.
      - **Deux parades, pas une** : un **contrôle préalable** par écran, avec les vrais verrous **lus dans les clés étrangères** et non devinés (sites = gardes + salles en `RESTRICT` ; horaires = gardes + règles de roulement en `RESTRICT` ; salles = gardes), et un **`.select('id')` sur le `DELETE`** — zéro ligne rendue = refus, et on le dit. Le premier évite de poser une question sans objet, le second couvre ce que le premier ne voit pas (garde créée entre-temps, compte non coordinateur).
      - **Deux textes de modale mentaient**, hérités des `confirm()` d'origine : ils promettaient une suppression en cascade (« supprimera aussi ses 6 salles ») là où la clé étrangère est en `RESTRICT`. Un troisième message parlait de « gardes assignées » alors que ni la requête ni la policy ne filtrent le statut.
    - **F-3 — la fiche garde et les vues restantes.** Les 2 `confirm()` de `useShiftDetail` deviennent deux drapeaux, `ShiftDetailModal` affichant les feuilles — un hook ne rend rien, et c'est le pattern déjà en place pour `showCancelAssignmentModal`. Les textes disent ce que la boîte système ne pouvait pas dire : la date et le créneau supprimés, le médecin retiré, et le fait que **la garde reste récupérable depuis le Journal** (vrai depuis MOD2-B, que rien n'indiquait). Les 3 `alert()` de `DoctorWeekSummaryView` passent au bandeau avec **`signaler` et non `signalerAction`** : c'est une vue médecin, `derniere_action()` est en `security invoker` et le journal est réservé au coordinateur — le bouton « Annuler » ne s'afficherait jamais.
    - ✓ **F-4 — le journal couvre les paramètres.** Script `22-MOD2F-1-agenda-journal-parametres.sql` + `activityLabels.ts`. Testé : **29 contrôles** (`22-MOD2F-2`). **Sous-étape née de l'incident J6 Beaune**, ci-dessus.
      - **MOD2-A avait écarté ces tables en le motivant** : « Elles bougent une fois par an et leurs modifications ne se confondent jamais avec une action de planning. À ajouter si le besoin apparaît — c'est une ligne par déclencheur. » Le raisonnement n'était pas faux, il était **incomplet** : c'est précisément parce que ces tables bougent rarement qu'une modification y est impossible à reconstituer. Une garde supprimée se retrouve dans le journal ; un créneau supprimé ne se retrouvait nulle part.
      - **9 déclencheurs de plus, on passe de 12 à 21.** `journaliser()` est **inchangée** : sa seule exigence est une colonne `id` en `uuid`, vérifiée sur les trois tables avant d'écrire le script. `journal_extrait()` apprend trois branches, sans quoi l'écran afficherait « a modifié 1 ligne » — une trace muette. Ici `create or replace` suffit, la signature ne changeant pas : c'est ce qui distingue ce script du piège de MOD2-D, où l'ajout de colonnes au type de retour avait imposé un `drop` et emporté les droits.
      - **Volontairement non restaurables d'un clic**, et vérifié plutôt que supposé : `restaurer_action` lève une exception hors gardes et demandes, `actions_restaurables` renvoie `false` avec un motif — **le bouton « Restaurer » ne s'affiche donc pas, sans qu'on ait touché à l'écran**. Ces tables n'ont pas de `deleted_at` ; restaurer un site supposerait de décider du sort de ses salles et de ses gardes, ce qui ne se tranche pas depuis un bouton. L'entrée le dit en clair : « Suppression définitive — non restaurable depuis le Journal ». **F-4 apporte la trace, pas la restauration.**
      - **Pas de nature « paramètres » dans le filtre** : une suppression de créneau est une suppression et a sa place sous ce filtre-là. Grouper par acte est plus utile que grouper par table.
  - ✓ **MOD2-E — FAITE (24/08/2026)** — **Le bandeau éphémère remplace le bouton, et `undo_buffer` n'existe plus.** Scripts `22-MOD2E-1` (`derniere_action`) et `22-MOD2E-2` (suppression de la table) + `components/ui/ActionToast.tsx`. Testé : **10 contrôles** (`22-MOD2E-3`) ; les cinq suites MOD-2 totalisent **81 contrôles**.
    - **Les cinq défauts de l'ancien dispositif sont clos**, et chacun par une pièce différente : le niveau unique (le journal conserve tout), l'absence de péremption (le bandeau disparaît, et l'écran vérifie la cohérence), l'absence de vérification (`restaurer_action`), la couverture réelle de 2 actions sur 6 annoncées (le déclencheur n'oublie rien), et l'UX datée (`alert()` bloquant, sondage toutes les 2 secondes — **le sondage réseau est supprimé**, l'état vit côté client et n'interroge la base qu'au clic).
    - **`agenda.derniere_action()` retrouve l'action qu'on vient de faire**, plutôt que de faire remonter le `txid` par chaque chemin d'écriture — ce qui aurait imposé de changer la signature de toutes les fonctions existantes et n'est de toute façon pas possible avec les `.insert()` de supabase-js. *Risque assumé et borné* : quelques millisecondes séparent l'action de l'appel, la fenêtre est plafonnée à 2 minutes et l'entrée doit être de l'utilisateur courant. Et si le mauvais `txid` était retenu, **`restaurer_action` ne pourrait pas faire de dégât silencieux** — elle compare et refuse.
    - **« Annuler » passe par la même porte que le journal** : pas de chemin d'annulation privilégié, donc le garde-fou de cohérence s'applique aussi au bandeau. En cas de refus, le bandeau affiche l'écart au lieu de disparaître.
    - **Deux `alert()` bloquants tombent au passage** (enregistrement d'un modèle, duplication) ainsi que celui de « libérer les gardes du roulement » — le rappel « le roulement n'est pas modifié » y survit, sans barrer l'écran. Le reste des `alert()`/`confirm()` est l'objet de MOD2-F.
    - **Communication bandeau → vues par événement** (`agenda:rafraichir`) plutôt que par un rappel à faire descendre dans tout le module : le bandeau vit au-dessus des vues. Le temps réel ferait double emploi mais n'est pas activé en bêta — on ne dépend donc pas de lui.
    - **Supprimés** : `UndoButton.tsx`, `undoUtils.ts`, et la table `agenda.undo_buffer` (vide au moment de la bascule, vérifié).
  - ✓ **MOD2-D — FAITE (24/08/2026)** — **La restauration existe, et elle refuse.** Scripts `22-MOD2D-1` (la porte), `22-MOD2D-3` (le journal expose les annulations) + bouton « Restaurer » et modale de confirmation dans `ActivityLogView`. Testé : **22 contrôles au vert** (`22-MOD2D-2-test-restauration.py`) ; les quatre suites MOD-2 totalisent **71 contrôles**.
    - **`agenda.restaurer_action(txid, verifier_seulement)` est la sixième porte** du module, après les trois du roulement et les deux de la suppression douce. **Ce qui la distingue : elle refuse plutôt qu'elle n'écrase.** Le défaut n°3 de MOD-2 — « aucune vérification de cohérence avant d'annuler » — est le cœur de la fonction, pas un ajout. Avant toute écriture, chaque ligne est comparée à l'état que l'action avait laissé ; **un seul écart et rien n'est écrit**, avec le détail (champ, attendu, actuel).
    - **On restaure une TRANSACTION, pas une ligne de journal.** Valider une demande écrit dans `requests` puis, via `update_shift_status`, dans `shifts` : défaire l'une sans l'autre laisserait le planning incohérent. C'est l'usage du `txid` ajouté en MOD2-A. Les demandes sont traitées **avant** les gardes, pour que l'état posé fasse foi malgré la cascade.
    - **Le mode inoffensif est le défaut** (`p_verifier_seulement = true`) : un appel maladroit ne peut rien casser. L'écran appelle d'abord en vérification, affiche le rapport, et n'écrit que sur confirmation — puis **re-vérifie au moment d'écrire**, l'état ayant pu changer entre l'ouverture de la modale et le clic.
    - **Refusé aussi** : une action déjà annulée (`undone_at`), une suppression réelle (la ligne n'existe plus), une action au-delà du seuil de détail, et tout ce qui n'est ni garde ni demande — les plans de roulement ont leur propre machinerie depuis MOD-1, on ne la double pas.
    - ⚠ **Piège rencontré** : `create or replace function` **refuse de changer le type de retour**. Ajouter deux colonnes à `journal_activite` a donc imposé un `drop` puis un `create` — **ce qui emporte les droits**. Sans le `grant` reposé en fin de script, la fonction serait devenue inappelable depuis l'application, sans autre symptôme qu'un 404 côté PostgREST. Contrôlé explicitement après exécution.
  - ✓ **MOD2-C — FAITE (06/08/2026)** — **L'écran « Journal » existe**, onglet coordination, en lecture seule. Script `docs/sql/22-MOD2C-1-agenda-lecture-journal.sql` + `components/ActivityLogView.tsx` + `lib/activityLabels.ts`. Testé : **14 contrôles au vert** (`22-MOD2C-2-test-lecture-journal.py`).
    - **Deux fonctions de lecture, en `security invoker`** — c'est **l'inverse des portes d'écriture**. Celles-ci doivent contourner la RLS pour agir ; une fonction de **lecture** doit s'y soumettre, sinon elle devient une fuite. Une lecture en `security definer` serait exactement le défaut trouvé en 6G. Vérifié en réel : un médecin qui appelle `journal_activite` reçoit une **liste vide**, pas une erreur et surtout pas les données.
    - **Projection compacte** : une entrée de 61 gardes pèse plusieurs dizaines de kilo-octets en lignes complètes, l'écran n'a besoin que de six champs. `journal_extrait()` réduit les payloads à un objet **indexé par identifiant** — l'appariement avant/après se fait donc par identifiant, jamais par position.
    - ⚠ **Défaut latent de MOD2-A corrigé au passage** : `journaliser()` agrégeait `rows_before` et `rows_after` par deux requêtes distinctes, **sans ordre garanti** — rien n'assurait que la 3ᵉ ligne de l'une corresponde à la 3ᵉ de l'autre. Sans effet visible aujourd'hui, mais MOD2-D restaurera en comparant l'état attendu à l'état courant : un appariement par position y aurait été faux, et faux **silencieusement**. Les deux agrégats sont désormais ordonnés par identifiant.
    - **La mise en mots vit dans `lib/activityLabels.ts`, pas en base.** Le journal stocke des faits ; une phrase figée en base ne se corrigerait qu'avec une migration et dupliquerait la logique métier en SQL.
    - **Regroupement par transaction, sans deviner** : les entrées d'un même `txid` sont présentées ensemble et **toutes affichées**. Aucune heuristique pour désigner « l'action principale » — l'ordre des écritures d'une transaction ne reflète pas l'intention (constaté : pour une demande de garde la cascade précède l'action d'origine, pour une suppression c'est l'inverse).
    - **L'écran nomme le défaut trouvé le matin même** : quand une écriture n'a changé aucune valeur, il l'écrit — « a réécrit 45 gardes sans rien y changer ». C'était le but du journal.
  - ✓ **MOD2-B — FAITE (06/08/2026)** — **Supprimer n'efface plus.** Script `docs/sql/22-MOD2B-1-agenda-suppression-douce.sql` : colonne `deleted_at` sur `shifts` et `fixed_duty_series`, contrainte `unique_shift` convertie en **index unique partiel** (`where deleted_at is null`), policies RLS refondues, **suppression réelle fermée à tout le monde** (policies `DELETE` supprimées + `revoke delete`), et quatre points de suppression du code convertis. Testé : **18 contrôles au vert** (`22-MOD2B-2-test-suppression-douce.py`).
    - ⚠ **Le piège qui a fait changer la conception, trouvé en testant et non en relisant** : **PostgreSQL applique la policy de LECTURE à la ligne d'APRÈS lors d'un `UPDATE`** — une ligne ne peut pas sortir de sa propre visibilité (protection délibérée du moteur : sans elle, on pourrait faire disparaître une ligne de la vue d'autrui à volonté). Or la policy de lecture masque justement les gardes supprimées : **elle interdisait donc de les supprimer**. Le message d'erreur (`new row violates row-level security policy`) désigne le `WITH CHECK`, ce qui envoie sur une fausse piste — le `WITH CHECK` était correct. Isolé en neutralisant la policy de lecture : la suppression passait aussitôt.
    - **Conséquence — deux nouvelles portes** : `agenda.supprimer_gardes(uuid[])` et `agenda.supprimer_serie(uuid)` en `security definer`, qui contournent la RLS par construction. Ce sont la **quatrième et la cinquième** portes du module, après les trois du roulement. L'alternative — montrer les gardes supprimées au coordinateur et filtrer dans les ~40 requêtes — annulait tout l'intérêt du filtrage par policy.
    - **Iso-comportement assumé** : ces deux fonctions vérifient le rôle coordinateur et **rien d'autre**, exactement comme la policy `DELETE` qu'elles remplacent. Le garde-fou « on ne supprime pas une garde attribuée ou demandée » reste dans l'interface. Le descendre en base est souhaitable mais suppose une décision fonctionnelle (que faire des gardes attribuées qui sortent d'une série raccourcie ?) — à reprendre à part.
    - **La contrainte `unique_shift` était le point bloquant** : sans sa conversion en index partiel, une garde supprimée aurait continué d'occuper son créneau et le coordinateur n'aurait plus pu en recréer une au même endroit. Vérifié avant d'écrire le script qu'aucun `upsert` ni aucune fonction SQL ne s'y appuie (le seul `onConflict` du module porte sur `undo_buffer.user_id`) — un `ON CONFLICT` inféré par PostgREST aurait cassé, un index partiel n'étant pas inférable.
    - ⚠ **Les fonctions `security definer` ne sont pas protégées par la RLS** : le filtre posé dans les policies leur est invisible. Inventaire fait en interrogeant `pg_proc`, pas en relisant les scripts — `creneaux_ferie_habituels`, `creneaux_hors_plan` et `enregistrer_modification_souhaitee` ont reçu un `deleted_at is null` explicite. `ouvrir_semaines` est en `security invoker` : la RLS la couvre, y compris son contrôle « la période contient déjà des gardes ». `update_shift_status` est **laissée telle quelle** (cœur métier migré à iso-comportement) ; le seul chemin par lequel elle pouvait réveiller une garde supprimée — une demande créée sur cette garde — est fermé par une policy, à la porte d'entrée.
    - **Méthode** : les trois fonctions patchées l'ont été par **substitution ciblée sur les définitions vivantes** (`pg_get_functiondef`), pas réécrites de mémoire — une première tentative de réécriture avait inventé un `exists` là où l'originale fait une anti-jointure, ce qui aurait changé le sens de `creneaux_hors_plan` sans que rien ne le signale.
  - ✓ **MOD2-A — FAITE (06/08/2026)** — **Le journal d'activité existe et enregistre.** Script `docs/sql/22-MOD2A-1-agenda-journal-activite.sql` exécuté : table `agenda.activity_log`, fonction `agenda.journaliser()`, **12 déclencheurs par instruction** (4 tables × 3 opérations : `shifts`, `requests`, `fixed_duty_series`, `rotation_plans`). Purement additif — aucune table existante modifiée, `undo_buffer` intacte jusqu'à MOD2-E.
    - **Testé par le chemin du navigateur** (jeton JWT signé, PostgREST avec `Content-Profile: agenda`), **17 contrôles au vert** : un médecin ne voit rien du journal, le coordinateur y accède, personne ne peut y insérer / modifier / supprimer (aucun `grant`, aucune policy d'écriture), une création de garde produit **une** entrée avec le bon auteur, un `UPDATE` ne touchant aucune ligne n'en produit **aucune**, et une suppression conserve l'état d'avant.
    - **Le regroupement par `txid` est vérifié en réel** : une demande de garde produit bien deux entrées (`shifts` UPDATE via `update_shift_status`, puis `requests` INSERT) **partageant le même identifiant de transaction**. C'est ce qui permettra à MOD2-C de les présenter comme un seul geste. À noter pour l'écran : l'ordre des entrées d'une même transaction n'est **pas** celui de l'intention — l'écriture en cascade apparaît avant l'écriture d'origine.
    - ⚠ **Découverte au passage, à traiter avant l'étape 8** : **aucun compte ne peut aujourd'hui tester le rôle « médecin »**. Les 2 seuls comptes ayant `agenda_beta_access` (Matthieu et Charlotte) sont **tous deux** `is_agenda_coordinator` depuis 6A. Le premier jet du test passait donc **à vide** : le médecin choisi était bloqué en amont par `peut_acceder()`, pas par la policy du journal — exactement le genre de test qui rassure à tort. Contourné en ouvrant l'accès bêta à un associé pendant l'exécution, avec restauration garantie (vérifiée : 2 comptes bêta, 2 coordinateurs après coup). **Il faudrait un troisième compte bêta non coordinateur** pour que les vues médecin soient testables sans manipulation.
      - ✓ **RÉSOLU (27/08/2026)** — script `docs/sql/23-7-agenda-troisieme-compte-beta.sql`, exécuté : **Airelle Sauvage** passe en bêta, non coordinatrice. Le harnais `22-MOD2-outil-test.py` la reconnaît et **n'écrit plus dans `public.profiles`** — l'emprunt est conservé en secours si ce compte perdait son accès, pour que les tests continuent de tourner sans intervention. Compte choisi parce que c'était déjà celui que le harnais empruntait (premier associé actif non coordinateur par ordre alphabétique) : la sortie des tests reste donc comparable aux campagnes précédentes.
      - ⚠ **Ce n'est pas un testeur humain, et cocher la colonne n'expose rien.** Point clarifié avec Matthieu le 27/08 : **le module n'existe que sur la branche `feature/module-agenda`**, absente de `main` (82 commits d'avance). L'application déployée n'a **aucune** entrée agenda — la tuile « Planning » ne peut donc pas s'afficher chez un associé, quel que soit son drapeau. Le harnais, lui, ne passe jamais par un navigateur : il signe un jeton JWT et appelle PostgREST. **Un vrai testeur humain avant la bascule supposerait de déployer la branche** (prévisualisation Vercel, URL propre à la branche) — décision distincte, non prise.
  - Matthieu retient la **piste C (hybride)** : bandeau éphémère pour le geste immédiat, journal d'activité pour la traçabilité et la restauration encadrée, journalisation exhaustive, **suppression douce** (`deleted_at`) sur les gardes. L'audit du code préalable à l'arbitrage a corrigé la doc sur un point important : le bouton « Annuler » couvre en réalité **2 actions et non 6** — les 4 autres types sont du code mort, déjà dans l'appli Bolt. Découpage **MOD2-A → MOD2-G** dans la section MOD-2 plus bas ; le journal se construit avant le bandeau, qui s'y adosse.

- ⏳ **Étape 8 — BASCULE FAITE LE 17/09/2026 (ouverture à 14h00)** — préparation commencée le 26/08/2026. Bolt archivé et mis en pause à 14h19. Reste : l'annonce au cabinet, puis les chantiers « après J ».
  - ⏳ **8M — Le fuseau horaire : le planning se décalait d'un jour hors de métropole — 8M-1 à 8M-5 FAITES (21/09/2026), 8M-6 à 8M-8 à faire.** Signalé par Matthieu le 21/09 : Thibault Guérin, associé actuellement à Tahiti, voyait sur son téléphone « les horaires d'un samedi (8h-20h) proposés un vendredi ».
    - **Mesuré avant de corriger.** Vérité en base pour la semaine du 14 au 20/12/2026 : **vendredi 18 → 4 gardes libres**, **samedi 19 → 1 garde libre** (08:00-20:00, Beaune Salle 2). Le code de l'onglet « Ouvertures », rejoué tel quel, donnait `Europe/Paris` → ven. 18 = 4, sam. 19 = 1 (juste) et `Pacific/Tahiti` → **jeu. 17 = 4, ven. 18 = 1** — exactement la capture d'écran reçue. Le portable de Thibault, resté à l'heure de Paris, affichait le bon planning ; son téléphone, passé à l'heure locale par le réseau, le mauvais.
    - **La cause, en une ligne** : `DoctorWeekSummaryView.tsx` construisait la clé de rapprochement jour ↔ garde avec `toISOString()` (donc en **UTC**) alors que le titre de la carte juste au-dessus était lu avec `getDay()`/`getDate()`/`getMonth()` (donc en **heure locale**). Les deux lectures coïncident à l'est de Greenwich et se séparent d'un jour à l'ouest. `rotationUtils.ts` portait pourtant déjà le commentaire « toISOString() est a proscrire ici » : la règle existait, elle n'était pas appliquée partout.
    - **Inventaire complet** : **48 occurrences dans 16 fichiers**, toutes dans le module Agenda — héritage du code Bolt. Le reste de l'application (événements, annuaire, SIM, immobilier) est propre, vérifié. Six familles : **A.** clé du jour en UTC, libellé en local (2) — **B.** libellé fabriqué par `new Date('AAAA-MM-JJ')` (8) — **C.** « aujourd'hui » calculé en UTC (11) — ⚠ **impact revu à la baisse, voir 8M-5** — **D.** semaine de roulement calculée sur `new Date(shift.date)` (16) — **E.** génération de séries de dates (4), la seule famille qui **écrit en base** — **F.** plages de requête et navigation (6).
    - ⚠ **Un second bug, celui-là en France et tous les jours** (famille F, `RequestsCalendarView.tsx`) : la plage de la vue « Mois » de l'onglet Validation demande `2026-11-30 → 2026-12-30` pour décembre. **Le dernier jour de chaque mois n'est jamais chargé.** Mesuré en base : **91 gardes invisibles sur 13 mois**. Sans aucun rapport avec Tahiti — Charlotte le subit depuis la bascule.
    - **Décision de Matthieu (21/09)** : une date de garde est un **jour**, jamais un instant, et ne se convertit donc jamais ; la seule notion qui ait besoin d'un fuseau est « aujourd'hui », et c'est celui du **cabinet** (`Europe/Paris`). Une garde du dimanche matin à Dijon est celle du dimanche, qu'on la regarde depuis Dijon ou depuis Papeete.
    - ✓ **8M-1 — une seule source pour les dates.** Nouveau fichier `src/modules/agenda/lib/dates.ts` : `jourLocal()` (Date → `'AAAA-MM-JJ'`, sans conversion), `depuisJour()` (`'AAAA-MM-JJ'` → Date **à midi**, pour garder douze heures de marge de chaque côté), `aujourdhuiCabinet()` (le jour à Dijon, via `Intl` — l'heure d'été est gérée par le navigateur), `libelleJour()` et `libelleJourCourt()`. Le module comptait jusque-là **quatre idiomes concurrents**, dont trois corrects (`+ 'T12:00:00'` dans `printPlanning`, `+ 'T00:00:00'` dans `exportUtils`, `new Date(y, m - 1, d)` dans les écrans de roulement) et un faux. Aucun appelant modifié à cette sous-étape.
    - ✓ **8M-2 — le bug signalé.** Famille A : `DoctorWeekSummaryView.tsx` et `lib/weekTemplateUtils.ts` (cette seconde enregistrait la semaine type décalée d'un jour, même cause). L'écran « Ouvertures » rejoué avec le code corrigé donne **ven. 18 = 4 gardes, sam. 19 = 1 garde** à l'identique dans `Europe/Paris`, `Pacific/Tahiti`, `Pacific/Kiritimati` (UTC+14) et `America/Cayenne`.
    - ✓ **8M-3 — les libellés de date.** Famille B, 8 remplacements : `ShiftDetailModal`, `shiftDetail/ShiftInfoRows`, `MyScheduleView`, `CancelRequestModal`, `DailyScheduleView`, `AssignDoctorModal` (×2), `BulkAssignPrevalidatedModal`. **`DeleteWeekTemplateModal` a été écarté à l'examen** : il formate un `created_at`, c'est-à-dire un vrai instant, où `new Date()` est la bonne fonction. Même remarque pour les `requested_at` de `PendingRequestsList` et les `created_at` des écrans de paramètres — non touchés, à raison.
    - **Vérification** : `npm run build` passe (2016 modules). Le module étant exclu du lint (`eslint.config.js`), les imports ont été confrontés un à un aux symboles utilisés. Les contrôles de dates sont rejoués dans **5 fuseaux** (`Europe/Paris`, `Pacific/Tahiti`, `Pacific/Kiritimati`, `America/Cayenne`, `Indian/Reunion`), aller-retour sur les 365 jours de 2026 et sur les deux changements d'heure — **aucun écart**. ⚠ Ces contrôles vivent encore hors du dépôt : les installer pour de bon est l'objet de 8M-8.
    - ✓ **8M-4 — les plages de requête et la navigation.** Famille F, 5 fichiers. La vue « Mois » de Validation charge enfin le **dernier jour de chaque mois** (les 91 gardes) ; hors métropole, la plage de la semaine demandait le 15→21 quand la grille affichait le 14→20 ; cliquer un jour dans la vue Mois sautait au jour précédent, y compris à Paris. Toute la plomberie des trois vues calendrier passe désormais par `dates.ts` : une chaîne devient une Date **à midi** (`depuisJour`), une Date redevient une chaîne par le calendrier affiché (`jourLocal`). Les **trois copies** de `formatDateLocal` (`EnhancedCalendarView`, `WeekView`, `MonthView`) disparaissent au profit de `jourLocal` — même code, une seule définition. **Choix délibéré** : la plage du mois reste le 1er → dernier jour et **non** la grille de 42 jours, parce que c'est elle qui borne « Assigner les pré-validations de ce mois », qui **écrit**. Conséquence assumée, déjà vraie avant : les gardes des mois voisins visibles aux coins de la grille ne sont pas chargées.
    - ✓ **8M-5 — « aujourd'hui » désigne le jour du cabinet.** Les 11 sites passent par `aujourdhuiCabinet()`, plus le filtre des jours passés de `DoctorWeekSummaryView`.
      - ⚠ **Correction de ce que cette même fiche annonçait plus haut.** La première mesure comparait l'UTC à l'heure **du navigateur**, alors que la référence retenue est le jour **du cabinet**. Or `new Date().toISOString()` donne le **même résultat partout dans le monde** à un instant donné : ce n'était donc **pas** un défaut propre aux voyageurs. Mesuré sur 2026 : la date UTC ne s'écarte de celle de Dijon que **575 h par an (6,6 %)**, soit environ **1,6 h par nuit** — entre minuit et 1 h l'hiver, 2 h l'été. L'effet réel était une journée qui commence trop tôt en pleine nuit, pas un décalage permanent. Ce qui avait été écrit (« Planning du jour s'ouvre sur demain », « Mes gardes masque la garde du jour ») était **faux**.
      - En revanche le filtre de `DoctorWeekSummaryView` lisait le jour **du navigateur**, lui bien sensible au fuseau : à Tahiti il s'écarte de celui de Dijon **48 % du temps**, et l'écran offrait une journée déjà passée au cabinet.
      - Vérifié sur les 24 heures d'une journée dans 3 fuseaux : **0 heure fausse**.
    - **Reste à faire** : **8M-6** famille D, les 16 calculs de roulement — une garde du **lundi** est aujourd'hui rattachée à la semaine de roulement précédente hors métropole ; **8M-7** famille E, les séries, seule famille qui écrit en base, à répéter d'abord sur l'environnement de test (8L) ; **8M-8** une suite de test multi-fuseaux installée dans le dépôt.
    - **Aucune écriture en base sur 8M** : pas de script `docs/sql`, pas de sauvegarde préalable, pas de migration. Corrections de code seulement, réversibles par `git revert`.
  - ✓ **8L — L'environnement de test existe, et les 7 suites y tournent de nouveau — FAITE (18-21/09/2026).** Chantier C d'après J. Nouveaux scripts `docs/sql/23-18-construire-env-test.py` et `docs/sql/23-19-charger-donnees-env-test.py` (**exécutés**), harnais `22-MOD2-outil-test.py` modifié. **128/128** contrôles sur la base de test ; production inchangée.
    - **Pourquoi** : depuis 8F-5, les 6 suites qui écrivent sont bloquées — le schéma `agenda` est le planning réel. Sans base jumelle, le chantier D (exiger `actif` dans les policies, 99 règles dans `public`) ne pouvait pas se répéter avant d'être appliqué.
    - **Où** : le 3e projet Supabase (`yjttfdwjbyufpavwxcpy`), inutilisé depuis avril, **restauré le 18/09** en 3 min 30. Il était vide, même version de PostgreSQL (17.6), mêmes extensions. ⚠ **L'offre gratuite n'autorise que 2 projets actifs** : il occupe la place libérée par la mise en pause de Bolt. Restaurer Bolt un jour supposerait de remettre le test en pause.
    - **C-2, la structure** (`23-18`) : environ 700 instructions — 43 tables, 187 contraintes, 94 index, 58 fonctions, 52 déclencheurs (dont celui posé sur `auth.users`), la RLS sur les 43 tables, 150 policies, 110 droits. **Rien n'est réécrit de mémoire** : chaque définition est celle que Postgres restitue (`pg_get_constraintdef`, `pg_get_functiondef`, `pg_get_triggerdef`, `pg_get_viewdef`, `pg_indexes`, `pg_policies`), les colonnes étant rendues par `format_type`. **Deux sens uniques** : la production n'est lue qu'en transaction `read only`, et la fonction d'écriture du script n'accepte aucune autre cible que le projet de test. **Vérification** : les deux structures sont relues et comparées objet par objet — **aucun écart**.
      - ⚠ **Les fonctions ne passent pas du premier coup** : Postgres valide le corps d'une fonction SQL à sa création, et le catalogue les donne par ordre alphabétique, pas par ordre de dépendance. Le script repasse tant que ça progresse — **4 passages**.
      - ⚠ **Le garde-fou s'est déclenché contre son auteur**, et c'était juste : après un premier échec, le projet portait 43 tables sans la table témoin, et le script a refusé de l'effacer (« ce n'est peut-être pas le bon projet »). **Corrigé** : la table témoin est désormais posée **avant** la construction, si bien qu'un chantier interrompu reste reconnaissable. `--recommencer` vide aussi `auth.users`, sans quoi 23-19 ne peut pas repartir d'une base vide.
    - **C-3, les données** (`23-19`) : **6 988 lignes et 49 comptes**, chargés en 80 s **depuis un dossier de sauvegarde `23-16`** — la production n'est pas même lue. **C'est aussi une répétition de restauration** : un dossier de sauvegarde suffit donc à repeupler une base vide, ce qui n'était jusque-là qu'une hypothèse.
      - **Les coordonnées sont remplacées** (décision de Matthieu) : adresses email (`compte-00N@exemple.test`, la même pour un compte et sa fiche), téléphones, notes internes, adresses et codes d'accès des lieux, texte des messages. **Vérifié dans la base de test : 0 vraie adresse, 0 téléphone, 0 note, 0 code réel, 0 message réel.** Sont conservés les noms, les rôles et tout le planning.
      - ⚠ **Le déclencheur `on_auth_user_created` appartient à Supabase** : impossible de l'endormir (`must be owner of table users`). Chaque compte chargé crée donc une fiche au passage ; les vraies fiches les écrasent, et les **8 fiches en trop** (les comptes bloqués en 8K, qui n'ont pas de fiche en production) sont supprimées. **Nos** déclencheurs, eux, sont endormis pendant tout le chargement — sinon le journal se remplirait de fausses lignes et 23-14 recalculerait les drapeaux — puis remis en service, ce que le script vérifie (0 endormi).
      - ⚠ **`agenda.activity_log.id` est une colonne d'identité « générée toujours »** : sans `overriding system value`, Postgres renumérote, et les tests de restauration porteraient sur d'autres lignes. Les séquences sont recalées à la fin.
      - **Fidélité vérifiée des deux côtés** : 2 511 gardes vivantes, 2 498 attribuées, 12 demandes en attente, 91 lignes de journal jusqu'au n° 1121, 530 règles de roulement, 32 médecins, 33 drapeaux, 2 coordinateurs.
    - **C-4, le harnais** : `OMNES_CIBLE=test` bascule le harnais **et** l'outil `22-6` sur le projet de test et sur `.env.test` (non versionné : il porte une clé ; à refaire avec l'API Management si besoin). **Sans la variable, la production reste la cible** et le blocage de 8F-5 joue comme avant — vérifié : une suite qui écrit s'arrête toujours sur « ARRET ». Sur la base de test, le harnais **refuse d'écrire si la table témoin de 23-18 est absente** : la variable ne peut pas désigner un vrai projet par accident.
      - **Résultat** : les 7 suites rejouées sur la base de test, **128/128** (17 + 18 + 14 + 22 + 10 + 29 + 18). **Production inchangée** : journal à 155 lignes (n° 1185), dernière action à 8h49 avant les essais, 2 511 gardes, aucune garde aux dates de test. La base de test est revenue d'elle-même à son état d'avant — les suites nettoient derrière elles.
    - **Ce que ça débloque** : le chantier D peut désormais s'écrire, se répéter et se prouver sur la base de test avant de toucher la production. **À savoir** : la base de test date de la sauvegarde du 18/09 ; la recharger revient à relancer `23-18 --recommencer --go` puis `23-19 --go`.
  - ✓ **8K — Les 8 comptes de connexion sans fiche sont bloqués — FAITE (18/09/2026).** Chantier B d'après J. Nouveau script `docs/sql/23-17-bloquer-comptes-sans-fiche.py` (**exécuté**). Sauvegarde `23-16` prise juste avant (`orga-sauvegardes/2026-09-18-09h46`). Suite `23-4` : **18/18**.
    - **Le problème, mesuré le 17/09** : `auth.users` portait 48 comptes pour 40 fiches. Les 8 comptes sans fiche sont des essais de mai et juin — `dr.martin@fictif.local` et `dr.bernard@fictif.local` (connectés en juin), `mireille@hello.com` (connectée en juin), `airelle@hello.com`, `charlotte@hello.fr`, deux adresses de Matthieu, et `imen94@hotmail.it`. Tous avaient leur adresse confirmée : **ils pouvaient encore se connecter**.
    - **Ce qu'ils voyaient, et ce qu'ils ne voyaient pas** — établi en lisant les policies, faute d'avoir pu le prouver par le chemin du navigateur *(le contrôle de permissions de Claude Code refuse de forger un jeton au nom d'un autre compte ; non contourné)* : **deux tables sur toute l'appli** s'ouvrent à tout compte connecté sans vérifier la fiche (`using true`) — `public.profiles` (41 fiches, emails, 11 téléphones, jours de disponibilité, notes internes) et `public.annuaire` (143 fiches). Tout le reste exige une fiche ou un rôle : codes d'accès et lieux (`can_read_codes()`), événements, fichiers du cabinet, SIM, discussions, agenda. **C'est le même défaut de fond que le chantier D** : « tout compte connecté » là où il faudrait « tout membre du cabinet ».
    - **Décision de Matthieu (18/09)** : « toutes les autres étaient des adresses fictives ou les miennes pour des tests, inutiles maintenant » ; pour `imen94@hotmail.it`, « Imane El Gari se connectera avec ses identifiants de l'app planning » — elle a son propre compte, avec sa fiche. **Bloquer d'abord** (réversible), la suppression restant possible ensuite.
    - **Le procédé** : `ban_duration` de 100 ans par l'API d'administration, exactement comme 23-11. Aucune fiche à modifier, puisque ces comptes n'en ont pas.
    - **Garde-fous, tous vérifiés avant écriture** : identifiant et adresse confrontés un par un à la liste écrite à la main ; **aucun compte de la liste ne doit avoir de fiche** — c'est le garde-fou central, ce script ne peut pas bloquer un membre du cabinet ; **aucune trace** — le script relit le catalogue et cherche ces identifiants dans les **136 colonnes de type `uuid`** des schémas `public`, `agenda` et `storage` ; effectif en fil tendu (`NB_COMPTES = 8`).
    - **Quatre témoins** : le compte de Matthieu glissé dans la liste s'arrête sur « ce compte a une FICHE dans l'appli » ; une adresse faussée et un identifiant inexistant s'arrêtent aussi ; et la **recherche de traces, lancée sur le compte de Matthieu, trouve 32 endroits** (187 gardes créées, 167 attribuées, 109 fichiers du stockage…) — le « aucune trace » des 8 dit donc quelque chose.
    - **Résultats** : 8 bloqués jusqu'au 25/08/2126 ; **15 comptes bloqués dans la base** (7 anciens du cabinet + 8 sans fiche) ; 0 compte actif bloqué ; 34 profils actifs, 33 drapeaux, 32 médecins — inchangés. Relance : « rien à faire ». *Non prouvé ici : qu'un compte bloqué ne peut plus se connecter — personne ne connaît leur mot de passe. `23-13` l'avait prouvé le 17/09 sur un compte jetable.*
    - **Au passage** : `Thibault GUERIN`, remplaçant créé dans l'appli le 18/09 à 9h31, a reçu tout seul le drapeau et la désignation médecin — le déclencheur de 8I fonctionne en production.
    - **Reste ouvert** : leur **suppression définitive**, à décider ; elle ne se défait pas, et demanderait un second script.
  - ✓ **8J — Sauvegarde — FAITE (17-18/09/2026).** 8J-1 et 8J-2 : le script `23-16`, lancé par Matthieu. 8J-3 : le bouton de Charlotte dans l'appli, en production.
    - **État des lieux mesuré le 17/09 à 18h15, en lecture seule, point de départ des chantiers d'après J** :
      - **Conforme** : `main` = `0c5736f`, le site public sert le même bundle qu'en 8G ; `23-4` : 18/18 ; 31 médecins, 32 drapeaux, 22 remplaçants actifs (les 21 de 23-12 + Léa JACQUET), 7 comptes bloqués, 0 inactif non bloqué ; déclencheur de 23-14 actif ; Bolt `INACTIVE`.
      - **Activité réelle depuis 14h00** : 7 remplaçants connectés (le premier à 15h29), plus Matthieu et Charlotte ; **aucune nouvelle demande** (2 681). Charlotte : une garde attribuée puis **annulée par « Annuler »** (le journal fonctionne en production), une garde retirée à son médecin, et le type de créneau **« J6 Dijon » renommé « pré - J2 Dijon »**. Sans effet sur l'appli (plans et import visent l'identifiant) ; seuls les scripts de comparaison, qui lisent le nom, verraient un écart.
      - ⚠ **Aucune sauvegarde de la base** : offre gratuite, l'API renvoie `backups: []` et `pitr_enabled: false`. Les seules copies étaient l'archive Bolt (12h43) et Bolt en pause. D'où 8J.
      - ⚠ **8 comptes de connexion sans fiche** dans `auth.users` (tests de mai-juin, dont `dr.martin@fictif.local` et `dr.bernard@fictif.local`, connectés en juin), **non bloqués**. Sans fiche, ils n'ont aucun rôle ; mais `profiles_select_all_authenticated` et `annuaire_select_all_authenticated` (`USING true`) laissent tout compte connecté lire les profils et l'annuaire. *Déduit des policies, non prouvé par le chemin du navigateur.*
      - **Environnement de test** : le 3e projet (`yjttfdwjbyufpavwxcpy`) est **en pause**, restaurable. Offre gratuite : en principe 2 projets actifs, il prendrait la place de Bolt. Les prévisualisations Vercel sont branchées sur la base de production.
      - **Priorités arrêtées par Matthieu** : A. sauvegarde (8J) — d'abord automatique sur son Mac, puis, le 18/09, un bouton dans l'appli ; B. bloquer les 8 comptes sans fiche ; C. environnement de test ; D. `actif` dans les policies ; E. le reste (écran de mot de passe, drapeau → rôle, temps réel, clôture automatique, redirection Bolt, J4 Beaune).
    - ✓ **8J-1 — FAITE (17/09/2026)** — **Script `docs/sql/23-16-sauvegarde-orga.py`, en lecture seule.** Simulation par défaut, `--go` pour exporter. Commit `fba11eb`.
      - **Ce qu'il exporte**, en JSON, **hors du dépôt** (données personnelles) dans `~/Documents/claude-projets/archives/orga-sauvegardes/<AAAA-MM-JJ-HHhMM>/` : chaque table des schémas `public` et `agenda` (**lue dans le catalogue** : une table ajoutée plus tard est sauvegardée sans toucher au script) ; `auth.users` par une **liste blanche de colonnes** (jamais d'empreinte de mot de passe ni de jeton, même si Supabase ajoute une colonne) ; la liste des fichiers du stockage, **sans leur contenu** ; la structure (colonnes, contraintes, index, policies, fonctions, déclencheurs, vues, droits, publications, extensions).
      - **Lecture seule imposée par Postgres** : chaque requête tourne dans une transaction `read only`, et la base confirme ce mode sur chaque ligne renvoyée. Le `commit` est sur sa propre ligne (piège de 8H).
      - **Pourquoi une empreinte avant et après** : l'export se fait table par table (46 requêtes), donc quelqu'un pourrait écrire entre deux tables — une demande sans sa garde, par exemple. L'empreinte (nombre de lignes + `md5` du contenu de chaque table) est prise **en une seule requête**, donc sur un même état ; identique avant et après, elle prouve que rien n'a bougé pendant l'export. Sinon l'export recommence, 3 essais au plus.
      - **Contrôles de fin** : chaque fichier est **relu sur le disque** et son nombre de lignes confronté à l'empreinte ; son `sha256` est noté dans `MANIFESTE.json`. Le dossier s'écrit en `.en-cours` et n'est renommé qu'au vert : **un dossier sans suffixe est une sauvegarde complète**. Droits 700 / 600 : lisible par le seul compte macOS de Matthieu. Codes de sortie pour l'automatisation : 0 complète, 1 arrêt, 2 base en mouvement (dossier `.non-fige`).
      - **Simulation** : les mêmes requêtes, mais chacune ne renvoie que son nombre de lignes. **46 sources, 7 151 lignes**, chaque export « à blanc » égal à l'empreinte.
      - **11 témoins au vert**, dans le bloc-notes et avec de fausses données : une requête hors `read only` arrête le script (même vérification, rejouée sur une requête sans `read only`) ; une base qui bouge à chaque empreinte → 3 essais, dossier `.non-fige`, code 2 ; un fichier auquel il manque une ligne → arrêt, `.en-cours` laissé pour examen ; cas normal → dossier final, droits 700 / 600 ; second lancement dans la même minute → refusé.
      - **Au passage** : l'outil de permission de Claude Code a refusé un test de taille qui lisait toutes les données en une requête. D'où l'export table par table, et une simulation qui ne rapatrie aucune donnée.
      - **Ce qu'il ne fait pas** : restaurer (un script serait à écrire, et à répéter d'abord sur l'environnement de test) ; sauvegarder le **contenu** des fichiers joints (121 fichiers, 56 Mo, surtout la SIM) ; supprimer les anciennes sauvegardes (8J-3).
    - ✓ **8J-2 — FAITE (17/09/2026, 18h34)** — **Première sauvegarde réelle : `orga-sauvegardes/2026-09-17-18h34/`.** Figée au premier essai, 31 s, 6,0 Mo, 48 fichiers.
      - **Vérifié de façon indépendante après coup** : 46/46 fichiers identiques à la base ; `sha256` recalculés égaux au manifeste ; exactement les fichiers attendus ; `auth.users` réduite aux 13 colonnes de la liste blanche, aucune empreinte ni jeton dans le fichier ; gardes triées par identifiant ; droits 700 / 600 ; décomptes relus en base par une autre voie : 2 930 gardes, 2 681 demandes, 85 lignes de journal, 530 règles de plan, 40 profils, 48 comptes.
      - **Pas de Time Machine ni de synchronisation iCloud** pour `Documents` (vérifié) : la sauvegarde n'existe que sur ce Mac.
    - ✓ **8J-3 — FAITE (18/09/2026)** — **Charlotte sauvegarde le planning d'un clic, depuis l'appli. En production.** Commit `ae33ccc`, `main` avancée de `0c5736f` à `ae33ccc`. ~~Automatisation nocturne sur le Mac de Matthieu.~~ **Abandonnée le 18/09, à sa demande** : « ça me paraît un peu compliqué. Charlotte travaille tous les jours sur l'appli et pourrait régulièrement sauvegarder manuellement. La sauvegarde se retrouverait sur l'ordinateur du cabinet plutôt que sur mon perso. »
      - **Ce que les sondes `launchd` avaient montré, avant l'abandon** (deux tâches jetables, chargées puis retirées, rien laissé dans `~/Library/LaunchAgents`) : macOS **refuse à une tâche de fond la lecture de `Documents`** (`Operation not permitted`) — ni le script du dépôt ni la liste des sauvegardes ne seraient lisibles ; l'écriture, elle, passe. Le trousseau, l'API et la notification fonctionnent. Hors de `Documents`, tout fonctionne. Il aurait donc fallu soit installer une **copie** du script hors du dépôt, soit donner l'**accès complet au disque** à Python — c'est-à-dire à tout script Python du Mac. *À reprendre si l'automatisation revient un jour.*
      - **Où** : Planning → Paramètres → **onglet « Sauvegarde »** (coordinateurs seuls, comme tout l'écran Paramètres), et **bandeau de rappel en tête de « Validation »**, son onglet d'accueil — un rappel qui ne vivrait que dans Paramètres ne serait jamais vu.
      - **Ce que fait le bouton** : il lit, il ne touche à rien. Le fichier `sauvegarde-planning-<date>.json` (5,3 Mo) est téléchargé sur l'appareil. **Sauvegarde complète à chaque fois**, jamais différentielle : un seul fichier, le plus récent, suffit à reconstituer le planning — une chaîne de différences se casse dès qu'un maillon manque.
      - **Contenu** : les 16 tables du schéma `agenda` plus la liste des médecins (identifiant, prénom, nom, rôle — **ni email ni photo**). C'est ce que la RLS laisse lire à un coordinateur : **les 419 gardes supprimées et les séries supprimées n'y sont pas** (les demandes, elles, y sont toutes, y compris les 247 rattachées à une garde supprimée). C'est une sauvegarde du **planning vivant**, pas l'équivalent de `23-16`.
      - ⚠ **La limite des 1 000 lignes** : PostgREST n'en renvoie pas plus par requête, **sans erreur au-delà**. La lecture se fait donc par tranches triées sur l'identifiant, et le nombre de lignes reçues est confronté au décompte de la base pris **avant et après** chaque table ; en cas d'écart (quelqu'un écrit pendant la sauvegarde), 3 essais puis un message qui invite à réessayer. *À noter : l'export CSV existant (`exportUtils.ts`), lui, ne lit pas par tranches — un export sur une longue période peut être tronqué en silence. Non corrigé.*
      - **Le rappel** : au-delà de **7 jours**, ou sans sauvegarde connue, le bandeau ocre s'affiche avec son bouton. La date est mémorisée **dans le navigateur** (`localStorage`), donc sans écrire en base — d'où la formule « sur cet appareil ».
      - **Prouvé** : **20/20 contrôles** en rejouant les requêtes exactes du bouton par le chemin du navigateur (jeton de coordinateur, `GET` seulement) — aucune table du schéma oubliée (contrôle sur le catalogue), chaque table au nombre exact de lignes visibles et sans doublon, gardes et demandes en **3 tranches** (la limite est bien franchie), liste des médecins sans email. **9/9** sur les règles de date, en exécutant le vrai code (hier 23h05 vu le lendemain matin = « hier », 7 jours ne déclenche pas, 8 jours oui). Build sans erreur ; `package.json` inchangé, **aucun `npm install`**.
      - **Essai réel par Matthieu** (localhost, 18/09 à 9h19) : fichier de 5,3 Mo téléchargé, rappel passé au vert. Puis vérification après déploiement : le site public sert **exactement** les fichiers construits en local (empreintes `sha256` identiques) et le module en production contient bien la sauvegarde.
      - **Reste à faire** : prévenir Charlotte ; lui conseiller de garder les 4 dernières sauvegardes et de ranger les fichiers. **Restaurer demande toujours un script**, à écrire le jour où il faudra, et à répéter d'abord sur l'environnement de test (chantier C).
  - ✓ **8I — FAITE (17/09/2026)** — **Un médecin créé depuis le Trombinoscope est aussitôt ouvert au Planning.** Signalé par Matthieu quelques heures après la bascule. Nouveaux scripts `docs/sql/23-14-agenda-designation-automatique.sql` (**exécuté**) et `23-15-agenda-preuve-creation-appli.py` (exécuté, **15/15**) ; suite `23-4` : **18/18**.
    - **Le problème** : un compte neuf hérite de `agenda_beta_access = false` (il n'ouvre pas le module) et de `is_agenda_doctor = false` (on ne peut pas lui attribuer de garde) — le piège noté en 8E. **Déjà atteint** : Léa JACQUET, remplaçante créée à 15h33 le jour de la bascule.
    - **Pourquoi un déclencheur sur `public.profiles`, et non la fonction `create-medecin`** : il couvre tous les chemins de création (appli, scripts comme 23-9, tableau de bord Supabase) et les changements de rôle, sans redéployer la fonction serveur.
    - **La règle — le rôle décide, à la création et à chaque changement de rôle** : remplaçant, associé, associé gérant → médecin + drapeau ; super_admin → drapeau, et médecin **seulement s'il tient déjà des gardes ou des règles de plan** (même critère factuel que 23-3) ; poste de bureau et tout autre rôle → ni l'un ni l'autre. **Un enregistrement qui ne change pas le rôle ne fait rien** : les comptes existants, dont les 7 bloqués, ne sont pas rouverts.
    - ⚠ **Le piège de la création en deux temps** : `create-medecin` crée le compte, `handle_new_user` insère le profil avec le rôle par défaut « remplaçant » (→ médecin + drapeau), **puis** la fonction applique le vrai rôle. Pour un super_admin, c'est donc l'`UPDATE` qui doit retirer la désignation posée à l'`INSERT` — d'où le critère « tient des gardes », et non un simple « ne pas toucher ». Fonction en `SECURITY DEFINER` : ce critère lit `agenda.shifts` quel que soit l'utilisateur qui modifie le profil.
    - **Rattrapage** : Léa JACQUET reçoit les deux colonnes. Le script s'arrête si un autre compte était à rattraper — il n'y en avait pas.
    - **Prouvé en trois temps** : (1) **répétition en `rollback`** — compte fictif inséré dans `auth.users` (donc par le vrai `handle_new_user`), 8 scénarios au vert : création, passage à associé, enregistrement sans changement de rôle après retrait manuel (rien ne bouge), super_admin sans garde, poste de bureau, retour à remplaçant, Matthieu passé associé gérant puis super_admin (reste médecin : il tient des gardes), Charlotte enregistrée sans changement ; base intacte ensuite. **Témoin** : les mêmes tests sans déclencheur échouent sur les scénarios 1, 2, 4 et 6 — ceux qui prouvent son effet ; 3, 5, 7 et 8 passent dans les deux cas, ils vérifient qu'il ne casse rien. (2) **Installation** : 31 médecins, 32 drapeaux, relance sans effet. (3) **`23-15`, par le vrai chemin de l'appli** : la fonction `create-medecin` appelée comme le Trombinoscope, au nom de Matthieu, sans email, pour un remplaçant, un associé et un super_admin — rôle appliqué, colonnes conformes, et le remplaçant créé **lit les gardes**. Comptes supprimés.
      - *Défaut du premier passage de 23-15* : la réponse était lue après la fermeture de la connexion, donc vide. Le nettoyage avait fonctionné ; corrigé et relancé.
    - **Suite `23-4` : la règle remplace l'effectif.** L'effectif écrit en dur (30) était un fil tendu voulu tant qu'aucun compte ne devait entrer sans décision ; depuis que l'appli crée des médecins et que 23-14 les désigne, il aurait cassé à chaque création normale. Trois contrôles le remplacent : tout remplaçant ou associé actif non bloqué est dans la liste ; la liste ne contient personne d'autre que des super_admin en plus ; chaque médecin de la liste a le drapeau. *Non vu en échec : le premier aurait nommé Léa JACQUET avant 23-14.*
  - ✓ **8H — LA BASCULE (17/09/2026, 13h50 → 14h00)** — **Le module Agenda est ouvert à tous les médecins du cabinet.** Décidée par Matthieu en séance, l'après-midi même où les derniers scripts étaient prêts, plutôt qu'un soir : Bolt était calme (dernière écriture à 12h43). Séquence du plan 8E déroulée dans l'ordre, chaque étape vérifiée avant la suivante.
    - **Décisions prises juste avant** : conflit du 24/04/2026 (Dijon, 08:00-14:00, close côté Orga, « en attente » sans médecin côté Bolt) → **clôture conservée**, garde passée jamais attribuée ; Bolt → **mise en pause** de son projet Supabase en fin de bascule ; temps réel → **plus tard**.
    - **1. Gel de Bolt pour les humains** — message de Matthieu sur le WhatsApp des remplaçants (« ne plus prendre ni demander de garde »), Charlotte prévenue.
    - **2-3. Dernière resynchronisation** — `22-8A-1` sans `--go` : 37 profils mappés, 0 inconnu ; `--go` : **22 gardes modifiées, 8 demandes insérées, 38 modifiées** (`agenda.shifts` 2 930 lignes dont 404 closes, `agenda.requests` 2 681). Relancé aussitôt sans `--go` : **delta vide** hors conflit connu — Bolt ne bouge plus.
    - **4. 6C-4** — `23-6` : IDENTIQUES ; `23-10` exécuté : `rotation_settings` et `rotation_assignment_rules` **supprimées**, 0 policy restante, plans V1 et V2 intacts (266 + 264). Relance : rien à faire.
    - **5. Clôture** — mesuré avant : 15 gardes passées libres (28/08 → 16/09), 41 demandes approuvées orphelines, 1 demande active. `23-5` exécuté : **15 gardes closes, aucune attribuée touchée, 240 suppressions futures inchangées, 42 demandes annulées, 0 orpheline**.
      - ⚠ **Incident sans conséquence** : la première exécution n'a rien écrit. Le script était passé à l'API sous la forme `begin; <fichier> commit;` ; le fichier se terminant par une ligne de commentaire, le `commit` s'y est collé et a été lu comme du commentaire — la transaction ouverte a été annulée à la fermeture de la connexion. **Vu par les contrôles** (15 gardes toujours ouvertes). Relancé avec `commit` sur sa propre ligne. *`23-10` n'était pas concerné : sa dernière ligne est `commit;`, et sa vérification indépendante l'avait confirmé.* **Règle** : toujours mettre le `commit` final sur sa propre ligne.
      - **Conséquence voulue** : relancée sans `--go`, la resynchronisation affiche désormais **41 demandes « à modifier »** — exactement celles du bloc 1 de 23-5 (vérifié : aucune autre demande n'a bougé, dernière écriture Bolt toujours à 12h43). **`22-8A-1 --go` ne doit plus jamais être lancé** : il les remettrait « approuvées ».
    - **6. Les 7 suites, pour la dernière fois** — 126/126.
    - **7. Ouverture** — `23-12 --go` à **14h00** : 21 remplaçants actifs, 31 drapeaux, 0 hors rôles médecins, 0 bloqué ouvert, 2 coordinateurs, 32 comptes actifs ; état avant écrit dans `docs/sql/23-12-etat-avant-ouverture.json`. **Chemin du navigateur** : Laurie-Anne BATISSE lit les 2 511 gardes et 0 ligne du journal ; le poste de bureau, 0 garde. Vérifié en plus : Matthieu et Charlotte lisent le journal (coordinateurs), Caroline Chauvet (drapeau posé ce jour) lit les gardes et pas le journal.
    - **8. Après l'ouverture** — `23-4` : 16/16. **Le garde-fou de 8F-5 prouvé en réel** : `MOD2E-3` s'arrête sur « ARRET », journal identique avant et après (1 076). **Test humain** : Matthieu confirme que « ça passe ».
    - **9. Bolt archivé puis mis en pause (14h19)** — décision de Matthieu : archiver d'abord.
      - **Pourquoi sans attendre** : aucune écriture dans Bolt depuis 12h43, mais **deux connexions après le gel** — « Coordinateur Admin », le compte de travail de Charlotte, à 14h06, et Dr Marie ZEHR à 14h10. Une consigne ne se vérifie pas toute seule.
      - **Archive** : les 16 tables de Bolt et la liste des comptes **sans empreinte de mot de passe**, en JSON, plus les colonnes du schéma et un `MANIFESTE.json`. **Chaque export est identique au décompte en base** (2 683 gardes, 2 685 demandes, 282 règles de roulement, 40 profils…). Rangée **hors du dépôt Git**, parce qu'elle contient des données personnelles : `~/Documents/claude-projets/archives/bolt-planning-2026-09-17/` (2,8 Mo).
      - **Pause** : `POST /v1/projects/kldgvjxuojeeqhdrmaia/pause` (API Management). Statut `INACTIVE` à 14h19 ; l'API de Bolt répond HTTP 540 ; Orga `ACTIVE_HEALTHY`, appli en ligne. L'appli Bolt ne peut plus ni lire ni écrire.
      - **Pour revenir en arrière** : « Restore project » dans le tableau de bord Supabase (ou `POST .../restore`). Sur l'offre gratuite, un projet en pause se restaure en principe **jusqu'à 90 jours** ; au-delà, l'archive locale reste la référence.
    - **Reste après la bascule** : l'annonce au cabinet (texte proposé à Matthieu : adresse de l'appli, identifiants Bolt inchangés, invitation à changer de mot de passe par « Mot de passe oublié ? » — l'appli n'a pas d'écran de changement dans le profil —, Xavier BAUDRILLART avec son adresse hotmail, fin du compte `contact@`) ; la page d'accueil de Bolt (`omnes-planning-share-6kyv.bolt.host`) affiche désormais une appli en erreur, une page de redirection reste possible dans Bolt.new ; puis les chantiers « après J » de 8E.
  - ✓ **8G — FAITE (17/09/2026)** — **Le code du module est en production, module toujours fermé.** Accord explicite de Matthieu. `main` avancée de `601393a` à `0c5736f` (simple avance : `main` n'avait plus aucun commit absent de la branche depuis 8E-1), déploiement de production Vercel réussi.
    - **Vérifié avant de pousser** : aucun fichier de l'appli modifié depuis le build local de 8E-1 et la prévisualisation testée par Matthieu en 8E-2 (seuls `docs/` ont bougé depuis).
    - **Vérifié après, sur l'adresse publique** `https://omnes-orga.vercel.app` : elle sert **exactement** le bundle construit en local (`index-DGNNgMOz.js`, même empreinte), qui contient la route `/planning` et le filtre `agenda_beta_access` ; le module agenda, chargé à la demande, est le même fichier (`App-lIqbOrVK.js`), lit `rotation_plans` et ne cite plus `rotation_settings`.
    - **Qui voit quoi** : la tuile Planning n'apparaît qu'aux 3 porteurs du drapeau — Matthieu, **Charlotte** et **Airelle**. Pour tous les autres, rien ne change (l'annuaire multi-catégories était déjà en production).
    - ⚠ **Relevé juste avant de pousser, et tranché par Matthieu** : Charlotte (coordinatrice) et Airelle verront la tuile dès maintenant. Ce qu'elles feraient dans le Planning d'Orga d'ici le soir J serait **écrasé sans alerte** par la resynchronisation (une ligne présente des deux côtés reçoit les valeurs de Bolt). **Décision : Matthieu les prévient** de continuer à travailler dans Bolt jusqu'au soir J — plutôt que retirer leurs drapeaux.
    - **Pour le soir J, noté** : Matthieu préviendra les remplaçants par le groupe WhatsApp du cabinet de ne plus prendre de gardes dans Bolt — c'est le « gel de Bolt pour les humains », première étape de la séquence, au signal donné pendant la session.
  - ⏳ **8F — Scripts du soir de la bascule, écrits et répétés à l'avance — COMMENCÉE (17/09/2026).**
    - ✓ **8F-5 — FAITE (17/09/2026)** — **Les suites de test qui écrivent sont bloquées dès que le module est ouvert à tous.** Garde-fou ajouté au harnais `docs/sql/22-MOD2-outil-test.py`. Le soir J, elles tournent une dernière fois **avant** `23-12` ; seule `23-4`, en lecture seule, reste utilisable après.
      - **Pourquoi** : tant que le module est en bêta, le schéma `agenda` n'est qu'une copie et les suites peuvent y écrire. Ouvert à tous, c'est le planning réel du cabinet. **Relevé en les relisant pour la production, le 17/09** : (1) elles suppriment **toutes** les gardes d'une date de test (`delete ... where date = '2027-12-01'`) — 0 garde réelle à ces dates aujourd'hui, la plus lointaine étant au 03/01/2027, mais de vraies gardes dès que fin 2027 sera ouverte ; (2) `MOD2D` restaure **« la dernière action du journal »**, quelle qu'elle soit — celle de Charlotte si elle agit pendant le test ; (3) elles effacent ou modifient les lignes du journal apparues pendant le test (`where id > départ`), y compris celles d'un vrai utilisateur ; (4) le contrôle « modifier le journal est refusé » vise **tout** le journal (`id=gt.0`) — une régression de policy l'effacerait ; (5) de fausses données (gardes 2027, site « ZZ-TEST », demandes du compte de test) y sont visibles quelques secondes. Et le médecin de test du harnais est une vraie personne — premier médecin non coordinateur porteur du drapeau, trié sur « prénom nom » : **Airelle SAUVAGE**, avant comme après l'ouverture. *(Rectifié le 17/09 : une première version disait Laurie-Anne BATISSE, en supposant un tri sur le nom de famille ; constaté en lançant `23-4` après l'ouverture.)*
      - **Décision de Matthieu (17/09)** : les **bloquer** après l'ouverture plutôt que les réécrire (6 suites, ~110 contrôles, et le point 5 resterait en partie). Pour les évolutions d'après J (retrait du drapeau du code, `actif` dans les policies), **un environnement de test séparé reste à décider**.
      - **Le mécanisme** : au chargement, avant toute écriture — y compris l'« emprunt » du drapeau — le harnais regarde si **au moins un remplaçant actif porte le drapeau** (exactement ce que fait `23-12`, et ce que défait son `--annuler`). Si oui, il arrête toute suite qui n'est pas nommée dans `SUITES_LECTURE_SEULE`. **Blocage par défaut** : une nouvelle suite qui écrit est bloquée sans qu'on ait à y penser. `23-4` y figure, vérifiée en lecture seule (`select`, `GET`, et `journal_activite`, fonction `STABLE` sans écriture).
      - **Prouvé sans ouvrir le module** : copie du harnais, dans le bloc-notes, qui croit le module ouvert. **Témoin A** — une copie de `MOD2A-2` s'arrête sur « ARRET » ; journal, gardes de la date de test et drapeaux **identiques avant et après** (752 / 0 / 3). **Témoin B** — une copie de `23-4` passe, 16/16. Puis les sept vraies suites, module non ouvert : 126/126.
    - ✓ **8F-4 — FAITE (17/09/2026)** — **Le script d'ouverture est prêt : `docs/sql/23-12-agenda-ouverture.py`, simulé et répété en `rollback`, NON exécuté.** À lancer le soir J après 22-8A-1, son contrôle, 23-6, 23-10 et 23-5.
      - **Ce qu'il fait, en une transaction** : active les **21** remplaçants inactifs non bloqués, et pose `agenda_beta_access = true` sur les **28** comptes actifs des quatre rôles médecins qui ne l'ont pas encore — **31** porteurs après ouverture (2 super_admin, 3 associés gérants, 5 associés, 21 remplaçants). Restent à l'écart, par construction et par contrôle : le poste de bureau (pas un rôle médecin) et les 7 comptes bloqués. **Aucun déploiement** (décision de Matthieu, voir 8E).
      - **Désignation par requête, mais confrontée** : les remplaçants à activer sont « inactifs et non bloqués » — le blocage de 23-11 sert de marqueur d'un ancien. Chacun doit porter le statut `REMPLACANT_A_CREER` au mapping, une empreinte au format Bolt et une adresse confirmée (sans elles, il ne pourrait pas se connecter : 8C-1b, 23-13). **Deux fils tendus** : `NB_A_ACTIVER = 21` et `NB_DRAPEAU_APRES = 31`. Un compte créé ou bloqué d'ici J fait tomber le script au lieu d'être ouvert en silence — à ajuster par décision, comme `NB_MEDECINS` dans 23-4.
      - **Retour arrière** : `--go` écrit d'abord l'état de chaque compte touché dans `docs/sql/23-12-etat-avant-ouverture.json` ; `--annuler` (simulation par défaut) remet exactement ces valeurs. Un second `--go` refuse de tourner si ce fichier existe déjà.
      - **Prouvé sans rien conserver** : simulation — 5 contrôles au vert, listes nommées affichées ; **répétition sur la vraie base** — (a) ouverture puis `rollback` : 21 remplaçants actifs, 31 drapeaux, 0 drapeau hors rôles médecins, 0 compte bloqué ouvert, 2 coordinateurs, 32 comptes actifs ; (b) ouverture **puis retour arrière** puis `rollback` : **0 écart** avec l'état avant ; (c) après les deux `rollback`, la base n'a pas bougé (0 remplaçant actif, 3 drapeaux). **Deux témoins** : `NB_A_ACTIVER` faussé à 22 arrête le script ; la répétition **sans** le retour arrière affiche **28 écarts** — le « 0 écart » de (b) prouve donc quelque chose. `--annuler` sans ouverture préalable refuse de tourner.
      - **Après `--go`, le soir J**, le script vérifie par le chemin du navigateur (jetons forgés, `GET`) qu'un remplaçant ouvert lit les gardes et pas le journal, et que le poste de bureau ne lit aucune garde. **Non exerçable avant J** : un `rollback` ne se voit pas depuis une autre connexion.
    - ✓ **8F-3 — FAITE (17/09/2026)** — **Un mot de passe Bolt de 6 caractères ouvre bien Orga, et un compte bloqué ne peut plus se connecter : prouvé sur un compte jetable.** Nouveau script `docs/sql/23-13-agenda-preuve-mot-de-passe-court-et-blocage.py` (exécuté, **12/12**).
      - **Les deux questions** : (1) Orga exige 10 caractères, Bolt n'en exigeait que 6, et 8C-1b n'avait prouvé la connexion qu'avec des mots de passe de 24 caractères. Si la règle d'Orga s'appliquait à la connexion, une partie des 21 remplaçants serait restée dehors le soir J. (2) 23-11 a bloqué 7 comptes, mais une colonne `banned_until` remplie ne prouve pas une porte fermée. Personne ne connaissant le mot de passe d'un vrai remplaçant, seule une répétition sur un compte dont on choisit le mot de passe pouvait répondre.
      - **Le procédé** : l'empreinte du mot de passe de 6 caractères est posée directement, **au format exact de Bolt** (`$2a$10$`, calculée par `pgcrypto` dans Postgres — aucun paquet installé), comme 8C-1 recopie les empreintes. La connexion passe par la **porte publique de l'appli** (`/auth/v1/token`), le blocage par **le même appel que 23-11**.
      - **Résultats** : témoin — le mot de passe long d'origine est accepté, puis refusé une fois l'empreinte courte posée (c'est donc bien elle qui est lue) ; **le mot de passe de 6 caractères ouvre la session**, et le jeton obtenu lit l'API ; bloqué, **le bon mot de passe est refusé** (« HTTP 400 — User is banned ») et **la session ouverte avant le blocage ne se renouvelle plus** ; débloqué, la connexion repasse — c'est le retour arrière de 23-11. Compte et profil supprimés, disparition vérifiée.
      - **Constat au passage** : à la connexion, Supabase signale le mot de passe court (`weak_password` : « Password should be at least 10 characters ») **mais ne refuse pas**. L'appli n'en tient pas compte (`useAuth.signIn` appelle seulement `signInWithPassword`). La règle des 10 caractères ne s'appliquera qu'au **changement** de mot de passe : raison de plus pour inviter chacun à en changer, dans l'annonce.
    - ✓ **8F-2 — FAITE (17/09/2026)** — **Les 6 remplaçants qui ne travaillent plus au cabinet et le compte fictif Essai DUPONT sont bloqués et retirés de la liste des médecins.** Nouveau script `docs/sql/23-11-agenda-bloquer-anciens-comptes.py` (**exécuté**) ; suite `23-4` ajustée. Sept suites : **126/126**.
      - ⚠ **La découverte qui l'a déclenchée : dans Orga, `actif = false` n'est PAS une barrière de sécurité.** Trouvé en préparant le script d'ouverture, en vérifiant ce que change vraiment `actif`. La connexion ne le vérifie pas, et **les policies du schéma `public` non plus** (3 sur 99 le citent, aucune sur les données sensibles) : `can_read_codes()` n'exige que le rôle. Seul l'agenda l'exige, via `peut_acceder()`. Or, depuis 8C-1 (03/09), les 27 remplaçants ont dans Orga leur mot de passe Bolt, et 8C-1 a posé `email_confirmed_at`.
      - **Prouvé par le chemin du navigateur, en lecture seule** (jeton forgé, `GET` seulement, nombres de lignes seulement — jamais un code affiché) : un remplaçant « inactif » lit **les 4 codes d'accès et leurs 3 lieux**, les 39 profils, les 143 fiches d'annuaire, les 22 événements. Le poste de bureau lit 0 code. L'agenda et la messagerie restent fermés. **Aucun des 27 ne s'est jamais connecté à Orga** (`last_sign_in_at` vide).
      - **Conséquence générale, hors bascule** : passer en « inactif » quelqu'un qui quitte le cabinet ne lui retire **aucun** accès. Correction de fond prévue après J (exiger `actif` dans les policies).
      - **Décisions de Matthieu (17/09)**, sur la base des gardes et des connexions Bolt mesurées pour chacun :
        - **ne travaillent plus au cabinet** : Mathilde LEDOUX, Prescilia PHILIPS, Sarah GUARAGNA, Aymeric GOUVERNEUR, Anne-Eugénie CHAUSSENOT, Caroline DE CONTENSON → bloqués **définitivement** et retirés de la liste des médecins ; **Essai DUPONT**, même traitement ;
        - **restent** (dont trois vérifiés un par un malgré une activité ancienne) : Yitian LUCOT, Louis DE MONTAIGNE DE PONCINS, Claire VIGNE — ses 4 demandes en attente (20/11 → 11/12, Dijon) sont légitimes. **21 remplaçants** seront ouverts le soir J ;
        - **les 21 ne sont pas bloqués d'ici là** : aucun ne s'est connecté, l'adresse d'Orga ne leur a pas été communiquée.
      - **Pourquoi bloquer plutôt que désactiver** : ils le sont déjà, et ça ne protège rien. Le blocage (`ban_duration` de 100 ans par l'API d'administration, voie prévue par Supabase) refuse la connexion quel que soit le mot de passe, sans toucher aux gardes, aux demandes ni à l'empreinte. **Il devient aussi le marqueur d'un ancien** : le script d'ouverture n'activera que des remplaçants non bloqués. Retirés de la liste des médecins, ils ne sont plus proposés à l'attribution ; **leur nom reste sur leurs anciennes gardes**, lu par jointure sur le profil et non dans la liste. Liste : 37 → **30**.
      - **Garde-fous, tous vérifiés avant écriture** : identité confrontée à la main (identifiant, prénom, nom, rôle, adresse) ; jamais un compte actif ni un coordinateur ; aucune garde à venir, aucune demande en attente, aucune règle de plan — mesuré : 0 partout pour les 7. **Deux témoins en simulation** : une adresse faussée s'arrête sur « ARRET », le compte de Matthieu glissé dans la liste s'arrête sur « le compte est ACTIF ». Mode `--annuler` (simulation par défaut) pour le retour arrière. L'`UPDATE` redit `not actif`.
      - **Résultats** : 7 bloqués jusqu'au 24/08/2126, 7 hors liste, 7 comptes bloqués dans toute la base (0 avant), 30 médecins, 21 remplaçants à ouvrir ; gardes conservées (13, 10, 10, 9, 3, 0, 0). Relance : « rien à faire ». `22-8A-1` sans `--go` : **37 profils mappés, 0 inconnu** — le blocage ne gêne pas la resynchronisation.
      - **La suite `23-4` a cassé comme elle le devait** : 12/15, sur les deux contrôles « 37 médecins » et sur « personne qui tient des gardes n'est hors liste », qui nommait **exactement** les 5 anciens ayant des gardes passées. Ajustée : `NB_MEDECINS = 30` ; un compte bloqué est exclu de « hors liste » (le blocage est le marqueur, pas l'absence de garde récente — un médecin non bloqué sorti de la liste reste un oubli) ; **nouveau contrôle « aucun compte bloqué dans la liste »**. 16/16. *Ce nouveau contrôle n'a pas été vu en échec : le faire casser demanderait de remettre un compte bloqué dans la liste.*
      - **Au passage** : Bolt a bougé depuis le matin — 22 gardes à modifier au lieu de 16, 8 demandes à insérer au lieu de 2. Les 6 nouvelles demandes viennent toutes de Céline KRÄTTLI (18 → 24/12) ; **aucun ancien n'a de demande en attente dans Bolt**.
      - **Ce que 8F-2 ne prouve pas** : qu'un compte bloqué ne peut réellement plus se connecter — personne ne connaît leur mot de passe. La preuve se fera sur comptes jetables, dans `23-13`.
    - ✓ **8F-1 — FAITE (17/09/2026)** — **6C-4 est prête : `docs/sql/23-10-agenda-6C-4-suppression-rotation.sql`, écrit et répété, NON exécuté.** À lancer le soir J juste après le « IDENTIQUES » de `23-6`.
      - **Ce qu'il fait, en une transaction** : contrôles préalables, suppression de `rotation_settings` et `rotation_assignment_rules`, vérification. Les contrôles arrêtent tout si la copie Orga n'a plus exactement 1 et 282 lignes (elle est figée depuis 7D : un autre nombre voudrait dire que quelque chose y a écrit) ; si une clé étrangère, une vue ou une fonction des schémas `agenda` et `public` dépend encore des tables ; ou si les plans actifs V1 et V2 n'ont plus 266 et 264 règles.
      - **Pourquoi sans `cascade`** : `cascade` supprimerait en silence tout ce qui dépendrait encore des tables. Sans, une dépendance oubliée fait échouer le `drop` et annule la transaction. Les 8 policies et les 2 triggers `updated_at` appartiennent aux tables et partent avec elles. **Les fonctions sont contrôlées à part** : le corps d'une fonction n'est pas une dépendance que Postgres connaît, un `drop` ne la ferait pas échouer, elle casserait plus tard, à l'appel.
      - **Pourquoi aucune sauvegarde des 282 règles** : `23-6` prouve qu'elles sont identiques au plan V1, qui reste en base, et elles existent encore dans Bolt. C'est aussi pourquoi `23-6` doit être relancé juste avant.
      - **Prouvé sans rien conserver** : (1) le bloc de contrôles seul, en lecture, passe ; (2) **deux témoins** — nombres attendus volontairement faux (281 règles, puis 265 pour le plan V1) — s'arrêtent bien sur « ARRET » ; (3) **répétition du script entier sur la vraie base, `commit` remplacé par `rollback`** : dans la transaction, tables supprimées, 0 policy restante, plans à 266 et 264 ; après, tout est revenu (1 et 282 lignes, 8 policies, 2 triggers) ; (4) **deux passages de suite dans la même transaction annulée** : le second constate « déjà exécuté » et ne lève aucune erreur. Le `notify pgrst` d'une transaction annulée n'est jamais envoyé.
      - **Piège de l'API Management, relevé en l'écrivant** : sur un script à plusieurs instructions, elle ne renvoie que le résultat du **dernier `select`**, même suivi d'un `commit`. La vérification est donc placée juste avant le `commit`.
  - ⏳ **8E — Mise en production du code — COMMENCÉE (17/09/2026).** Jamais planifiée en détail jusque-là : la branche avait 90 commits d'avance sur `main`, et l'appli déployée n'avait aucune entrée agenda.
    - ✓ **8E-1 — FAITE (17/09/2026)** — **`main` fusionnée dans la branche, et la partie code de 6C-4 retirée.** Commits `67c6c5d` (fusion) et `856b994` (nettoyage), poussés : la prévisualisation Vercel est construite, **la production n'a pas bougé** (`601393a`). Build local sans erreur, annuaire vérifié à la main par Matthieu. Sept suites : **125/125**.
      - **Pourquoi c'était obligatoire** : `main` portait 6 commits absents de la branche — la refonte multi-catégories de l'annuaire (26/07), dont `5A-4`, qui **supprime la colonne `annuaire.categorie`**. Vérifié en base : elle n'existe plus. La branche lisait encore cette colonne : **déployée telle quelle, elle aurait cassé l'annuaire en production**. Fusion à blanc d'abord (`git merge-tree`), sans conflit ; puis fusion réelle sans commit, relue avant validation. Les `categorie` restants dans le code appartiennent à la table `lieux` (Codes d'accès), dont la colonne existe bien.
      - **Conséquence pour 8G** : `main` n'a plus aucun commit absent de la branche. La fusion vers `main` sera une simple avance, sans conflit possible.
      - **Nettoyage** : `getRotationSettings()`, son cache et `clearRotationCache()` sont retirés de `lib/rotationUtils.ts` — aucun appel nulle part. Le type `RotationSettings` est **conservé** : `getRotationWeek` et `getRotationSlot` le reçoivent, et un plan le satisfait. Les deux tables restent en base jusqu'au soir de la bascule. `.env.example` ne mentionne plus `VITE_AGENDA_*`, inutiles depuis 7E.
      - **Diff hors module relu** : 10 fichiers, +113 / −14, `package.json` inchangé — le module n'importe que `react`, `react-dom`, `lucide-react` et `react-router-dom`. **Aucun `npm install` à prévoir.**
    - ✓ **8E-2 — FAITE (17/09/2026)** — Matthieu ouvre la prévisualisation de `856b994`, s'y connecte, et voit la tuile Planning : la prévisualisation est bien branchée sur la base Omnès-Orga. Testeur humain : toujours à trancher.
    - **État des lieux mesuré le 17/09/2026, avant 8E-1, en lecture seule** :
      - Delta de resynchronisation identique à celui du matin (16 gardes et 38 demandes à modifier, 2 demandes à insérer, 1 conflit, 37 profils mappés, 0 inconnu). `23-6` : zéro écart. Sept suites : 125/125. Les 27 remplaçants sont inactifs, 27/27 empreintes `$2a$10$`, adresses confirmées, désignés médecins. Drapeau bêta : Matthieu, Charlotte, Airelle SAUVAGE.
      - Vercel construit une prévisualisation à chaque push de la branche. Elle est **protégée par la connexion Vercel** : un testeur extérieur n'y accède pas sans lien de partage.
      - ⚠ **« Essai DUPONT »** (`dr.dupont@fictif.local`, associé inactif, compte fictif) porte `is_agenda_doctor = true`, rattrapé par la règle par rôle de 23-3. Il fait partie des **37** « médecins » (les vrais sont 36 : 9 associés et 27 remplaçants) et apparaît dans la liste d'attribution. Décision à prendre.
      - ⚠ **`peut_acceder()` et `est_coordinateur()` ne vérifient aucun rôle** : seul le drapeau bêta tient le compte partagé `poste_bureau` à l'écart des données de l'agenda. Retirer la condition sans la remplacer par un contrôle de rôle lui ouvrirait la lecture par l'API, même sans tuile.
      - Temps réel : **aucune** table `agenda` dans la publication `supabase_realtime`.
      - 6C-4 : `rotation_settings` (1 ligne) et `rotation_assignment_rules` (282) n'ont **aucune dépendance entrante** (clé étrangère, vue, fonction). `23-6` et `23-9` lisent ces tables **dans Bolt**, pas dans Orga : la suppression ne les gêne pas.
      - ⚠ **Mots de passe courts jamais éprouvés** : Orga exige 10 caractères, Bolt en exigeait 6. 8C-1b a prouvé la connexion avec des mots de passe de 24 caractères. L'écran de connexion d'Orga, lui, accepte 6.
      - Bolt est hébergé sur `omnes-planning-share-6kyv.bolt.host`, inscription ouverte. Activité faible : dernière demande le 09/09, 6 connexions sur 7 jours ; sur 60 jours, quasi rien après 20h.
      - ⚠ **La séquence du soir ne gelait pas Bolt** : une écriture faite dans Bolt après le `--go` serait perdue. Remplacer la page ne suffit pas (onglet déjà ouvert, appli installée) ; le seul contrôle vérifiable est de **rejouer 8A-1 sans `--go` juste après** — le delta doit être vide, hors conflit connu.
      - ⚠ **Après la bascule, les suites de test écriront en production** : six d'entre elles nettoient par `delete from agenda.activity_log where id > départ`, qui effacerait une action réelle faite pendant le test — or c'est de ce journal que dépend « Annuler ».
    - **Plan arrêté le 17/09/2026** :
      - **8E-2** — Matthieu ouvre la prévisualisation et s'y connecte (faite le jour même, ci-dessus).
      - **8F** — scripts du soir, écrits et répétés à l'avance : `23-10` (6C-4) ; `23-12` (ouverture, avec son retour arrière) ; `23-13` (preuve, sur comptes jetables, du mot de passe court **et** du blocage — celui-ci exécuté avant) ; suites bloquées en production (8F-5, fait). *(`23-11`, le blocage des anciens comptes, s'est intercalé en 8F-2 et a été exécuté tout de suite.)*
      - **8G** — fusion vers `main`, c'est-à-dire déploiement en production. *(Faite le 17/09, voir 8G ci-dessus.)*
      - **Soir J** — annonce ; gel de Bolt pour les humains ; 8A-1 sans `--go` ; 8A-1 `--go` ; **8A-1 sans `--go` à nouveau, delta vide** ; `23-6` puis `23-10` ; `23-5` et le conflit du 24/04 ; **les 7 suites, pour la dernière fois** ; `23-12` ; **`23-4` seule** ; test de connexion d'un vrai remplaçant ; gel de Bolt côté données ; doc.
      - **Après J** — remplacer le drapeau bêta par un contrôle de rôle aux quatre endroits *(moins urgent depuis 8I : le drapeau est désormais posé automatiquement selon le rôle)* ; **exiger `actif` dans les policies de toute l'appli** (voir 8F-2), pour que désactiver quelqu'un lui retire vraiment ses accès. **Avant ces deux chantiers, décider d'un environnement de test** : les suites qui écrivent sont bloquées en production depuis 8F-5.
      - **Décisions ouvertes** : temps réel ; testeur humain ; mode d'extinction de Bolt (proposé : page de redirection, puis pause du projet Supabase, réversible). *(Essai DUPONT : tranché en 8F-2.)*
      - ✓ **Décidé par Matthieu le 17/09** :
        - **Ouverture en posant le drapeau** : le soir J, `agenda_beta_access = true` pour les quatre rôles médecins et activation des 27 remplaçants, par SQL réversible et **sans déploiement**. *Pourquoi* : le soir J ne comporte plus que des scripts répétés à l'avance, le code en production ayant été vérifié les jours précédents. Le compte `poste_bureau` ne reçoit pas le drapeau et reste exclu, sans toucher aux fonctions. ~~**Piège jusqu'au nettoyage d'après J** : tout nouveau compte médecin doit recevoir le drapeau à la main, sa valeur par défaut étant `false`.~~ **Levé le 17/09 par 8I** : le déclencheur de `23-14` pose le drapeau selon le rôle.
        - **Airelle SAUVAGE garde son drapeau**, et Matthieu la prévient **avant 8G** : la tuile lui apparaîtra dès la mise en production, et ce qu'elle y ferait n'apparaîtrait pas dans Bolt.
  - ✓ **8C-2 — FAITE (17/09/2026)** — **Dr Vincent D'ALESIO rejoint les remplaçants : compte Orga inactif, mapping, mot de passe Bolt.** Nouveau script `docs/sql/23-9-agenda-integrer-remplacant.py` (exécuté) ; `22-8C-1` rejoué ; suite `23-4` ajustée. Sept suites : **125/125**. La resynchronisation passe de nouveau sans copie de test.
    - **Le contexte** : remplaçant créé dans Bolt le 03/09/2026 (confirmé remplaçant par Matthieu le 17/09 — Bolt ne distingue pas associés et remplaçants, tous `doctor`), connecté le 11/09, 3 gardes. Sans compte Orga ni ligne de mapping, `22-8A-1` refusait de tourner (voir 8A-2). **Le cas se reproduira** : tant que Bolt vit, le cabinet peut y créer des comptes. La procédure est désormais outillée — le script de 7B-2 (`creer-remplacants.py`) n'avait jamais été versionné.
    - **Le procédé** reprend 7B-2 à l'identique : compte par l'API d'administration, mot de passe aléatoire jamais conservé, `email_confirm = false` — **aucun email envoyé**. Le vrai mot de passe arrive ensuite par `22-8C-1`, qui sélectionne ses comptes par le statut `REMPLACANT_A_CREER` du mapping : **aucune ligne de 8C-1 ni de 8A-1 n'a eu à changer**, la ligne de mapping suffit à les y faire entrer.
    - ⚠ **Le piège évité : `is_agenda_doctor`.** Le profil cible a été relevé **colonne par colonne sur les 26 existants**, pas supposé. Deux colonnes y diffèrent des valeurs par défaut d'un compte neuf : `actif` (`false` contre `true`) et surtout **`is_agenda_doctor` (`true` contre `false`)**. Cette colonne n'est pas calculée : 23-3 l'a posée **une fois**, par `UPDATE`, sur les comptes de l'époque. Un compte créé après hérite de `false` — il aurait manqué dans la liste des médecins à qui attribuer une garde, **le défaut exact que 23-3 avait corrigé**, invisible jusqu'à ce qu'on cherche son nom dans un menu déroulant.
    - **Garde-fous du script, tous exercés en simulation avant écriture** : adresse et rôle confrontés à Bolt ; **découpage prénom / nom écrit à la main et confronté au nom complet de Bolt** (« Dr Vincent D'ALESIO ») plutôt que déduit ; empreinte au format `$2a$10$`, faute de quoi 8C-1 ne saurait pas la transférer ; aucune autre ligne de mapping ne porte l'adresse ; un compte Orga existant à cette adresse n'est réutilisé que s'il est remplaçant — **l'`UPDATE` lui-même filtre sur `role = 'remplacant'`**, pour qu'aucun chemin ne puisse réécrire le profil d'un associé. L'apostrophe de « D'ALESIO » passe par un littéral échappé : une concaténation naïve aurait cassé la requête. Le mapping est réécrit **à son format exact** (fins de ligne CRLF, sans guillemets) : diff d'une seule ligne.
    - **Résultats** : `23-9` — 8/8 contrôles, relance « rien à faire ». `22-8C-1` — simulation « 1 à transférer, 27 déjà à jour », puis **28/28 empreintes identiques à Bolt, 28/28 adresses confirmées**, relance « 0 à transférer ». `22-8A-1` réel, sans `--go` — **37 profils mappés, 0 inconnu**, 16 gardes à modifier au lieu de 13 et 251 « seulement Orga » au lieu de 254 : ce sont ses 3 gardes, que la copie de test de 8A-2 mettait de côté. **Vérifié garde par garde** : dans Orga, deux sont encore au nom d'**Imane EL GARI** (15 et 18/09) et une est libre (16/09) — il les a reprises dans Bolt, la copie est simplement en retard, la resynchronisation du soir J les lui rendra.
    - **La suite `23-4` a cassé comme elle le devait**, et c'est une bonne nouvelle : lancée avant ajustement, **13/15**, les deux seuls contrôles en rouge étant les deux « 36 médecins », qui lisaient 37. L'effectif en dur est un fil tendu volontaire contre une désignation non décidée. Remplacé par une constante `NB_MEDECINS = 37` commentée et datée, utilisée par les deux contrôles.
    - **Ce que 8C-2 ne fait pas** : il n'ouvre rien. `actif` reste à `false` ; l'activation des **27** remplaçants reste une étape du soir de la bascule.
  - ✓ **8A-2 — FAITE (17/09/2026)** — **La resynchronisation ne réécrit plus l'horaire des gardes depuis Bolt, et J2 Beaune retrouve le sien.** Nouveau script `docs/sql/23-8-agenda-j2-beaune-rejoue-6A-1.sql` (exécuté) ; `22-8A-1` corrigé (étape « 4 bis »). Sept suites rejouées : **125/125**.
    - **Ce que 8D-1 avait pris pour un mystère avait une histoire complète**, reconstituée dans `agenda.activity_log` : le **01/08**, 6A-1 passe J2 Beaune à `14:00-22:00` sur décision de Matthieu et corrige les gardes **à venir**, en laissant les gardes déjà effectuées à `10:00-22:00` parce qu'elles ont réellement eu lieu ainsi. Le **26/08 à 14:32**, les trois lots de la répétition générale de 8A-1 (200 + 200 + 42 : les « 442 gardes mises à jour » de l'époque) remettent **107 gardes J2 Beaune** à `10:00-22:00`, du 03/08 au 31/12/2026. Bolt n'a jamais changé ce créneau, et le script recopiait le texte `shifts.shift_type`. **Personne ne l'a vu** : le rapport de la répétition annonçait un nombre de lignes, pas leur contenu.
    - ⚠ **La contradiction était dans le script lui-même.** Son en-tête pose que « `shift_types` : Orga fait autorité depuis 6A » — mais il recopiait depuis Bolt la **copie texte** de l'horaire que porte chaque garde. L'autorité sur le créneau ne valait donc rien sur son libellé. Sans correction, le soir de la bascule aurait défait la réparation une seconde fois, **noyée dans 104 lignes « à modifier » de plus** — le vrai delta du soir en comptait 13.
    - **Décision de Matthieu (17/09) : `14:00-22:00`, portée du 01/08 maintenue.** Les 146 gardes effectuées avant le 01/08 restent à `10:00-22:00` (149 avec les 3 closes). `23-8` rejoue le bloc 2b de 6A-1 à l'identique — même filtre, même date figée. **Mesuré avant d'écrire : il visait 107 gardes, toutes nommées par le journal, aucune en dehors, et aucune garde du journal ne lui échappait.** Après exécution : 0 garde à 10h depuis le 01/08, 0 garde d'avant touchée.
    - **La règle retenue pour 8A-1 est celle de l'appli** : le libellé est posé quand une garde *entre* dans un créneau, puis n'est plus réécrit. Garde déjà dans Orga et même créneau → le libellé d'Orga fait foi ; créneau changé dans Bolt → horaire déclaré du nouveau créneau ; garde nouvelle → horaire déclaré de son créneau (même expression que `ouvrir_semaines`). *Pourquoi pas simplement « toujours l'horaire déclaré »* : ça aurait réécrit l'historique volontaire des 149 gardes d'avant le 01/08 au prochain passage. *Pourquoi pas retirer `shift_type` des champs recopiés* : une garde insérée depuis Bolt n'aurait alors plus d'horaire du tout.
    - **Prouvé en trois temps, sur une copie de simulation qui ne peut pas écrire** : (1) référence avant toute modification — 13 gardes, 1 conflit, 2 + 38 demandes ; (2) **témoin** après réparation avec l'ancien script — **117** gardes à modifier, le piège est réel ; (3) script corrigé — retour **exact** à la référence, et comparaison **par identifiants** : les 104 gardes sorties de la liste sont toutes J2 Beaune et toutes postérieures au 01/08, aucune n'est entrée, demandes strictement identiques. Les 3 gardes J2 Beaune restant dans les 13 changent dans Bolt pour une autre raison et seront écrites avec le libellé d'Orga. La fonction elle-même est testée à part sur 6 cas fabriqués, dont les deux branches qu'aucune donnée réelle n'exerce aujourd'hui (créneau changé, garde nouvelle).
    - **Bénéfice secondaire** : une garde close côté Orga ne peut plus remonter en faux « conflit à trancher à la main » pour la seule différence de son libellé.
    - ✓ **LEVÉ le jour même par 8C-2, ci-dessus.** ~~BLOQUANT POUR LA BASCULE~~, trouvé en lançant la simulation : **Dr Vincent D'ALESIO.** Compte `doctor` créé dans Bolt le **03/09/2026**, connecté le 11/09, adresse `vincent.dalesio@orange.fr`, **3 gardes attribuées**, aucune demande. **Aucun compte Orga, aucune ligne de mapping.** La resynchronisation s'arrête et le nomme — c'est son garde-fou, et il fonctionne. À faire avant la bascule, **rôle à confirmer par Matthieu** (Bolt ne distingue pas associé et remplaçant, tous `doctor`) : créer son compte dans Orga sur le modèle de 7B-2 (auth + profil, `actif = false`), l'ajouter à `docs/mapping-comptes-agenda.csv`, puis lui transférer son mot de passe Bolt par `22-8C-1` — qui sélectionne ses comptes par le statut `REMPLACANT_A_CREER` du mapping, ou par la liste nommée `INCLUS_EN_PLUS` pour une exception. La simulation de vérification de 8A-2 l'a mis de côté par une copie de test, **le vrai script n'a pas été touché sur ce point**.
  - ✓ **8D — FAITE (03/09/2026)** — **Retouches d'UI des vues médecin, décidées en regardant l'appli sur un téléphone.** Trois sous-étapes demandées par Matthieu au fil de la séance, chacune validée en réel avant la suivante. Sept suites rejouées : **125/125**.
    - **Le dispositif compte autant que le résultat** : un serveur de développement exposé sur le réseau local (`npm run dev -- --host`, port dédié pour ne pas toucher aux instances déjà ouvertes) a permis à Matthieu de regarder chaque modification **sur son propre téléphone, en direct**, le rechargement à chaud faisant le reste. Les vues médecin sont pensées mobile-first : un navigateur d'ordinateur rétréci ne donne ni les vraies zones tactiles, ni le vrai passage à la ligne. Trois des quatre demandes de la séance sont nées de ce coup d'œil, pas d'une relecture de code. **À refaire pour toute retouche d'UI des vues médecin.** Le pare-feu macOS étant désactivé, aucune autorisation à accorder ; le service worker ne s'enregistre pas en `http://` hors `localhost` (donc pas d'installation PWA sur cette adresse), ce qui est sans effet sur le rendu — `App.jsx` teste sa présence avant de s'en servir.
    - ✓ **8D-1 — les gardes qui finissent à 22:00 sont des gardes de nuit.** `lib/horaireStyles.ts` : nouvelle règle `fin ≥ 22:00 → marine`, placée après la règle `début ≥ 14:00`. J2 Beaune s'affichait en canard (« journée ») faute de commencer l'après-midi, alors qu'il finit à la même heure que J2 Dijon.
      - **Le seuil est à 22:00 et non à 20:00**, et ce n'est pas un détail : à 20:00 la règle aurait aussi emporté J5 Dijon (`12:00-20:00`, 83 gardes à venir) et les créneaux de week-end (`08:00-20:00`), qui n'ont rien de nocturne. Mesuré sur les **7 plages horaires réellement présentes en base** avant d'écrire la règle, pas déduit des noms de créneaux.
      - **Vérifié en exécutant la vraie fonction**, transpilée avec `sucrase` puis passée sur ces 7 plages en semaine, les mêmes un samedi (le week-end doit continuer de primer), et 5 cas limites — `08:00-21:59` reste canard, `08:00-22:00` bascule, le format `08h-22h` est reconnu, une plage illisible retombe sur « autre ». **19 contrôles.** Une règle de couleur ne se relit pas, elle se joue.
      - ⚠ **Découverte en mesurant : `10:00-22:00` n'est pas un créneau, c'est J2 Beaune qui affiche un horaire périmé.** Les **253 gardes** portant ce texte pointent toutes vers le créneau **J2 Beaune**, dont la plage déclarée dans `shift_types` est **`14:00-22:00`**. Seul cas de désaccord de toute la base (253 gardes sur ~2 700, comparaison faite sur l'ensemble). Cause : `shifts.shift_type` est une **copie texte figée à la création** de la garde, pas une lecture du créneau — même mécanisme que `location` et `room`. Quelqu'un a modifié la plage de J2 Beaune ; les gardes déjà ouvertes ont gardé l'ancien texte. *(Hypothèse du 03/09, **inexacte** : la plage avait été modifiée par 6A-1 sur décision de Matthieu, les gardes à venir corrigées dans la foulée, puis cette correction défaite par la resynchronisation du 26/08 — voir 8A-2.)*
      - ⚠ **L'écart va grandir tout seul.** Les deux chemins de création écrivent la plage *déclarée* : `CreateShiftModal` (`shift_type: selectedShiftType.time_range`) et la fonction `ouvrir_semaines` (`coalesce(nullif(st.time_range, ''), st.name)`). Toute semaine ouverte désormais sur J2 Beaune produira des gardes à `14:00-22:00`, **à côté des 84 gardes futures qui disent `10:00-22:00`** — deux horaires différents pour le même créneau, dans le même planning.
      - ✓ **CLOS le 17/09/2026 — 14:00-22:00, portée du 01/08 maintenue. Voir 8A-2.** ~~Question métier ouverte, laissée à Matthieu : J2 Beaune commence-t-il à 10h ou à 14h ?~~ Décision du 03/09 : **on ne touche pas aux données pour l'instant**. La correction demandera un script à part, dans un sens ou dans l'autre (corriger la plage déclarée, ou corriger les 253 gardes — dont 84 à venir, déjà lues par des médecins). **La règle de couleur est juste dans les deux cas** (les deux plages finissent à 22:00), donc rien de ce qui a été livré ici ne sera à refaire.
    - ✓ **8D-2 — la couleur du créneau devient un liseré en L, et l'avatar grandit.** `MyScheduleView` et `DailyScheduleView`. Le bandeau plein coloré qui coiffait la date (« Mes gardes ») et le nom du médecin (« Planning du jour ») disparaît : tout passe en marine sur blanc, la couleur se réduit à une **bordure de 3 px sur le bord bas et le bord droit** de la carte.
      - **Trois essais successifs avant de trouver, et c'est le sujet** : bandeau en pied portant l'horaire → liseré de 6 px en bas → liseré en L de 5 px → 3 px. Aucun de ces pas n'était prévisible sur maquette ; chacun venait d'un regard sur l'écran réel. La proposition initiale avait été présentée en trois options ASCII, et **ce n'est pas celle que Matthieu avait choisie qui a été retenue** — il a fallu l'avoir en main.
      - ⚠ **Le piège, vu par Matthieu sur une capture : deux rectangles ne peuvent pas faire un coin arrondi.** La première version posait deux `<div>` colorés (un en bas, un à droite) ; ils se croisaient en **angle droit** dans le coin bas-droit, au milieu d'une carte à coins ronds. Corrigé en passant à une **vraie bordure** (`border-b-[3px] border-r-[3px]` sur un calque en surimpression avec le même `rounded-card`) : seule une bordure épouse un rayon à épaisseur constante. Effet de bord assumé et normal : là où la bordure s'arrête (coins bas-gauche et haut-droit), le navigateur l'estompe en biseau.
      - **Nouveau champ `borderClass` dans `horaireStyles.ts`**, et `bandClass` **supprimé** (plus aucune vue n'affiche de bandeau). Le champ n'a pas été retiré au moment où il est devenu mort mais **à la fin de la séance**, une fois le choix arrêté : le supprimer plus tôt aurait obligé à le réécrire à chaque essai.
      - ⚠ **Contrôle indispensable : Tailwind génère-t-il vraiment ces classes ?** Les six `border-<couleur>` et les largeurs arbitraires ont été cherchées **dans la feuille CSS servie**, pas supposées. C'est le piège documenté en tête du fichier : une classe non générée donne un liseré **invisible**, sans la moindre erreur.
      - **Avatar de « Planning du jour » : 52 → 72 px, sans retirer un pixel au texte.** 72 est la taille de `MedecinCard` (trombinoscope), dont cette carte reprend déjà le pattern depuis 4E — reprendre le nombre existant plutôt qu'en inventer un. La place a été prise sur le padding : `12 (pl) + 72 + 16 (px de la colonne droite) = 100 px`, exactement l'ancien `16 + 52 + 16 + 16`. Le texte démarre au même endroit qu'avant, aucun mot ne passe à la ligne à cause du changement. Un `py-3` a été ajouté à la colonne de l'avatar : la hauteur de la carte est dictée par la colonne de texte (~104 px sur mobile où les infos passent à la ligne, mais ~76 px sur écran large où elles tiennent sur une ligne), et sans lui un avatar de 72 px aurait touché les bords haut et bas sur grand écran.
    - ✓ **8D-3 — l'onglet d'accueil dépend du rôle applicatif, plus seulement du rôle agenda.** Les **9 associés** arrivent sur **Planning du jour** (barre : Planning du jour · Mes gardes · Ouvertures), les **26 remplaçants** gardent **Ouvertures** en premier (barre inchangée). Le coordinateur n'est pas concerné : il reste sur Validation (8B-2).
      - **Le module ne pouvait pas faire cette distinction.** Côté agenda, associés et remplaçants sont **tous `doctor`** — le rôle du module porte les permissions, pas le statut au cabinet. L'information est dans le rôle applicatif Orga, d'où une fonction `estAssocieOrga()` ajoutée à `lib/userAdapter.ts`, le fichier qui possède déjà la traduction Orga → agenda. Même esprit que `is_agenda_doctor` en 23-3 : on ne déduit pas un statut d'un rôle qui ne le porte pas.
      - **Mesuré avant d'écrire** : la base contient exactement **5** valeurs de rôle — `associe` (6), `associe_gerant` (3), `remplacant` (26), `super_admin` (2), `poste_bureau` (1, exclu du module). 6 + 3 = les 9 associés annoncés. Aucune valeur ne tombe dans un cas non prévu.
      - **L'onglet d'accueil EST désormais le premier onglet de la barre, par construction** (`vueParDefaut` appelle `ongletsVisibles` et prend `[0]`). Les deux vivaient jusqu'ici dans deux fichiers différents — c'est exactement ce que 8B-2 avait dû corriger. Réordonner les onglets suffit maintenant, l'accueil suit. La `vueParDefaut` locale d'`App.tsx` a disparu au profit de celle exportée par `AgendaHeader`.
      - **Ordre nommé, jamais renversé** : l'ordre associé est aujourd'hui l'exact inverse de l'ordre remplaçant, et un `.reverse()` aurait suffi — mais un quatrième onglet médecin ajouté plus tard s'y retrouverait à une place que personne n'a choisie. Un tableau `ORDRE_ASSOCIE` nomme les trois onglets ; tout onglet non nommé part en fin de barre, visiblement, le tri de JS étant stable.
      - **Vérifié en exécutant les vraies fonctions sur le vrai tableau `TABS`** (transpilé, imports de rendu neutralisés) : **13 contrôles** — l'ordre des trois barres, la non-régression du coordinateur, l'égalité « accueil = premier onglet » dans les quatre combinaisons, l'absence d'onglet perdu ou dupliqué par le tri, et le repli sur `calendar`. **Ce repli n'est pas décoratif** : le `main` d'`App.tsx` ne rend **rien** quand l'onglet courant ne correspond pas au rôle — un accueil mal choisi donne un écran blanc sous le header, sans erreur. C'est le piège relevé en 8B-2.
      - **Aucun droit accordé** : l'ordre des onglets est de l'affichage. La RLS ne connaît pas cette notion, et un associé n'accède à rien de plus qu'avant.
  - ✓ **8C-1 — FAITE (31/08-03/09/2026)** — **Les remplaçants garderont le mot de passe qu'ils connaissent.** Question de Matthieu : peut-on transférer les identifiants Bolt vers la nouvelle appli ? Oui. Nouveaux fichiers `docs/sql/22-8C-1-transfert-mots-de-passe.py` et `22-8C-1b-repetition-transfert-mots-de-passe.py`. **27 comptes transférés, 27/27 vérifiés.** Sept suites rejouées avant et après l'écriture : **125/125**.
    - **Le problème que ça résout** : 7B-2 a créé les 26 comptes avec un mot de passe **aléatoire, jamais conservé**. En l'état, aucun remplaçant ne pouvait entrer. Le plan prévoyait 26 courriels de réinitialisation le soir de la bascule — avec la certitude que quelques-uns ne les traiteraient pas et appelleraient, un soir précisément choisi pour être calme.
    - **Pourquoi c'est possible, et sans jamais connaître le mot de passe** : Supabase ne stocke pas un mot de passe mais une **empreinte bcrypt**, et cette empreinte est *autoportante* — la chaîne `$2a$10$...` contient l'algorithme, son coût, le sel et le condensé. Aucune clé secrète propre au projet n'entre dans le calcul. Recopier la chaîne d'une base à l'autre suffit. Vérifié avant d'écrire : les 27 comptes Bolt sont tous en `$2a$10$`, aucun dans un autre format.
    - ⚠ **`email_confirmed_at` n'était pas une précaution, mais la condition de tout.** Transporté au départ « au cas où », il s'est révélé **indispensable** quand 8C-1b a mesuré au lieu de supposer : sans lui, la connexion est refusée en **HTTP 400 « Email not confirmed »**, les comptes de 7B-2 ayant été créés avec `email_confirm=false`. Sans cette colonne, transférer les 27 mots de passe n'aurait ouvert **exactement rien**, sur un message qui n'en dit pas la raison. `confirmed_at` n'est en revanche jamais écrit : c'est une colonne générée par Postgres.
    - **8C-1b — prouver la connexion, pas la copie.** La vérification de 8C-1 compare les empreintes : elle prouve que la copie a eu lieu, **pas qu'on peut se connecter**. Or personne au cabinet ne connaît le mot de passe d'un remplaçant, donc personne ne pouvait le tester. D'où un script qui fabrique deux comptes jetables dont il **choisit** les mots de passe et déroule la preuve de bout en bout — la cible accepte son mot de passe, refuse celui de la source, on copie l'empreinte, **la cible accepte désormais le mot de passe de la source**, et refuse l'ancien. **9/9.** Les deux premiers contrôles sont des témoins : sans eux, un succès final ne prouverait rien, un compte qui accepte tout donnerait le même vert. Comptes supprimés en `finally`, disparition vérifiée indépendamment du script.
    - ⚠ **Une personne aurait été bloquée le soir J, et ce n'était pas un remplaçant.** L'audit déclenché par une remarque de Matthieu — « les associés ont un compte différent sur les deux applis » — a montré que **Dr Imane EL GARI**, associée, active sur Bolt (31/07/2026), ne s'était **jamais** connectée à Orga. Son compte existait, actif et confirmé, avec un mot de passe qu'elle n'avait jamais utilisé. Avoir un compte ne veut pas dire pouvoir entrer. Elle est incluse au transfert : même adresse des deux côtés, et un mot de passe que personne ne possédait.
    - **Une liste nommée, jamais un filtre élargi** (`INCLUS_EN_PLUS`). Élargir le filtre à `ASSOCIE_MAPPE` aurait embarqué les 9 autres associés, qui se servent de leur compte Orga tous les jours (connexions de juin à août 2026) : leur écraser leur mot de passe par celui de Bolt leur **retirerait** l'accès à l'appli qu'ils utilisent. La liste nommée rend cette erreur impossible par inadvertance, et chaque ajout est vérifié contre le mapping (adresse connue, identique des deux côtés, pas déjà dans les 26). **Contrôle après écriture : sur les 7 associés comparables, 0 empreinte écrasée, 7 intactes.**
    - **Ce que le script ne fait pas** : il n'ouvre l'appli à personne. `profiles.actif` reste à `false` pour les 26 — c'est la porte de l'appli, distincte de celle de Supabase — ce qui permet de jouer cette sous-étape **avant** le soir de la bascule au lieu de l'y ajouter. Seule Imane, associée au profil déjà actif, retrouve un accès immédiat ; le script le signale nommément. Il ne fait que des `UPDATE` sur des lignes nommées, ne crée ni ne supprime aucun compte, et n'écrit jamais dans Bolt. Relancé, il annonce « rien à faire » — idempotent, vérifié.
    - **Deux défauts trouvés en exécutant** : un jeton `service_role` forgé est rejeté en `Invalid API key` — le projet valide l'en-tête `apikey` contre ses **vraies** clés, mais accepte un `Authorization` signé avec le secret JWT (le partage des rôles qu'exploite déjà le harnais de test) ; et un `26` codé en dur dans le message d'idempotence, devenu faux avec le 27e compte.
    - **Pour l'annonce de bascule, relevé au passage** : Xavier BAUDRILLART a **deux adresses différentes** (`@icloud.com` sur Bolt, `@hotmail.fr` sur Orga) — il se connecte à Orga sans souci, mais échouera s'il tente l'adresse iCloud ; le compte générique `contact@omnesmedecins.fr`, encore utilisé le 11/08, disparaît avec Bolt ; et le mot de passe choisi pour un outil de planning ouvre désormais **toute l'appli du cabinet**, ce qui justifie d'inviter au changement.
    - **Observation hors sujet** : 46 comptes `auth.users` pour 38 profils. Les 8 sans profil sont des comptes d'essai de mai-juin 2026, antérieurs à l'agenda, aucune personne réelle. Sans risque pour la bascule, à nettoyer un jour.
  - ✓ **8B-3 — FAITE (28/08/2026)** — **Le planning s'imprime, à la disposition de l'écran.** L'export « Matrice » produisait un CSV que le tableur affichait sans mise en forme ; il est remplacé par un document HTML autonome, en noir et blanc, une semaine par page. Nouveau fichier `lib/printPlanning.ts`. Sept suites rejouées : **125/125**.
    - **Deux défauts du format matrice, visibles sur la capture de Matthieu** : les libellés de lignes **répétaient le site** (« J1 BEAUNE **BEAUNE** » — le nom du créneau le porte déjà, et le code le recollait derrière), et surtout, une garde non pourvue écrivait le **nombre de demandes en attente à la place du nom**. D'où le « 1 » isolé au milieu d'une colonne de noms propres : ce n'était pas une donnée aberrante mais un compteur, sans rien pour le signaler. Le document imprimable écrit « 2 demandes » ou « libre » — un mot accompagne toujours le chiffre.
    - **Aucune dépendance ajoutée, et c'est le point d'architecture.** Produire un PDF supposerait une bibliothèque (jsPDF…), donc une installation. Or le navigateur sait déjà imprimer une page **et** proposer « Enregistrer au format PDF » dans sa propre boîte d'impression : on obtient le PDF sans rien ajouter au projet. Le document porte ses styles en ligne, `@page` en A4 paysage, et un saut de page par semaine.
    - ⚠ **La fenêtre s'ouvre AVANT le chargement des données**, et l'ordre n'est pas cosmétique : ouverte après un `await`, elle serait bloquée comme une fenêtre publicitaire — le droit d'ouvrir un onglet vient du clic et ne survit pas à l'attente réseau, Safari étant le plus strict. La modale ouvre donc la fenêtre, y écrit « Préparation… », puis y injecte le document une fois les gardes chargées. Si le navigateur bloque malgré tout, le message le dit au lieu d'échouer en silence.
    - **Le seul bouton du document disparaît à l'impression** (`@media print`) : c'est la demande de Matthieu — « sans les boutons du haut ».
    - **Éprouvé en exécutant, pas en relisant** : le générateur a été bundlé avec des données factices et son HTML inspecté. Ce que la relecture n'aurait pas donné — l'échappement d'un nom contenant `<`, `&` et des guillemets (toute la page est construite par concaténation de chaînes, or un nom de médecin ou une note de coordination sont de la saisie libre) ; le bornage des colonnes à la période demandée (une période finissant un mardi ne fabrique pas cinq colonnes vides) ; et le cas d'une **semaine intermédiaire sans aucune garde**, qui produisait un tableau aux en-têtes vides — elle garde désormais sa page et l'annonce, un tableau vide laissant croire à un défaut d'impression.
    - **Le CSV « Liste » est conservé** : il n'a pas le même usage — une ligne par garde, avec filtres, pour retravailler les données dans un tableur. Ce n'est pas un doublon de l'impression, contrairement à la matrice.
  - ✓ **8B-2 — FAITE (27/08/2026)** — **Les onglets disent le geste : « Validation » et « Ouvertures ».** Demande de Matthieu, qui trouvait « Calendrier » et « Demandes » mal adaptés à ce qu'il en fait. Sept suites rejouées : **125/125**.
    - **Les libellés seuls changent, et c'est ce qui rend l'opération sûre** : dans `AgendaHeader`, chaque onglet porte un `view` (`'calendar'`, `'requests'`) **et** un `label` ; seul le second s'affiche, le premier pilote tout le rendu. Rien en base, aucune policy, aucune des 7 suites (elles passent par PostgREST, jamais par l'écran).
    - **La vraie raison pour laquelle les noms sonnaient faux** : les deux onglets rendent **la même grille `WeekView`, sous le même titre « Calendrier des gardes »**. Ce qui les sépare tient à trois détails — la barre d'ouverture d'un côté, le bouton d'attribution en masse de l'autre, et surtout `hideValidation={true}` dans l'onglet Calendrier. **La distinction réelle n'était pas *calendrier / demandes* mais *ce que j'ouvre / ce que je valide*.** Renommer les onglets sans toucher aux deux `<h2>` identiques aurait déplacé l'ambiguïté d'un cran : on aurait cliqué sur « Validation » pour arriver sur « Calendrier des gardes ». Ils deviennent « Validation des demandes » et « Ouverture des gardes » — ce dernier titré **« Gardes ouvertes » côté médecin**, le composant servant les deux rôles.
    - **Le code disait déjà « validation ».** Le commentaire de `PendingRequestsList` — « la validation se fait alors depuis l'onglet Demandes » — et le `hideValidation` du calendrier nommaient cet onglet par son geste bien avant son libellé. Le renommage met sur le bouton ce que le code disait tout bas.
    - ⚠ **Le piège de l'onglet d'accueil : un écran vide, sans la moindre erreur.** `currentView` était une constante `'calendar'` pour tout le monde. Or le `main` ne rend **rien** quand l'onglet courant ne correspond pas au rôle, et « Validation » n'existe pas pour un médecin : poser `'requests'` en défaut brut aurait donné un écran blanc sous le header à tous les remplaçants, sans exception ni message. D'où `vueParDefaut(role)`, avec repli sur `calendar`, seul onglet commun.
    - **Second effet, plus discret, et qui concerne Matthieu en particulier** : `handleViewAsChange` remettait l'onglet sur `'calendar'` à chaque bascule Coordination/Médecin. Comme il jongle entre les deux, il serait revenu **systématiquement sur le second onglet**, ce qui annulait le bénéfice du changement. La bascule renvoie désormais vers l'onglet d'accueil du rôle choisi.
    - **L'ordre d'affichage suit l'ordre du tableau `TABS`**, que le filtre par rôle conserve : déplacer une ligne suffit, et l'ordre vu par un médecin ne bouge pas — il n'a pas cet onglet. Les onglets étant un `useState` et non des routes, aucune URL n'est concernée.
    - **Corrigé au passage, deux renvois vers des onglets** : `RequestsCalendarView` invitait à créer des gardes « depuis l'onglet **Planning** », un onglet qui n'a jamais existé dans ce module (reliquat de l'appli Bolt) ; et `PendingRequestsList` renvoyait à « l'onglet Demandes » par son nom.
  - ✓ **8B-1 — FAITE (27/08/2026)** — **La duplication de modèle est supprimée ; « Ouvrir des semaines » est le seul chemin d'ouverture.** Relevé par Matthieu en regardant la barre d'outils de la vue Semaine : deux boutons ouvraient des semaines en y posant le roulement. Sept suites de test rejouées : **125/125**.
    - **Ce n'était pas qu'un doublon.** L'audit a montré que le chemin retiré était **inférieur sur trois points**, et que deux d'entre eux annulaient des corrections déjà livrées : `duplicateWeekTemplate` n'avait **aucune notion de jour férié** (un 25 décembre ouvrait les consultations ordinaires — le trou que 6H-2 avait bouché), et **n'ouvrait pas les gardes du roulement absentes de la semaine type** (sa boucle ne parcourt que les items du modèle — le modèle d'ouverture que 6H-3 avait rétabli). Troisième point, mineur : elle écrivait **sans aperçu**, là où `ouvrir_semaines` affiche total / affectées / libres / fériés avant d'écrire. **Garder ce bouton, c'était garder une porte qui contourne les deux corrections.**
    - **Ce qu'on perd, nommé plutôt que découvert plus tard** : la duplication reprenait la **salle enregistrée dans le modèle**, `ouvrir_semaines` prend `shift_types.default_room_id`. Écart mesuré nul en pratique (contrôle de 6H : 42/42 gardes dans la salle par défaut de leur créneau), mais la conséquence est que `opening_week_template_items.room_id` devient une colonne **écrite et plus jamais lue** — le texte de la modale d'enregistrement, qui promettait de retenir les salles, a été corrigé en conséquence. Second écart : la période se compte désormais en **semaines entières** (1 à 52), plus en date de fin libre.
    - ⚠ **Le piège de cette suppression, repéré avant de toucher au code** : la barre d'outils entière était conditionnée à `onDuplicateTemplate` (`WeekView`). Retirer la prop sans corriger la garde **faisait disparaître les quatre boutons, dont « Ouvrir des semaines »** — sans erreur, sans échec de build. La barre ne dépend plus que de `onOpenWeeks`, le seul bouton qui ouvre des gardes, et chaque bouton secondaire porte sa propre garde. Un commentaire le dit sur place.
    - **Aucune migration.** Les tables `opening_week_templates` / `opening_week_template_items` restent : ce sont les semaines types que consomme `ouvrir_semaines`. Aucune des 7 suites ne touchait à la duplication — vérifié avant, pas supposé.
    - ✓ **8B-1b — le bandeau couvre enfin l'ouverture.** `handleDuplicateTemplate` était le **seul** appel à `signalerAction` du calendrier, alors que « Ouvrir des semaines » écrit bien davantage — plusieurs centaines de gardes — **et le faisait en silence**. `onOpened` remonte désormais le nombre de gardes du rapport de vérification, et l'appelant en fait un bandeau avec « Annuler ». L'annulation fonctionne par construction : `restaurer_action` pose `deleted_at` sur un `INSERT` de gardes — c'est exactement ce qui avait défait la duplication du 06/08, et qui a laissé les 81 gardes de janvier 2027 en suppression douce.
    - ✓ **8B-1c — « modèle » devient « semaine type ».** Le mot « modèle » avait un sens tant qu'on le *dupliquait* ; l'écran qui les consomme disait « semaine type » partout. Les deux boutons conservés, les titres et messages des deux modales, et les deux bandeaux sont alignés. Même esprit que MOD2-F-1 : un mot, un geste.
  - ✓ **8A-1 — La resynchronisation différentielle** : `docs/sql/22-8A-1-resynchronisation-differentielle.py`, **écrit, exécuté et éprouvé sur les données réelles le 26/08/2026**. Remplace 7F, devenu destructeur (voir l'étape 7).
    - **L'argument de 7F s'est inversé.** Il justifiait la recopie complète par « c'est plus sûr qu'un différentiel ». Vrai le 31/07, quand la copie n'était qu'une copie ; faux dès le lendemain, la copie ayant divergé volontairement à partir de 6A. Mesure du 26/08 : **2 681 gardes communes, 2 seulement dans Bolt, 126 seulement dans Orga** (45 ouvertes par MOD-1 en septembre-novembre 2026, 81 de janvier 2027 en suppression douce). 7F les détruirait.
    - **Le nouveau script ne touche qu'à `shifts` et `requests`** — les seules tables dont Bolt possède encore quelque chose. `sites`, `rooms`, `shift_types` sont figés (Orga fait autorité depuis 6A) ; c'est possible parce que **les identifiants sont partagés** : les 15 créneaux, 2 sites et 12 salles de Bolt existent tous côté Orga avec le **même `id`** — vérifié, pas supposé. `deleted_at` n'est jamais écrasé.
    - **Il ne supprime jamais rien.** Une ligne absente de Bolt peut être du travail fait dans Orga pendant la bêta ; rien ne permet de la distinguer d'une suppression faite dans Bolt. Il les compte et les affiche, la décision reste humaine.
    - **Répétition générale réussie** (Charlotte étant en congés, le delta était figé) : **442 gardes et 203 demandes mises à jour, 185 demandes insérées**. Le différentiel est ensuite **vide** — le script est idempotent. Les 126 gardes propres à Orga et les 235 suppressions douces ont survécu. Sept suites de test : 125/125.
    - ⚠ **Trois défauts trouvés en exécutant, aucun en relisant** — la même leçon que MOD-2 :
      1. **`update ... from (values …)` type ses colonnes en `text`**, et Postgres refuse d'écrire dans une colonne `date` ou `uuid`. Le piège était anticipé en commentaire, mais seul l'`id` avait été casté. Les types sont désormais **lus dans le catalogue** plutôt qu'écrits en dur.
      2. **`unique_doctor_per_day` rejetait le lot entier.** Quand Charlotte déplace un médecin de salle le même jour, le lot contient à la fois la libération et l'attribution, et l'index est vérifié **ligne à ligne** : l'attribution se heurte à l'ancienne ligne encore en place. Constaté en réel — Dr Mireille YUAN, 11/08, Cabinet B5 → B2. Corrigé en **libérant avant d'attribuer**, exactement comme `restaurer_action` traite les demandes avant les gardes (MOD2-D). Toute permutation se résout ainsi, y compris un échange.
      3. **`23-5` ne savait nettoyer qu'une fois** : son bloc de clôture des demandes orphelines exigeait `s.deleted_at is null`, condition sans effet au premier passage mais bloquante dès le second, les gardes étant closes entre-temps. 37 demandes redevenues irrattrapables. Signalé par son propre contrôle.
    - **Ordre des opérations, éprouvé et à rejouer tel quel le soir de la bascule** :
      0. *(ajouté le 17/09)* `22-8A-1-resynchronisation-differentielle.py` **sans `--go`** : si un compte a été créé dans Bolt depuis la dernière fois, le script s'arrête et le nomme. Le créer dans Orga, compléter `docs/mapping-comptes-agenda.csv`, et relancer la simulation jusqu'à ce qu'elle passe. Procédé outillé depuis le 17/09 : ajouter la personne à la liste nommée de `23-9-agenda-integrer-remplacant.py`, puis `22-8C-1` pour son mot de passe (voir 8C-2). Premier cas traité ainsi : Dr Vincent D'ALESIO.
      1. `22-8A-1-resynchronisation-differentielle.py --go`
      2. `23-6-comparer-roulement-bolt-plan-v1.py` → confirmer zéro écart, puis 6C-4
      3. `23-5-agenda-cloture-gardes-non-pourvues.sql`
      L'ordre n'est pas indifférent : clore avant de resynchroniser ferme des gardes que Bolt a pourvues entre-temps, **et la resynchronisation ne réveille jamais une garde close**. Le cas s'est produit le 26/08 (garde du 11/08, Cabinet B2, close à tort puis rouverte à la main — 1 sur 155).
      ⚠ *(17/09)* **Séquence complétée par 8E** : gel de Bolt avant l'étape 1, et 8A-1 rejoué sans `--go` juste après l'étape 1 pour prouver que Bolt n'a plus bougé. Voir le plan arrêté dans 8E.
    - **Reste à trancher à la main le soir J** : le script **nomme** les conflits — gardes closes côté Orga que Bolt voit autrement. Il en restait 1 au 26/08, bénin.

- ⏳ **Étape 7 — EN COURS (à partir du 30/07/2026)** — Migration vers la base Omnès-Orga, réalisée **avant** l'étape 6 (justification dans l'encadré du plan ci-dessus). Le suivi détaillé de cette étape vit dans un document dédié : **`docs/migration-agenda-etape7.md`** (inventaire du schéma réel, écarts relevés, décisions d'architecture, découpage 7A → 7F).
  - ⚠ **7F — FAITE (31/07/2026), mais DEVENUE DESTRUCTRICE — ne pas l'exécuter en l'état** — **Script de resynchronisation** `docs/sql/22-7F-resynchronisation-agenda.py` : recopie complète (plus sûre qu'un différentiel à ce volume), simulation par défaut, `--go` pour exécuter. Garde-fous : refuse de tourner si un profil créé dans Bolt manque au mapping ou si l'historique Planning est incohérent. Testé en réel le 31/07 : 5 669 lignes réimportées, aucune dérive.
    - ⚠ **Constat du 26/08/2026 — le script ne peut plus être lancé tel quel.** Il fait une **purge puis recopie** de 13 tables, dont `sites`, `rooms`, `shift_types`, `shifts` et `requests`. C'était sans danger le 31/07 ; ça ne l'est plus depuis le **lendemain**, car la copie Orga a divergé de Planning **volontairement** à partir de 6A. Mesuré en lecture seule sur les deux bases : `shift_types` = **15 côté Planning, 19 côté Orga** ; `shifts` = 2 683 contre 2 807.
    - **Ce qu'une exécution détruirait aujourd'hui** : les 4 créneaux de Beaune créés par `22-6A-2` (J4, J6, J7, J8 — dont J6 Beaune, remis le 26/08) ; les renommages de `22-6A-1` (Bolt a toujours `Pré J2 Dijon `, `WE1 Dijon ` et `WE 2 Dijon ` avec leurs espaces parasites) ; et **tous les `deleted_at`** de MOD2-B, la colonne n'existant pas côté Planning — dont les 155 gardes non pourvues closes par `23-5`.
    - ✓ **RÉGLÉ le 26/08/2026 — remplacé par `22-8A-1-resynchronisation-differentielle.py`**, écrit, exécuté et éprouvé le jour même. **7F ne doit plus jamais être lancé.** Détail ci-dessous.
    - La phrase « sert aussi à rafraîchir la copie de travail à la demande » **était vraie à l'écriture et ne l'est plus** : elle est conservée ici barrée du sens, pas supprimée, parce que c'est exactement le genre d'affirmation périmée qui fait commettre l'erreur.
  - ✓ **7E — FAITE (31/07/2026)** — **Le module lit désormais la base Omnès-Orga.** Schéma `agenda` exposé dans l'API (redémarrage PostgREST effectué, appli principale vérifiée intacte, `anon` refusé sur le schéma). Client unique scopé via `.schema('agenda')` : les ~40 fichiers du module sont inchangés. **Écran de liaison, session Planning et variables `VITE_AGENDA_*` supprimés** — l'utilisateur connecté à Omnès-Orga est l'utilisateur de l'agenda, avec le rôle déduit de `is_agenda_coordinator`. **Les vraies photos des médecins s'affichent** (9 des 33 médecins du planning en ont une). Découverte : le temps réel n'a **jamais** fonctionné, dans aucune des deux applis — corrigé côté code, activation proposée en étape 8.
  - ✓ **7D — FAITE (30/07/2026)** — **5 664 lignes importées** dans le schéma `agenda` (2 681 gardes, 2 481 demandes, 282 règles de roulement…), identifiants de profils remappés, trigger métier désactivé pendant l'import puis réactivé. Contrôles préalables et postérieurs tous au vert (0 orpheline, 0 incohérence de statut). Découverte : `Coordinateur Admin` n'était pas un compte de test mais **le compte de travail de Charlotte** (259 gardes, les 282 règles de roulement, 2 modèles) — tout lui a été rattaché nominativement. **La copie est déjà périmée** : Charlotte a validé 199 demandes pendant l'import, ce qui confirme la nécessité du script de resynchronisation 7F.
  - ✓ **7C — FAITE (30/07/2026)** — Schéma `agenda` complet dans la base Omnès-Orga : **14 tables et 75 index** (7C-1, identiques au schéma Planning colonne par colonne), **2 fonctions et 10 triggers** dont le circuit métier `update_shift_status` migré à l'identique et testé de bout en bout (7C-2), **57 policies RLS** exprimées via deux fonctions centralisées `peut_acceder()` / `est_coordinateur()` et validées par usurpation d'identité (7C-3). Charlotte Franzino désignée coordinatrice. Le schéma n'est **pas encore exposé** dans l'API : aucun impact sur l'appli principale. Détail dans `migration-agenda-etape7.md`.
  - ✓ **7B-2 — FAITE (30/07/2026)** — **26 comptes de remplaçants créés** dans Omnès-Orga, 0 échec : compte d'authentification (mot de passe aléatoire, `email_confirm: false`, **aucun email envoyé**) puis profil complété en `actif = false`. Créés dès maintenant car `profiles.id` est une clé étrangère vers `auth.users` : sans eux, l'import des 2 684 gardes échouerait. L'étape 8 se limitera à les activer. **Aucun effet visible pour les associés** (trombinoscope toujours à 10 médecins — tous les écrans filtrent sur `actif = true`). Mapping complet : les 35 lignes à migrer ont un identifiant cible.
  - ✓ **7B-1 — FAITE (30/07/2026)** — Correspondance des comptes établie : 9 associés rapprochés (dont Xavier Baudrillart, arbitré manuellement — double adresse), **26 comptes de remplaçants à créer**, 4 comptes de test écartés (1 garde et 4 demandes de test abandonnées). Fichier `docs/mapping-comptes-agenda.csv`. Deux questions ouvertes de la checklist sont tranchées au passage : la correspondance initiales → comptes pour MOD-1, et le fait que **les associés gérants n'ont pas les droits coordinateur** (Charlotte Franzino sera la seule coordinatrice).
  - ✓ **7A — FAITE (30/07/2026)** — Inventaire du schéma Planning de production relevé en lecture seule via l'API Management, recoupé avec les 34 migrations d'origine. 15 tables à migrer (~5 700 lignes), 65 policies RLS à réécrire, 58 index, 5 fonctions, 9 triggers. **8 écarts ou défauts** documentés avec leur décision (table `events` orpheline écartée, `shifts` dénormalisée conservée en l'état, `CHECK` figeant les sites à Dijon/Beaune supprimé, clés étrangères vers `auth.users` uniformisées vers `profiles`, triggers `updated_at` manquants ajoutés, policies en double dédupliquées). **Architecture retenue** : schéma dédié `agenda` + vue `agenda.profiles` traduisant `public.profiles` au format attendu par le module + colonne `is_agenda_coordinator`. Découverte annexe : les `shift_types` ne correspondent pas aux codes du fichier Excel (voir la checklist plus bas).

---

## Modifications fonctionnelles souhaitées

### MOD-1 — Refonte du système de rotation automatique + import du fichier Excel de roulement

#### Le système actuel (à comprendre avant de le remplacer)

Deux tables :

```
rotation_settings          → 1 seule ligne : start_date + cycle_length_weeks (défaut 8)
rotation_assignment_rules  → 1 ligne par case du roulement :
                             doctor_id, site_id, room_id, shift_type_id,
                             weekday (0-6), rotation_week (1..N)
                             UNIQUE(site_id, room_id, shift_type_id, weekday, rotation_week)
```

Calcul (`src/lib/rotationUtils.ts` → `getRotationWeek`) : on prend le lundi de la semaine visée, on compte le nombre de semaines écoulées depuis `start_date`, modulo `cycle_length_weeks`, +1.

#### Les 4 défauts de conception à corriger

1. **Aucune historisation.** Les règles n'ont ni `valid_from` ni `valid_to`. Modifier le roulement écrase l'ancien : impossible de savoir quel roulement s'appliquait en mars dernier, ni de préparer à l'avance un nouveau roulement qui démarrera en septembre.
2. **Changer la durée du cycle rebat toutes les cartes.** Comme la semaine de rotation est un modulo à partir d'une date fixe, passer le cycle de 8 à 9 semaines (parce qu'un médecin s'associe) décale rétroactivement **toutes** les semaines, passées et futures. La migration `reset_rotation_assignments` présente dans le dépôt suggère que ce problème a déjà été rencontré. C'est le défaut le plus grave au regard du besoin exprimé (association d'un nouveau médecin).
3. **Saisie case par case uniquement.** Aucun import en masse. Avec 8 semaines × 5 jours × plusieurs salles × plusieurs créneaux, cela représente potentiellement des centaines de saisies manuelles, alors que la source de vérité du cabinet est **un fichier Excel**.
4. **Contrainte UNIQUE trop rigide.** Une seule case = un seul médecin. Impossible d'exprimer « deux médecins sur ce créneau » ni « personne cette semaine-là ».

#### ⚠️ Principe directeur, posé par Matthieu le 01/08/2026 : une seule vérité

> « J'aimerais qu'il n'y ait qu'une seule vérité : faire les modifications depuis
> le fichier Excel (ou autre format), décider d'une date de mise en œuvre, et que
> le planning soit toujours égal à notre fichier validé. »

Ce principe commande toute la conception de MOD-1. Il demande une distinction
sans laquelle on vise à côté :

- **Le plan de roulement** (qui est censé travailler tel jour de telle semaine du
  cycle) → le fichier est l'unique vérité, sans réserve.
- **Le planning réel** (les gardes effectives) → l'égalité stricte est impossible
  *et non souhaitable* : maladie, échange entre associés, remplaçant prenant une
  garde libre. C'est précisément le rôle du circuit demandes/remplaçants.

**Formulation qui tient : le plan est la vérité, le planning en découle par
génération, et tout écart du réel est visible plutôt que silencieux.** C'est ce
dernier point qui manque aujourd'hui — la dérive s'est installée sans que
personne ne la voie.

##### Le roulement devient en lecture seule dans l'application

**Décision de Matthieu (01/08/2026) : « plan verrouillé + aide au report ».**

L'application ne modifie **plus jamais** le plan de roulement. La fonction
« appliquer à la semaine de roulement » (`useShiftDetail`, `AssignDoctorModal`)
en est retirée : c'est elle qui a fait diverger la base du fichier.

En contrepartie — et c'est la condition pour que ce soit tenable au quotidien —
l'application doit offrir un **chemin de retour vers le fichier** : quand
Charlotte veut un changement permanent, elle l'enregistre comme *modification
souhaitée*, et un écran les récapitule pour qu'elle les reporte dans l'Excel
avant le prochain import. Sans ce chemin, le verrouillage se paierait en
rouvertures de Numbers pour le moindre ajustement, et finirait contourné.

À conserver en revanche : changer le médecin d'**une garde précise**. C'est une
opération sur le planning réel, pas sur le plan — elle reste nécessaire.

##### Diagnostic de la dérive (relevé le 01/08/2026)

Comparaison des 282 `rotation_assignment_rules` au fichier `planning-actuel_2025-12.xlsx` :
**27 écarts, qui recouvrent trois réalités distinctes.**

| Nature | Nombre | Détail |
|---|---:|---|
| **Vestige de modélisation** | **14** | Règles `J3 Dijon` du samedi et du dimanche, créées les 11–15/12/2025. **Ce n'est pas une dérive du roulement** : avant septembre 2026, le créneau week-end de Dijon n'existait pas et la garde était enregistrée sur un créneau de journée. Vérifié dans les gardes : `J3 Dijon` le week-end de janvier à août 2026 (68 gardes), puis `WE1 Dijon` de septembre à janvier 2027 (36 gardes). Ces règles sont **mortes**. |
| **Vraies divergences** | **13** | 3 doublons de Laurène Daudin présents au fichier, absents de la base ; 6 réattributions (LD et CB échangés en S4 jeudi, gardes S6 réattribuées) ; 4 ajouts isolés. |

Et l'ampleur de l'écriture par l'application, sur les 282 règles : **41 modifiées**
après création, **24 ajoutées** en avril, mai et juillet 2026. La dérive n'était
pas marginale, elle était continue.

##### Le V2 tranche les 13 divergences — toutes contre la base

Vérifié le 01/08/2026 : sur les 13, **13 suivent le fichier, 0 suit la base**.
L'optimiseur est parti de l'Excel de décembre, pas de l'état réel de
l'application : les décisions prises dans l'app n'ont jamais existé pour lui.

Un cas achève de l'éclairer — les gardes de week-end en S6 :

| | Garde S6 Beaune | Garde S6 Dijon | Doublon S6 Dijon |
|---|---|---|---|
| Fichiers V1 **et** V2 | MC | CC | **LD** |
| Base, après dérive | CC | LD | — |

Dans la base, **Laurène Daudin est de garde seule à Dijon en S6**, alors que sa
fiche porte `pas_de_garde_seule: true` et ne lui donne aucune garde de week-end,
uniquement des doublons. La dérive n'a pas seulement écarté la base du fichier :
elle a introduit une **violation d'un desiderata explicite**, sans que rien ne la
signale. C'est le coût de la double vérité, démontré sur les données réelles.

**Conséquence pour la migration du plan « V1 » en 6B** : reprendre **l'état de la
base moins les 14 règles mortes**, pour rester à comportement constant — c'est ce
qui produit le planning d'aujourd'hui. Les 13 divergences n'ont pas à être
reportées dans le fichier : le V2 les a déjà tranchées, et il prendra le relais le
04/01/2027. Elles doivent en revanche **apparaître à l'écran de différentiel de
6F** au moment d'activer le V2 — treize changements silencieux seraient
exactement le genre de surprise que ce dispositif existe pour éviter.

#### Cible proposée : des « plans de roulement » versionnés

```
rotation_plans
  id, name (ex. "Roulement 2026 - 11 associés"),
  start_date, cycle_length_weeks,
  status ('draft' | 'active' | 'archived'),
  effective_from date, effective_to date NULL,
  source_file_name, imported_at, created_by

rotation_plan_rules
  plan_id → rotation_plans,
  doctor_id, site_id, room_id, shift_type_id,
  weekday, rotation_week
  UNIQUE(plan_id, site_id, room_id, shift_type_id, weekday, rotation_week, doctor_id)
```

Principes :

- **La semaine de rotation se calcule par rapport au `start_date` du plan**, pas à une date globale. Un nouveau plan repart donc de zéro : plus aucun décalage rétroactif quand le cycle change de longueur.
- **Plusieurs plans coexistent dans le temps** : l'ancien est archivé avec sa `effective_to`, le nouveau prend le relais à sa `effective_from`. L'historique reste consultable et les plannings passés restent explicables.
- **Un plan se prépare en brouillon** (`draft`), se prévisualise, puis s'active à une date choisie — sans jamais perturber le roulement en cours.
- Suppression de la contrainte d'unicité stricte → possibilité de plusieurs médecins sur une case, ou d'une case vide.

#### Import Excel

Fonctionnalité à construire : **Paramètres → Roulement → Importer un fichier Excel**.

Parcours :
1. Dépôt du fichier `.xlsx` (drag & drop, desktop en priorité — c'est un écran coordinateur).
2. Parsing côté navigateur avec la bibliothèque **SheetJS (`xlsx`)** — pas d'envoi du fichier sur un serveur, les données restent dans le navigateur.
3. **Écran de correspondance** : l'appli liste les noms de médecins, les sites, les salles et les créneaux détectés dans le fichier, et demande de les faire correspondre aux enregistrements existants en base. Les correspondances évidentes (nom identique) sont pré-remplies ; seules les ambiguïtés demandent une action. Les correspondances validées sont mémorisées pour les imports suivants.
4. **Écran de différentiel** : « 14 affectations ajoutées, 3 modifiées, 1 supprimée par rapport au plan actif » — avec le détail, avant toute écriture.
5. Création d'un plan en brouillon + choix de la date d'entrée en vigueur.
6. **Prévisualisation** : génération simulée des gardes des N prochaines semaines, affichée en calendrier, avant écriture réelle dans `shifts`.

#### Format du fichier Excel du cabinet (analysé — fichier de référence `planning-actuel_2025-12.xlsx`)

Le fichier est **exporté depuis Apple Numbers**. Le classeur contient donc trois feuilles :
`Résumé de l'exportation` (à ignorer), `Feuille 1` (le roulement), et `Feuille 1-1` (**le même tableau, décalé d'une colonne**). Cette duplication est une conséquence de l'export Numbers : elle interdit tout parseur reposant sur des coordonnées de cellules fixes.

**Structure de la grille (`Feuille 1`) :**

- Ligne 2 : titre libre — `ROULEMENT MEDECINS ASSOCIES (mis à jour en Décembre 2025)`
- Ligne 3 : en-têtes de colonnes, de la colonne D à la colonne S — **16 colonnes = 8 semaines × 2 sites** : `S1 Beaune`, `S1 Dijon`, `S2 Beaune`, … `S8 Beaune`, `S8 Dijon`
- Colonne B : le jour (`Lundi`, `Mardi`, `Mercredi `, `Jeudi `, `vendredi`, `Samedi`, `Dimanche`) — renseigné **uniquement sur la première ligne du bloc**, les suivantes sont vides
- Colonne C : le créneau
  - Lundi → vendredi : `J1`, `J2`, `J3`, `J4`, `J5`, `J6 ou J7 ou J8`
  - Samedi et dimanche : `Garde`, `Doublon`
- Cellules : **initiales du médecin** (`AS`, `CB`, `CC`, `IEG`, `LD`, `MC`, `MY`, `TE`, `XB` — 9 associés), ou vide

**Volumétrie :** 265 affectations réparties de façon très équilibrée entre les 9 médecins (de 28 à 31 chacun). C'est autant de saisies manuelles évitées par l'import — la justification principale de cette fonctionnalité.

**Cinq particularités que le parseur doit gérer :**

1. **Surcharge de créneau dans la cellule.** Sur la ligne `J6 ou J7 ou J8`, la cellule contient le médecin **et** le créneau réellement retenu : `LD J7`, `AS J7`, `AS J8`, `MY J7` (16 occurrences). Le créneau ne se déduit donc pas de la ligne seule : il faut lire le contenu de la cellule. Format à reconnaître : `<initiales> <code créneau>` optionnel.
2. **La ligne `Doublon` du week-end** place un **second médecin** sur la même garde que la ligne `Garde`. C'est la preuve directe qu'il faut abandonner la contrainte `UNIQUE` actuelle qui n'autorise qu'un médecin par case.
3. **Les créneaux dépendent du site.** `J1` n'est renseigné qu'à Beaune, `J4` et `J5` presque exclusivement à Dijon. Le schéma doit accepter qu'un créneau n'existe pas sur tous les sites.
4. **Samedi et dimanche portent les mêmes affectations** (lignes `Garde` identiques). À traiter comme deux jours distincts, sans chercher à factoriser.
5. **Irrégularités de saisie humaine à normaliser** : espaces en fin de valeur (`Mercredi `, `Jeudi `, `MY `), espace en début d'en-tête (` S8 Dijon`), casse variable (`vendredi` en minuscule), lignes vides entre les blocs samedi et dimanche, cellule fusionnée. Le parseur doit systématiquement rogner les espaces et comparer sans tenir compte de la casse ni des accents.

**Règles d'implémentation du parseur :**

- **Repérer la feuille et la ligne d'en-tête par leur contenu**, jamais par des coordonnées fixes : chercher la première ligne contenant des libellés du type `S<n> <site>`, et en déduire la colonne de départ. C'est ce qui rendra l'import robuste aux prochains exports Numbers (voir la `Feuille 1-1` décalée).
- **En déduire dynamiquement** le nombre de semaines du cycle et la liste des sites, plutôt que de coder « 8 » et « Beaune/Dijon » en dur — c'est précisément ce qui doit pouvoir changer.
- **Propager le jour** de la première ligne du bloc vers les lignes suivantes (remplissage vers le bas).
- **Table de correspondance des initiales → comptes médecins**, à établir une première fois puis mémorisée (voir l'écran de correspondance décrit plus haut). Le fichier ne contient aucun nom complet ni email : cette correspondance est indispensable et ne peut pas être devinée.
- **Rapport d'anomalies** en fin d'analyse : initiales inconnues, créneaux non déclarés en base, sites non reconnus, cellules ambiguës — présenté avant toute écriture.

**Note sur le cycle :** 9 médecins pour un cycle de 8 semaines — la durée du cycle n'est pas indexée sur le nombre d'associés. L'arrivée d'un dixième médecin ne changera donc pas mécaniquement la longueur du cycle, mais si elle change, le mécanisme de plans versionnés décrit plus haut évite le décalage rétroactif.

#### Définition des créneaux (source : `desiderata.yaml`)

*(Tableau à jour des arbitrages du 01/08/2026 — voir la section suivante.)*

| Code | Horaire | Contrainte |
|---|---|---|
| `J1` | 08:00–16:00 | **Beaune uniquement**, 1 seul par jour |
| `J2` | 14:00–22:00 | **1 seul par site et par jour** — la ressource la plus disputée |
| `J3` `J4` `J7` `J8` | 08:00–18:30 | Journée, multipliables |
| `J5` | **12:00–20:00** | Va en pratique aux remplaçants — hors roulement |
| `J6` | 08:00–14:00 | Va en pratique aux remplaçants — hors roulement |
| `Garde` / `Doublon` | week-end | `Doublon` = second médecin sur la même garde |

Fenêtre de recouvrement maximal : 14:00–16:00 (J1, J2 et journées se chevauchent). Capacité : 6 salles par site, **9 associés simultanés maximum**.

**Conséquence architecturale majeure :** le roulement ne concerne que les **9 associés**. Les créneaux `J5` et `J6`, et plus généralement tous les créneaux non couverts par le roulement, sont destinés aux **remplaçants** — c'est-à-dire exactement ce que le circuit « garde libre → demande → approbation » de l'agenda gère déjà. Les deux mécanismes sont donc complémentaires et couvrent chacun une population : **rotation = associés (affectation automatique)**, **demandes = remplaçants (à la demande)**. C'est la clé de lecture du module.

---

#### Décisions du 01/08/2026 — les deux points qui bloquaient le démarrage de MOD-1

Les deux éléments manquants de la checklist sont tranchés. Les arbitrages ont été
rendus sur des relevés faits en base (schéma `agenda` d'Omnès-Orga) et sur un
parsing des deux fichiers Excel, pas sur la seule documentation.

##### 1. Le roulement V2 démarre le lundi 04/01/2027, en semaine S6

| Champ du plan | Valeur | Pourquoi |
|---|---|---|
| `effective_from` | **2027-01-04** | Le planning n'est généré que jusqu'au 03/01/2027 : **aucune garde déjà publiée n'est touchée**. |
| `start_date` | **2026-11-30** | Pour que le 04/01/2027 tombe en **S6** (04/01 − 5 semaines). |
| `cycle_length_weeks` | 8 | Inchangé. |

**Le choix de Matthieu : ne pas rompre l'ordre habituel.** La semaine du
28/12/2026 est S5 dans le roulement en cours ; celle du 04/01/2027 doit donc être
S6, et non S1. Les médecins lisent la numérotation des semaines dans le
calendrier — un saut S5 → S1 les perdrait.

Propriété remarquable : **le `start_date` calculé (30/11/2026) est lui-même une
frontière S1 du roulement actuel**. Les deux plans partagent donc exactement le
même ancrage de cycle ; la numérotation reste continue, sans le moindre décalage.
Le V2 passera en S1 pour la première fois le **lundi 25/01/2027**.

**C'est la démonstration que `start_date` et `effective_from` doivent être deux
colonnes distinctes** dans `rotation_plans` : le plan est ancré au 30/11/2026
mais n'entre en vigueur qu'au 04/01/2027, et ses semaines S1 à S5 ne seront
jamais jouées lors de son premier passage. Le schéma cible proposé plus haut
tient — ce cas d'usage réel le valide.

*Vérification du calcul (roulement en cours : `start_date` 2025-12-29, cycle 8) :
28/12/2026 → S5, 04/01/2027 → S6, 11/01 → S7, 18/01 → S8, 25/01/2027 → S1.*

##### 2. Les trois écarts d'horaire

Arbitrés au vu de l'usage réel des créneaux, relevé en base :

| Créneau | Base | `desiderata.yaml` | Décision | Justification |
|---|---|---|---|---|
| `J5 Dijon` | 12:00–20:00 | 08:00–18:30 | **la base fait foi** | Sur 239 gardes, **133 tenues par un remplaçant, 16 seulement par un associé**. La ligne `J5` est **vide** dans le roulement V2 et quasi vide en V1. Ce n'est pas une journée d'associé mais un **créneau de renfort, hors roulement**, comme `J6`. |
| `J2 Beaune` | 10:00–22:00 | 14:00–22:00 | **`desiderata.yaml` fait foi** | `J2 Dijon` est bien à 14:00–22:00. L'écart est propre à Beaune sur un créneau tenu à 80 % par des associés (206 gardes sur 256) : erreur de saisie, à corriger en base. |
| `J5 bis Dijon` | 12:00–20:00 | absent | **désactivé** | 3 gardes en tout, **aucune à venir**, la dernière le 02/03/2026, aucune règle de roulement, aucun associé. `is_active = false` : il sort des menus de création, l'historique des 3 gardes reste lisible. |

Un argument a pesé dans les deux sens : `shifts.shift_type` stocke le
`time_range` du créneau (conséquence de la dénormalisation documentée en 7A) —
**l'horaire de la base est donc celui que les médecins lisent dans « Mes
gardes »**. Corriger le créneau ne corrige pas les gardes déjà créées.

##### 3. Constats relevés au passage — tous utiles à MOD-1

- **Le roulement en base est le V1, pas le V2.** Comparaison des 282
  `rotation_assignment_rules` aux deux grilles : **256 cases sur 283 identiques
  au V1** contre **198 sur 305 au V2**. La base suit le V1 avec une **dérive de
  27 cases** accumulée depuis décembre 2025 (retouches au fil de l'eau). L'import
  du V2 sera donc une vraie bascule, et l'écran de différentiel prévu par MOD-1
  n'est pas un confort : c'est ce qui rendra cette dérive visible avant écriture.
- **`Pré J2 Dijon` est le `J6` de `desiderata.yaml`** : même horaire (08:00–14:00),
  176 des 257 gardes tenues par des remplaçants, aucune règle de roulement. La
  correspondance est établie, il n'y a pas de `J6` manquant — seulement un nom
  historique. Table complète dans `desiderata.yaml`, section `correspondance_agenda`.
- **⚠️ Le V2 introduit `J4 Beaune`, qui n'existe pas en base** — 6 affectations
  (IEG en S1 jeudi, S2 vendredi, S3 mercredi, S3 vendredi ; MY en S4 mardi et S6
  mardi). Le créneau **et la salle qui l'accueille** sont à créer avant l'import.
  Cohérent avec le déménagement : Beaune n'a jamais ouvert que `Salle 1` et
  `Salle 2` (les salles 3 à 6 existent en base mais n'ont **jamais** porté une
  garde). C'est le cas d'usage « ouverture d'une nouvelle salle » de MOD-1, et il
  se présente dès le premier import.
- **Le roulement s'applique à la *création* des gardes, pas rétroactivement**
  (`weekTemplateUtils.applyWeekTemplate`, `applyRotationRulesToShifts`). Un
  changement de plan ne réécrit donc aucune garde existante. C'est ce qui rend la
  date du 04/01/2027 indolore — et ce qui explique qu'une date antérieure aurait
  exigé de rejouer le plan sur des gardes déjà assignées.

##### 4. Sous-étape 6A — FAITE (01/08/2026)

Deux scripts exécutés sur la base Orga, schéma `agenda`.

**`docs/sql/22-6A-1-agenda-correction-creneaux.sql`** — les arbitrages ci-dessus :

| Action | Résultat vérifié |
|---|---|
| `J2 Beaune` → `14:00-22:00` | créneau corrigé + **107 gardes à venir** ; les **149 passées** gardent `10:00-22:00` |
| `J5 bis Dijon` → `is_active = false` | ses 3 gardes passées restent lisibles |
| `J5 Dijon` | aucune écriture — c'est la doc qui a été corrigée |

Portée choisie par Matthieu pour `J2 Beaune` : les gardes **déjà effectuées**
gardent leur horaire d'origine, seules celles à venir sont corrigées. Sans ce
second `UPDATE` la correction serait restée invisible : `shifts.shift_type`
porte une copie texte de l'horaire (dénormalisation, écart n°2 de 7A), et les
médecins auraient continué à lire `10:00-22:00` dans « Mes gardes » jusqu'en 2027.

**`docs/sql/22-6A-2-agenda-creneaux-beaune.sql`** — les créneaux manquants :

| | Avant | Après |
|---|---:|---:|
| Créneaux Beaune | 3 + 2 week-end | **7 + 2 week-end** |
| Créneaux Dijon | 8 + 2 week-end | 8 + 2 week-end (dont 1 inactif) |
| **Total** | 15 | **19** |

Créés : `J4`, `J7`, `J8 Beaune` (08:00–18:30) et `J6 Beaune` (08:00–14:00).
Beaune peut désormais occuper ses 6 salles. **Les salles, elles, existaient
déjà toutes les six** depuis le 17/11/2025 : le site n'avait jamais ouvert que
`Salle 1` et `Salle 2`, faute de créneaux pour occuper les autres — le
déménagement avait été anticipé en base, mais à moitié.

Hygiène des noms au passage : `Pré J2 Dijon ` → **`J6 Dijon`** (le concept
« préJ2 » est déclaré abandonné par `desiderata.yaml`, et le nom divergeait de
`J6 Beaune` qu'on venait de créer), et suppression des espaces parasites en fin
de nom (`WE1 Dijon `, `WE 2 Dijon `). Sans effet sur les données : les gardes
stockent l'horaire, jamais le nom du créneau.

**Créer un créneau n'ouvre aucune garde** — il devient seulement proposable à la
création. Rien n'a changé pour les médecins ; c'est Charlotte qui décide d'ouvrir
des gardes dessus, via les modèles de semaine.

##### 5. Bascule d'affichage coordination / médecin (01/08/2026)

`is_agenda_coordinator` posé sur le compte de Matthieu, qui rejoint Charlotte. Le
module en déduisant un rôle **unique**, il y perdait du même coup « Mes gardes »
et « Planning du jour », réservés au rôle `doctor` — alors qu'il exerce et a donc
des gardes, contrairement à la coordinatrice.

D'où un sélecteur **Coordination / Médecin** dans le header (`App.tsx` +
`AgendaHeader.tsx`), bâti sur la primitive `Segmented` existante. Rendu aux seuls
comptes **réellement** coordinateurs, choix mémorisé en `localStorage`, retour au
Calendrier à chaque bascule (seul onglet commun aux deux rôles).

**Ce qu'il remplace** : jusqu'ici, Matthieu contrôlait les écrans coordinateur en
se connectant **avec les identifiants de Charlotte**. Les actions de test
apparaissaient donc sous le nom de la coordinatrice, et un mot de passe circulait
entre deux personnes. Le sélecteur supprime les deux. *(Reste à faire un jour,
hors périmètre : changer ce mot de passe partagé.)*

**Conservé durablement**, à la demande de Matthieu — ce n'est pas un outil de test
jetable mais le moyen normal, pour un associé exerçant la coordination, de voir
ses propres gardes.

**⚠️ Portée du sélecteur** : il change ce que l'**interface** propose, pas ce que
la **base** autorise. En vue médecin l'utilisateur reste coordinateur pour la RLS
(`agenda.est_coordinateur()`) : ses droits d'écriture sont intacts et une action
proposée s'exécute réellement. Ce n'est ni un bac à sable ni un contrôle de
sécurité — seules les policies en sont un, et elles ont été testées par
usurpation d'identité en 7C-3.

##### 6. « Planning du jour » reste réservé au rôle médecin — décision assumée

La question s'est posée : faut-il ouvrir `DailyScheduleView` à la coordinatrice ?
**Non**, tranché avec Matthieu le 01/08/2026.

La grille coordinateur (`WeekView`) **affiche déjà le nom du médecin dans chaque
case**, sans clic — c'est donc un doublon d'information, et même un sous-ensemble :
la grille couvre 7 jours au lieu d'un, avec le statut de chaque case en plus.

Les deux écrans ne répondent d'ailleurs pas à la même question. « Planning du
jour » est coloré par **créneau** et pensé mobile-first (une pastille par garde,
avatar à gauche) : « qui travaille aujourd'hui ? », pour un médecin en
déplacement. La grille est colorée par **statut** : « qu'est-ce qui reste à
pourvoir ? ». C'est exactement la double optimisation d'écran posée dans les
contraintes du projet — lui donner un onglet coordinateur mélangerait les deux
logiques et allongerait une barre d'onglets déjà à trois entrées.

Et le sélecteur du point 5 rend le besoin caduc : une coordinatrice qui veut
cette lecture bascule en vue Médecin.

##### 8. Sous-étape 6C — FAITE (6C-1 à 6C-3, 01/08/2026)

Le module lit et écrit désormais les plans. Plus aucun fichier ne consulte
`rotation_assignment_rules` ni `rotation_settings`.

**6C-1 — le socle.** `rotationUtils` expose `getRotationPlans()` (chargement
unique, caché 60 s) et `getPlanForDate()` (résolution en mémoire, sans requête).
`getRotationWeek` est **réutilisée telle quelle** : un `RotationPlan` porte
`start_date` et `cycle_length_weeks`, donc l'arithmétique ne peut pas diverger —
l'iso-comportement est structurel, pas seulement testé.

*Deux choix de conception* : le plan est résolu sur le **lundi** de la semaine
visée, pour qu'une semaine relève toujours d'un seul plan même si une date
d'entrée en vigueur tombait en milieu de semaine ; et les dates sont comparées
en chaînes `YYYY-MM-DD` construites en local, jamais via `toISOString()` — qui
convertit en UTC et décale d'un jour selon l'heure.

**Preuve d'équivalence sur les 2 681 gardes** (ancien calcul contre nouveau,
rejoués en SQL) :

| Identiques | Médecin différent | Ancien seul | Nouveau seul |
|---:|---:|---:|---:|
| **1 625** | **0** | 60 | **0** |

Les 60 sont exclusivement les gardes `J3 Dijon` du week-end, celles du vestige.
Toutes déjà `assigned`, dont les 8 restantes — et le roulement ne s'applique
qu'à la *création* d'une garde. Aucune conséquence pratique.

**6C-2 — les consommateurs** : `MonthView` (chaque cellule résout son propre
plan), `WeekView`, `weekTemplateUtils`, `applyRotationRulesToShifts`. Un mois à
cheval sur deux roulements affichera donc la bonne numérotation de part et
d'autre, sans bascule manuelle.

**6C-3 — le retrait de l'écriture.** Les deux fonctions concernées faisaient
chacune **deux** choses ; une seule disparaît :

| Fonction | Écriture du roulement | Action sur les gardes |
|---|---|---|
| `handleApplyToRotationWeek` | `upsert` de la règle → **retiré** | assigne le médecin → **conservé** |
| `handleCancelAssignment('rotation')` | `delete` de la règle → **retiré** | libère les gardes → **conservé** |

Les libellés suivent, sans quoi l'interface promettrait une action qu'elle ne
fait plus : « Supprimer la règle de roulement » devient **« Libérer les gardes
de cette case »**, et les deux modales portent la mention explicite que le
roulement vient du fichier validé et n'est pas modifié.

**Garde-fou ajouté** : « la même case du roulement » ne retient plus que les
gardes **régies par le même plan**. Sans ce test, une action passée en décembre
2026 toucherait des gardes de 2027 relevant du V2 — qui ne sont pas dans la même
case, puisque le roulement a changé. Sans effet aujourd'hui (un seul plan),
indispensable au 04/01/2027. Même famille de défaut que l'incident du 29/07 :
une action dont le périmètre dépasse ce qu'elle annonce.

`RotationManagement` passe en **consultation** : liste des plans, période,
ancrage, nombre d'affectations, fichier d'origine. Il permettait jusqu'ici de
changer `start_date` et la durée du cycle — le défaut n°2 de MOD-1.

*Note de convention* : le **nom d'un plan est du texte affiché**, il porte donc
ses accents (« Roulement V1 — décembre 2025 »). La règle « pas d'accents dans
les migrations » vise les identifiants et le code, pas les valeurs destinées à
l'écran.

##### 11. Sous-étape 6B-3 — la salle sort du roulement (01/08/2026)

**Découverte par la grille de 6D** : une case affichait « MY · MY ». En cause,
deux règles pour la même case sur des **salles différentes** — l'ancienne
contrainte (`UNIQUE(site, salle, créneau, jour, semaine)`) l'autorisait, et
l'`upsert` du code portait sur ces mêmes colonnes : changer de salle créait une
ligne au lieu d'en modifier une.

| Case | Salles | Règles créées le |
|---|---|---|
| S6 jeudi · `J7 Dijon` | Cabinet B3 / **B6** | 15/12/2025 et 11/05/2026 |
| S1 mardi · `J8 Dijon` | Cabinet B2 / **B3** | 29/07/2026 (les deux) |

À la génération, deux salles ouvertes le même jour auraient produit **deux
gardes assignées au même médecin à la même date** — ce que l'index
`unique_doctor_per_day` refuse. La création aurait échoué sans message lisible.

**Décision de Matthieu : sortir la salle du roulement.** Le fichier de roulement
n'en parle pas ; un créneau se tient toujours dans la même salle, donc la salle
est une propriété du **créneau**. Script `22-6B-3-agenda-salle-par-creneau.sql` :
colonne `agenda.shift_types.default_room_id`, remplie **par déduction** (salle
majoritaire des gardes réelles) pour les 15 créneaux historiques ; `room_id`
retiré de `rotation_plan_rules`, dont la clé d'unicité devient exactement ce que
dit le fichier — plan, site, créneau, jour, semaine, médecin. **266 règles**
(268 − 2 vestiges).

**⚠️ Aucune contrainte d'unicité sur `default_room_id`** — deux créneaux peuvent
partager une salle si leurs horaires ne se recouvrent pas réellement :

- **Dijon** : `J6` (08:00–14:00) puis `J2` (14:00–22:00) — d'où l'ancien nom
  « pré J2 ».
- **Beaune** : `J1` puis `J2`, alors que leurs horaires se chevauchent en
  apparence (08:00–16:00 et 14:00–22:00). **Précisé par Matthieu, indevinable
  depuis les données** : le médecin en `J1` consulte au cabinet de 08:00 à 13:00
  puis part en **visites à domicile**. La salle se libère donc à 13:00. Il n'y a
  pas de visites à Dijon — c'est ce qui distingue l'occupation des deux sites.
  Consigné dans `desiderata.yaml`.

Salles des 4 créneaux créés en 6A-2 (aucune garde, donc rien à déduire) :
`J4` → Salle 3, `J7` → Salle 4, `J8` → Salle 5, `J6` → Salle 6 — ce dernier
étant un créneau du matin, il ne peut rien partager, la Salle 1 étant occupée
par `J1`.

**Contrôle d'équivalence après coup** (2 681 gardes) : 1 625 identiques, **0
médecin différent**, 60 « ancien seul » (le vestige `J3` week-end, déjà connu)
et **1 « nouveau seul »** — une garde `J8 Dijon` du 02/06/2026 placée
exceptionnellement en Cabinet B2, que l'ancien système ne rattachait à aucune
règle faute de salle identique. Le nouveau retrouve Airelle Sauvage… qui est
précisément la personne assignée. **La salle n'aurait jamais dû faire partie de
l'identité d'une case.**

##### 10. Sous-étape 6D — FAITE (01/08/2026)

`components/settings/RotationPlanGrid.tsx` : la grille d'un plan, **à la
disposition du fichier de roulement** — créneaux en lignes groupés par jour,
semaines × sites en colonnes (`S1 Beaune`, `S1 Dijon`, `S2 Beaune`…). Choix de
Matthieu : c'est la lecture à laquelle les associés sont habitués.

**Pas de vue par médecin dans cet écran** : « Mes gardes » la couvre côté
médecin, et la bascule Coordination / Médecin y donne accès côté coordination.
*(Nuance relevée : « Mes gardes » montre les gardes réelles, pas la place dans
le cycle. Comme les gardes sont générées loin à l'avance, l'information est là
en pratique — à revoir si le besoin remonte.)*

**Fichier séparé et prop `highlight` prévue dès maintenant** : c'est la même
grille qui servira à l'écran de différentiel de 6F, avec les cases modifiées en
couleur. Autant la construire une fois.

Points d'implémentation : les sites et le nombre de semaines sont **déduits des
données** (un troisième site apparaîtrait tout seul) ; le code du créneau est
obtenu en retirant le nom du site et la plage horaire du libellé
(`WE1 beaune 08h-20h` → `WE1`) ; le tri est naturel (J1 < J2 < … < J8 < WE) et
non alphabétique ; les initiales sont dérivées du nom (initiale du prénom +
initiale de chaque mot du nom — vérifié sur les 9 associés, `Imane EL GARI` →
`IEG`), avec le nom complet en infobulle et une légende sous la grille.

*Déviation assumée au design system* : la barre de défilement horizontale reste
**visible**. La règle `.hide-scrollbar` vise les listes de chips ; sur un tableau
de données large, la masquer nuirait à sa découvrabilité.

**Contrôle** : la grille produite a été comparée au fichier
`planning-actuel_2025-12.xlsx` pour le lundi — **case pour case identique**, y
compris les `J7` que le fichier note en cellule composite (`AS J7` sur la ligne
« J6 ou J7 ou J8 ») et que la base a normalisées.

##### 9. ⚠️ 6C-4 reportée après la bascule — et ce qu'elle révèle

La suppression de `rotation_settings` et `rotation_assignment_rules` **ne peut
pas avoir lieu maintenant** : `docs/sql/22-7F-resynchronisation-agenda.py` les
recopie depuis Planning, et ce script doit encore servir le soir de la bascule
pour rattraper le delta de Bolt. Les supprimer le casserait. Elles ne coûtent
rien en attendant — plus aucun code ne les lit.

**Mais la vraie conséquence est ailleurs.** Charlotte travaille dans Bolt jusqu'à
la bascule, et Bolt a toujours son « appliquer à la semaine de roulement », qui
écrit dans `rotation_assignment_rules`. **Le plan « Roulement V1 » est figé au
01/08/2026** : toute modification du roulement faite dans Bolt d'ici la bascule
n'y sera pas.

À prévoir le soir de la bascule, après la resynchronisation :

1. **Comparer** `rotation_assignment_rules` fraîchement resynchronisée au plan
   V1, et présenter les écarts — ne pas régénérer en silence.
2. Arbitrer : soit reporter ces changements dans le plan, soit les considérer
   comme caducs puisque le V2 prend le relais au 04/01/2027.
3. Puis seulement, exécuter 6C-4.

*Piste plus simple, à confirmer avec Matthieu* : demander à Charlotte de ne plus
utiliser « appliquer à la semaine de roulement » dans Bolt d'ici la bascule. Le
contrôle reste nécessaire — une consigne humaine ne se vérifie pas toute seule.

> **✓ La comparaison est faite (26/08/2026), et elle est rassurante : zéro écart.**
> Script `docs/sql/23-6-comparer-roulement-bolt-plan-v1.py`, **en lecture seule sur
> les deux bases** — il ne resynchronise rien et peut être relancé à tout moment,
> notamment le soir de la bascule.
>
> **Résultat : 280 règles dans Bolt, 266 dans le plan V1, et aucun vrai écart.** Les
> 14 de différence sont exactement les règles **écartées volontairement par 6B-2** —
> les « J3 Dijon » du samedi et du dimanche, ancienne façon d'enregistrer la garde
> de week-end à Dijon avant la création du créneau `WE1 Dijon`. L'arbitrage a déjà
> été rendu le 01/08/2026, et le plan les remplace par 7 samedis + 7 dimanches en
> `WE1 Dijon`. Le script les nomme comme telles au lieu de les compter en écarts —
> les présenter comme 14 arbitrages à rendre serait faux.
>
> **Charlotte n'a donc rien modifié au roulement depuis le 01/08** (elle est par
> ailleurs en congés la semaine du 24/08, ce qui fige le delta). Reste à relancer le
> script le soir de la bascule pour confirmer : c'est une minute, et c'est ce qui
> permet d'exécuter 6C-4 sans arbitrage.
>
> **Deux pièges traités dans le script**, tous deux invisibles si l'on compare
> naïvement : les identifiants ne se correspondent pas d'une base à l'autre (les
> médecins sont rapprochés par `mapping-comptes-agenda.csv`, jamais par leur nom),
> et les créneaux ont été **renommés** côté Orga par 6A-1 (`Pré J2 Dijon` → `J6
> Dijon`, espaces parasites) — comparer sur les noms bruts produirait un écart sur
> chaque ligne.
>
> **Précision pour 6C-4** : la suppression devra aussi retirer `getRotationSettings()`
> (`lib/rotationUtils.ts`), qui interroge encore `rotation_settings`. Elle n'est
> appelée nulle part — rien ne casserait — mais une fonction qui pointe vers une
> table inexistante fait perdre une heure à qui la relira dans six mois.

##### 7. Sous-étape 6B — FAITE (01/08/2026)

Deux scripts : `22-6B-1-agenda-plans-roulement.sql` (schéma) et
`22-6B-2-agenda-migration-plan-v1.sql` (reprise du roulement actuel).

**Le schéma** — `agenda.rotation_plans` (13 colonnes) et
`agenda.rotation_plan_rules` (9 colonnes), 6 index, 2 fonctions de validation,
1 fonction `agenda.plan_applicable(date)`.

Les quatre défauts de conception sont corrigés : historisation par plan,
numérotation ancrée sur le `start_date` **du plan** (plus de décalage rétroactif
quand le cycle change de longueur), `doctor_id` dans la clé d'unicité (le
`Doublon` du week-end devient exprimable), et l'import comme voie d'entrée.

**Le verrou du principe « une seule vérité » est dans la base** : aucune policy
`insert` / `update` / `delete` n'existe, pas même pour les coordinateurs. La
seule porte d'entrée sera la fonction d'import de 6E, en `security definer`.
Vérifié par usurpation d'identité — Charlotte lit les plans, mais ses trois
tentatives d'écriture sont refusées.

Garde-fous testés sur données jetables, puis effacées :

| Test | Résultat |
|---|---|
| `start_date` qui n'est pas un lundi | refusé — décalerait tout le plan en silence |
| Deux plans actifs qui se recouvrent | refusé — « quel roulement s'appliquait en mars ? » doit avoir une réponse unique |
| Un plan qui enchaîne le lendemain du précédent | accepté |
| Semaine S9 dans un cycle de 8 | refusé — serait une affectation qui ne se déclenche jamais |
| **Deux médecins sur la même case** | **accepté** |
| Le même médecin deux fois sur une case | refusé |
| `plan_applicable()` : 15/12/2026 → V1, 10/01/2027 → V2 | correct |

*Choix technique : un trigger plutôt qu'une contrainte d'exclusion pour le
non-chevauchement — `btree_gist` n'est pas installé sur le projet, et l'ajouter
pour cette seule règle serait disproportionné.*

**La migration** — plan « Roulement V1 — décembre 2025 », `start_date`
2025-12-29, cycle 8, actif depuis le 29/12/2025, sans date de fin (c'est
l'activation du V2 en 6F qui la posera au 03/01/2027).

| Source | Écartées | Migrées | Migrée sans source | Source sans migrée |
|---:|---:|---:|---:|---:|
| 282 | 14 | **268** | **0** | **0** |

> **Le plan compte 266 règles depuis 6B-3, et non 268** (relevé en base le
> 01/08/2026 pendant 6E-1). En retirant `room_id` de la table, 6B-3 a rendu
> identiques deux paires de règles qui ne différaient que par la salle : le
> script les supprime avant de retirer la colonne. Aucune case du roulement
> n'est perdue — c'est la même case, comptée deux fois. **266 est le chiffre de
> référence du différentiel de 6F.**

Les 14 écartées sont les règles `J3 Dijon` du week-end. Vérification faite case
par case, elles sont **entièrement redondantes** avec les 14 règles `WE1 Dijon`,
qui couvrent exactement les mêmes cases : **12 portent le même médecin des deux
côtés** (doublon exact), et les **2 dernières** (S6 samedi et dimanche) portent
Caroline Chauvet sur `J3` contre Laurène Daudin sur `WE1`. Ces deux-là sont la
trace de la réattribution de la garde S6 : seule la règle du nouveau créneau a
été mise à jour, l'ancienne est restée figée sur sa valeur d'origine — celle du
fichier de décembre. Aucune information n'est perdue.

##### 12. Sous-étape 6E-1 — FAITE (01/08/2026)

**La décision laissée en attente est tranchée : le fichier passe par un JSON
canonique produit en Python.** L'application ne lira jamais de `.xlsx`. Pas de
`npm install xlsx`.

Ce qui a emporté la décision : **le parseur existait déjà**. `lire_fichier()`
dans `22-6-outil-comparer-roulement-fichiers.py` traitait déjà les deux formats
du cabinet, et c'est lui qui a produit le diagnostic des 27 écarts. Le réécrire
en TypeScript, c'était refaire à neuf — sans vérificateur — un travail validé
sur les deux fichiers réels.

**`docs/sql/22-6E-1-export-roulement-json.py`** — c'est le `3_export_app.py` du
schéma de MOD-1 bis. Il vit dans `docs/sql/` avec les autres scripts du projet ;
sa place définitive est le dépôt du pipeline Python, aux côtés de
`verifie-planning.py`.

```
python3 docs/sql/22-6E-1-export-roulement-json.py docs/planning-V2_2026-07.xlsx \
    --nom "Roulement V2 - 9 associes" --date-debut 2027-01-04
```

**Écart assumé au JSON décrit plus haut : il ne porte ni horaire de créneau, ni
nom complet de médecin.** Le format initial prévoyait de les lire dans
`desiderata.yaml`. Depuis que la route retenue place l'écran de correspondance
dans l'application, ce serait une **troisième copie** des tables de
correspondance — exactement le défaut déjà reproché à `1_optimize.py`, dont la
doc note que « la duplication finira par diverger ». Le JSON ne porte donc que
l'image fidèle du fichier : les codes tels qu'ils y sont écrits. La frontière
devient nette — **Python lit le fichier, l'application résout les identités** —
et le script n'a aucune dépendance nouvelle (PyYAML n'est pas installé, et n'a
plus lieu de l'être).

Le script refuse une `--date-debut` qui n'est pas un lundi, et propose le lundi
le plus proche. Le contrôle existe déjà en base ; le faire ici évite de
découvrir l'erreur au moment de l'import.

**Rapport d'anomalies** (dans le JSON *et* à l'écran) : `feuille_ignoree`,
`jour_inconnu`, `cellule_ambigue`, `creneau_ambigu`, `doublon_exact`,
`ligne_ignoree`, `code_medecin_suspect`, `semaine_vide`. Le plus utile est
`creneau_ambigu` : sur les lignes `J6 ou J7 ou J8` du V1, le créneau ne se
déduit pas de la ligne. Vérifié — **toutes** les cellules de ces lignes portent
leur propre code (`LD J7`), aucune ne retombe sur le libellé ambigu. Le cas ne
se présente donc pas aujourd'hui, mais il ne passera pas en silence s'il
survient.

| Fichier | Feuille retenue | Cycle | Affectations | Anomalies |
|---|---|---:|---:|---|
| `planning-V2_2026-07.xlsx` | `Roulement V2` | 8 | 264 | aucune |
| `planning-actuel_2025-12.xlsx` | `Feuille 1` | 8 | 265 | 1 — le doublon `Feuille 1-1` de l'export Numbers, signalé et non lu |

**Contrôle — le JSON du V1 confronté au plan actif en base : 13 écarts, et ce
sont exactement les 13 « vraies divergences » du diagnostic.** 3 doublons de
Laurène Daudin présents au fichier et absents de la base, 6 réattributions
(LD/CB en S4 jeudi, les gardes S6), 4 ajouts isolés. Le tableau S6 de la section
« diagnostic de la dérive » se relit ligne à ligne dans la sortie. Un chiffre
établi par un autre script, retrouvé par celui-ci : c'est la vérification qui
comptait.

##### 13. Sous-étape 6E-2 — FAITE (01/08/2026)

**`docs/sql/22-6E-2-agenda-import-plan.sql`** — la porte d'entrée unique des
plans. 6B avait posé le verrou (aucune policy d'écriture, pas même pour un
coordinateur) ; ce script pose la seule serrure qui l'ouvre.

**1. `agenda.rotation_import_mappings` — la mémoire des correspondances.**
Le fichier ne contient que des codes (`CB`, `Beaune`, `J1`) : aucun nom
complet, aucun identifiant. La correspondance se décide une fois à l'écran,
puis se mémorise. Une table plutôt qu'une constante dans le code, pour que
l'arrivée d'un dixième associé ou d'un troisième site ne demande pas de
livraison — c'est le cas d'usage « association d'un nouveau médecin ».

`target_id` désigne trois tables selon `kind` : une clé étrangère est donc
impossible, et le contrôle passe par un trigger. Une référence polymorphe non
vérifiée finit par pointer dans le vide, et l'erreur ne se verrait qu'à
l'écran du roulement, longtemps après.

**Amorçage — 29 correspondances, dont 9 dérivées et 18 déclarées.** Les codes
médecins se **dérivent** du nom (initiale du prénom + initiale de chaque mot du
nom, la règle déjà utilisée par la grille de 6D) : recopier neuf noms dans un
script en aurait fait une source de vérité de plus. La dérivation produit
exactement `AS, CB, CC, IEG, LD, MC, MY, TE, XB` — vérifié par le script.
Les créneaux, eux, **ne peuvent pas se dériver** (`Garde` → `WE1 beaune
08h-20h`, et les irrégularités de saisie des noms en base l'interdisent) : ils
sont déclarés d'après `desiderata.yaml`, et le bloc **échoue avec la liste des
manquants** si un créneau attendu est absent, plutôt que d'amorcer une table
trouée.

**2. `agenda.importer_plan_roulement(...)` — la fonction d'import.** Elle reçoit
le JSON de 6E-1 tel quel, plus les trois tables de correspondance arrêtées à
l'écran. Elle revalide tout de son côté : *un écran ne protège rien*, c'est la
leçon de 7C-3. Le plan est créé en **brouillon sans date d'entrée en vigueur** —
un import ne touche jamais au planning en cours, c'est 6F qui activera.

`p_verifier_seulement` produit le rapport **sans rien écrire** : c'est ce que
l'écran de 6E-3 appellera pour afficher le récapitulatif avant confirmation.

Garde-fous testés sur données jetables, puis effacées :

| Test | Résultat |
|---|---|
| Un non-coordinateur importe | refusé |
| Vérification à blanc, correspondances complètes | rapport : 264 affectations, 9 médecins, 2 sites, 13 créneaux |
| Vérification à blanc, `CB` sans correspondance | `ok: false`, `manquants: {medecins: ["CB"]}` — **et rien d'écrit** |
| `date_debut` qui n'est pas un lundi | refusé, avec le motif |
| Semaine S9 dans un cycle de 8 | refusé **avant** toute écriture |
| Import réel du V2 | 264 règles, plan en `draft` |
| Les 5 écritures directes (plans, règles, correspondances) | **refusées**, coordinateur authentifié compris |
| `plan_applicable()` après l'import | V1 aujourd'hui **et** en mars 2027 — le brouillon ne s'applique pas |

**Contrôle décisif — le brouillon importé confronté au fichier : 264 / 264 cases
identiques, zéro écart.** C'est le contrôle que le script de 6E-1 annonce en fin
d'exécution, et il passe.

**Mémorisation vérifiée** : 24 des 29 correspondances rafraîchies par l'import
— 9 médecins + 2 sites + 13 créneaux, exactement ceux que le V2 utilise. Les 5
créneaux non employés par ce fichier ne sont pas touchés : seule une
correspondance qui a servi est retenue.

*Le brouillon de test a été supprimé après contrôle.* Le V2 sera importé pour de
bon depuis l'écran de 6E-3, puis activé en 6F.

##### 14. Sous-étape 6E-3 — FAITE (01/08/2026)

**`components/settings/RotationPlanImport.tsx`**, plus un bouton « Importer un
plan » dans `RotationManagement`.

**L'écran explique l'étape d'avant.** Remarque de Matthieu : « je ne visualise
pas très bien le glisser/déposer de `.json` ». Elle est juste, et elle a changé
le design — le `.json` est un fichier intermédiaire produit par une commande au
terminal, pas un document que la coordinatrice manipule d'habitude. Une simple
zone de dépôt aurait laissé chacun deviner quel fichier déposer. L'écran
**affiche donc la commande de conversion** avant la zone de dépôt, et dit
pourquoi elle vit hors de l'application. Glisser-déposer **et** sélecteur de
fichier : le premier ne se devine pas, le second se voit.

**Un panneau, pas une modale.** Le contenu (récapitulatif, correspondances,
anomalies) est trop dense pour une bottom-sheet, et c'est un parcours, pas une
saisie ponctuelle. L'import prend donc toute la carte Roulement, avec le
`ChevronLeft` réglementaire pour revenir. *Ce n'est pas une déviation au design
system : le pattern bottom-sheet vise les modales de contenu, et il n'y a pas
de modale ici.*

**Les correspondances déjà mémorisées ne s'affichent pas** — seules les
inconnues demandent une action, avec un « Tout afficher et modifier » pour les
revoir. Quand tout est reconnu, l'écran le dit en une ligne (« les 24 codes du
fichier sont tous reconnus ») plutôt que d'aligner 24 listes déroulantes que
personne ne lira. Le bouton d'import reste désactivé tant qu'un code n'est pas
tranché.

L'écran appelle la fonction **deux fois** : d'abord en vérification à blanc,
puis en écriture. Le premier appel ne sert pas à l'affichage — il sert à ce que
le serveur revalide avant d'écrire.

##### ⚠️ Le bug que seul le test de bout en bout pouvait trouver

Les garde-fous de 6E-2 avaient été testés par l'API d'administration, en rôle
`postgres`. Rejoués par le **chemin réel du navigateur** (PostgREST, rôle
`authenticated`, jeton de session), le premier appel a échoué :

```
{"code":"21000","message":"DELETE requires a WHERE clause"}
```

Supabase active **pg_safeupdate** pour le rôle `authenticated` : tout `DELETE`
sans clause `WHERE` est refusé. La fonction en contenait un
(`delete from tmp_affectations;`), remplacé par un `drop` + `create` de la table
temporaire. **L'import aurait échoué au premier clic**, et rien dans les tests
précédents ne l'annonçait.

*La leçon vaut pour la suite de MOD-1 : une fonction `security definer` testée
en rôle d'administration n'est pas une fonction testée.* Le rôle qui l'exécutera
n'a ni les mêmes droits ni les mêmes garde-fous.

Rejoué après correction, par le chemin du navigateur :

| Appel | Résultat |
|---|---|
| Coordinateur, vérification à blanc | `ok: true` — 264 affectations, 9 médecins, 2 sites, 13 créneaux |
| Médecin non coordinateur | refusé |
| Coordinateur, `CB` sans correspondance | `ok: false`, `manquants: {medecins: ["CB"]}` |
| Coordinateur, écriture réelle avec mémorisation | 264 règles, plan en `draft` |

Le brouillon de test a été supprimé ; `plan_applicable()` rend toujours le V1.

##### 15. Sous-étape 6F — FAITE (01/08/2026)

`docs/sql/22-6F-1-agenda-activation-plan.sql` et
`components/settings/RotationPlanDiff.tsx`.

##### ⚠️ La doc disait « archiver le plan sortant ». C'était un bug.

La cible décrite plus haut annonçait : « l'ancien est archivé avec sa
`effective_to` ». Pris au pied de la lettre, **le V1 aurait disparu de la
résolution des dates passées** : `getRotationPlans()` ne charge que les plans
`active` ([rotationUtils.ts:56](../src/modules/agenda/lib/rotationUtils.ts)), et
`plan_applicable()` filtre pareil. « Quel roulement s'appliquait en mars ? »
n'aurait plus eu de réponse — ce que MOD-1 existe précisément pour corriger.

**Le plan sortant reste donc `active`, avec sa `effective_to` fermée.** Les
statuts se lisent ainsi :

| Statut | Sens |
|---|---|
| `draft` | préparé, hors de la frise |
| `active` | **dans** la frise : passé, présent ou futur |
| `archived` | retiré de la frise (brouillon abandonné, plan qui n'a jamais servi) — **pas** « périmé » |

« En vigueur aujourd'hui » n'est pas un statut mais un calcul : `active` **et**
la date du jour dans `[effective_from, effective_to]`. C'est déjà ce que fait
`estEnVigueur()` dans l'écran de 6D — les deux lectures concordent.

**La fonction d'activation.** `agenda.activer_plan_roulement(plan, date,
verifier_seulement)` — deuxième et dernière porte d'écriture des plans. Elle
ferme le sortant **avant** d'activer l'entrant, sans quoi le trigger de
non-chevauchement de 6B refuserait l'opération.

Garde-fous testés **par le chemin du navigateur** (PostgREST, rôle
`authenticated`) :

| Test | Résultat |
|---|---|
| Un non-coordinateur active | refusé |
| Date qui n'est pas un lundi | refusé — la semaine du basculement relèverait de deux plans |
| Date dans le passé | refusé — les gardes en sont déjà générées |
| Ancrage S1 postérieur à l'entrée en vigueur | refusé — donnerait une semaine de rotation négative |
| Activer un plan déjà actif | refusé |
| Activation du V2 au 04/01/2027 | V1 fermé au 03/01, V2 en vigueur au 04/01 |

**Le contrôle qui comptait — la frise après bascule :**

| Date interrogée | Plan rendu |
|---|---|
| Aujourd'hui | V1 |
| **Mars 2026 (passé)** | **V1 — l'historique survit** |
| 03/01/2027 (veille) | V1 |
| 04/01/2027 (bascule) | V2 |
| Mars 2027 | V2 |

**L'écran.** Différentiel en tableau (nature, semaine, jour, site, créneau,
avant → après), puis la grille de 6D avec sa prop `highlight` — construite en
6D pour exactement cet usage, et utilisée sans modification. Choix de la date
d'entrée en vigueur (le prochain lundi par défaut), puis `ConfirmDialog`.
L'activation appelle la fonction deux fois, en vérification à blanc puis en
écriture.

Un brouillon ne peut pas être activé sans passer par cet écran : le bouton
« Comparer et activer » n'existe que sur les brouillons, et c'est le seul
chemin.

**Différentiel V1 → V2 mesuré : 93 changements** — 25 ajoutées, 27 supprimées,
41 modifiées, sur 291 cases dans l'union. Soit **198 cases identiques**, très
exactement le « 198 sur 305 » relevé en juillet par le comparateur de fichiers,
retrouvé ici par un calcul entièrement différent.

*Écart assumé, à confirmer* : la fonction **exige un lundi**, alors que la
section « cas d'usage » évoque une activation « au 1er du mois choisi ». Une
bascule en milieu de semaine est calculable, mais donnerait un mardi en « S3 du
V1 » et un mercredi en « S1 du V2 » — illisible pour un cabinet qui lit son
roulement à la semaine. Le cas d'usage devient donc « le lundi qui suit le 1er
du mois ». À rouvrir si Matthieu préfère l'inverse.

##### 16. Sous-étape 6H — FAITE (02/08/2026)

`docs/sql/22-6H-1-agenda-ouvrir-semaines.sql`, `components/OpenWeeksModal.tsx`,
bouton **« Ouvrir des semaines »** dans la vue Semaine.

**Deux constats relevés dans les données ont fondé la conception :**

1. **La salle se dérive du créneau, sans exception.** Sur les 367 gardes
   couvertes par le plan des neuf dernières semaines, **367** utilisent
   `shift_types.default_room_id`. La prémisse de 6B-3 se vérifie dans les faits,
   donc la génération n'a pas besoin qu'on lui dise la salle.
2. **L'habituel se sépare de l'accidentel par la fréquence.** Quinze cases hors
   roulement existent ; **onze reviennent 7 à 9 fois sur 9 semaines** (donc
   chaque semaine) — `J5`, `J6`, `J7`, `J8` à Dijon selon les jours. Les
   **quatre autres n'apparaissent qu'une ou deux fois**, et ce sont des
   accidents de saisie : un créneau de week-end (`WE1`) posé un mercredi ou un
   vendredi. Un seuil à la moitié des semaines de référence les sépare
   proprement.

**`agenda.creneaux_hors_plan(n)`** déduit ces cases et marque les habituelles.
Elle sert à **pré-cocher** l'écran, jamais à décider seule : une déduction sur
l'historique reproduirait fidèlement une anomalie passée. Le coordinateur garde
la main — même philosophie que l'écran de correspondance de 6E-3. Les cases
non habituelles s'affichent décochées, avec leur fréquence en étiquette.

**`agenda.ouvrir_semaines(debut, semaines, hors_plan, verifier_seulement)`** est
en **`security invoker`**, volontairement — contrairement aux fonctions d'import
et d'activation. Celles-là devaient franchir un verrou ; ici les coordinateurs
ont déjà le droit d'écrire dans `shifts`, donc la RLS s'applique normalement et
aucun privilège n'est accordé sans nécessité.

Elle reprend **exactement** l'arithmétique de `getRotationWeek()` et résout le
plan jour par jour : une période à cheval sur deux roulements applique le bon de
part et d'autre.

Garde-fous testés **par le chemin du navigateur** :

| Test | Résultat |
|---|---|
| Un non-coordinateur ouvre | refusé |
| Début qui n'est pas un lundi | refusé |
| 99 semaines | refusé (bornes 1–52) |
| Période déjà occupée | refusé, avec le nombre de gardes trouvées |
| Vérification à blanc, 8 semaines | 352 cases — 264 du plan, 88 hors roulement |
| Ouverture réelle d'une semaine | 42 gardes **en 0,20 s** |

**Le contrôle qui comptait** — sur la semaine du 04/01/2027 : **42/42 gardes
dans la salle par défaut de leur créneau**, et **31 règles du plan V2 sur 31 ont
produit la bonne garde avec le bon médecin**. Les 11 restantes sont libres, pour
les remplaçants.

**Dette réglée** : `duplicateWeekTemplate` faisait une requête d'existence par
case et par jour — ~380 allers-retours enchaînés pour 8 semaines — alors qu'elle
venait de vérifier que la période était **vide**. Ces requêtes ne pouvaient rien
trouver. Supprimées.

~~*L'ancien chemin (modèle de semaine) n'est pas retiré* : Charlotte peut s'y
appuyer, et le supprimer sortirait du cadre de MOD-1. Il est simplement passé en
bouton secondaire, « Ouvrir des semaines » devenant le chemin principal.~~

> ⚠ **Périmé le 27/08/2026 — la duplication de modèle est supprimée (8B-1a).**
> La phrase était vraie tant qu'on ne savait pas si le nouveau chemin couvrait
> tous les usages ; elle est conservée barrée plutôt que supprimée, comme celle
> de 7F. Ce qui l'a renversée : la duplication ne se contentait pas de faire
> doublon, elle **contournait les corrections de 6H-2 et 6H-3** — pas de jours
> fériés, et pas d'ouverture des gardes du roulement absentes de la semaine
> type. Détail sous « Étape 8 » dans le suivi d'avancement.

##### 17. Sous-étape 6H-2 — la révision qui corrige 6H-1 (02/08/2026)

Deux remarques de Matthieu sur l'écran livré la veille. Toutes deux justes, et
la première a mis au jour un vrai trou fonctionnel.

**« Il y a 2 créneaux de WE1 le vendredi : à mon avis c'est un bug. »** Ce n'en
était pas un — `WE1 Beaune` et `WE1 Dijon` sont deux créneaux distincts, le nom
portant le site. Mais le relevé a révélé bien pire.

**Les 18 gardes de week-end posées en semaine tombent TOUTES sur un jour
férié** : Pâques, 1er Mai, 8 Mai, Ascension, Pentecôte, 14 Juillet, 11 Novembre,
Noël, Jour de l'An. Neuf fériés, zéro exception. Le cabinet traite un férié
comme un jour de week-end, et cela **remplace** la journée :

| Date | Gardes ouvertes |
|---|---|
| Vendredi 18/12 (ordinaire) | **10** — J1 à J8 |
| Vendredi 25/12 (Noël) | **2** — `WE1` sur chaque site |
| Mercredi 11/11 (Armistice) | **2** |

**Ma déduction par fréquence de 6H-1 avait classé ces cases en « accidents de
saisie ».** C'était faux : elle voyait « 2 fois sur 9 semaines » sans pouvoir
comprendre pourquoi. *Un chiffre sans cause n'est pas un diagnostic* — et ni le
roulement ni la fonction d'ouverture n'avaient la moindre notion de jour férié.

**« Je trouverais ça plus simple de montrer un tableau avec une semaine type. »**
Une liste de cases à cocher ne montre pas ce qui sera **fermé**, or c'est ce que
Charlotte doit vérifier. Et le cabinet ouvre plus de créneaux l'hiver que l'été :
il y a plusieurs semaines types, qu'il faut pouvoir reconnaître.

**Ce que 6H-2 change.** La séparation devient franche : *la semaine type dit
quelles cases ouvrent (l'offre), le plan dit qui les occupe (l'affectation).*

- **Les semaines types réutilisent `opening_week_templates`**, qui existe depuis
  l'origine et contenait déjà « Semaine type hiver » et « semaine hiver WE non
  doublée ». Le concept était juste, il lui manquait un écran qui le montre.
- **La grille** : créneaux en lignes, jours en colonnes. Les cases du roulement
  sont **verrouillées ouvertes** — les fermer priverait un associé de sa garde.
- **`agenda.jours_feries()`** calcule les 11 fériés français (dates fixes +
  Pâques par l'algorithme grégorien anonyme). **Vérifié : 9 fériés observés en
  base, 9 reconnus.**

**Une 8e colonne « Férié », et pourquoi elle existe.** Première tentative : « un
férié ouvre les créneaux du dimanche ». Le test l'a invalidée — elle produisait
**5 gardes** sur le lundi de Pâques (les `WE1`, les deux doublons `WE2` et le
vestige `J3 Dijon`) là où les fériés observés n'en portent que **2**. Plutôt que
de deviner une règle (« `WE1` oui, `WE2` non ») à redécouvrir à chaque évolution
des créneaux, le férié devient une **colonne de la grille**, réglée par la
coordinatrice.

Elle se pré-remplit d'après les fériés passés, **à la majorité et non en
union** : sur les 12 fériés en base, 11 portent exactement `WE1` sur chaque site,
mais le Jour de l'An 2026 — le plus ancien, antérieur à la pratique actuelle — a
été ouvert comme une journée ordinaire. L'union aurait fait revivre ce cas unique
à chaque férié. *Cette fois la fréquence a une cause identifiée : c'est ce qui
manquait à 6H-1.*

Les gardes de férié restent **sans affectation** : le roulement ne les couvre
pas, et les deux derniers fériés en base sont effectivement libres. Les
attribuer d'office inventerait une règle que le cabinet n'a jamais posée.

*Défaut de performance corrigé en cours de route* : la déduction des créneaux de
férié, écrite en sous-requête corrélée, relançait le calcul des fériés pour
chaque ligne de `shifts` et dépassait le délai d'exécution. Extraite dans
`agenda.creneaux_ferie_habituels()`, calculée une fois.

**Contrôle sur données réelles** — 2 semaines à partir du lundi de Pâques 2027,
avec « Semaine type hiver » : 118 gardes, 62 pré-affectées, et **2 gardes sur le
férié**, conformes aux 11 fériés sur 12 observés.

##### 23. « Appliquer aux gardes du roulement » remontait dans le passé (03/08/2026)

Signalé par Matthieu : en assignant une garde de 2027, le message d'erreur
annonçait un conflit sur le **30/12/2025** — et le bouton « Assigner sur toute
la semaine de roulement » semblait sans effet.

**Un seul défaut, deux symptômes.** Les deux copies de cette action
(`useShiftDetail` et `AssignDoctorModal`) annoncent en commentaire « les gardes
**futures** de la même case du roulement », mais **aucune ne filtrait par
date** : la requête ramassait tout l'historique. Or **125 gardes passées sont
encore `free` ou `pending`** en base, du 29/12/2025 au 31/07/2026 — l'héritage
de l'ancienne application, où des créneaux non pourvus sont simplement restés
ouverts.

Le déroulé exact : la seule autre garde de la case était le 30/12/2025 ; le
contrôle de conflit a vu que le médecin travaillait déjà ce jour-là ; la liste
des gardes à assigner s'est retrouvée vide ; la fonction est sortie en affichant
l'erreur. Rien ne se passait, et le motif invoqué remontait à quinze mois.

`.gte('date', aujourdhui)` dans les deux copies. **Le commentaire disait déjà
la bonne règle — c'est le code qui ne la mettait pas en œuvre.**

*Ajout* : quand il n'y a rien à propager, l'écran le dit désormais (message
neutre, pas une erreur) et rappelle que la garde de départ est bien assignée.
Auparavant il fermait sans un mot, ce qui se lit comme un bouton sans effet —
c'est d'ailleurs ce qui a mis Matthieu sur la piste.

##### 22. Sous-étape 6G — FAITE (03/08/2026)

**La contrepartie du verrou.** Depuis 6B, l'application n'écrit plus jamais le
plan. Le principe ne tient au quotidien que si Charlotte dispose d'un **chemin
de retour vers le fichier** — sans lui, le moindre ajustement permanent
demanderait de rouvrir Numbers séance tenante, et le verrou finirait contourné,
exactement comme la double vérité qu'on venait d'éliminer.

**`agenda.rotation_plan_changes`** — un carnet, pas une file d'écriture. Rien
n'y modifie le plan, jamais, même après report. La seule façon de changer le
roulement reste le fichier, puis l'import de 6E. *Les trois écrans le disent
sans détour* : sans cela, on croira le changement appliqué.

Deux choix de modélisation qui comptent :

- **La case du roulement est dénormalisée** (semaine, jour, site, créneau) :
  elle doit survivre à la suppression de la garde d'origine, qui n'est que le
  prétexte de la saisie.
- **`plan_id` enregistre le plan en vigueur au moment du souhait** : sans lui,
  une note prise sous le V1 deviendrait illisible une fois le V2 en place —
  « S3 lundi » ne désigne pas la même chose d'un plan à l'autre.

**C'est la base qui traduit la garde en case de roulement.** « La garde du lundi
18/01/2027 » devient « S3 · Lundi · J3 Dijon ». Ce calcul — plan applicable,
puis semaine de rotation — est celui qui a produit les défauts les plus subtils
de MOD-1 ; il vit déjà dans `ouvrir_semaines` et dans `getRotationWeek`. On ne
l'a pas écrit une troisième fois dans un composant React.

*Garde-fou utile* : réenregistrer sur la même case **remplace** le souhait
précédent (index unique partiel sur les `pending`), plutôt que d'empiler des
doublons qu'il faudrait démêler au report.

**L'écran** : bouton « Signaler un changement permanent » sur une garde
(coordinateur, quand la case relève du roulement), et récapitulatif sous la
liste des plans dans Paramètres → Roulement. Le récapitulatif rend les lignes
**dans la forme où le fichier les attend** — `S3 · Lundi · J3 Dijon : AS → MY` —
avec un bouton « Copier la liste » : le report se fait dans Numbers, hors de
l'application, et recopier quinze lignes à l'œil est une source d'erreur qu'un
presse-papier supprime.

##### ⚠️ Une fuite de lecture, trouvée par le test de bout en bout

`modifications_souhaitees()` était en `security definer` **sans contrôle
explicite** : la policy réservant la lecture aux coordinateurs était donc
contournée, et n'importe quel médecin pouvait lire le carnet de la coordination
— qui elle souhaite déplacer, et pourquoi. L'écriture, elle, était bien
refusée.

Invisible à la relecture : la table *a* sa policy, la fonction *a* l'air
correcte. Seul l'appel réel avec un jeton de non-coordinateur l'a montré.
*C'est la deuxième fois en trois jours que `security definer` fait sauter un
contrôle qu'on croyait posé* — à vérifier systématiquement sur les fonctions à
venir.

| Test | Résultat |
|---|---|
| Un non-coordinateur enregistre | refusé |
| Garde inexistante | refusé |
| Souhaiter le médecin déjà au roulement | refusé — « il n'y a rien à reporter » |
| Réenregistrer sur la même case | remplace, même identifiant, pas de doublon |
| Souhait « personne » (sortir la case du roulement) | accepté |
| Marquer comme reportée | statut changé, la ligne passe à l'historique |
| Un non-coordinateur **lit** le carnet | refusé (après correction) |
| Un non-coordinateur **écrit** dans le carnet | refusé |

##### 21. Le modèle final de l'ouverture — l'offre ouvre chaque semaine (03/08/2026)

Signalé par Matthieu, captures à l'appui : `J8` coché — et même **verrouillé**
— dans la grille mais absent du calendrier ; `J2 Dijon` manquant le mardi et le
mercredi de S4 ; `J4` et `J7` manquants le vendredi de S4 ; d'autres cases sur
S3. Vérifié : les quatre cases partagent le même motif — **le plan couvre ce
jour de semaine, mais pas cette semaine-là du cycle** — et la règle de la
veille les fermait alors entièrement.

**C'est ma règle qui était fausse, pas son application.** Le fonctionnement
historique du cabinet — celui de l'ancienne duplication de modèle — est le
bon : *une case de la semaine type ouvre chaque semaine ; le roulement y place
ses médecins quand ses règles tombent sur la date ; le reste demeure libre
pour les remplaçants.* Un `J2 Dijon` sans associé en S3 ne disparaît pas :
c'est une garde à prendre.

**L'erreur de diagnostic, nommée pour ne pas la refaire** : avoir pris « le
nombre de libres doit être constant » pour l'invariant. Le vrai invariant est
**l'offre constante** — les libres varient avec la semaine du cycle, par
construction, et c'est précisément l'information utile aux remplaçants. La
sur-ouverture à 61 gardes qui m'avait fait dévier venait d'ailleurs : l'écran
envoyait aussi les cases *verrouillées* (déduites du plan mais absentes de la
semaine type, comme `J4 Beaune`) dans l'offre permanente.

**Le modèle final, en trois phrases :**

1. Les gardes du roulement s'ouvrent **quoi qu'il arrive**, à leur semaine du
   cycle, avec leur médecin — que la case soit cochée ou non.
2. Une case **cochée** ouvre **chaque semaine** — affectée si le roulement y
   place quelqu'un, libre sinon.
3. **Le verrou disparaît.** Fermer une case ne peut plus priver un associé de
   sa garde (le point 1 y veille), donc plus rien n'est verrouillé. À la
   place, un badge ↻ « roulement ». Les cases du plan absentes de la semaine
   type apparaissent décochées avec ce badge : les cocher les ouvre *en plus*
   aux remplaçants.

Techniquement : dans `semaine_type`, les lignes issues du plan assurent la
présence de la case dans la grille mais ne la marquent plus « ouverte »
d'office ; dans `ouvrir_semaines`, la branche (b) ouvre toutes les cases de
l'offre et ne déduplique que contre ce que (a) a posé à la même date.

**Contrôle — les cinq cases signalées, après correction : toutes ouvertes et
libres.** Et le profil des 8 semaines :

| | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gardes | 53 | 55 | 54 | 54 | 53 | 56 | 52 | 53 |
| Affectées | 31 | 37 | 31 | 35 | 30 | 38 | 28 | 34 |
| Libres | 22 | 18 | 23 | 19 | 23 | 18 | 24 | 19 |

52–56 gardes par semaine — l'ordre de grandeur historique (46–54) —, les
affectées calquées sur le plan, les libres en sens inverse.

*Note pour Charlotte et Matthieu* : `J8 Dijon` le lundi n'est **pas** dans la
« Semaine type hiver » (l'écran d'hier le montrait verrouillé-ouvert à tort à
cause de l'union avec le plan). Il s'affiche désormais décoché avec le badge.
Le cocher l'ouvrira réellement chaque lundi — et cette fois c'est vrai.

##### 20. Le bug des créneaux remplaçants manquants (02/08/2026)

**« Pas d'ouverture en cabinet B2 le lundi et le mardi. »** Signalé par Matthieu
sur une semaine ouverte avec le correctif précédent.

**Une seule cause pour deux symptômes : la contamination par le V1.** Les deux
requêtes qui demandent « cette case est-elle au roulement ? » lisaient *tous les
plans actifs*. Or depuis 6F, **deux plans sont actifs en permanence** — le V1
(jusqu'au 03/01/2027) et le V2 (à partir du 04/01). Et le V1 contient des
`J5 Dijon` le lundi, que le V2 ne connaît pas du tout.

Conséquence : en janvier 2027, `J5 Dijon` passait pour une case du roulement, se
trouvait donc exclue de l'offre remplaçants, **et n'était affectée par personne
puisque le V2 l'ignore**. La case disparaissait purement et simplement.

*C'est un effet de bord direct du versionnement des plans* : tant qu'un seul
plan existait, « les plans actifs » et « le plan applicable » se confondaient.
Les deux fonctions lisent désormais `agenda.plan_applicable(date)`.

**Une seconde tentative, et pourquoi elle était fausse aussi.** J'ai d'abord fait
porter l'exclusion sur *ce que la branche (a) avait posé ce jour-là*. Cela
rétablissait bien `J5 Dijon`, mais ouvrait **en case vide** tout créneau du
roulement dans les semaines du cycle où le plan ne s'en sert pas : `J4 Beaune`
se retrouvait libre 7 jeudis sur 8, et la semaine passait de 48 à **61 gardes**.

La règle juste : **une case du roulement n'ouvre que quand le roulement s'en
sert.** Sa présence dans le plan applicable, à ce jour de semaine, suffit à la
retirer de l'offre permanente — quelle que soit la semaine du cycle où elle
sert.

Le contrôle qui tranche entre les trois versions est la **stabilité du nombre de
cases libres** : l'offre remplaçants ne dépend pas de la semaine de rotation.

| Version | Gardes/semaine | Libres/semaine |
|---|---|---|
| Exclusion sur « tous les plans actifs » | 42–48 | 11 — mais `J5 Dijon` manquant lundi et mardi |
| Exclusion sur ce que (a) a posé | **61** partout | 23 à 33 — **variable, donc faux** |
| **Exclusion sur le plan applicable** | 42–52 | **14, constant** ✓ |

Résultat final, avec « Semaine type hiver » :

| Semaine | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gardes | 45 | 51 | 45 | 49 | 44 | 52 | 42 | 48 |
| Affectées | 31 | 37 | 31 | 35 | 30 | 38 | 28 | 34 |
| Libres | 14 | 14 | 14 | 14 | 14 | 14 | 14 | 14 |

Les affectées suivent exactement les effectifs du plan V2.

*Effet de bord signalé à Matthieu* : `Cabinet B3` reste fermé le lundi, et c'est
correct — la semaine type y place `J5 bis Dijon`, créneau désactivé en 6A. Pour
l'ouvrir, cocher `J8 Dijon` dans la grille.

**Ajout à l'écran** : les cases ajustées à la main survivent désormais au
rechargement de la grille. Comme celle-ci dépend maintenant de la date (le plan
applicable en dépend), changer la date aurait sinon effacé les ajustements sans
prévenir.

##### 19. Sous-étape 6F-2 — supprimer un brouillon (02/08/2026)

Demandé par Matthieu après qu'un import répété a laissé deux brouillons
identiques dans la liste des plans.

**`agenda.supprimer_plan_roulement()`** — troisième et dernière porte d'écriture
des plans, après l'import (6E-2) et l'activation (6F-1). Les policies RLS n'en
accordent toujours aucune en direct.

**Réservée aux brouillons, et c'est le point important.** Supprimer un plan
`active` effacerait la réponse à « quel roulement s'appliquait en mars ? » —
précisément l'historique que 6F a pris soin de préserver en *ne l'archivant
pas*. Un plan qui a servi ne se supprime pas : il se ferme.

**Nuance apportée au message de confirmation.** Matthieu le formulait ainsi :
« il faudra réimporter une version de planning pour rouvrir des jours ».
L'intention est juste mais la conséquence est plus étroite — un brouillon n'a
jamais été appliqué, donc le supprimer **n'a aucun effet sur les jours déjà
ouverts ni sur le planning en cours**. Ce qu'on perd, c'est le plan préparé.
Écrire l'inverse aurait inquiété à tort au moment de cliquer. Le message retenu :

> « Roulement V2 - 9 associés » et ses 264 affectations seront supprimés. Ce
> plan n'a jamais été appliqué : le planning en cours et les semaines déjà
> ouvertes ne changent pas. Pour le retrouver, il faudra réimporter le fichier
> de roulement.

| Test | Résultat |
|---|---|
| Un non-coordinateur supprime | refusé |
| Supprimer le plan **en vigueur** | refusé, avec le motif |
| Supprimer le plan V1 (historique) | refusé |
| Plan inexistant | refusé |
| Supprimer un brouillon | 264 règles parties en cascade, 0 orpheline |

##### 18. Deux correctifs signalés par Matthieu le 02/08/2026

**1. Deux lignes `WE2` dans la grille du roulement.** Cause : l'espace parasite
de `WE 2 Dijon`. La grille dérive le code en retirant le site et la plage
horaire du nom — `WE2 beaune 08h-20h` donne `WE2`, mais `WE 2 Dijon` donnait
`WE 2`. Deux codes, donc deux lignes, là où le doublon de week-end n'en est
qu'un. Que `WE1 Dijon` et `WE1 beaune 08h-20h` se rejoignent bien sur une seule
ligne confirmait le diagnostic.

Renommé en `WE2 Dijon` (script `22-6H-3`). Sans risque : tout ce qui pointe vers
un créneau le fait par son identifiant, et la colonne texte `shifts.shift_type`
porte la plage horaire, pas le nom. Répercuté dans `desiderata.yaml`,
`22-6-outil-comparer-roulement-fichiers.py` et l'amorçage de `22-6E-2`.

**2. Sur-ouverture — un défaut introduit par 6H-2 lui-même.** En confiant à la
semaine type le pilotage de *toutes* les cases, y compris celles du roulement,
j'avais perdu ce que 6H-1 faisait bien : **le plan se résout semaine de rotation
par semaine de rotation.**

Une semaine type ne distingue pas les 8 semaines du cycle. Marquer « du
roulement » une case que le plan n'utilise qu'en S8 la faisait donc ouvrir
**toutes** les semaines. Mesuré sur les données : la semaine du 15/02/2027 est
une S7, à 28 affectations au plan — elle a reçu **63 créneaux**, soit 35 cases
vides sans raison d'être.

`ouvrir_semaines` génère désormais en trois temps distincts :

| | Source | Rythme | Médecin |
|---|---|---|---|
| **a** | Les règles du plan | par semaine de rotation | affecté |
| **b** | La semaine type, cases **non** couvertes par le plan | chaque semaine | libre |
| **c** | La colonne « Férié » | sur les jours fériés | libre |

Contrôle après correction, avec « Semaine type hiver » :

| Semaine ouverte | Gardes | Affectées | Règles du plan |
|---|---:|---:|---|
| 22/02/2027 (S8) | 45 | **34** | S8 = 34 ✓ |
| 01/03/2027 (S1) | 42 | **31** | S1 = 31 ✓ |
| 29/03/2027 (S5, lundi de Pâques) | 36 | 24 | S5 = 30, moins les 6 du lundi remplacé ✓ |

*Ce que l'épisode enseigne* : la semaine type et le plan ne sont pas deux
descriptions de la même chose à des niveaux différents. **Le plan a une
dimension que la semaine type n'a pas — le cycle.** Toute tentative de faire
porter les cases du roulement par la semaine type écrase cette dimension, et
l'écrasement ne se voit qu'au comptage.

*À signaler à Charlotte* : « Semaine type hiver » contient `J3 Dijon` le samedi
et le dimanche — le **vestige de modélisation** documenté en 6B, d'avant la
création du créneau `WE1 Dijon`. Le modèle date de novembre 2025 et a figé cet
état. La grille le montre et permet de le décocher ; une liste de cases à cocher
ne l'aurait jamais laissé voir.

---

`source_file_name` et `imported_at` restent **volontairement NULL** : ce plan ne
vient pas d'un fichier, c'est le relevé d'un état construit à la main dans
l'application pendant sept mois. C'est précisément ce que MOD-1 fait cesser.

---

#### ⚠️ Le format du fichier a déjà changé entre deux versions

Le cabinet dispose de deux fichiers de roulement, de structures **différentes** :

| | `planning-actuel_2025-12.xlsx` | `planning-V2_2026-07.xlsx` |
|---|---|---|
| Origine | Saisie manuelle dans Numbers | Généré par le script d'optimisation |
| Ligne d'en-tête | ligne 3, semaines en colonnes D→S | ligne 3, semaines en colonnes C→R |
| Colonne jour / créneau | B et C | A et B |
| Créneaux | `J1`…`J5` + `J6 ou J7 ou J8` | **`J1` à `J8`, une ligne chacun** |
| Cellules composites | Oui (`LD J7`, `AS J8`) | **Non — une initiale par cellule** |
| Feuilles | `Feuille 1` + doublon `Feuille 1-1` | `Roulement V2` + 9 feuilles par médecin |

Deux formats en sept mois : c'est la confirmation définitive que **le parseur doit repérer la grille par son contenu** (chercher la ligne contenant des libellés `S<n> <site>`, en déduire les colonnes ; chercher la colonne des créneaux par ses valeurs `J1`, `Garde`…), et **jamais par des coordonnées fixes**. Il doit accepter les deux formats, donc gérer aussi bien les cellules simples que composites.

---

### MOD-1 bis — Articulation avec le pipeline d'optimisation existant

Le cabinet dispose déjà d'un outillage indépendant, hors application :

- `desiderata.yaml` — **source unique de vérité** des contraintes : créneaux, capacités, règles dures, fiches individuelles des 9 associés (site fixe/flexible, cibles J2, gardes week-end, interdictions, jours non travaillés).
- `1_optimize.py` — optimiseur sous contraintes **OR-Tools CP-SAT**. Part du planning existant et minimise le bouleversement ; ne décide que l'étiquette J2 / journée, J2 étant la seule ressource rare.
- `2_generate_xlsx.py` — génère la grille V2 + 9 feuilles imprimables par médecin.
- `verifie-planning.py` — vérificateur indépendant en lecture seule (443 lignes) : contrôle les 6 règles dures, les desiderata codifiables et la règle « lundi off après week-end travaillé ». Fonctionne aussi sur un fichier **retouché à la main** après négociation entre associés.

**Recommandation : ne PAS réimplémenter l'optimiseur dans l'application.** La conception d'un roulement est une opération rare (quelques fois par an), qui suppose des arbitrages humains et des négociations avec l'équipe ; l'outillage Python existant la traite bien. L'application est la couche de **diffusion et d'exécution**, pas de conception.

**Frontière proposée :**

```
desiderata.yaml ──► 1_optimize.py ──► 2_generate_xlsx.py ──► planning-Vx.xlsx
                                                                   │
                                              (retouches manuelles Numbers)
                                                                   │
                                                          verifie-planning.py
                                                                   │
                                                          3_export_app.py  ◄── À CRÉER
                                                                   │
                                                          roulement-Vx.json
                                                                   │
                                            Omnès-Orga → import → rotation_plans
```

**Script `3_export_app.py` à créer** (une trentaine de lignes, dans le pipeline Python, pas dans l'application) : lit le fichier `.xlsx` **final** — quelle que soit son origine, généré ou retouché à la main — et émet un JSON canonique :

```json
{
  "plan": { "nom": "Roulement V2 juillet 2026", "cycle_semaines": 8,
            "date_debut": "2026-09-07", "source": "planning-V2_2026-07.xlsx" },
  "creneaux": [ { "code": "J1", "debut": "08:00", "fin": "16:00",
                  "sites": ["Beaune"], "unique_par_site_jour": true } ],
  "medecins": [ { "code": "IEG", "nom": "Imane El Gari" } ],
  "affectations": [ { "medecin": "CB", "semaine": 1, "jour": "Lundi",
                      "site": "Beaune", "creneau": "J1" } ]
}
```

Intérêt : toute la fragilité de lecture reste dans le pipeline Python, là où l'expertise et le vérificateur vivent déjà. L'import côté application devient trivial et robuste — il ne fait plus que valider un JSON et créer un plan. L'import `.xlsx` direct reste utile en secours, mais ce n'est plus le chemin principal.

**Règles dures à porter dans l'application** (validation à la création/affectation d'une garde, à aligner avec `src/lib/shiftValidation.ts`) : un seul `J2` par site et par jour ; un seul `J1` par jour à Beaune ; maximum 9 associés simultanés sur la fenêtre 14:00–16:00 ; maximum 6 salles occupées par site ; lundi off obligatoire après un week-end travaillé.

> **⚠️ Une règle en moins — corrigée par Matthieu le 01/08/2026.** Cette liste
> comptait « jamais un associé sur `J6` », reprise telle quelle de
> `desiderata.yaml` (« ne doit JAMAIS contenir un associé »). **C'est faux** :
> `J5` et `J6` vont *en pratique* aux remplaçants, mais rien ne doit empêcher
> d'y assigner un associé. C'est un usage habituel, pas un invariant — donc
> **jamais un contrôle bloquant**, tout au plus un avertissement. `desiderata.yaml`
> a été corrigé (`usage_habituel: remplacants` au lieu de `reserve_remplacants`),
> et la correction est à reporter dans `verifie-planning.py`, qui compte
> aujourd'hui ce cas comme une violation.
>
> Le piège est instructif pour la suite de MOD-1 : une contrainte écrite en
> majuscules dans un fichier de configuration n'est pas nécessairement une règle
> dure. Chaque règle de `shiftValidation.ts` mérite d'être reconfirmée avant
> d'être transformée en verrou — un verrou de trop se paie en blocages
> incompréhensibles pour la coordinatrice.

**Incohérence repérée dans le pipeline** (à corriger côté Python, indépendamment de l'application) : `desiderata.yaml` se présente comme la source unique de vérité et prévoit que l'optimiseur le lise, mais `1_optimize.py` code encore en dur le dictionnaire `targetJ2` et le bloc des desiderata. Les valeurs coïncident aujourd'hui, mais la duplication finira par diverger. Sa section 4 (« Cibles J2 retenues pour la V2 ») est par ailleurs vide, les cibles vivant dans les fiches individuelles `j2_cible`.

#### Cas d'usage à couvrir explicitement

- **Association d'un nouveau médecin** → nouveau plan importé depuis l'Excel mis à jour, activé au 1er du mois choisi. Les plannings déjà publiés ne bougent pas.
- **Ouverture d'un nouveau lieu / nouvelle salle** → création du site/salle dans les paramètres, puis import d'un plan intégrant les nouvelles colonnes.
- **Départ d'un médecin** → le plan archivé conserve ses affectations passées ; le profil reste en base (désactivé) pour ne pas casser l'historique.

---

### MOD-1 — découpage en sous-étapes (arrêté le 01/08/2026)

Révisé après la décision « plan verrouillé + aide au report » — d'où la
sous-étape 6G, absente du découpage initial.

| | Contenu | Écrit en base ? |
|---|---|---|
| **6A** | ✓ **FAITE** — Correction des créneaux, création des 4 créneaux Beaune. | Fait |
| **6B** | ✓ **FAITE** — Tables `rotation_plans` / `rotation_plan_rules` + RLS en lecture seule, plan « Roulement V1 » créé avec 268 règles. Anciennes tables intactes. | Fait |
| **6C** | ✓ **FAITE (6C-1 à 6C-3)** — Code basculé sur les plans à iso-comportement, écriture du roulement retirée, écran de paramètres passé en consultation. **6C-4 (suppression des anciennes tables) est reportée après la bascule** — voir ci-dessous. | Non |
| **6D** | ✓ **FAITE** — Écran Paramètres → Roulement : liste des plans + **grille consultable** à la disposition du fichier (créneaux en lignes, semaines × sites en colonnes). | Non |
| **6E** | ✓ **FAITE (6E-1 à 6E-3)** — Le `.xlsx` → JSON canonique (Python) ; la fonction d'import `security definer` + la mémoire des correspondances ; l'écran d'import avec correspondances pré-remplies et rapport d'anomalies. | Fait |
| **6F** | ✓ **FAITE** — Fonction d'activation `security definer` + écran de différentiel (tableau des changements, grille en évidence, choix de la date, confirmation). | Fait |
| **6G** | ✓ **FAITE** — **Modifications souhaitées** : collecte depuis une garde, récapitulatif dans la forme du fichier avec copie au presse-papier, suivi du report. La contrepartie du verrouillage. | Fait |
| **6H** | ✓ **FAITE** — Révisée : « Ouvrir les N prochaines semaines depuis le plan », en remplacement du trio semaine de référence / modèle / duplication. Créneaux hors roulement déduits de l'usage et proposés cochés. | Fait |

#### Le pont plan → gardes existe déjà — relevé le 01/08/2026

Constat fait à partir d'une capture de Matthieu (calendrier vide au 04/01/2027)
et de son explication : « les dates ne sont pas encore ouvertes aux
remplaçants ; quand Charlotte fait une ouverture, le roulement se met par
défaut ». Vérification faite dans le code : **c'est exact, et ce pont tourne
déjà sur les nouvelles tables de plans** depuis 6C.

`lib/weekTemplateUtils.ts` → `duplicateWeekTemplate()` : chaque jour généré
résout **son propre** plan (`getPlanForDate`), calcule sa semaine de rotation,
cherche la règle correspondante et pré-affecte le médecin
(`status = 'assigned'`). Une période à cheval sur deux roulements applique donc
le bon de part et d'autre — ce qui rend l'activation du V2 en 6F sans effet sur
les semaines déjà ouvertes.

**Le modèle de semaine ne fait pas double emploi avec le plan.** Les deux
répondent à des questions différentes, et les chiffres le montrent :

| | Ce qu'il dit | Volume |
|---|---|---:|
| **Plan de roulement** | *qui* travaille — les 9 associés | 266 règles ÷ 8 semaines ≈ **33 cases/semaine** |
| **Modèle de semaine** | *quelles cases sont ouvertes* | ≈ **48 gardes/semaine** en base |

L'écart d'une quinzaine, ce sont les créneaux `J5`, `J6` et les salles
supplémentaires : **les cases des remplaçants**, que le roulement ne connaît pas
et ne doit pas connaître. C'est la clé de lecture posée plus haut — *rotation =
associés, demandes = remplaçants*. Le modèle porte l'**offre**, le plan porte
l'**affectation**.

**Mais le parcours actuel est plus lourd qu'il n'a besoin de l'être**, et c'est
l'intuition de Matthieu (« il y a peut-être plus simple à trouver »). Ouvrir des
semaines suppose aujourd'hui : disposer d'une semaine de référence bien formée,
l'enregistrer comme modèle, puis la dupliquer — et uniquement sur un calendrier
**vide**. Trois étapes et une condition, alors que le plan couvre à lui seul
toutes les cases des associés. Il ne manque qu'une liste courte : les créneaux
remplaçants à ouvrir systématiquement. **D'où la 6H révisée** : « Ouvrir les N
prochaines semaines », sans semaine de référence à fabriquer.

**Défaut relevé au passage** : `duplicateWeekTemplate` fait une requête
d'existence **par case et par jour**, soit ~380 allers-retours enchaînés pour 8
semaines. Or la fonction vient de vérifier que la période est **vide** : ces
requêtes ne peuvent rien trouver. C'est probablement ce qui rend l'ouverture
lente. À corriger avec 6H.

*Arbitrage de Matthieu (01/08/2026) : 6F d'abord.* Activer le V2 sans écran de
différentiel, ce serait laisser passer treize changements silencieux — le
dispositif existe précisément pour éviter ça.

---

**6C est le passage délicat** : le plan « V1 » migré doit produire exactement le
même calendrier qu'aujourd'hui — même numérotation S1–S8, mêmes pré-affectations.
Vérifiable ligne à ligne, et c'est la discipline appliquée en 7C : une migration à
comportement constant rend tout écart ultérieur suspect par construction.

~~**Décision en attente pour 6E**~~ — **tranchée le 01/08/2026 par Matthieu, en
faveur du JSON canonique produit en Python** (`3_export_app.py`), contre le
parsing `.xlsx` dans l'application. Pas de `npm install xlsx`. Motif décisif :
le parseur des deux formats existait déjà et était éprouvé. Détail en 6E-1.

---

### MOD-2 — Refonte du bouton d'annulation

#### Le système actuel

Table `undo_buffer` avec **`UNIQUE(user_id)`** : une seule action mémorisée par utilisateur, écrasée à chaque nouvelle action (`upsert`). Réservée au coordinateur. Le bouton interroge la base **toutes les 2 secondes** et utilise `alert()` pour les retours.

> **⚠ Correction apportée par l'audit du code (03/08/2026) : la couverture réelle
> est de 2 actions, pas de 6.**
>
> `undoUtils.ts` sait *rejouer* 6 types d'actions (`assign_shift`,
> `unassign_shift`, `validate_request`, `bulk_shift_create`,
> `bulk_shift_delete`, `delete_shift`), mais seuls **deux** endroits du code
> écrivent dans le tampon :
>
> | Action | Enregistrée ? | Où |
> |---|---|---|
> | Annulation d'assignation (garde seule) | oui | `hooks/useShiftDetail.ts:520` |
> | Duplication d'un modèle de semaine | oui | `lib/weekTemplateUtils.ts:252` |
> | Assignation d'un médecin | **non** | — |
> | Validation d'une demande | **non** | — |
> | Suppression d'une garde ou d'une série | **non** | — |
> | Suppression en masse | **non** | — |
>
> Les quatre derniers types sont du **code mort** : la fonction de rejeu existe,
> rien ne la nourrit. Vérifié dans `reference-agenda/` — **c'était déjà le cas
> dans l'appli Bolt**, ce n'est donc pas une régression du portage mais une
> couche jamais branchée (signature de l'empilement de prompts).
>
> **Conséquence** : les actions les plus lourdes ne sont pas annulables du tout,
> y compris « appliquer au roulement » — celle qui a libéré 100 gardes d'un seul
> clic le 29/07. Le problème n°4 ci-dessous (« couverture partielle ») est donc à
> lire comme *couverture quasi nulle sur ce qui compte*.
>
> **Autre relevé** : `handleDelete` (`useShiftDetail.ts:402`) fait un vrai
> `DELETE` et n'enregistre rien. Seul garde-fou : la suppression est refusée si la
> garde est `assigned` ou `pending`. Supprimer une série de gardes libres est
> définitif, ligne `fixed_duty_series` comprise.

#### Les problèmes

1. **Un seul niveau d'annulation** : une deuxième action rend la première définitivement irréversible.
2. **Aucune péremption** : le bouton reste actif indéfiniment. Le coordinateur peut annuler, sans s'en rendre compte, une action vieille de trois jours — alors que des médecins ont entre-temps demandé ou obtenu les gardes concernées. **C'est le risque le plus sérieux du dispositif actuel.**
3. **Aucune vérification de cohérence** avant d'annuler : l'état actuel n'est pas comparé à l'état attendu.
4. **Couverture partielle** : les actions sur les séries, les modèles de semaine et les attributions groupées ne sont pas toutes réversibles.
5. **UX datée** : `alert()` bloquant, mauvaise expérience sur mobile, sondage réseau permanent.
6. **Ambiguïté du mot « Annuler »** : dans cette appli, il désigne à la fois l'annulation d'une garde, l'annulation d'une demande, et l'annulation d'une action. À clarifier dans le vocabulaire de l'interface.

#### Trois pistes — arbitrées le 03/08/2026

> **Décision de Matthieu (03/08/2026) : piste C — l'hybride.** Avec deux
> précisions prises dans le même arbitrage :
> - **Périmètre** : *journaliser tout, ne proposer « Restaurer » que lorsque
>   c'est sûr.* Le journal enregistre l'ensemble des actions du coordinateur ; le
>   bouton de restauration n'apparaît que sur les entrées encore réversibles,
>   l'état actuel étant comparé à l'état attendu.
> - **Suppression douce retenue** : colonne `deleted_at` sur les gardes plutôt
>   que suppression réelle avec copie dans le journal. Motif : une réinsertion
>   après `DELETE` recrée un identifiant neuf et casse les liens (demandes,
>   série) — c'est exactement ce qui a rendu la réparation du 29/07 partielle.
>
> Les trois pistes restent décrites ci-dessous : elles gardent la trace du
> raisonnement, et les limites de A et de B expliquent la forme de C.

**Piste A — Le bandeau éphémère (modèle Gmail).**
Après chaque action, un bandeau apparaît en bas de l'écran : « 12 gardes créées — Annuler », avec un compte à rebours de 10 à 15 secondes, puis il disparaît. Plus de bouton permanent.
*Avantages* : supprime d'un coup le risque d'annulation périmée, mentalement évident, excellent sur mobile, permet d'empiler les actions puisque chaque bandeau ne concerne que la sienne.
*Limite* : plus rien à annuler si l'onglet est fermé entre-temps.

**Piste B — Le journal d'activité.**
Remplacer l'annulation par un historique complet : qui a fait quoi, quand, avec un bouton « Restaurer » sur les entrées réversibles.
*Avantages* : traçabilité — précieuse dans un cabinet médical pour savoir qui a supprimé une garde ; annulation possible bien après coup.
*Limite* : plus de travail, et la restauration tardive rouvre le risque de conflit.

**Piste C — L'hybride (recommandation).**
Bandeau éphémère pour l'annulation immédiate (couvre la grande majorité des cas) **+** journal d'activité pour la traçabilité, la restauration ciblée n'étant proposée que lorsque l'état actuel le permet encore.
À compléter par deux mesures de fond :
- **Suppression douce** (`deleted_at`) au lieu de suppression réelle pour les gardes : restaurer devient trivial et sans risque.
- **Garde-fou de cohérence** : avant toute restauration, comparer l'état actuel à l'état attendu. En cas d'écart (« cette garde a été demandée par le Dr X depuis »), afficher un avertissement explicite et laisser le choix, plutôt que d'écraser silencieusement.

Autres améliorations à prévoir quelle que soit la piste retenue : remplacer `alert()` par les notifications de l'appli principale, supprimer le sondage toutes les 2 secondes (l'état d'annulation vit côté client, ou via le temps réel Supabase), et raccourci clavier Ctrl/Cmd+Z sur les écrans coordinateur (usage desktop).

#### Deux contraintes techniques relevées avant le découpage (03/08/2026)

**1. La contrainte `unique_shift` interdit la suppression douce en l'état.**
`agenda.shifts` porte `constraint unique_shift unique (date, location, room,
shift_type)` (`22-7C-1`, jamais modifiée depuis). Avec un `deleted_at`, une garde
supprimée **continue d'occuper son créneau** : le coordinateur ne pourrait plus en
recréer une au même endroit le même jour. Il faut donc remplacer la contrainte par
un **index unique partiel** `where deleted_at is null`. Point non évident, à
traiter dans la même migration que la colonne, sans quoi le bug n'apparaîtrait
qu'au premier « je supprime puis je recrée » en usage réel.

**2. L'appli principale n'a aucun système de message à l'écran.**
`src/lib/notify.js` envoie des notifications **push** (Firebase, via l'Edge
Function `send-notification`) — ce n'est pas un afficheur de messages in-app. Il
n'existe donc rien à réutiliser pour remplacer les `alert()`. En revanche le
**bandeau éphémère de la piste C est lui-même un afficheur de messages** : une
fois construit, il sert aussi bien aux retours de succès et d'erreur. Les
`confirm()`, eux, ont déjà leur remplaçant : `BottomSheet` dans le module,
`ConfirmModal` dans l'appli principale.

#### MOD-2 — découpage en sous-étapes (arrêté le 03/08/2026)

> **Nommage : `MOD2-A` … `MOD2-G`, et non `2A` … `2G`.** Le découpage avait
> d'abord été noté `2A → 2G`, ce qui entrait en collision avec l'**étape 2**, dont
> la sous-étape A a déjà son script (`22-2A-agenda-beta-access.sql`). Les fichiers
> de MOD-2 sont donc préfixés `22-MOD2A-…`. Corrigé le 06/08/2026, avant que le
> premier script ne soit écrit.

**Le journal d'abord, le bandeau ensuite.** L'ordre n'est pas neutre : le bandeau
« Annuler » a besoin de quelque chose à annuler. S'il s'appuie sur la dernière
entrée du journal et sur la fonction de restauration, il devient presque gratuit
une fois MOD2-D livrée — alors que l'écrire en premier obligerait à inventer un
second mécanisme de mémorisation, puis à le jeter.

- **MOD2-A — Le journal en base.** ✓ FAITE. Table `agenda.activity_log` (qui, quoi, quand,
  lignes touchées, état avant / après) alimentée par des **déclencheurs**
  sur `shifts`, `requests`, `fixed_duty_series` et `rotation_plans`.
  - *Pourquoi un déclencheur et non un appel applicatif* : l'appel applicatif est
    exactement ce qui a échoué avec `undo_buffer` — 4 des 6 types n'ont jamais
    été câblés, et personne ne s'en est aperçu pendant des mois. Un déclencheur
    ne s'oublie pas, et il capture même les écritures faites hors module
    (scripts SQL, resynchronisation 7F).
  - *Pourquoi des déclencheurs **par instruction** (`for each statement` +
    `referencing new table`) et non par ligne* : côté supabase-js, une action de
    l'utilisateur est une instruction SQL unique (`.insert([12 lignes])` est une
    seule instruction). Un déclencheur par instruction produit donc **une** entrée
    de journal pour les 12 gardes, au lieu de 12 entrées illisibles. Le
    regroupement par action est obtenu sans variable de session — impossible via
    PostgREST, où chaque appel est sa propre transaction.
  - *Le regroupement des instructions en actions, par le `txid`* (ajout du
    06/08, non prévu au découpage initial) : une action de l'utilisateur est une
    transaction PostgREST, mais **pas toujours une seule instruction**. Approuver
    une demande écrit dans `requests`, ce qui réveille le déclencheur métier
    `update_shift_status` qui écrit à son tour dans `shifts` : deux instructions,
    deux entrées, un seul geste. Stocker l'identifiant de transaction les
    rattache l'une à l'autre. C'est ce qui lève la limite annoncée plus haut
    (« une action qui s'étend sur plusieurs instructions produit plusieurs
    entrées ») — elle est levée à l'affichage, pas dans la trace, qui reste
    fidèle à ce que la base a réellement fait.
  - RLS : lecture réservée au coordinateur, **aucune policy d'écriture** pour
    `authenticated` — seul le déclencheur écrit.
- **MOD2-B — Suppression douce.** ✓ FAITE. `deleted_at` sur `shifts` et
  `fixed_duty_series`, contrainte `unique_shift` convertie en index partiel (voir
  ci-dessus), suppression réelle fermée, et deux portes `security definer`
  (`supprimer_gardes` / `supprimer_serie`) — la policy de lecture interdisant à un
  `UPDATE` de rendre une ligne invisible. Détail dans le suivi d'avancement.
  - *Pourquoi filtrer par policy RLS et non par `.is('deleted_at', null)`* : le
    filtre applicatif demanderait de modifier ~40 requêtes réparties dans le
    module, avec la certitude d'en oublier. Exprimé une fois dans la policy de
    lecture, le module ne voit tout simplement plus les lignes supprimées, sans
    qu'on touche à une seule requête.
  - À vérifier dans la foulée : interaction avec le déclencheur métier
    `update_shift_status` et avec le `on delete cascade` de `requests`.
- **MOD2-C — L'écran « Journal d'activité ».** ✓ FAITE. Onglet coordination,
  entrées groupées par jour puis par transaction, filtre par nature d'action,
  détail dépliable, pagination vers le passé. **Lecture seule** — on regarde le
  journal vivre avant de lui donner des boutons. Détail dans le suivi
  d'avancement.
- **MOD2-D — Le garde-fou et la restauration.** ✓ FAITE. Fonction `security definer`
  `agenda.restaurer_action(log_id)` — la **quatrième porte** du module, dans la
  lignée des trois de MOD-1. Elle compare l'état actuel à l'état attendu ; en cas
  d'écart, elle refuse ou avertit explicitement, **jamais d'écrasement
  silencieux**. Elle marque l'entrée `undone_at` / `undone_by` pour interdire la
  double annulation. Le bouton « Restaurer » n'apparaît que sur les entrées que la
  fonction accepterait.
- **MOD2-E — Le bandeau éphémère.** ✓ FAITE. Composant `ActionToast` + contexte React monté
  dans le shell du module, adossé au journal et à `restaurer_action`. Livre aussi
  l'afficheur de messages qui manque à l'appli. **Suppression de `UndoButton`, de
  `undoUtils.ts` et de la table `undo_buffer`** : fin du sondage toutes les
  2 secondes.
- **MOD2-F — Vocabulaire et fin des `alert()` / `confirm()`.** ✓ FAITE, en quatre
  sous-étapes (F-1 vocabulaire, F-2 écrans de paramètres, F-3 fiche garde et vues
  restantes, **F-4 le journal couvre les paramètres** — non prévue au découpage).
  Détail dans le suivi d'avancement.
  - *Le décompte annoncé ici était faux* : « 20 `alert()` / `confirm()` restants
    (8 fichiers) » datait d'avant MOD2-E, qui en avait fait tomber 3, et comptait
    les `onConfirm(` d'un `grep` trop large. Le vrai reste était de **13 appels
    dans 6 fichiers** (8 `alert()`, 5 `confirm()`). Tous supprimés.
  - *« Retirer sa demande » était déjà en place* côté médecin (`CancelRequestModal`,
    `MyScheduleView`) depuis l'étape 4 — la moitié du travail annoncé était faite.
- **MOD2-G — Raccourci Ctrl/Cmd+Z** sur les écrans coordinateur. ❌ **ABANDONNÉ**
  (Matthieu, 24/08/2026, à la reconfirmation prévue). Motif : le bandeau porte déjà
  un « Annuler » visible, à portée de souris, avec compte à rebours. Un raccourci
  n'ajouterait qu'un **second chemin vers le même geste**, sur des écrans où l'on
  saisit aussi du texte (note du coordinateur) — avec le risque de déclencher une
  annulation en base en croyant défaire une frappe.

**Hors périmètre** : le roulement lui-même est déjà protégé par MOD-1 (plans
versionnés + trois portes en `security definer`) ; son historique est acquis
autrement. MOD2-A pose quand même un déclencheur sur `rotation_plans`, pour que le
journal raconte une histoire complète.

> **Ce que MOD-2 a coûté hors périmètre annoncé.** Trois défauts sérieux ont été
> trouvés **en testant**, jamais en relisant du code : le second index unique oublié
> par MOD2-B (`unique_doctor_per_day`, 31 gardes fantômes bloquant 9 médecins), la
> réécriture de 45 gardes pour en libérer une (`handleCancelAssignment('series')`),
> et le refus silencieux des policies `DELETE` (F-2). Les trois appartiennent à la
> même famille — **un mécanisme qui refuse sans le dire, ou qui agit plus largement
> que l'intention**. C'est l'argument le plus solide en faveur des suites de test
> par le chemin du navigateur : aucune des trois n'aurait été vue autrement.

##### La création de garde : message brut et séries orphelines (06/08/2026)

Relevé par Matthieu en testant MOD2-B : impossible de créer une série, avec pour
seule explication `duplicate key value violates unique constraint "unique_shift"`.

**Ce n'était pas une régression.** L'index unique
`(date, location, room, shift_type)` faisait son travail : la série créée une
heure plus tôt occupait déjà tous les lundis de la plage demandée. MOD2-B a même
rendu la règle **plus permissive** — une garde supprimée ne bloque plus son
créneau. Mais le message brut de PostgreSQL n'apprend rien au coordinateur et
laisse croire à une panne.

**Un défaut plus sérieux découvert en cherchant** : la ligne `fixed_duty_series`
était insérée **avant** les gardes, et rien ne la nettoyait si l'insertion
échouait. **10 séries vides traînaient en base**, dont 5 datant des 26 et 29
juillet — le défaut est antérieur à MOD-2 et s'accumulait en silence.

**Corrigé** : les dates sont calculées d'abord, les conflits contrôlés ensuite,
la série n'est créée **qu'après** ; si l'insertion échoue malgré tout (création
concurrente), la série est supprimée en douceur via `supprimer_serie`. Le message
nomme désormais le site, la salle, le créneau et les dates en conflit. Les
10 orphelines ont été passées en suppression douce — traçables, invisibles.

##### ⚠ Le SECOND index unique, oublié par MOD2-B (24/08/2026)

Trouvé par Matthieu en retestant la création : `duplicate key value violates
unique constraint "unique_doctor_per_day"`. Un deuxième message brut, mais une
cause différente — et un vrai défaut.

`agenda.shifts` porte **deux** index uniques. MOD2-B a converti `unique_shift`
pour ignorer les gardes supprimées, mais **n'a pas touché le second** :

```
unique (assigned_doctor_id, date)
  where assigned_doctor_id is not null and status = 'assigned'
```

**Conséquence** : une garde supprimée mais restée `assigned` **continuait
d'occuper la journée de son médecin**. Impossible de lui en attribuer une autre
ce jour-là, alors que la garde n'existait plus pour personne — un fantôme qui
interdit sans se montrer. Mesure au moment du correctif : **31 gardes supprimées
bloquaient 9 médecins**, du 04 au 10/01/2027 (reliquat de l'annulation de
duplication du 06/08). Corrigé par `22-MOD2B-3` : `and deleted_at is null`.

> **Leçon** : quand on rend une suppression douce, il faut passer en revue **tous**
> les index uniques de la table, pas seulement celui auquel on pense. La règle
> avait été appliquée à un seul des deux.

**Au passage** : le contrôle préalable de la création couvre désormais les
**deux** contraintes. Le conflit médecin/jour vient du roulement, qui pré-affecte
les médecins — le message nomme donc le médecin et les dates concernées. Ce
n'était pas la cause de l'erreur du 24/08 (les gardes fantômes étaient hors
plage) : celle-ci était un vrai conflit de roulement, jusque-là inexplicable
pour le coordinateur.

##### ⚠ La première prise du journal — « annuler l'assignation » sur une série (06/08/2026)

Relevé **le jour même de la mise en service du journal**, en relisant les traces
des tests de Matthieu. Aucune relecture de code ne l'avait vu depuis l'étape 4.

`handleCancelAssignment('series')` (`useShiftDetail.ts`) fait un
`.eq('series_id', …)` **sans filtre de statut ni de date** : trois actions du
06/08 à 15:15–15:16 ont chacune **réécrit 45 gardes pour en libérer une ou deux**.
Les 43-44 autres passent de `free` à `free` — sans effet visible, mais réécrites.

**C'est la même famille que l'incident du 29/07** : un filtre plus large que
l'intention. Le correctif de l'époque (`findRotationSlotShifts`) n'a couvert que
le cas `'rotation'` ; le cas `'series'` est resté tel quel.

Deux nuances, relevées dans les données et pas supposées : la série testée était
**entièrement dans le futur** (07/09 → 06/11/2026), donc rien du passé n'a été
touché ; et libérer une garde déjà libre ne change rien fonctionnellement. Les
dégâts réels sont ailleurs :
- **rien ne borne la requête au présent**, contrairement à celle du roulement
  corrigée le 03/08 — une série à cheval sur aujourd'hui réécrirait le passé ;
- **l'`updated_at` de 44 gardes non concernées est écrasé**, ce qui détruit
  précisément le signal qui avait permis de reconstituer l'incident du 29/07.

**Trou de couverture associé** : ni `'series'` ni `'rotation'` n'enregistrent
d'action annulable — seul `'single'` le fait. Ces actions à 45 gardes n'étaient
donc annulables par rien.

**✓ Arbitré et corrigé le 06/08/2026.** Matthieu retient : **le même médecin, et
borné à aujourd'hui** — l'arbitrage déjà rendu le 03/08 pour le roulement.
`findSeriesShiftsToFree()` filtre sur `series_id` + `assigned_doctor_id` +
`date >= aujourd'hui`, et l'écriture porte sur une **liste d'identifiants
explicite** plutôt qu'un filtre ouvert (leçon du 29/07). La modale annonce
désormais le compte exact, calculé **par le même helper que l'action** — pas de
divergence possible entre ce qui est annoncé et ce qui est fait.

**Mesure sur les données réelles**, série « WE1 Dijon » (la plus exposée :
31 gardes, 9 médecins) — depuis la garde du Dr Thomas ETIENNE :

| | Avant | Après |
|---|---:|---:|
| Gardes libérées | 31 | **4** |
| Médecins touchés | 9 | **1** |

Les gardes déjà passées ne sont plus jamais touchées. **Le déclencheur** :
ouvrir une garde appartenant à une série fixe (et **non** au roulement, qui a son
propre chemin) → « Annuler l'assignation » → « Annuler toute la série ».

**Reste ouvert** : ce chemin n'enregistre toujours aucune action annulable. Volontaire
— `undo_buffer` meurt en MOD2-E, câbler l'ancien mécanisme serait du travail à jeter.

**Rappel de méthode, hérité de MOD-1** : tester par le **chemin du navigateur**
(jeton JWT signé, appel PostgREST avec `Content-Profile: agenda`), jamais par
l'API d'administration — une fonction `security definer` testée en rôle
`postgres` n'est pas testée. Et vérifier les imports à la main à chaque hook
ajouté : `npm run build` ne les contrôle pas.

---

## Éléments à fournir avant l'étape 6

- [x] ~~Le fichier Excel de roulement~~ — deux fichiers fournis et analysés (`planning-actuel_2025-12.xlsx` et `planning-V2_2026-07.xlsx`). **Placer les deux dans `docs/`** : ils servent de jeux de test au parseur, précisément parce que leurs formats diffèrent.
- [x] ~~Signification des codes J1 à J8~~ — documentée dans `desiderata.yaml`, reprise dans le tableau ci-dessus. **Placer `desiderata.yaml` dans `docs/`** : il fait autorité sur les contraintes.
- [x] ~~Noms complets des 9 associés~~ — connus (`analyse-planning-actuel.md`).
- [x] ~~**⚠️ Date réelle de démarrage du roulement V2**~~ — **tranché par Matthieu le 01/08/2026**. Le V2 entre en vigueur le **lundi 04/01/2027**, et cette semaine-là est numérotée **S6** pour ne pas rompre l'ordre habituel (la semaine du 28/12/2026 est S5 dans le roulement en cours). Il en découle **`start_date` = lundi 30/11/2026** (04/01/2027 − 5 semaines) et `effective_from` = 04/01/2027. Détail et vérification dans « Décisions du 01/08/2026 » ci-dessous.
- [x] ~~**Emails des 9 associés** dans Omnès-Orga, pour relier les initiales aux comptes~~ — établi le 30/07/2026 en 7B-1, et mieux : **la correspondance initiales → comptes est résolue** (`MY` Mireille YUAN, `TE` Thomas ETIENNE, `XB` Xavier BAUDRILLART, `AS` Airelle SAUVAGE, `CB` Christophe BERTRAND, `IEG` Imane EL GARI, `CC` Caroline CHAUVET, `LD` Laurène DAUDIN, `MC` Matthieu CADENNES). Déduite des règles de roulement présentes en base, pas d'une saisie manuelle. Détail dans `migration-agenda-etape7.md`, table de correspondance complète dans `docs/mapping-comptes-agenda.csv`.
- [x] ~~**État des `shift_types` déjà déclarés dans l'agenda**~~ — vérifié le 30/07/2026 en 7A : **ils ne correspondent pas**. 15 créneaux déclarés, dont le nom inclut le site (`J1 Beaune`, `J2 Dijon`…), aucun `J6`, trois écarts d'horaire avec `desiderata.yaml` et des irrégularités de saisie. Détail et conséquences pour MOD-1 dans `migration-agenda-etape7.md`. **Les trois écarts d'horaire sont arbitrés** (01/08/2026) : `J5 Dijon` → la base fait foi, `J2 Beaune` → `desiderata.yaml` fait foi, `J5 bis Dijon` → désactivé. Voir « Décisions du 01/08/2026 » ci-dessous. La table de correspondance complète (code, site) → `shift_type` vit désormais dans `desiderata.yaml`, section `correspondance_agenda`.
- [x] ~~Décision sur la piste d'annulation retenue (A, B ou C).~~ — **tranché par Matthieu le 03/08/2026 : piste C (hybride)**, avec journalisation exhaustive et restauration seulement lorsque l'état le permet encore, et **suppression douce** (`deleted_at`) sur les gardes. Découpage MOD2-A → MOD2-G dans la section MOD-2 ci-dessus.
- [ ] **Notifications aux médecins** (souhaité par Matthieu, *sans urgence*) — le module n'envoie **aucune** notification aujourd'hui : « les médecins sont notifiés » signifie qu'ils voient leurs gardes apparaître dans « Mes gardes ». Omnès-Orga dispose déjà de Firebase et d'un `fcm_token` par médecin : une fois la migration faite, la validation définitive du planning pourrait déclencher une vraie notification. À placer en étape 8.
- [x] ~~Confirmation : les associés gérants ont-ils les droits coordinateur sur l'agenda ?~~ — **NON**, tranché par Matthieu le 30/07/2026. **Charlotte Franzino est la seule coordinatrice** (`is_agenda_coordinator = true` sur son compte). Caroline Chauvet, Thomas Étienne et Xavier Baudrillart restent `doctor` sur l'agenda malgré leur rôle `associe_gerant`. Le compte générique `Coordinateur Admin` de Planning, avec lequel Charlotte se connecte aujourd'hui, n'est pas migré.

---

## Conseils pour Claude Code

- Fournir ce fichier ET `cabinet-medical-app.md` en début de session.
- Travailler en local (`npm run dev`) sur une branche Git dédiée `feature/module-agenda` ; commit après chaque étape validée.
- Ne jamais exécuter de migration SQL sur le projet Supabase Planning en production — en phase 1–6, le module est **client** de cette base, il ne la modifie pas structurellement.
- L'étape 7 (migration) se prépare sur une copie locale des données avant d'être rejouée en production.
