# Cabinet médical — Application collaborative
> Fichier de référence projet · À fournir à Claude Code en début de session

---

## Contexte

Application **PWA** (Progressive Web App) pour un cabinet médical regroupant **9 associés** et **~20 remplaçants**.
Elle centralise en un seul outil : annuaire, documents partagés, tableaux de décisions et messagerie.

Un sous-groupe d'associés fait partie d'une **Société d'Intendance Médicale (SIM)** et dispose d'un espace dédié et cloisonné au sein de la même application.

L'usage est **principalement mobile** — l'interface doit être pensée mobile-first, installable sur l'écran d'accueil iOS et Android, avec notifications push.

---

## Format de distribution : PWA

L'application est distribuée comme une **Progressive Web App** : pas de publication App Store ou Play Store. Les utilisateurs y accèdent via une URL et l'installent sur leur téléphone via "Ajouter à l'écran d'accueil".

### Avantages
- Pas de validation App Store / Play Store
- Mises à jour instantanées pour tous les utilisateurs
- Code unique pour iOS, Android, desktop
- Coût d'hébergement minimal (Vercel gratuit)

### Contraintes spécifiques iOS (à connaître)
- L'utilisateur **doit** ouvrir l'URL dans **Safari** (pas Chrome) puis faire "Partager → Sur l'écran d'accueil"
- Les notifications push iOS ne fonctionnent **que** si l'application a été ajoutée à l'écran d'accueil (depuis iOS 16.4)
- Une page d'aide d'installation avec captures d'écran sera fournie aux utilisateurs

### Sur Android
- Installation fluide depuis Chrome (bandeau "Installer l'application")
- Notifications push natives, comportement proche d'une app native

