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

| Code | Horaire | Contrainte |
|---|---|---|
| `J1` | 08:00–16:00 | **Beaune uniquement**, 1 seul par jour |
| `J2` | 14:00–22:00 | **1 seul par site et par jour** — la ressource la plus disputée |
| `J3` `J4` `J5` `J7` `J8` | 08:00–18:30 | Journée, multipliables |
| `J6` | 08:00–14:00 | **Réservé aux remplaçants — jamais un associé** |
| `Garde` / `Doublon` | week-end | `Doublon` = second médecin sur la même garde |

Fenêtre de recouvrement maximal : 14:00–16:00 (J1, J2 et journées se chevauchent). Capacité : 6 salles par site, **9 associés simultanés maximum**.

**Conséquence architecturale majeure :** le roulement ne concerne que les **9 associés**. Le créneau `J6`, et plus généralement tous les créneaux non couverts par le roulement, sont destinés aux **remplaçants** — c'est-à-dire exactement ce que le circuit « garde libre → demande → approbation » de l'agenda gère déjà. Les deux mécanismes sont donc complémentaires et couvrent chacun une population : **rotation = associés (affectation automatique)**, **demandes = remplaçants (à la demande)**. C'est la clé de lecture du module.

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

**Règles dures à porter dans l'application** (validation à la création/affectation d'une garde, à aligner avec `src/lib/shiftValidation.ts`) : un seul `J2` par site et par jour ; un seul `J1` par jour à Beaune ; jamais un associé sur `J6` ; maximum 9 associés simultanés sur la fenêtre 14:00–16:00 ; maximum 6 salles occupées par site ; lundi off obligatoire après un week-end travaillé.

