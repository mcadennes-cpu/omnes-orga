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
6. **Étape 6** — Modifications fonctionnelles souhaitées : MOD-1 (roulement) et MOD-2 (annulation). **⚠️ Exécutée APRÈS l'étape 7** — voir l'encadré ci-dessous.
7. **Étape 7 — EN COURS (à partir du 30/07/2026)** — Migration des données vers le projet Supabase principal (voir section Migration), remplacement de `supabaseAgenda` par le client unique.
8. **Étape 8** — Ouverture à tous, activation des comptes remplaçants, extinction de l'appli Bolt.

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
  - **3D — Navigation interne** : `Navigation.tsx` remplacée par `components/AgendaHeader.tsx`, header sticky au pattern Omnès (bouton retour `ChevronLeft` vers l'accueil, filigrane `HeaderWatermark` canard, onglets en pills défilant en `hide-scrollbar` sur mobile, actif = canard plein). Onglets filtrés par rôle (coordinator : Calendrier / Demandes / Paramètres ; doctor : Calendrier / Mes gardes / Planning du jour). L'ancien « Déconnexion » devient **« Délier le compte Planning »** (icône lien barré) : vocabulaire distinct de la déconnexion Omnès-Orga car il ne délie que la session Planning de ce navigateur. La disparition de `Navigation.tsx` supprime les dernières références au logo 404 (`/logo-omnes-couleur.png`) et à la classe `.brand-title` non portée.
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
    - **125 gardes passées encore `free` ou `pending`** (relevé le 03/08/2026), du **29/12/2025 au 31/07/2026** — héritage de l'ancienne application, où un créneau non pourvu restait simplement ouvert. Elles n'ont plus de sens (personne ne prendra une garde de décembre 2025) mais **entrent dans les requêtes** : c'est ce qui a fait remonter « Appliquer aux gardes du roulement » quinze mois en arrière (voir plus bas). Le correctif borne cette action au présent, mais **les lignes restent**. À traiter à part : les passer en « non pourvue » (statut à créer) ou les archiver. Hors périmètre de MOD-1.
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

- ⏳ **Étape 6 / MOD-2 — EN COURS.** Arbitrée le 03/08/2026 ; MOD2-A à MOD2-C livrées le 06/08/2026, MOD2-D et MOD2-E le 24/08/2026 — **toutes validées en usage réel par Matthieu** au fil des sous-étapes. Restent **MOD2-F** (vocabulaire « Annuler », `alert()`/`confirm()` restants) et **MOD2-G** (Ctrl/Cmd+Z, optionnel).
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
  - Matthieu retient la **piste C (hybride)** : bandeau éphémère pour le geste immédiat, journal d'activité pour la traçabilité et la restauration encadrée, journalisation exhaustive, **suppression douce** (`deleted_at`) sur les gardes. L'audit du code préalable à l'arbitrage a corrigé la doc sur un point important : le bouton « Annuler » couvre en réalité **2 actions et non 6** — les 4 autres types sont du code mort, déjà dans l'appli Bolt. Découpage **MOD2-A → MOD2-G** dans la section MOD-2 plus bas ; le journal se construit avant le bandeau, qui s'y adosse.

- ⏳ **Étape 7 — EN COURS (à partir du 30/07/2026)** — Migration vers la base Omnès-Orga, réalisée **avant** l'étape 6 (justification dans l'encadré du plan ci-dessus). Le suivi détaillé de cette étape vit dans un document dédié : **`docs/migration-agenda-etape7.md`** (inventaire du schéma réel, écarts relevés, décisions d'architecture, découpage 7A → 7F).
  - ✓ **7F — FAITE (31/07/2026)** — **Script de resynchronisation** `docs/sql/22-7F-resynchronisation-agenda.py` : recopie complète (plus sûre qu'un différentiel à ce volume), simulation par défaut, `--go` pour exécuter. Garde-fous : refuse de tourner si un profil créé dans Bolt manque au mapping (ses gardes arriveraient sans médecin) ou si l'historique Planning est incohérent. Testé en réel : 5 669 lignes réimportées, écarts avec Planning **exactement égaux aux exclusions volontaires** — aucune dérive. **Ne plus exécuter après la bascule.** Sert aussi à rafraîchir la copie de travail à la demande.
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

*L'ancien chemin (modèle de semaine) n'est pas retiré* : Charlotte peut s'y
appuyer, et le supprimer sortirait du cadre de MOD-1. Il est simplement passé en
bouton secondaire, « Ouvrir des semaines » devenant le chemin principal.

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
- **MOD2-F — Vocabulaire et fin des `alert()` / `confirm()`.** Lever l'ambiguïté du
  mot « Annuler » (problème n°6) : « Annuler » réservé à *défaire une action*,
  « Libérer la garde » et « Retirer sa demande » pour le reste. Les 20 `alert()` /
  `confirm()` restants (8 fichiers) passent au bandeau ou à `BottomSheet`.
- **MOD2-G — Raccourci Ctrl/Cmd+Z** sur les écrans coordinateur. Optionnel, à
  reconfirmer une fois MOD2-E en main.

**Hors périmètre** : le roulement lui-même est déjà protégé par MOD-1 (plans
versionnés + trois portes en `security definer`) ; son historique est acquis
autrement. MOD2-A pose quand même un déclencheur sur `rotation_plans`, pour que le
journal raconte une histoire complète.

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