### Composants techniques PWA
- `manifest.json` (nom, icônes, couleurs, mode d'affichage)
- Service worker (cache, push, mode hors-ligne basique)
- Icônes en plusieurs tailles (192x192, 512x512, maskable)
- Plugin `vite-plugin-pwa` pour automatiser la génération

---

## Stack technique

| Couche | Outil |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| PWA | vite-plugin-pwa (manifest + service worker) |
| Backend / Auth | Supabase (auth, base de données, storage, realtime) |
| Notifications push | Firebase Cloud Messaging (FCM) |
| Hébergement | Vercel (HTTPS automatique, requis pour PWA) |
| Gestion de code | Git + GitHub |

---

## Les 4 rôles utilisateurs

| Rôle | Identifiant BDD | Description |
|---|---|---|
| Super administrateur | `super_admin` | Gère les comptes, les rôles, les paramètres globaux. Seul à pouvoir désactiver/réactiver un médecin. |
| Associé gérant | `associe_gerant` | Accès cabinet complet + accès espace SIM. Peut éditer toutes les fiches Trombinoscope (champs admin compris). |
| Associé | `associe` | Accès cabinet, pas d'accès SIM. Peut éditer **sa propre** fiche Trombinoscope (champs basiques uniquement). |
| Remplaçant | `remplacant` | Accès en lecture restreinte sur la plupart des modules. Peut éditer **sa propre** fiche Trombinoscope (champs basiques uniquement). Voit le Trombinoscope sans les champs internes (jours_disponibles, notes_internes). |

### Table `profiles` (Supabase)

```
id                  uuid      lié à auth.users (FK ON DELETE CASCADE)
nom                 text
prenom              text
role                enum      super_admin / associe_gerant / associe / remplacant
specialite          text      (optionnel)
photo_url           text      (optionnel, Supabase Storage)
telephone           text      (optionnel)
email               text      unique, lié à auth.users (non modifiable côté UI)
actif               boolean   pour activer/désactiver les comptes (soft delete)
fcm_token           text      token Firebase pour les notifications push
jours_disponibles   text      (optionnel, ajouté en 4B-1) — jours de présence au cabinet
notes_internes      text      (optionnel, ajouté en 4B-1) — notes libres à usage interne
created_at          timestamp
updated_at          timestamp
```

**RLS en place sur `profiles` (5 policies, étape 2C-2) :**
- `profiles_select_all_authenticated` : tous les utilisateurs authentifiés lisent toute la table (USING true). Le filtrage des champs sensibles (`jours_disponibles`, `notes_internes`) pour les remplaçants se fait **côté frontend** (approche pragmatique). Une migration vers une vue PostgreSQL est envisageable plus tard si on a besoin d'une sécurité forte.
- `profiles_insert_own` : un user peut INSERT uniquement sa propre ligne (id = auth.uid()).
- `profiles_update_own_safe_fields` : un user peut UPDATE sa propre ligne MAIS PAS `role` ni `actif` (subselect dans WITH CHECK).
- `profiles_update_super_admin` : super_admin peut UPDATE n'importe quelle ligne.
- `profiles_delete_super_admin` : super_admin seul peut DELETE (non utilisé en pratique car on a opté pour le soft delete).

Un trigger `on_auth_user_created` crée automatiquement la ligne `profiles` à chaque signup auth.

### Table `profiles_compta` (Supabase)

Table séparée pour les informations bancaires des médecins (étape 2C-1). Distincte de `profiles` pour permettre des RLS plus restrictives sur des données sensibles (RIB).

```
id                       uuid      FK profiles(id) (ON DELETE CASCADE)
iban                     text
bic                      text
nom_titulaire_compte     text
created_at               timestamp
updated_at               timestamp
```

**RLS en place (7 policies, étape 2C-3) :**
- super_admin / associe_gerant / associe peuvent lire toute la table.
- remplaçant ne lit que sa propre ligne.
- Chaque user peut INSERT/UPDATE sa propre ligne ; super_admin peut tout modifier ; suppression réservée à super_admin.

**Pas d'UI dédiée pour l'instant** — la gestion des informations bancaires sera codée dans l'étape 11 (Page Profil personnelle + gestion profiles_compta).

---

## Page d'accueil après login

Grille de 7 icônes, adaptée mobile (3 colonnes). Chaque icône ouvre son module.
Toutes les icônes ont la **même taille** dans la grille — aucune icône n'est en pleine largeur ou mise en avant différemment des autres.
Les modules non accessibles selon le rôle sont **masqués** (pas affichés, pas grisés).

| # | Module | Type |
|---|---|---|
| 1 | Trombinoscope | Cartes |
| 2 | Annuaire | Liste collaborative |
| 3 | Cabinet pratique | Drive |
| 4 | Discussion | Cartes + chat |
| 5 | Événements | Drive |
| 6 | SIM | Drive (restreint) |
| 7 | Immobilier | Cartes + chat |

---

## Modules — détail

---

### 1. Trombinoscope

**Type :** Cartes (une carte par médecin du cabinet)

**Contenu d'une carte (vue lecture) :**
- Photo du médecin (ou initiales sur fond canard si pas de photo)
- Nom, prénom, spécialité
- Téléphone (cliquable, ouvre le composeur), email
- Jours disponibles (visible aux non-remplaçants uniquement)
- Notes internes (visibles aux non-remplaçants uniquement)

**Droits :**
| Action | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Voir le Trombinoscope (cartes) | ✓ | ✓ | ✓ | ✓ lecture restreinte |
| Voir jours_disponibles + notes_internes | ✓ | ✓ | ✓ | — |
| Modifier sa propre fiche (champs basiques) | ✓ | ✓ | ✓ | ✓ |
| Modifier la fiche d'un autre (champs basiques) | ✓ | ✓ | — | — |
| Modifier les champs admin (rôle, actif, notes_internes) | ✓ | ✓ | — | — |
| Désactiver / Réactiver un médecin | ✓ | — | — | — |

**Champs basiques** : nom, prénom, téléphone, spécialité, jours_disponibles.
**Champs admin** : role, actif, notes_internes.
**Email** : non modifiable côté UI (lié à l'auth Supabase).

Pas de chat dans ce module.

#### Permissions fines

La logique d'autorisation est centralisée dans [src/lib/permissions.js](../src/lib/permissions.js) :

- `canEditMedecin({ role, currentUserId, medecinId })` — true si super_admin OU associe_gerant OU si on édite sa propre fiche.
- `canEditPrivilegedFields(role)` — true uniquement pour super_admin et associe_gerant. Contrôle l'accès aux champs admin (rôle, actif, notes_internes) côté formulaire.
- `canToggleActif(role)` — true uniquement pour super_admin. Contrôle la visibilité du bouton "Désactiver / Réactiver".
- `canViewSensitiveFields(role)` — true sauf pour remplaçant. Contrôle l'affichage des jours et notes côté lecture.

Côté `MedecinDetail`, un filtrage `safeValues` est aussi appliqué avant l'`update` Supabase : un utilisateur sans privilège qui tenterait de pousser `role`/`actif`/`notes_internes` via DOM trafiqué verrait son payload nettoyé côté frontend (défense en profondeur, en plus de la RLS `profiles_update_own_safe_fields`).

#### Soft delete (désactivation / réactivation)

Pas de suppression physique de profils dans cette étape :
- Le bouton "Désactiver" passe `actif = false`. La fiche disparaît du Trombinoscope (le hook `useMedecins` filtre `actif = true`).
- Le hook `useMedecin(id)` ne filtre **pas** sur `actif` — la fiche reste accessible via URL directe `/trombinoscope/:id`, ce qui permet à un super_admin de réactiver le médecin (bouton "Réactiver" qui repasse `actif = true`).
- La confirmation avant désactivation/réactivation utilise le composant générique `ConfirmDialog` (variant `danger` pour désactiver, `primary` pour réactiver).

**Création d'un médecin (workflow actuel)** : pas de bouton "+" dans l'app à ce stade. Procédure :
1. Super_admin crée un AuthUser dans le dashboard Supabase (Authentication → Users).
2. Le trigger `on_auth_user_created` insère automatiquement une ligne dans `profiles` avec valeurs par défaut.
3. Super_admin se connecte à l'app et enrichit le profil via le formulaire d'édition (`/trombinoscope/:id` → "Modifier").

Cette approche (option D du plan 4D) évite de manipuler `auth.admin.createUser` côté client et reste viable pour les ~30 utilisateurs cibles. Une industrialisation via une Supabase Edge Function (option C) est possible plus tard si le volume le justifie.

#### Routing du module

- `/trombinoscope` — liste des médecins actifs (cartes cliquables).
- `/trombinoscope/:id` — fiche détail. Affiche en lecture par défaut ; bouton "Modifier" passe en mode édition (toggle sur la même page, pas de nouvelle route). Bouton "Désactiver / Réactiver" visible pour super_admin.

---

### 2. Annuaire

**Type :** Liste collaborative

**Concept :** Carnet d'adresses partagé de ressources externes au cabinet. N'importe quel utilisateur peut contribuer en ajoutant un spécialiste, un service hospitalier, un numéro direct, un laboratoire… Ce n'est pas l'annuaire des médecins du cabinet (c'est le rôle du Trombinoscope).

**Contenu d'une entrée :**
- Nom / structure
- Catégorie (ex : cardiologue, labo, urgences pédiatriques…)
- Téléphone
- Email (optionnel)
- Note libre (optionnel)
- Auteur de la fiche + date de création

**Droits :**
| Action | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Voir l'annuaire | ✓ | ✓ | ✓ | ✓ |
| Ajouter une entrée | ✓ | ✓ | ✓ | ✓ |
| Modifier / supprimer sa propre entrée | ✓ | ✓ | ✓ | ✓ |
| Modifier / supprimer l'entrée d'un autre | ✓ | ✓ | — | — |

Pas de chat dans ce module.

---

### 3. Cabinet pratique

**Type :** Drive (documents)

**Concept :** Espace documentaire du cabinet. Protocoles, guides, documents administratifs, formulaires types. Organisé en sous-dossiers thématiques libres (protocoles, administratif, RH, hygiène…).

**Droits :**
| Action | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Voir et télécharger | ✓ | ✓ | ✓ | ✓ |
| Uploader / créer dossier | ✓ | ✓ | — | — |
| Supprimer | ✓ | ✓ | — | — |

Pas de chat dans ce module.

---

### 4. Discussion

**Type :** Cartes / tableaux (style Trello) + chat par carte

**Concept :** Espace de décisions collectives. Les admins/gérants créent des tableaux thématiques et invitent des participants. Chaque tableau contient des cartes avec un fil de discussion intégré.

**Droits :**
| Action | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Voir ses tableaux invités | ✓ | ✓ | si invité | si invité |
| Créer un tableau | ✓ | ✓ | — | — |
| Inviter des participants | ✓ | ✓ | — | — |
| Créer / modifier une carte | ✓ | ✓ | — | — |
| Commenter (chat) dans une carte | ✓ | ✓ | si invité | si invité |

**Navigation :** Les utilisateurs accèdent à leurs tableaux via le module Discussion. Ils ne voient que les tableaux auxquels ils sont invités.

**Notifications push (Firebase FCM) :**
- Création d'un nouveau tableau → notification à tous les invités
- Nouveau message dans une carte → notification à tous les participants
- Format : nom du tableau en titre + aperçu du message (style WhatsApp)
- ⚠️ iOS : nécessite que l'utilisateur ait installé la PWA sur l'écran d'accueil

---

### 5. Événements

**Type :** Drive (documents + descriptions)

**Concept :** Centralise les événements du cabinet (formations, réunions, congrès…). Peut contenir des documents associés (programmes, inscriptions).

**Droits :**
| Action | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Voir | ✓ | ✓ | ✓ | ✓ |
| Créer / modifier / uploader | ✓ | ✓ | — | — |
| Supprimer | ✓ | ✓ | — | — |

Pas de chat dans ce module.

---

### 6. SIM (Société d'Intendance Médicale)

**Type :** Drive (documents)

**Concept :** Espace documentaire privé réservé aux associés gérants de la SIM. Collecte tous les documents de la société (statuts, PV d'AG, comptabilité, contrats…). Complètement invisible pour les associés simples et les remplaçants — le module n'apparaît pas dans leur page d'accueil.

**Droits :**
| Action | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Voir et télécharger | ✓ | ✓ | — | — |
| Uploader / créer dossier | ✓ | ✓ | — | — |
| Supprimer | ✓ | — | — | — |

---

### 7. Immobilier

**Type :** Cartes / tableaux (style Trello) + chat par carte

**Concept :** Suivi des projets immobiliers liés au cabinet (travaux, acquisitions, baux…). Fonctionne comme le module Discussion : tableaux thématiques avec invitation et chat intégré. Non accessible aux remplaçants même sur invitation.

**Droits :**
| Action | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Voir ses tableaux invités | ✓ | ✓ | si invité | — |
| Créer un tableau | ✓ | ✓ | — | — |
| Inviter des participants | ✓ | ✓ | — | — |
| Créer / modifier une carte | ✓ | ✓ | — | — |
| Commenter (chat) dans une carte | ✓ | ✓ | si invité | — |

**Notifications push :** Mêmes règles que le module Discussion.

---

## Matrice des accès — vue globale

| Module | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Trombinoscope | ✓ édition complète | ✓ édition complète | ✓ lecture + édition de soi | ✓ lecture restreinte + édition de soi |
| Annuaire | ✓ | ✓ | ✓ | ✓ |
| Cabinet pratique | ✓ édition | ✓ édition | ✓ lecture | ✓ lecture |
| Discussion | ✓ | ✓ | si invité | si invité |
| Événements | ✓ édition | ✓ édition | ✓ lecture | ✓ lecture |
| SIM | ✓ | ✓ | invisible | invisible |
| Immobilier | ✓ | ✓ | si invité | — |

---

## Notifications push

**Stack :** Firebase Cloud Messaging (FCM)

**Déclencheurs :**
- Création d'un nouveau tableau Discussion ou Immobilier → notification à tous les invités
- Nouveau message dans une carte → notification à tous les participants du tableau
- Format : nom du tableau en titre + aperçu du message (style WhatsApp)

**Implémentation :**
- Stocker le `fcm_token` dans la table `profiles` à chaque login
- Supabase Edge Function pour déclencher l'envoi FCM côté serveur
- Demander la permission notifications push au premier login sur mobile
- Sur iOS : vérifier que l'utilisateur a installé la PWA avant de proposer l'activation des push

---

## Architecture frontend

### Routing

La navigation utilise **react-router-dom v6**. `main.jsx` enveloppe l'application dans un `<BrowserRouter>`. Les routes sont définies dans `App.jsx` :

| Route | Accès | Page |
|---|---|---|
| `/login` | publique | `Login` |
| `/` | protégée | `Home` |
| `/trombinoscope` | protégée | `Trombinoscope` |
| `/trombinoscope/:id` | protégée | `MedecinDetail` (lecture + édition) |
| `*` | — | redirect vers `/` |

Mécanique :
- `<ProtectedRoute>` (à `src/components/ProtectedRoute.jsx`) affiche un écran "Chargement…" pendant `useAuth().loading`, redirige vers `/login` si pas d'utilisateur, sinon rend `<Outlet />`. Toutes les routes protégées sont imbriquées sous ce composant.
- `Login.jsx` redirige vers `/` si un utilisateur est déjà connecté (via `useEffect` qui surveille `useAuth().user`).

### Composants réutilisables transverses

- **`src/components/common/ConfirmDialog.jsx`** — modal de confirmation Tailwind générique. Props : `{ open, title, message, onConfirm, onCancel, confirmLabel, cancelLabel, confirmVariant, submitting }`. Variants : `'primary'` (bg-marine) et `'danger'` (bg-brique). A11y : `role="dialog"`, `aria-modal`, `aria-labelledby`. Bloque le scroll du body et capte la touche Escape pendant l'ouverture. Utilisé actuellement pour la désactivation/réactivation Trombinoscope, à réutiliser pour les futures suppressions (événements, entrées d'annuaire, etc.).

### Helpers de permissions

`src/lib/permissions.js` centralise les règles d'accès du Trombinoscope (cf. section "Permissions fines" du module 1). Les pages et composants importent ces helpers plutôt que de tester `role` directement, ce qui rend les règles modifiables d'un seul endroit.

---

## Structure du projet

```
omnes-orga/
├── public/
│   └── (icônes PWA, manifest — à venir étape 12)
├── docs/
│   ├── cabinet-medical-app.md      ← ce fichier
│   └── sql/                        ← scripts SQL versionnés (4B-1, 4B-2, ...)
├── src/
│   ├── App.jsx                     ← routing react-router-dom
│   ├── main.jsx                    ← BrowserRouter wrapper
│   ├── index.css                   ← Tailwind directives
│   ├── components/
│   │   ├── ProtectedRoute.jsx
│   │   ├── common/
│   │   │   └── ConfirmDialog.jsx
│   │   ├── home/
│   │   │   ├── HomeHeader.jsx
│   │   │   ├── ModuleTile.jsx
│   │   │   └── ActivityList.jsx
│   │   ├── layout/
│   │   │   ├── AppLayout.jsx
│   │   │   ├── BottomNav.jsx
│   │   │   └── Filigrane.jsx
│   │   └── trombinoscope/
│   │       ├── MedecinCard.jsx
│   │       └── MedecinForm.jsx
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useRole.js
│   │   ├── useMedecins.js          ← liste filtrée actif=true
│   │   └── useMedecin.js           ← fiche unique, ne filtre pas actif
│   ├── lib/
│   │   ├── supabaseClient.js
│   │   ├── modules.js              ← ROLES, ROLE_LABELS, MODULES, getVisibleModules
│   │   └── permissions.js          ← helpers d'autorisation Trombinoscope
│   └── pages/
│       ├── Login.jsx
│       ├── Home.jsx
│       ├── Trombinoscope.jsx
│       └── MedecinDetail.jsx
├── vite.config.js
├── tailwind.config.js
├── .env
├── .env.example
└── README.md
```

**Fichiers à venir (étapes ultérieures)** : pages `Annuaire`, `CabinetPratique`, `Discussion`, `Evenements`, `SIM`, `Immobilier`, `InstallGuide`, `ProfilPersonnel` ; composants `TrelloBoard`, `DriveFolder`, `ChatThread`, `InstallPrompt`, `ModuleIcon` ; hooks `useNotifications`, `useInstallPrompt` ; lib `firebase.js`.

---

## Variables d'environnement requises

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=votre_clé_anon
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...
```

---

## Plan de développement (ordre recommandé)

1. ✓ **Étape 1 — FAITE** — Init React + Vite + Tailwind avec palette Omnès, polices Google Fonts (Inter + Archivo), mode prudent Claude Code activé.
2. ✓ **Étape 2 — FAITE** (sous-étapes 2A → 2E)
   - 2A : Compte + projet Supabase "OMNES ORGA"
   - 2B : Table `profiles` avec contraintes
   - 2C-1 : Table `profiles_compta` avec contraintes
   - 2C-2 : RLS + 5 policies sur `profiles`
   - 2C-3 : RLS + 7 policies sur `profiles_compta`
   - 2D : Frontend connecté à Supabase via `supabaseClient.js`
   - 2E : Auth complète (signup / signin / signout) + trigger `on_auth_user_created`
3. ✓ **Étape 3 — FAITE** — Home avec grille 7 modules colorés, filigrane SVG décoratif, bottom nav 3 onglets (état local), masquage des modules selon le rôle, mini-écran Profil temporaire.
4. ✓ **Étape 4 — FAITE** (sous-étapes 4A → 4D, sauf création de médecin volontairement reportée)
   - 4A : Routing react-router-dom v6 (BrowserRouter, Routes, ProtectedRoute, Outlet)
   - 4B : Données de test (3 médecins fictifs) + 2 nouveaux champs `jours_disponibles` + `notes_internes` (scripts SQL versionnés `docs/sql/4B-1` et `docs/sql/4B-2`)
   - 4C : Affichage cartes en lecture seule + tri alphabétique + filtre `actif=true`
   - 4C-bis : Visibilité fine (`canViewNotes`, `canViewSchedule`) avec sécurité par défaut
   - 4D-1 : Audit + plan
   - 4D-2 : Hook `useMedecin` + Page `MedecinDetail` (lecture seule)
   - 4D-3 : `MedecinForm` + mode édition (toggle view/edit sur la même page)
   - 4D-4 : `ConfirmDialog` + soft delete (désactiver / réactiver)
   - 4D-5 : Tests fonctionnels + commit
5. **Étape 5** — Module Annuaire (liste collaborative)
6. **Étape 6** — Module Cabinet pratique (Drive)
7. **Étape 7** — Module Discussion (tableaux + invitations + chat)
8. **Étape 8** — Module Événements (Drive)
9. **Étape 9** — Module SIM (Drive restreint)
10. **Étape 10** — Module Immobilier (mêmes composants que Discussion)
11. **Étape 11** — Page Profil personnelle + gestion `profiles_compta`
12. **Étape 12** — Configuration PWA (manifest, service worker, icônes, page guide d'installation)
13. **Étape 13** — Déploiement Vercel + tests installation iOS et Android
14. **Étape 14** — Notifications push Firebase FCM (à faire après que la PWA fonctionne)

---

## Limitations connues

- **BottomNav non reliée au routing** — la barre de navigation du bas (3 onglets : Accueil, Rechercher, Profil) fonctionne uniquement sur la page Home, où elle est gérée via un `useState` local. Sur les autres pages (`Trombinoscope`, `MedecinDetail`), la BottomNav s'affiche mais les clics sur les onglets ne déclenchent pas de navigation. À corriger lors d'une étape ultérieure en migrant la BottomNav vers `<NavLink>` de react-router-dom (avec ouverture des routes correspondantes).
- **Création d'un médecin sans UI dédiée** — pas de bouton "+" dans l'application. Workflow actuel : super_admin crée un AuthUser dans le dashboard Supabase, le trigger `on_auth_user_created` insère la ligne `profiles` avec valeurs par défaut, puis super_admin enrichit le profil via le formulaire d'édition. Industrialisation possible plus tard via une Supabase Edge Function (cf. section Trombinoscope > Création d'un médecin).
- **Filtrage des champs sensibles côté frontend** — la RLS `profiles_select_all_authenticated` autorise la lecture de toute la table `profiles` à tout utilisateur authentifié. Le masquage de `jours_disponibles` et `notes_internes` pour les remplaçants se fait côté React. Si on a besoin d'une sécurité forte (les remplaçants ne doivent jamais voir ces données via une requête manuelle), migrer vers une vue PostgreSQL filtrée par rôle.
- **Pas d'UI pour `profiles_compta`** — la table existe et est protégée par RLS, mais la gestion des informations bancaires sera traitée à l'étape 11.

---

## Conseils pour travailler avec Claude Code

- Fournissez ce fichier en début de session : `claude` puis *"Lis ce fichier : docs/cabinet-medical-app.md"*
- Procédez étape par étape, sans sauter d'étapes
- En cas d'erreur, copiez le message exact et demandez : *"J'ai cette erreur, corrige-la"*
- Après chaque étape réussie, faites un commit Git
- Testez sur mobile régulièrement (même réseau Wi-Fi, IP locale du PC)
- Les modules Discussion et Immobilier partagent les mêmes composants (TrelloBoard, ChatThread) — codez-les une seule fois à l'étape 9
- L'aspect PWA et les notifications push sont volontairement placés en fin de plan : ce sont les sujets les plus délicats, à traiter une fois que les fonctionnalités principales fonctionnent

---

## Tests sur mobile pendant le développement

Pendant le développement local (`npm run dev`), pour tester sur ton téléphone :
- Téléphone et ordinateur sur le **même réseau Wi-Fi**
- Récupérer l'IP locale du PC (ex : `192.168.1.42`)
- Lancer Vite avec : `npm run dev -- --host`
- Ouvrir `http://192.168.1.42:5173` sur le téléphone

⚠️ Pour tester l'installation PWA et les push, il faut un **HTTPS réel** : ce ne sera donc possible qu'après déploiement sur Vercel (HTTPS automatique).