**Incohérence repérée dans le pipeline** (à corriger côté Python, indépendamment de l'application) : `desiderata.yaml` se présente comme la source unique de vérité et prévoit que l'optimiseur le lise, mais `1_optimize.py` code encore en dur le dictionnaire `targetJ2` et le bloc des desiderata. Les valeurs coïncident aujourd'hui, mais la duplication finira par diverger. Sa section 4 (« Cibles J2 retenues pour la V2 ») est par ailleurs vide, les cibles vivant dans les fiches individuelles `j2_cible`.

#### Cas d'usage à couvrir explicitement

- **Association d'un nouveau médecin** → nouveau plan importé depuis l'Excel mis à jour, activé au 1er du mois choisi. Les plannings déjà publiés ne bougent pas.
- **Ouverture d'un nouveau lieu / nouvelle salle** → création du site/salle dans les paramètres, puis import d'un plan intégrant les nouvelles colonnes.
- **Départ d'un médecin** → le plan archivé conserve ses affectations passées ; le profil reste en base (désactivé) pour ne pas casser l'historique.

---

### MOD-2 — Refonte du bouton d'annulation

#### Le système actuel

Table `undo_buffer` avec **`UNIQUE(user_id)`** : une seule action mémorisée par utilisateur, écrasée à chaque nouvelle action (`upsert`). Réservée au coordinateur. Couvre 6 types d'actions (`assign_shift`, `unassign_shift`, `validate_request`, `bulk_shift_create`, `bulk_shift_delete`, `delete_shift`). Le bouton interroge la base **toutes les 2 secondes** et utilise `alert()` pour les retours.

#### Les problèmes

1. **Un seul niveau d'annulation** : une deuxième action rend la première définitivement irréversible.
2. **Aucune péremption** : le bouton reste actif indéfiniment. Le coordinateur peut annuler, sans s'en rendre compte, une action vieille de trois jours — alors que des médecins ont entre-temps demandé ou obtenu les gardes concernées. **C'est le risque le plus sérieux du dispositif actuel.**
3. **Aucune vérification de cohérence** avant d'annuler : l'état actuel n'est pas comparé à l'état attendu.
4. **Couverture partielle** : les actions sur les séries, les modèles de semaine et les attributions groupées ne sont pas toutes réversibles.
5. **UX datée** : `alert()` bloquant, mauvaise expérience sur mobile, sondage réseau permanent.
6. **Ambiguïté du mot « Annuler »** : dans cette appli, il désigne à la fois l'annulation d'une garde, l'annulation d'une demande, et l'annulation d'une action. À clarifier dans le vocabulaire de l'interface.

#### Trois pistes à arbitrer

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

---

## Éléments à fournir avant l'étape 6

- [x] ~~Le fichier Excel de roulement~~ — deux fichiers fournis et analysés (`planning-actuel_2025-12.xlsx` et `planning-V2_2026-07.xlsx`). **Placer les deux dans `docs/`** : ils servent de jeux de test au parseur, précisément parce que leurs formats diffèrent.
- [x] ~~Signification des codes J1 à J8~~ — documentée dans `desiderata.yaml`, reprise dans le tableau ci-dessus. **Placer `desiderata.yaml` dans `docs/`** : il fait autorité sur les contraintes.
- [x] ~~Noms complets des 9 associés~~ — connus (`analyse-planning-actuel.md`).
- [ ] **⚠️ Date réelle de démarrage du roulement V2** : quelle semaine calendaire correspond à `S1` ? Aucun fichier ne le précise, et c'est la valeur `start_date` du plan — sans elle, l'application ne peut pas placer le roulement sur le calendrier.
- [x] ~~**Emails des 9 associés** dans Omnès-Orga, pour relier les initiales aux comptes~~ — établi le 30/07/2026 en 7B-1, et mieux : **la correspondance initiales → comptes est résolue** (`MY` Mireille YUAN, `TE` Thomas ETIENNE, `XB` Xavier BAUDRILLART, `AS` Airelle SAUVAGE, `CB` Christophe BERTRAND, `IEG` Imane EL GARI, `CC` Caroline CHAUVET, `LD` Laurène DAUDIN, `MC` Matthieu CADENNES). Déduite des règles de roulement présentes en base, pas d'une saisie manuelle. Détail dans `migration-agenda-etape7.md`, table de correspondance complète dans `docs/mapping-comptes-agenda.csv`.
- [x] ~~**État des `shift_types` déjà déclarés dans l'agenda**~~ — vérifié le 30/07/2026 en 7A : **ils ne correspondent pas**. 15 créneaux déclarés, dont le nom inclut le site (`J1 Beaune`, `J2 Dijon`…), aucun `J6`, trois écarts d'horaire avec `desiderata.yaml` et des irrégularités de saisie. Détail et conséquences pour MOD-1 dans `migration-agenda-etape7.md`. **Reste à arbitrer** : la source de vérité des horaires est-elle la base ou `desiderata.yaml` ?
- [ ] Décision sur la piste d'annulation retenue (A, B ou C).
- [ ] **Notifications aux médecins** (souhaité par Matthieu, *sans urgence*) — le module n'envoie **aucune** notification aujourd'hui : « les médecins sont notifiés » signifie qu'ils voient leurs gardes apparaître dans « Mes gardes ». Omnès-Orga dispose déjà de Firebase et d'un `fcm_token` par médecin : une fois la migration faite, la validation définitive du planning pourrait déclencher une vraie notification. À placer en étape 8.
- [x] ~~Confirmation : les associés gérants ont-ils les droits coordinateur sur l'agenda ?~~ — **NON**, tranché par Matthieu le 30/07/2026. **Charlotte Franzino est la seule coordinatrice** (`is_agenda_coordinator = true` sur son compte). Caroline Chauvet, Thomas Étienne et Xavier Baudrillart restent `doctor` sur l'agenda malgré leur rôle `associe_gerant`. Le compte générique `Coordinateur Admin` de Planning, avec lequel Charlotte se connecte aujourd'hui, n'est pas migré.

---

## Conseils pour Claude Code

- Fournir ce fichier ET `cabinet-medical-app.md` en début de session.
- Travailler en local (`npm run dev`) sur une branche Git dédiée `feature/module-agenda` ; commit après chaque étape validée.
- Ne jamais exécuter de migration SQL sur le projet Supabase Planning en production — en phase 1–6, le module est **client** de cette base, il ne la modifie pas structurellement.
- L'étape 7 (migration) se prépare sur une copie locale des données avant d'être rejouée en production.
