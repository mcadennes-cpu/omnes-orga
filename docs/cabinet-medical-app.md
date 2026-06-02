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
Tout est en place depuis l'étape 12 (cf. plan de développement pour les détails).
- `manifest.webmanifest` généré par `vite-plugin-pwa` à partir de la config dans `vite.config.js` (nom, icônes, couleurs DS, screenshots iOS/desktop, mode `standalone`, orientation portrait).
- Service worker Workbox en stratégie **shell uniquement** : précache du bundle JS/CSS/HTML + icônes + offline.html (18 entrées, ~900 ko). Pas de cache des requêtes Supabase. Runtime caching pour les polices Google (1 an).
- 5 icônes générées : `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, `apple-touch-icon.png` (180×180), `favicon.ico`.
- Page `public/offline.html` autoporteuse comme fallback de secours.
- Bannière `OfflineBanner` (top, brique, icône WifiOff) montée dans `AppLayout`, déclenchée par le hook `useOnlineStatus`.
- Modale `InstallPromptModal` auto-affichée sur mobile non-installé (3 étapes iOS / bouton natif Android), montée dans `AppLayout`. Dismiss "Plus tard" persiste 7 jours dans `localStorage`.
- Page `/installer` permanente accessible depuis Profil, avec instructions adaptées à la plateforme détectée.

---

## Stack technique

| Couche | Outil |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| PWA | vite-plugin-pwa (manifest + service worker) |
| Backend / Auth | Supabase (auth, base de données, storage, realtime) |
| Notifications push | Firebase Cloud Messaging (FCM) |
| Email transactionnel | Resend (domaine vérifié `app.omnesmedecins.fr`, envoi via `noreply@app.omnesmedecins.fr`) — utilisé en API directe (création de médecin, étape 14D) et en SMTP custom configuré dans Supabase Auth (emails de reset password, étape 15A) |
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

**RLS en place (4 policies, étape 11A — refonte de l'étape 2C) :**
- `compta_select_reader` (SELECT) : super_admin / associe_gerant / associe via la fonction `can_read_compta()`. Le remplaçant ne lit aucune ligne, pas même la sienne.
- `compta_insert_super_admin` (INSERT) : super_admin uniquement via `is_super_admin()`.
- `compta_update_super_admin` (UPDATE) : super_admin uniquement.
- `compta_delete_super_admin` (DELETE) : super_admin uniquement.

Note d'historique : l'étape 2C avait initialement créé 7 policies sur un modèle « chacun gère sa propre ligne + les associés lisent ». Ce modèle a été abandonné en 11A : les remplaçants ne saisissent pas leur RIB eux-mêmes (le super_admin centralise la saisie), et ils ne doivent pas pouvoir lire les RIB. Les anciennes policies (jamais archivées en SQL) ont été supprimées et remplacées. Le SQL est désormais versionné dans `docs/sql/11A-1`.

**UI (étape 11)** — la gestion des informations bancaires se fait dans la fiche médecin du Trombinoscope (composant `MedecinCompta`, section « Coordonnées bancaires (RIB) »). Cf. module Trombinoscope, sous-section RIB.

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

**Création d'un médecin depuis l'app (étape 14)** : le super_admin dispose d'un bouton "+ Nouveau médecin" en haut à droite du header sticky de `/trombinoscope` (rond canard 40×40, visible uniquement pour le super_admin via le helper `canCreateMedecin`). Le clic ouvre une modale bottom-sheet `CreateMedecinModal` (formulaire à 4 champs : email, prénom, nom, rôle avec `remplacant` par défaut + case à cocher "Envoyer aussi par email" décochée par défaut). À la soumission, le frontend appelle l'Edge Function `create-medecin` via `supabase.functions.invoke`. La fonction :
1. Vérifie l'authentification de l'appelant (lecture du header `Authorization` + `auth.getUser()` avec un client `ANON_KEY` propageant le JWT).
2. Vérifie via un client `SERVICE_ROLE_KEY` (bypass RLS) que le rôle de l'appelant est `super_admin` et que son compte est `actif`.
3. Valide les entrées (email regex, nom/prenom non vides, rôle dans la liste autorisée).
4. Vérifie que l'email n'existe pas déjà dans `profiles` (distingue `actif=true` → "déjà associé à un compte existant" / `actif=false` → "compte désactivé, réactivez-le depuis la fiche").
5. Génère un mot de passe temporaire de 12 caractères via `crypto.getRandomValues`, garantit 1 minuscule + 1 majuscule + 1 chiffre + 1 symbole, exclut les caractères ambigus (`0`, `O`, `l`, `1`, `I`), mélange via Fisher-Yates.
6. Crée l'AuthUser via `auth.admin.createUser` avec `email_confirm: true` (la confirmation email n'est pas utilisée dans cette app).
7. Le trigger `handle_new_user` insère automatiquement une ligne dans `profiles` avec valeurs par défaut (`role='remplacant'`, `nom=''`, `prenom=''`).
8. UPDATE `profiles` pour appliquer le `role`, `nom`, `prenom` réels. Si cet UPDATE échoue, rollback via `auth.admin.deleteUser` pour ne pas laisser un compte à moitié configuré.
9. Si `sendEmail === true`, envoie le mot de passe par email via Resend (envoi non-bloquant : un échec d'envoi n'annule pas la création).
10. Retourne `{ success, userId, email, tempPassword, emailSent, emailError? }`.

Une fois la création réussie, le frontend ouvre une seconde modale `MedecinCreatedModal` qui affiche l'email et le mot de passe sur un fond canard pastel (police mono, `select-all`), un bandeau ocre rappelant que le mot de passe ne sera plus affiché, deux boutons de copie ("mot de passe seul" et "email + mot de passe formatés"), et un bandeau vert olive "Email envoyé" ou ocre "Échec d'envoi" selon le retour. La fermeture par overlay ou Escape est volontairement désactivée : seul le bouton "Terminer" ferme la modale, et déclenche un `refetch()` du Trombinoscope.

Défense en profondeur : l'Edge Function vérifie le rôle de l'appelant côté serveur (la RLS Postgres ne suffit pas pour ces opérations qui nécessitent la `SERVICE_ROLE_KEY`). Le toggle "Verify JWT with legacy secret" du dashboard Supabase est laissé OFF, conformément à la recommandation officielle Supabase dans la nouvelle architecture JWT (les clés asymétriques rendent ce toggle obsolète). La protection vient entièrement de l'auth custom dans le code de la fonction.

Le workflow alternatif via dashboard Supabase reste possible mais devient secondaire. La création via Edge Function est désormais le chemin nominal.

#### Routing du module

- `/trombinoscope` — liste des médecins actifs (cartes cliquables).
- `/trombinoscope/:id` — fiche détail. Affiche en lecture par défaut ; bouton "Modifier" passe en mode édition (toggle sur la même page, pas de nouvelle route). Bouton "Désactiver / Réactiver" visible pour super_admin.

#### Coordonnées bancaires (RIB) — étape 11

La fiche détail (`/trombinoscope/:id`, mode lecture) affiche une section « Coordonnées bancaires (RIB) » alimentée par la table `profiles_compta` (champs `iban`, `bic`, `nom_titulaire_compte`). Objectif métier : permettre aux médecins associés de récupérer le RIB des remplaçants pour les payer par virement.

- **Visibilité** : super_admin / associe_gerant / associe voient la section (en lecture) sur toutes les fiches. Le remplaçant ne voit aucune section RIB, sur aucune fiche.
- **Édition** : super_admin uniquement (ajout / modification / suppression). Les remplaçants ne gèrent pas leur propre RIB — ils préviennent le super_admin en cas de changement.
- **Composant** : `src/components/trombinoscope/MedecinCompta.jsx` (lecture + édition inline). Appelle `useProfilCompta(medecinId)` et `canEditCompta(role)`. Validation IBAN par checksum mod-97 intégrée (fonction exportée `isValidIban`).
- **Écriture** : upsert sur la clé primaire `id` de `profiles_compta` (`onConflict: 'id'`), qui est aussi FK vers `profiles(id)`. Une ligne RIB par médecin.
- **Défense en profondeur** : la RLS (cf. 11A) applique les mêmes règles côté Postgres, indépendamment de l'UI.

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

#### Routing du module

- `/annuaire` — liste avec recherche locale, filtre par catégorie et bouton "+ Ajouter".
- `/annuaire/nouveau` — formulaire de création (utilise EntreeAnnuaireForm).
- `/annuaire/:id` — fiche détail/édition (toggle view/edit sur la même page) + bouton Supprimer.

#### Permissions fines

La logique d'autorisation est dans [src/lib/permissions.js](../src/lib/permissions.js) :

- `canEditEntreeAnnuaire({ role, currentUserId, auteurId })` — true si super_admin OU associe_gerant OU auteur de l'entrée.
- `canDeleteEntreeAnnuaire(...)` — même règle que canEditEntreeAnnuaire.

Défense en profondeur : la RLS Postgres applique strictement les mêmes règles côté serveur (cf docs/sql/5A-2-rls-annuaire.sql), indépendamment de ce qui passe côté frontend.

#### Hard delete

Contrairement au Trombinoscope qui utilise un soft delete via `actif`, l'Annuaire fait un hard DELETE en base. Justification : les entrées d'annuaire n'ont pas de lien fort avec auth.users (juste auteur_id en ON DELETE SET NULL), et il n'y a pas de nécessité de garder un historique. Le ConfirmDialog (variant danger) protège contre les suppressions accidentelles.

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

**Type :** Tableaux thématiques + cartes (liste plate) + chat temps réel par carte

**Concept :** Espace de décisions collectives. Les utilisateurs autorisés créent des tableaux thématiques (ex. « Achat échographe », « Planning été ») et y invitent des participants. Chaque tableau contient une liste plate de cartes ; une carte représente un sujet ou une question. Chaque carte porte un fil de chat temps réel où les participants discutent jusqu'à décision, et possède un statut binaire **ouvert / clos**.

> Le format Kanban à colonnes a été écarté au profit d'une liste plate de cartes, plus adaptée au mobile et au cas d'usage d'un cabinet médical.

**Anatomie d'une carte :** titre + description + chat + pièces jointes + statut (ouvert/clos).

**Couleur d'un tableau :** chaque tableau peut choisir une couleur d'identité parmi 6 swatches du DS (`brique`, `canard`, `ocre`, `olive`, `fuchsia`, `marine`). Cette couleur teinte la tile dans la liste, le CTA « + Nouvelle carte » et les bulles de mes messages dans le chat. Fallback `brique` (couleur du module) si non choisie.

**Droits :**

| Action | super_admin | associé_gérant | associé | remplaçant |
|---|:---:|:---:|:---:|:---:|
| Voir ses tableaux invités | ✓ | ✓ | si invité | si invité |
| Créer un tableau | ✓ | ✓ | ✓ | — |
| Inviter / désinviter dans son tableau | ✓ (tout tableau) | ✓ (tout tableau) | ✓ (créateur) | — |
| Créer une carte (dans un tableau où invité) | ✓ | ✓ | ✓ | — |
| Modifier / archiver une carte | créateur de la carte, créateur du tableau, super_admin |
| Commenter (chat) dans une carte | ✓ | ✓ | si invité | si invité |
| Éditer / supprimer ses propres messages | ✓ | ✓ | ✓ | ✓ |
| Archiver un tableau | créateur du tableau + super_admin |
| Supprimer dur un tableau | super_admin uniquement |

**Précisions :**
- Le remplaçant participe au chat mais ne crée pas de cartes.
- Désinviter un participant conserve son historique de messages visible pour les autres.
- L'archivage masque le tableau de la liste principale (accessible via filtre Actifs / Archivés).
- Les messages ne peuvent plus être postés dans une carte close ; le chat passe en lecture seule (composer remplacé par une bande grisée « Cette carte est close — les messages sont en lecture seule. »).

**Navigation :** Les utilisateurs accèdent à leurs tableaux via le module Discussion. Ils ne voient que les tableaux auxquels ils sont invités.

**Stockage des pièces jointes :** bucket Supabase dédié `discussion-attachments`, helpers calqués sur le pattern `cabinetStorage.js` (path UUID flat, download via Blob pour préserver les noms UTF-8). Une pièce jointe est rattachée soit à une carte (contexte de décision, affichée en chips scrollables sous la description), soit à un message du chat.

**Temps réel :** Supabase Realtime activé sur `discussion_messages` (chat ouvert) et sur `discussion_cards` (rafraîchissement de la liste de cartes quand un autre user en crée une).

**Tracking lu / non-lu :** deux niveaux pour éviter de tout recalculer côté client :
- `discussion_board_members.last_read_at` : utilisé pour le **point coloré** sur la tile du tableau dans la liste Discussion (niveau « ce tableau a du nouveau ou non »).
- `discussion_card_reads.last_read_at` : utilisé pour le **compteur numérique** non-lu par carte dans la vue tableau (priorisation fine des cartes actives).
- Marquage automatique à l'ouverture d'une carte.

**Notifications push (Firebase FCM) :** reportées à l'étape 14 (module dédié notifications). Le module Discussion est livré sans push ; les utilisateurs voient les nouveaux messages au prochain chargement ou via Realtime s'ils ont la carte ouverte.

**Cohérence visuelle :** mêmes patterns que les modules existants (header sticky, recherche en haut de liste, modales bottom-sheet via React Portal, menu trois-points pour actions). Avatars = initiales sur fond coloré, rotation déterministe parmi 6 couleurs (même hash que dans Annuaire). Densité de liste hardcodée à 68 px (comfortable) en V1.

---

### 5. Événements

**Type :** Agenda commun (liste d'événements) + sondage de présence + documents

**Concept :** Agenda partagé du cabinet — formations, réunions, congrès. Chaque événement porte un titre, des dates (un ou plusieurs jours), un lieu, une description et une couleur d'identité. En option : un sondage de présence et des documents attachés. Pas de chat, pas de récurrence, pas de notifications.

**Couleur par événement :** à la création, l'auteur choisit une couleur parmi les 6 du DS (`brique`, `ocre`, `olive`, `canard`, `fuchsia`, `marine`, défaut `marine`). Elle teinte le bloc-date de la liste, la pastille calendrier du détail, la pill « Sondage », l'indicateur « À répondre » et les boutons du sondage. Le module n'a pas de couleur d'accent propre : les CTA et le filtre actif sont en `marine`.

#### Tables (Supabase)

`evenements`
```
id             uuid      PK
titre          text      not null
description    text
date_debut     date      not null
date_fin       date      optionnel (multi-jours ; CHECK >= date_debut)
lieu           text      optionnel
couleur        text      6 valeurs DS, defaut 'marine'
sondage_actif  boolean   defaut false
auteur_id      uuid      FK profiles(id) ON DELETE SET NULL
created_at / updated_at  timestamptz
```

`evenement_fichiers` — documents attachés (bucket Storage `evenements`, l'`id` sert de nom physique du blob, pattern flat UUID).
```
id            uuid      PK = nom du blob dans Storage
evenement_id  uuid      FK evenements(id) ON DELETE CASCADE
nom           text
taille_octets bigint    CHECK <= 25 Mo
mime_type     text
auteur_id     uuid      FK profiles(id) ON DELETE SET NULL
created_at    timestamptz
```

`evenement_reponses` — réponses au sondage (une par utilisateur et par événement).
```
id            uuid      PK
evenement_id  uuid      FK evenements(id) ON DELETE CASCADE
user_id       uuid      FK profiles(id) ON DELETE CASCADE
reponse       text      'oui' | 'non' | 'peut_etre' (CHECK)
created_at / updated_at  timestamptz
UNIQUE (evenement_id, user_id)  -- permet l'upsert
```

**RLS (10 policies, étape 8A-2) :** lecture des 3 tables ouverte à tout authentifié. `evenements` : création par super_admin / associe_gerant / associe (auteur = soi) ; modification et suppression par super_admin / associe_gerant ou l'auteur. `evenement_fichiers` : ajout / suppression réservés à ceux qui peuvent modifier l'événement parent. `evenement_reponses` : chacun gère sa propre réponse (INSERT + UPDATE) tant que le sondage est actif. Storage : bucket `evenements` privé, 25 Mo ; lecture pour tous, écriture pour super_admin / associe_gerant / associe (la granularité fine « son propre événement » est portée par la RLS de `evenement_fichiers`). Realtime activé sur `evenements` uniquement.

#### Droits

| Action | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Voir les événements | ✓ | ✓ | ✓ | ✓ |
| Créer un événement | ✓ | ✓ | ✓ | — |
| Modifier / supprimer un événement | ✓ tous | ✓ tous | ✓ les siens | — |
| Ajouter / supprimer un document | ✓ tous | ✓ tous | ✓ ses événements | — |
| Répondre au sondage | ✓ | ✓ | ✓ | ✓ |

#### Écrans & routing

- `/evenements` — liste : recherche (titre + lieu), filtre segmenté « À venir » / « Passés », bloc-date coloré (plage compacte si multi-jours, neutralisé en gris pour les passés), pill « Sondage », indicateur « À répondre ». CTA « Nouvel événement » selon le rôle. Tuile Home câblée.
- `/evenements/:id` — détail : bloc résumé (date complète, lieu, auteur), description, section sondage (si actif), section documents. Menu trois-points Modifier / Supprimer selon les droits.
- Création / édition via la bottom-sheet `EvenementFormModal` (titre, description, dates, lieu, `ColorPicker`, interrupteur sondage).

#### Permissions fines

Dans `src/lib/permissions.js` : `canCreateEvenement(role)`, `canEditEvenement({ role, currentUserId, auteurId })`, `canDeleteEvenement(...)` (même règle qu'éditer), `canRespondToSondage(role)`.

#### Sondage de présence

Activable à la création / édition (`sondage_actif`). 3 réponses fixes Oui / Non / Peut-être, une par personne, modifiable (upsert sur `evenement_reponses`), en optimistic UI. Décompte et liste des votants groupée visibles par tous.

#### Architecture

Dossier `src/features/evenements/` : hooks `useEvenements`, `useEvenement`, `useEvenementFichiers`, `useSondage` ; composants `EvenementFormModal`, `ColorPicker`, `EvenementDocuments`, `EvenementUploadModal`, `PollSection`, `EventDateBlock` ; helpers `eventColors.js`, `eventDate.js`, `fileType.js`, `evenementStorage.js`. Pages `src/pages/Evenements.jsx` et `EvenementDetail.jsx`.

#### Écarts au plan initial

- Spécifié « Drive » à l'origine, le module a été conçu en **liste plate d'événements** (pas d'arborescence de dossiers).
- Droits élargis : l'`associe` peut créer des événements et gérer les siens (le plan le donnait en lecture seule).
- Ajouts produit non prévus : **couleur d'identité par événement** et **sondage de présence**.
- Pas de champ heure (l'heure va dans la description) ni de sous-lieu (un seul champ `lieu`).

#### Limitations connues

- Suppression d'un événement : nettoyage best-effort des blobs Storage des documents ; un échec laisse des fichiers orphelins (sans fuite de données).
- Pas de Realtime sur les documents ni le sondage : rafraîchis au chargement de la page détail.

---

### 6. SIM (Société d'Intendance Médicale)

**Type :** Drive (documents)

**Concept :** Espace documentaire privé réservé aux associés gérants de la SIM. Collecte tous les documents de la société (statuts, PV d'AG, comptabilité, contrats…). Complètement invisible pour les associés simples et les remplaçants — le module n'apparaît pas dans leur page d'accueil et l'URL directe `/sim` les redirige vers un écran « Accès restreint ».

#### Tables (Supabase)

`sim_dossiers` — arborescence libre via `parent_id` (self-référence avec `ON DELETE RESTRICT` : un dossier non vide ne peut pas être supprimé).
id          uuid      PK
nom         text      not null
parent_id   uuid      FK sim_dossiers(id) ON DELETE RESTRICT
couleur     text      6 valeurs DS (bleu/gris/jaune/orange/rouge/vert), défaut 'gris'
auteur_id   uuid      FK profiles(id) ON DELETE RESTRICT, NOT NULL
created_at / updated_at  timestamptz

`sim_fichiers` — fichiers rattachés à un dossier ou à la racine. L'`id` UUID sert aussi de nom physique du blob dans le bucket Storage `sim` (pattern flat UUID).
id            uuid      PK = nom du blob dans Storage
nom           text      not null
dossier_id    uuid      FK sim_dossiers(id) ON DELETE RESTRICT (NULL = racine)
taille_octets bigint    CHECK <= 25 Mo
mime_type     text
auteur_id     uuid      FK profiles(id) ON DELETE RESTRICT, NOT NULL
created_at / updated_at  timestamptz

**Fonction `is_sim_member()`** (`SECURITY DEFINER`, étape 9A-3) — répond à « l'utilisateur courant est-il super_admin ou associe_gerant ? ». Pattern identique à `is_board_member` (Discussion) : permet de lire `profiles` sans récursion de policy et sans dépendre des droits SELECT de l'appelant.

**RLS (8 policies + 3 storage, étape 9A-4 et 9A-5) :**
- SELECT / INSERT sur `sim_dossiers` et `sim_fichiers` : conditionnés à `is_sim_member()`. Un non-membre ne voit **aucune ligne**.
- UPDATE / DELETE : `is_sim_member()` ET (`auteur_id = auth.uid()` OU rôle `super_admin`). Le filtrage fin « auteur » est porté au niveau Postgres, pas seulement côté React.
- Storage (bucket `sim`, privé, 25 Mo) : SELECT / INSERT / DELETE conditionnés à `is_sim_member()`. La granularité « auteur » sur la suppression de blob est implicite — le code supprime d'abord la ligne DB (où la RLS « auteur » s'applique), puis le blob dans la foulée.

#### Droits

| Action | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Voir et télécharger | ✓ | ✓ | — | — |
| Uploader / créer dossier (n'importe où) | ✓ | ✓ | — | — |
| Modifier / supprimer un dossier | ✓ tous | ✓ les siens | — | — |
| Modifier / supprimer un fichier | ✓ tous | ✓ les siens | — | — |

Conséquence assumée : un dossier créé par un gérant peut contenir des fichiers déposés par d'autres membres. La règle `ON DELETE RESTRICT` empêche alors le créateur de supprimer son propre dossier tant qu'il contient le fichier d'un autre — il faut soit que l'autre membre retire son fichier, soit que le super_admin intervienne.

#### Écrans & routing

- `/sim` — racine : header « SIM » + sous-titre « Société d'Intendance Médicale », toolbar « Nouveau dossier » + « Importer » (CTA olive), barre de recherche, liste dossiers puis fichiers, état vide dédié. Tuile Home câblée.
- `/sim/:id` — vue d'un dossier : breadcrumb à 2 segments `SIM > NomDossier` (le segment `SIM` est cliquable, ramène à la racine). Si l'id n'existe pas (ou a été supprimé entre-temps), redirection vers `/sim`.
- Création de dossier, import, renommage, confirmation de suppression : tous en bottom-sheet via React Portal, animation `animate-slide-up`, calques bottom-sheet sur ceux de Cabinet pratique (boutons de validation en `marine`, danger en `brique`, accent secondaire `canard` dans les états des modales — conformément au DS).

#### Permissions fines (helpers React)

Dans `src/lib/permissions.js` :
- `canAccessSim(role)` — pilote le masquage de la tuile Home (`getVisibleModules` lit `allowedRoles`) et les gardes de page de `/sim` et `/sim/:id`.
- `canEditSim({ role, currentUserId, auteurId })` — true si `super_admin`, ou `associe_gerant` ET auteur de l'élément. Pattern identique à `canEditEntreeAnnuaire`.
- `canDeleteSim(...)` — même règle que `canEditSim`.

Côté UI, chaque dossier/fichier est décoré par `Sim.jsx` et `SimFolder.jsx` avec des champs `canEdit` / `canDelete` / `canMenu` avant d'être passé à `DrivePage`. L'icône « ⋮ » n'apparaît que si au moins une action est possible — un dossier dont on n'est pas l'auteur affiche un simple chevron `>` à la place.

#### Architecture

Dossier `src/features/sim/` : hooks `useSimRoot`, `useSimFolder`, helper de filtrage `filterByTerm` (recherche scopée au dossier courant — différent de Cabinet pratique qui a une recherche globale) ; composants `DrivePage`, `NewFolderModal`, `UploadModal`, `ActionsMenu`, `RenameModal`, `DeleteConfirmModal` ; helper `simStorage.js` (`openSimFile`, `downloadSimFile`, `removeSimBlob`). Pages `src/pages/Sim.jsx` et `src/pages/SimFolder.jsx`.

#### Écarts au plan initial

- Le plan initial donnait la suppression uniquement à `super_admin`. Arbitré en étape 9 : `associe_gerant` peut supprimer (et modifier) **ses propres éléments**, calqué sur l'Annuaire. La matrice des accès du module a été corrigée en conséquence dans la section « Matrice des accès — vue globale ».
- La recherche du Drive SIM est **scopée au dossier courant**, et non globale comme Cabinet pratique. Décision produit assumée : volume documentaire faible et arborescence prévue peu profonde.
- `DrivePage` a été dérivé de la version Cabinet plutôt que partagé : ajout des props `subtitle` et `accent`, et bascule du contrat `canWrite` (global) vers `canMenu` par élément pour porter la logique « auteur ». Une factorisation Cabinet / SIM pourra être envisagée plus tard si une troisième page Drive émerge.

#### Limitations connues

- **Breadcrumb à 2 segments uniquement** (`SIM > NomDossier`). Au-delà du 2e niveau d'imbrication, le contexte intermédiaire n'apparaît pas dans le fil — le retour racine se fait en un clic sur le segment `SIM`. Limitation identique à Cabinet pratique ; un breadcrumb complet (remontée des `parent_id`) pourra être ajouté en transverse sur les deux modules en une étape dédiée si le besoin se confirme.
- **Suppression de fichier** : nettoyage best-effort du blob dans le bucket Storage. Un échec laisse le fichier orphelin (inaccessible, sans fuite de données) — même stratégie qu'en Cabinet pratique et Événements.
- **Suppression d'un dossier non vide** : refusée par la contrainte SQL `ON DELETE RESTRICT`. Le code Postgres 23503 est intercepté et traduit en message utilisateur clair (« Ce dossier n'est pas vide. Supprimez d'abord les éléments qu'il contient. »).
- **Pas de Realtime** : les listes sont rafraîchies au chargement de la page et après chaque mutation locale (`refetch`). Un utilisateur qui consulte un dossier ne voit pas en direct un fichier déposé par un autre membre — il faut un rechargement de la page. Cohérent avec Cabinet pratique.

---

### 7. Immobilier

**Type :** Cartes / tableaux (style Trello) + chat par carte

**Concept :** Suivi des projets immobiliers liés au cabinet (travaux, acquisitions, baux…). Fonctionne comme le module Discussion : tableaux thématiques avec invitation et chat intégré. Module **invisible et inaccessible aux remplaçants** : la tuile est masquée sur la Home, l'URL directe redirige vers `/`, et la RLS exclut leur user_id de l'invitation aux board_members.

#### Tables (Supabase)

`immobilier_boards` — tableaux thématiques.
id               uuid     PK
titre            text     not null
description      text     optionnel
couleur          text     CHECK in (brique, canard, ocre, olive, fuchsia, marine), défaut 'canard'
archive          boolean  défaut false
auteur_id        uuid     FK profiles(id) ON DELETE SET NULL
last_activity_at timestamptz  mis à jour par trigger sur insert message
created_at / updated_at  timestamptz

`immobilier_board_members` — appartenance à un tableau.
board_id      uuid    FK immobilier_boards(id) ON DELETE CASCADE
user_id       uuid    FK profiles(id) ON DELETE CASCADE
role_in_board text    CHECK in ('owner', 'member'), défaut 'member'
last_read_at  timestamptz  utilisé pour le point coloré du tableau
created_at    timestamptz
PRIMARY KEY (board_id, user_id)

`immobilier_cards` — cartes d'un tableau.
id               uuid     PK
board_id         uuid     FK immobilier_boards(id) ON DELETE CASCADE
titre            text     not null
description      text
statut           text     CHECK in ('ouvert', 'clos'), défaut 'ouvert'
archive          boolean  défaut false
auteur_id        uuid     FK profiles(id) ON DELETE SET NULL
last_activity_at timestamptz
created_at / updated_at  timestamptz

`immobilier_messages` — fil de chat d'une carte.
id         uuid     PK
card_id    uuid     FK immobilier_cards(id) ON DELETE CASCADE
auteur_id  uuid     FK profiles(id) ON DELETE SET NULL
contenu    text     not null
edited     boolean  défaut false
created_at / updated_at  timestamptz

`immobilier_attachments` — pièces jointes attachées à une carte. L'`id` UUID sert aussi de nom physique du blob dans le bucket Storage `immobilier-attachments` (pattern flat UUID identique à Cabinet/SIM/Discussion).
id            uuid    PK = nom du blob
card_id       uuid    FK immobilier_cards(id) ON DELETE CASCADE
nom           text    not null
taille_octets bigint  CHECK <= 25 Mo
mime_type     text
auteur_id     uuid    FK profiles(id) ON DELETE SET NULL
created_at    timestamptz

`immobilier_card_reads` — dernière lecture d'une carte par un user (pour le compteur numérique non-lu).
card_id      uuid    FK immobilier_cards(id) ON DELETE CASCADE
user_id      uuid    FK profiles(id) ON DELETE CASCADE
last_read_at timestamptz
PRIMARY KEY (card_id, user_id)

#### Fonctions SECURITY DEFINER

Cinq fonctions dans `public`, toutes en `SECURITY DEFINER` avec `search_path` figé sur `public, pg_temp` :
- `is_immobilier_member()` — true si l'utilisateur courant est super_admin / associe_gerant / associe (exclut remplaçants).
- `is_immobilier_board_member(p_board_id)` — true si l'utilisateur est membre du tableau donné. Sert aux RLS SELECT.
- `is_immobilier_board_owner(p_board_id)` — true si l'utilisateur est `owner` du tableau. Sert aux RLS UPDATE/DELETE/INSERT-members.
- `can_create_immobilier_board()` — true si l'utilisateur est super_admin ou associe_gerant. Différence vs Discussion : l'associé ne peut PAS créer de tableau.
- `mark_immobilier_board_read(p_board_id)` — RPC appelée à l'ouverture d'un tableau ; met à jour le seul champ `last_read_at` de la ligne `immobilier_board_members` de l'appelant. Pattern identique à `mark_board_read` (Discussion 7C).

#### Trigger auto-owner

Trigger `AFTER INSERT` sur `immobilier_boards` qui inscrit automatiquement l'`auteur_id` comme `owner` dans `immobilier_board_members`. Permet à l'INSERT côté client de réussir sans devoir gérer manuellement la ligne d'appartenance après création, et résout un piège RLS où l'INSERT...RETURNING échouait parce que le SELECT du RETURNING ne passait pas la policy SELECT (le créateur n'était pas encore membre au moment de l'évaluation).

#### RLS (21 policies)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `immobilier_boards` | membre | super_admin + associe_gerant, et `auteur_id = auth.uid()` | owner | super_admin uniquement |
| `immobilier_board_members` | membre | owner du tableau, et `user_id` non-remplaçant (sous-requête `profiles`) | — (pas de policy, on passe par RPC `mark_immobilier_board_read`) | owner OU soi-même (quitter) |
| `immobilier_cards` | membre | membre, et `auteur_id = auth.uid()` | créateur carte OU owner OU super_admin | idem UPDATE |
| `immobilier_messages` | membre du board parent | membre du board parent, `auteur_id = auth.uid()`, et statut carte = 'ouvert' | auteur uniquement | auteur uniquement |
| `immobilier_attachments` | membre du board parent | membre du board parent, `auteur_id = auth.uid()` (carte close bloquée côté UI uniquement) | — | auteur uniquement |
| `immobilier_card_reads` | soi-même | soi-même | soi-même | — |

#### Storage

Bucket `immobilier-attachments` (privé, 25 Mo, MIME types non restreints au niveau bucket — la validation des types acceptés est faite côté UI dans `immobilierStorage.js`). 3 policies : SELECT/INSERT/DELETE conditionnées à `is_immobilier_member()`. La granularité fine « auteur uniquement » sur la suppression de blob est portée implicitement : le code supprime d'abord la ligne DB (où la RLS auteur s'applique), puis le blob dans la foulée.

#### Realtime

Activé sur `immobilier_boards`, `immobilier_cards`, `immobilier_messages`, `immobilier_attachments`. Non activé sur `immobilier_board_members` (rechargement de page suffit) ni sur `immobilier_card_reads` (purement local). Les 4 tables relayées ont aussi `REPLICA IDENTITY FULL` pour que les DELETE soient relayés avec leur contenu complet (sans ça, les filtres `card_id=eq.X` côté client n'évaluent pas les DELETE).

#### Droits

| Action | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Voir ses tableaux invités | ✓ | ✓ | si invité | — |
| Créer un tableau | ✓ | ✓ | — | — |
| Inviter / désinviter dans son tableau | ✓ tout tableau | ✓ tout tableau | si owner (rare en pratique) | — |
| Créer / modifier une carte | ✓ | ✓ | ✓ si invité | — |
| Commenter (chat) dans une carte | ✓ | ✓ | si invité | — |
| Éditer / supprimer ses propres messages | ✓ | ✓ | ✓ | — |
| Modifier / clore / supprimer une carte | créateur carte + owner + super_admin |
| Archiver un tableau | créateur tableau + super_admin |
| Supprimer dur un tableau | super_admin uniquement |
| Ajouter / supprimer ses propres pièces jointes | ✓ | ✓ | ✓ si membre | — |

#### Écrans & routing

- `/immobilier` — page liste : header sticky (titre canard, recherche locale, filtre Actifs/Archivés), CTA `+ Nouveau` (visible super_admin + associe_gerant), liste de tiles avec point coloré non-lu, état vide adapté au rôle.
- `/immobilier/:boardId` — vue tableau : header (retour, titre, description, avatars membres, menu trois-points), filtre Ouvertes/Closes/Toutes, CTA `+ Carte` teinté couleur tableau, liste de tiles cartes (avec snippet du dernier message + compteur non-lus + badge statut).
- `/immobilier/:boardId/:cardId` — vue carte plein écran (sans AppLayout, sans BottomNav — comportement type messagerie) : header retour + titre + sous-titre tableau + badge statut + menu trois-points, description repliable, section pièces jointes (chips horizontales scrollables), fil de messages temps réel, composer sticky (textarea autosizing, bouton Send teinté couleur tableau, désactivé si carte close).

#### Architecture

Dossier `src/features/immobilier/` :
- Hooks : `useImmobilier.js` (liste tableaux + point non-lu), `useBoard.js` (vue tableau + enrichissement cartes avec dernier message et compteur non-lus), `useBoardOwnerIds` (hook léger pour la vue carte), `useCard.js` (vue carte + messages + attachments + Realtime).
- Composants : `ImmobilierBoardTile`, `CardTile`, `StatusBadge`, `MemberAvatars`, `BoardActionsMenu`, `CardActionsMenu`, `CardMessage`, `CardComposer`, `CardPage`, `CardAttachments`, `AttachmentChip`, `ColorPicker`, `MemberPicker`, modales `CreateBoardModal`, `EditBoardModal`, `CreateCardModal`, `EditCardModal`, `ManageMembersModal`.
- Helpers : `immobilierColors.js` (accent canard + 6 swatches), `immobilierStorage.js` (upload/download/open, validation taille + types).

Pages : `src/pages/Immobilier.jsx`, `ImmobilierBoard.jsx`, `ImmobilierCard.jsx`.

Permissions dans `src/lib/permissions.js` : `canAccessImmobilier`, `canCreateImmobilierBoard`, `isImmobilierBoardOwner`, `canInviteToImmobilierBoard`, `canEditImmobilierBoard`, `canArchiveImmobilierBoard`, `canDeleteImmobilierBoard`, `canCreateImmobilierCard`, `canEditImmobilierCard`, `canDeleteImmobilierCard`, `canCommentImmobilier`, `canEditOwnImmobilierMessage`.

#### Écarts au plan initial

- Décisions de cadrage validées en début d'étape 10 : architecture **copier-adapter** depuis `features/discussion/` (pas de partage de composants), tables séparées préfixées `immobilier_`, accent module **canard** (différent de Discussion qui est `brique`).
- L'`associe` invité peut **créer/modifier ses propres cartes** (la matrice initiale lui donnait juste « commenter »). Arbitré pour pertinence métier.
- **Alignement visuel sur Discussion** (étape 10D-2-bis, sous-étapes a → d) : les écrans Immobilier ont été réharmonisés sur les patterns Discussion tout en préservant trois spécificités assumées : accent module canard (au lieu de brique), déroulement horizontal des pièces jointes, sous-titre du tableau parent dans le header de la vue carte. Décision de portée : on a aligné les composants visuels uniquement ; les hooks Immobilier gardent la convention snake_case (français) au lieu de camelCase (anglais) de Discussion. Cette dette de nommage entre modules est notée pour l'étape 12 bis.

#### Limitations connues

- **Nouveau tableau créé par un autre utilisateur** : visible uniquement après rechargement de `/immobilier` (la table `immobilier_board_members` n'est pas dans la publication Realtime ; une fix simple — ajouter la table à la publication — pourra être faite ultérieurement si l'usage le justifie).
- **Suppression de PJ orpheline** : si la suppression DB réussit mais que la suppression du blob Storage échoue, le blob reste dans le bucket (inaccessible, sans fuite de données). Stratégie best-effort identique à Cabinet pratique, SIM, Événements et Discussion.
- **Pas de breadcrumb riche** sur la vue carte : juste « retour au tableau ». Cohérent avec le pattern Discussion 7C.

---

## Matrice des accès — vue globale

| Module | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Trombinoscope | ✓ édition complète | ✓ édition complète | ✓ lecture + édition de soi | ✓ lecture restreinte + édition de soi |
| Annuaire | ✓ | ✓ | ✓ | ✓ |
| Cabinet pratique | ✓ édition | ✓ édition | ✓ lecture | ✓ lecture |
| Discussion | ✓ | ✓ | si invité | si invité |
| Événements | ✓ édition complète | ✓ édition complète | ✓ création + édition de soi | ✓ lecture + sondage |
| SIM | ✓ | ✓ | invisible | invisible |
| Immobilier | ✓ création + gestion complète | ✓ création + gestion complète | ✓ si invité (cartes + chat) | — invisible |

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
| `/recherche` | protégée | `Recherche` (filtre Trombinoscope, vouée à s'étendre aux autres modules) |
| `/profil` | protégée | `Profil` (infos compte + déconnexion ; sera enrichi à l'étape 11) |
| `*` | — | redirect vers `/` |

Mécanique :
- `<ProtectedRoute>` (à `src/components/ProtectedRoute.jsx`) affiche un écran "Chargement…" pendant `useAuth().loading`, redirige vers `/login` si pas d'utilisateur, sinon rend `<Outlet />`. Toutes les routes protégées sont imbriquées sous ce composant.
- `Login.jsx` redirige vers `/` si un utilisateur est déjà connecté (via `useEffect` qui surveille `useAuth().user`).

### Composants réutilisables transverses

- **`src/components/common/ConfirmDialog.jsx`** — modal de confirmation Tailwind générique. Props : `{ open, title, message, onConfirm, onCancel, confirmLabel, cancelLabel, confirmVariant, submitting }`. Variants : `'primary'` (bg-marine) et `'danger'` (bg-brique). A11y : `role="dialog"`, `aria-modal`, `aria-labelledby`. Bloque le scroll du body et capte la touche Escape pendant l'ouverture. Utilisé actuellement pour la désactivation/réactivation Trombinoscope, à réutiliser pour les futures suppressions (événements, entrées d'annuaire, etc.).

- **`src/components/layout/BottomNav.jsx`** — barre de navigation basse fixe (3 onglets : Accueil, Rechercher, Profil). Utilise `<NavLink>` de react-router-dom : navigue par URL et calcule l'état actif via la prop render `({ isActive })`. Aucune prop n'est passée par les pages — la nav est entièrement autonome. L'onglet Accueil utilise `end={true}` pour matching exact (sinon il resterait actif sur toutes les routes).

- **`src/components/common/Pill.jsx`** — composant pill réutilisable pour badges, statuts et catégories. Props : `{ color, variant, size, uppercase, children }`. Variants : `'soft'` (couleur 10-15% + texte couleur) et `'solid'` (couleur pleine + texte blanc, sauf ocre qui passe en texte marine). Couleurs supportées : marine, canard, ocre, olive, brique, fuchsia. Tailles : `'sm'` (11px) et `'md'` (13px). Uppercase tracking 0.12em par défaut. Utilisé pour les rôles dans le Trombinoscope (variant soft canard) et pour les catégories dans l'Annuaire (variant soft ocre, qui exploite la couleur `ocre-fonce` du DS pour le contraste sur fond pastel).

### Design system

Les tokens couleurs, typographies, radii et shadows sont centralisés dans `tailwind.config.js`. Une couche de classes typo composées est définie dans `src/index.css` via `@layer components`.

**Couleurs de marque** : `marine` (primary/CTA/Cabinet pratique), `canard` (Trombinoscope, Immobilier, liens), `ocre` (Annuaire), `olive` (SIM), `brique` (Discussion, danger), `fuchsia` (Événements). Variante secondaire : `ocre-fonce` (#A06A0E) pour les textes sur fond ocre pastel (pills catégorie, suggestions, empty state Annuaire). Permet un contraste WCAG suffisant que le `ocre` natif n'offre pas sur fond `bg-ocre/15`. **Surfaces** : `fond` (#F5F7F9), `carte` (#FFFFFF). **Opacités du marine** : `ink` (100%), `muted` (55%), `faint` (35%), `border` (8%), `overlay` (40%, pour les fonds de modale).

**Typographies** : préférer les classes composées `.text-h1`, `.text-h2`, `.text-wordmark` (Archivo) et `.text-body-l`, `.text-body-m`, `.text-caption`, `.text-eyebrow`, `.text-tagline`, `.text-field-label`, `.text-button` (Inter) plutôt que de combiner les classes Tailwind à la main. Cela garantit la cohérence des tailles, weights et letter-spacings d'un écran à l'autre.

**Radii** : `rounded-tile` (18px, tuiles modules), `rounded-card` (16px, cartes/dialogs), `rounded-input` (14px, inputs et CTA primary), `rounded-pill` (10px, chips et boutons icônes).

**Shadows** : `shadow-card` (cartes/list items, très subtile), `shadow-button` (CTA primary, plus marquée), `shadow-tile` (tuiles modules colorées). Toutes utilisent une teinte marine plutôt que du noir pur.

### Helpers de permissions

`src/lib/permissions.js` centralise les règles d'accès du Trombinoscope (cf. section "Permissions fines" du module 1). Les pages et composants importent ces helpers plutôt que de tester `role` directement, ce qui rend les règles modifiables d'un seul endroit.

Depuis l'étape 11, `permissions.js` couvre aussi le RIB : `canViewCompta(role)` et `canEditCompta(role)`, miroirs React des fonctions Postgres `can_read_compta()` et `is_super_admin()` (cf. 11A).

### Helpers Storage

`src/lib/storageOpen.js` (introduit en étape 15 bis) centralise la logique d'ouverture des fichiers stockés dans Supabase Storage. Expose `openOrDownload({ supabase, bucket, storagePath, filename, mimeType })` qui choisit dynamiquement la meilleure stratégie selon le type de fichier et le contexte d'exécution :

- Fichier non previewable → téléchargement Blob (préserve les accents et l'encodage UTF-8 du nom de fichier)
- Fichier previewable + PWA installée (iOS standalone) → téléchargement Blob, pour contourner le blocage Safari sur `window.open()` et `<a target="_blank">` après une opération asynchrone
- Fichier previewable + navigateur classique → ouverture dans un nouvel onglet via URL signée

Expose aussi `isPreviewable(mimeType)` (factorisé : était dupliqué dans 4 helpers de module) et `isStandaloneMode()` (détection PWA installée combinant `matchMedia('(display-mode: standalone)')` et `navigator.standalone` iOS).

Les 5 helpers de module (`cabinetStorage.js`, `simStorage.js`, `evenementStorage.js`, `discussionStorage.js`, `immobilierStorage.js`) délèguent désormais leur fonction `openXxxFile` ou `openAttachment` à `openOrDownload`. Les signatures publiques sont inchangées — les composants appelants n'ont pas été modifiés.

### Composants Branding

`src/components/common/LogoOmnes.jsx` (introduit en étape 15 ter) affiche le mark Omnès Médecins teinté dans n'importe quelle couleur du DS, sans dépendre d'une bibliothèque d'icônes ni d'un SVG. Technique : un seul PNG noir opaque (`public/watermark-mask.png`, ~16 ko) est utilisé en `mask-image` CSS, colorisé via `background-color`. Une seule image, n couleurs. Props : `color` (clé DS ou valeur CSS libre), `width`, `height`, `opacity`, `className`, `style`. Le composant inclut les préfixes `-webkit-mask-*` requis pour Safari/iOS (PWA).

`src/components/common/HeaderWatermark.jsx` (introduit en étape 15 ter) est un wrapper de `LogoOmnes` qui positionne le logo en filigrane dans un header sticky. Le composant est en `position: absolute` à droite, `pointer-events-none`, `select-none` ; il ne capte ni clics ni sélection. Props : `color`, `size` (`sm` / `md` / `lg`), `opacity` (défaut 0.18), `offsetRight` (défaut -10 px pour effet « déborde »), `verticalAlign` (`center` par défaut / `top` pour les headers multi-lignes type BoardPage). Le header parent doit avoir `relative overflow-hidden`, et les éventuels `<div>` enfants doivent avoir `relative z-10` (pattern défensif d'empilement pour que les boutons restent au-dessus du watermark).

Distinction d'usage entre les deux composants :
- `HeaderWatermark` : filigrane d'arrière-plan dans le header des pages module et utilitaires (Trombinoscope, Annuaire, Cabinet pratique, Discussion, Événements, SIM, Immobilier, Profil, Recherche).
- `LogoOmnes` direct : élément d'identité de marque sur la Home (taille 320×128, opacité 0.07, position custom débordant à droite). Sémantique différente — c'est une signature, pas un filigrane.

---

## Structure du projet

```
omnes-orga/
├── public/
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   ├── pwa-192x192.png
│   ├── pwa-512x512.png
│   ├── pwa-maskable-512x512.png
│   ├── screenshot-mobile.png
│   ├── screenshot-desktop.png
│   ├── offline.html
│   ├── logo-omnes.webp
│   └── watermark-mask.png          ← masque CSS pour LogoOmnes (étape 15 ter)
├── docs/
│   ├── cabinet-medical-app.md      ← ce fichier
│   └── sql/                        ← scripts SQL versionnés (4B-1, 4B-2, 5A-1, 5A-2, ..., 11A-1-profiles-compta-rls.sql)
├── src/
│   ├── App.jsx                     ← routing react-router-dom
│   ├── main.jsx                    ← BrowserRouter wrapper
│   ├── index.css                   ← Tailwind directives
│   ├── components/
│   │   ├── ProtectedRoute.jsx
│   │   ├── annuaire/
│   │   │   └── EntreeAnnuaireForm.jsx
│   │   ├── common/
│   │   │   ├── ConfirmDialog.jsx
│   │   │   ├── HeaderWatermark.jsx          ← etape 15 ter
│   │   │   ├── InstallPromptModal.jsx       ← etape 12E
│   │   │   ├── LogoOmnes.jsx                ← etape 15 ter
│   │   │   ├── OfflineBanner.jsx            ← etape 12D-bis
│   │   │   └── Pill.jsx
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
│   │       ├── MedecinForm.jsx
│   │       └── MedecinCompta.jsx            ← etape 11C (section RIB)
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useRole.js
│   │   ├── useMedecins.js          ← liste filtrée actif=true
│   │   ├── useMedecin.js           ← fiche unique, ne filtre pas actif
│   │   ├── useEntreesAnnuaire.js   ← liste annuaire avec auteur joint
│   │   ├── useEntreeAnnuaire.js    ← fiche annuaire unique
│   │   ├── useProfilCompta.js      ← etape 11B (lecture RIB d'un médecin)
│   │   ├── useOnlineStatus.js      ← etape 12D-bis
│   │   └── useInstallPrompt.js     ← etape 12E
│   ├── lib/
│   │   ├── supabaseClient.js
│   │   ├── modules.js              ← ROLES, ROLE_LABELS, MODULES, getVisibleModules
│   │   ├── permissions.js          ← helpers d'autorisation Trombinoscope (+ RIB : canViewCompta / canEditCompta, etape 11B)
│   │   └── storageOpen.js          ← helper transverse d'ouverture/téléchargement de fichiers Supabase Storage (étape 15 bis)
│   └── pages/
│       ├── Login.jsx
│       ├── Home.jsx
│       ├── Trombinoscope.jsx
│       ├── MedecinDetail.jsx
│       ├── Recherche.jsx           ← etape 4-bis
│       ├── Profil.jsx              ← etape 4-bis
│       ├── Annuaire.jsx            ← etape 5
│       ├── EntreeAnnuaireDetail.jsx ← etape 5
│       ├── EntreeAnnuaireNouvelle.jsx ← etape 5
│       └── Installer.jsx           ← etape 12E
├── vite.config.js
├── tailwind.config.js
├── .env
├── .env.example
└── README.md
```

**Fichiers à venir (étapes ultérieures)** : hooks `useNotifications` ; lib `firebase.js` (étape 14 — notifications push FCM).

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
   4-bis. ✓ **Étape 4-bis — FAITE** — Refacto BottomNav + pages /recherche et /profil
  - Migration de la BottomNav vers `<NavLink>` de react-router-dom (fin de la simulation par `useState` local).
  - Création de la page `/profil` (infos compte + déconnexion, déplacés depuis `Home.jsx`).
  - Création de la page `/recherche` (input + filtre du Trombinoscope par nom/prénom/spécialité ; couvrira les autres modules au fil du projet).
  - Allègement de `Home.jsx` (~96 → ~36 lignes).
  - Refacto `AppLayout.jsx` (suppression des props `activeTab` et `onTabChange`, devenues inutiles).
5. ✓ **Étape 5 — FAITE** (sous-étapes 5A → 5H)
   - 5A : Table public.annuaire + RLS (4 policies) + index + trigger updated_at
   - 5B : Hooks useEntreesAnnuaire (liste avec auteur joint) + useEntreeAnnuaire (singulier)
   - 5C : Helpers canEditEntreeAnnuaire + canDeleteEntreeAnnuaire dans permissions.js
   - 5D-1 : Page /annuaire (liste basique) + tuile Home câblée
   - 5D-2 : Recherche texte (nom/catégorie/note) + filtre par catégorie + compteur
   - 5D-3 : Bouton + Ajouter + route /annuaire/nouveau
   - 5E : Composant EntreeAnnuaireForm (création + édition, auto-complete catégorie via datalist)
   - 5F : Page /annuaire/:id (détail + édition + suppression hard) + lignes cliquables
   - 5G : Page /annuaire/nouveau fonctionnelle (INSERT avec auteur_id, redirige vers la fiche créée)
   - 5H : Tests multi-rôles + mise à jour doc
6. **Étape 6** — Module Cabinet pratique (Drive)
   - 6.0. ✓ **FAITE** — Mise à jour design system : ajout des tokens `overlay` (couleur), `pill` (radius), `card`/`button`/`tile` (shadows) dans `tailwind.config.js` ; ajout de 10 classes typo composées dans `src/index.css` via `@layer components` (`.text-wordmark`, `.text-h1`, `.text-h2`, `.text-body-l`, `.text-body-m`, `.text-caption`, `.text-eyebrow`, `.text-tagline`, `.text-field-label`, `.text-button`).
   - 6A. ✓ **FAITE** — Setup Supabase Storage : bucket `cabinet-pratique` (privé, taille max 25 Mo, MIME types non restreints) + 4 Storage policies sur `storage.objects` (lecture pour tous les rôles authentifiés, écriture limitée à `super_admin` + `associe_gerant`) + test d'upload via dashboard. SQL archivé dans `docs/sql/6A-2-cabinet-pratique-storage-policies.sql`.
   - 6B. ✓ **FAITE** — Tables `cabinet_dossiers` (hiérarchie via `parent_id`, couleur symbolique avec CHECK sur 6 valeurs `bleu/gris/jaune/orange/rouge/vert`, `auteur_id` obligatoire, `ON DELETE RESTRICT` sur la self-référence) + `cabinet_fichiers` (id UUID utilisé aussi comme nom physique dans Storage, `taille_octets` ≤ 25 Mo via CHECK, `mime_type` libre) + RLS activé + 8 policies (4 par table, lecture pour tous, écriture pour `super_admin` + `associe_gerant`) + 2 index sur `parent_id` / `dossier_id` + fonction `handle_updated_at()` + 2 triggers `BEFORE UPDATE`. SQL archivé dans `docs/sql/6B-1-cabinet-pratique-create-tables.sql`, `docs/sql/6B-2-cabinet-pratique-rls-policies.sql`, `docs/sql/6B-3-cabinet-pratique-index-triggers.sql`.
   - 6C. ✓ **FAITE** — Hooks `useDossiersEnfants(parentId)` et `useFichiersDossier(dossierId)` dans `src/hooks/`. Pattern aligné sur `useEntreesAnnuaire` (état `data/loading/error`, `refetch` via `reloadKey`, cleanup `let active`, jointure `auteur:profiles!auteur_id(prenom, nom)`). Subtilité : `null`/`undefined` traités comme « racine » via `.is('parent_id', null)` / `.is('dossier_id', null)` (PostgREST n'accepte pas `.eq()` avec `null`).
   - 6D. ✓ **FAITE** — Helpers `canEditCabinet(role)` + `canDeleteCabinet(role)` dans `src/lib/permissions.js`. Signature à un seul paramètre `role` (pas de logique d'auteur, contrairement à Annuaire) : seuls `super_admin` et `associe_gerant` peuvent éditer/supprimer, indépendamment du créateur. Cohérent avec les Storage policies (6A-2) et les RLS policies (6B-2) — les 3 couches (RLS, Storage, helpers React) appliquent la même règle.
   - 6E-1 : Page `/cabinet` racine + tuile Home câblée (affichage des dossiers et fichiers de la racine, sans navigation arborescente pour l'instant).
   - 6E-2 : Navigation arborescente — route `/cabinet/:dossier_id` + breadcrumb (fil d'Ariane), clic sur un dossier descend dedans.
   - 6E-3. ✓ **FAITE** — Recherche dans tout le cabinet (étendu par rapport au plan initial : passé d'une recherche scopée au dossier courant à une recherche globale, avec affichage de l'emplacement de chaque résultat). Hook `useCabinetSearch(term)` dans `useCabinet.js`, normalisation insensible casse + accents via `s.toLowerCase().normalize('NFD').replace(/\u0300-\u036f/g, '')`. Compteur d'éléments par dossier **non implémenté** (déféré : décision produit, pas de besoin actuel).
   - 6E-4. ✓ **FAITE** — Boutons « + Nouveau dossier » et « + Importer » dans la toolbar de `DrivePage`. **Divergence avec le plan** : pas de route dédiée `/cabinet/:dossier_id/nouveau-dossier`, on utilise une modale bottom-sheet `NewFolderModal` rendue via React Portal (UX plus moderne, pas de changement d'URL pour une simple création).
   - 6F. ✓ **FAITE** — `UploadModal` dans `src/features/cabinet/`. Drag & drop + click-to-pick, validation taille ≤ 25 Mo client-side, upload vers `cabinet-pratique` avec UUID comme path flat, INSERT dans `cabinet_fichiers`, rollback automatique de l'orphelin Storage si l'INSERT échoue. Spinner pendant l'envoi (pas de barre de progression réelle — limitation du client Supabase JS).
   - 6F-bis. ✓ **FAITE (bonus, hors plan initial)** — Téléchargement et preview-or-download. Helper `cabinetStorage.js` avec `downloadCabinetFile` (stratégie Blob pour préserver les noms UTF-8 incluant les formes NFD macOS) et `openCabinetFile` (preview dans un nouvel onglet via URL signée si MIME est previewable : PDF, image, video, audio, texte ; téléchargement sinon).
   - 6G. ✓ **FAITE** — Menu fichier (« ⋮ ») via `ActionsMenu` bottom-sheet. Actions : Renommer (`RenameModal`), Télécharger (force le download via `downloadCabinetFile`), Supprimer (`DeleteConfirmModal` avec DELETE en DB + cleanup best-effort du bucket Storage).
   - 6H. ✓ **FAITE** — Menu dossier (« ⋮ ») via le même `ActionsMenu`. Actions : Renommer, Supprimer. Garde-fou non vide géré côté SQL via `ON DELETE RESTRICT` sur les FK ; le code Postgres 23503 (foreign_key_violation) est intercepté et traduit en message utilisateur clair.
   - 6I. ❌ **PARTIEL** — Tests multi-rôles à faire en rôle remplaçant (lecture seule). Cas limites testés : fichier > 25 Mo (rejet client), dossier non vide (refus de suppression avec message clair). Mise à jour doc faite ici.
7. **Étape 7** — Module Discussion (tableaux + invitations + chat temps réel)
   - 7A — Fondations : migration SQL (6 tables : `discussion_boards`, `discussion_board_members`, `discussion_cards`, `discussion_messages`, `discussion_attachments`, `discussion_card_reads`), policies RLS via helpers SQL (`is_board_member`, `is_board_owner`, `can_create_discussion_board`), trigger `last_activity_at` sur insert message, bucket Storage `discussion-attachments`, helpers JS de permissions dans `src/lib/permissions.js` (`canCreateBoard`, `canInviteToBoard`, `canCreateCard`, `canEditCard`, `canArchiveBoard`, `canDeleteBoard`), hook `useDiscussion.js` dans `src/features/discussion/`, page `Discussion.jsx` (liste plate des tableaux où je suis membre, recherche, filtre Actifs / Archivés, état vide), création d'un tableau via modale bottom-sheet (titre + description + couleur parmi 6 swatches + invitation de participants multi-sélection depuis l'Annuaire), Realtime sur `discussion_boards` pour rafraîchir la liste.

#### Étape 7B — Vue d'un tableau + cartes (livrée)

**Livré :**
- Route `/discussion/:boardId` : vue d'un tableau, accessible au clic depuis la liste.
- Liste plate des cartes triées par dernière activité, avec onglets de filtre Ouvertes / Closes / Toutes.
- Header de tableau : retour, titre, avatars des membres, bouton « + Nouvelle carte » teinté de la couleur du tableau, menu trois-points (Renommer, Archiver / Désarchiver, Supprimer).
- Cartes : création, modification (titre + description), clôture / réouverture, suppression — via une modale détail légère en bottom-sheet.
- Realtime sur `discussion_cards` : la liste se rafraîchit quand un autre utilisateur ajoute ou modifie une carte.
- États gérés : chargement (skeleton), tableau vide, tableau introuvable / accès refusé, tableau archivé (bandeau).

**Écarts au plan initial :**
- La modale détail de carte est une **version légère sans chat** : elle sera remplacée en 7C par une vue plein écran intégrant le fil de discussion temps réel et les pièces jointes.
- Le menu d'actions d'une carte propose **Modifier / Clore-Rouvrir / Supprimer**, mais **pas Archiver** : la maquette ne prévoit pas de vue « cartes archivées », donc une carte archivée disparaîtrait sans recours. La capacité `archiveCard` existe dans le hook mais n'est pas exposée. « Clore » joue le rôle d'archivage doux (la carte reste consultable dans l'onglet Closes).

**Fichiers ajoutés :**
- Module Discussion : `useBoard.js`, `BoardPage.jsx`, `CardListItem.jsx`, `StatusBadge.jsx`, `CreateCardModal.jsx`, `CardDetailModal.jsx`, `BoardActionsMenu.jsx`, `RenameBoardModal.jsx`, `MemberAvatars.jsx`, `boardColors.js`.
- Transverses : `src/lib/profileFormat.js` (formatName, initials, normalizeForSearch), `src/lib/dateFormat.js` (formatRelativeDate), `src/components/ConfirmModal.jsx` (modale de confirmation générique).
- Permission ajoutée : `canEditBoard` (renommer un tableau).

**Correctifs réalisés au passage :**
- Recherche du Trombinoscope rendue insensible aux accents (réutilise `normalizeForSearch`).
- `Discussion.jsx` : helpers locaux dédupliqués au profit des modules transverses.

**À traiter en 7C :**
- Correctif SQL : ajouter une policy RLS `discussion_board_members_update` (absente du SQL 7A) pour autoriser un utilisateur à mettre à jour son `last_read_at` — prérequis du tracking lu / non-lu.
- Vue carte plein écran, chat temps réel, pièces jointes, passage en lecture seule des cartes closes, tracking lu / non-lu.

   - 7B — Vue tableau + cartes : page `DiscussionBoard.jsx` (route `/discussion/:boardId`), sous-header avec `MemberStack` (4 avatars chevauchés + pastille `+N`) et CTA `+ Nouvelle carte`, filtre segmenté `Ouvertes / Closes / Toutes`, liste plate de cartes avec aperçu (titre, badge statut, dernier message, compteur de non lus), CRUD carte (créer, modifier, archiver, basculer statut), gestion des membres du tableau (modale inviter / désinviter / quitter), archivage du tableau côté créateur + super_admin, Realtime sur `discussion_cards` pour rafraîchir la liste.

#### Étape 7C — Vue carte + chat temps réel (livrée)

**Livré :**
- Route `/discussion/:boardId/:cardId` : vue d'une carte en page plein écran, ouverte au clic depuis la liste des cartes du tableau.
- La vue carte est une page autonome, sans `AppLayout` ni barre de navigation : comportement type écran de conversation de messagerie.
- Fil de discussion temps réel : envoi de messages, édition et suppression de ses propres messages, séparateurs de jour dans le fil.
- Composer : zone de saisie à hauteur automatique, envoi par bouton (la touche Entrée fait un retour à la ligne). Une carte close passe le fil en lecture seule.
- Description de carte repliable, dépliée par défaut.
- Menu d'actions de la carte (modifier, clore / rouvrir, supprimer) accessible depuis la vue carte.
- Suivi lu / non-lu à deux niveaux : compteur de messages non lus par carte sur les tiles du tableau, et point coloré du tableau dans la liste `/discussion` qui s'éteint à l'ouverture du tableau.
- Tile de carte complétée : aperçu du dernier message (« Prénom N. : … »), compteur total de messages, badge de non-lus.

**Côté base de données :**
- Fonction RPC `mark_board_read(p_board_id)` en `SECURITY DEFINER`, qui met à jour le seul champ `last_read_at` de la ligne `discussion_board_members` de l'appelant. Fichier `docs/sql/7C-1-mark-board-read.sql`, appliqué via le dashboard Supabase.

**Écarts au plan initial :**
- La vue carte est une page routée plein écran, et non une vue intégrée à `AppLayout` : choix assumé pour un comportement de type messagerie.
- Le suivi lu / non-lu côté tableau passe par la fonction RPC `mark_board_read` et non par une policy RLS `UPDATE` sur `discussion_board_members` (envisagée en note de fin de 7B). Une policy `UPDATE` aurait laissé un membre modifier son propre champ `role` et donc s'auto-promouvoir owner ; la fonction `SECURITY DEFINER` ne touche que `last_read_at` et écarte ce risque.
- La modale détail légère `CardDetailModal.jsx` (livrée en 7B) est supprimée, remplacée par la vue carte plein écran.
- Pièces jointes : aucune dans les messages. Les pièces jointes de carte sont reportées à une étape 7D dédiée (l'infrastructure SQL et Storage existe déjà depuis 7A).

**Fichiers ajoutés :**
- Module Discussion : `useCard.js`, `CardPage.jsx`, `CardMessage.jsx`, `CardComposer.jsx`, `CardActionsMenu.jsx`, `EditCardModal.jsx`.
- Page : `src/pages/DiscussionCard.jsx`.
- SQL : `docs/sql/7C-1-mark-board-read.sql`.

**Fichiers modifiés :**
- `useBoard.js` : charge les messages et les lectures de chaque carte, calcule les compteurs (messages, non-lus) et l'aperçu du dernier message ; marque le tableau lu via `mark_board_read`.
- `BoardPage.jsx` : alimente les tiles de cartes (aperçu, compteur, badge de non-lus).
- `dateFormat.js` : ajout de `formatTime` et `formatDayLabel`.
- `profileFormat.js` : ajout de `formatShortName` (« Prénom N. »).
- `App.jsx` : route `/discussion/:boardId/:cardId`.
- `DiscussionBoard.jsx` : navigation vers la page carte au lieu de la modale, retrait de `CardDetailModal`.

**Fichier supprimé :**
- `CardDetailModal.jsx`.

**Correctifs réalisés au passage :**
- Couleurs des avatars de membres alignées sur le Trombinoscope : `MemberAvatars` calcule sa couleur à partir du nom du profil, comme `MedecinCard`, et non plus à partir de l'identifiant.
- Titre de carte : ajout de `break-words` pour gérer proprement un titre sans espaces.

**À traiter en 7D :**
- Pièces jointes de carte : upload vers le bucket `discussion-attachments`, helpers `discussionStorage.js` calqués sur `cabinetStorage.js`, affichage en chips sous la description de la carte. L'infrastructure SQL (table `discussion_attachments`, bucket et policies Storage) existe depuis 7A.

   - 7C — Chat dans la carte : ouverture d'une carte en bottom-sheet plein écran (Portal, pattern Cabinet), header avec poignée de drag (swipe-down pour fermer), description collapsible, pièces jointes de carte en chips horizontales scrollables, fil de messages style WhatsApp (bulles asymétriques, mes messages alignés droite en couleur du tableau, autres alignés gauche en `carte` + bordure), séparateurs de date flottants (HIER / AUJOURD'HUI / LUN. 14 AVR.), statut d'envoi (`sending` icône `Clock` / `sent` icône `CheckCheck`), composer sticky avec textarea autosizing + bouton trombone + bouton send, **optimistic UI** sur envoi (insertion locale `sending` → remplacement par version Supabase), Supabase Realtime sur `discussion_messages`, édition / suppression de mes propres messages (menu contextuel), pièces jointes dans message (upload via helper dédié type `discussionStorage.js`, preview / download via Blob), marquage automatique « lu » à l'ouverture (upsert sur `discussion_card_reads`), gestion clavier mobile via `visualViewport.resize` (variable CSS `--keyboard-offset` sur le composer), auto-scroll bas si user en bas (sinon bouton flottant « ↓ N nouveaux messages »).

#### Étape 7D — Pièces jointes de carte (livrée)

**Livré :**
- Section « Pièces jointes » sous la description de chaque carte.
- Ajout de fichiers avec sélection multiple ; suppression de ses propres pièces jointes (avec confirmation inline).
- Ouverture d'une pièce jointe : prévisualisation dans un nouvel onglet pour les types affichables (images, PDF), téléchargement avec nom de fichier propre pour les autres (Word, Excel, PowerPoint, Pages, Numbers, Keynote).
- Formats acceptés : images (jpg, png, gif, webp, heic), PDF, bureautique Microsoft et Apple iWork. Taille maximale de 25 Mo par fichier, validée côté application et côté bucket.
- Realtime : l'ajout ou la suppression d'une pièce jointe se reflète en direct chez les membres consultant la même carte.

**Côté base de données :**
- `discussion_attachments` ajoutée à la publication Realtime ; limite de taille du bucket `discussion-attachments` fixée à 25 Mo. Fichier `docs/sql/7D-1-attachments-realtime.sql`.
- L'infrastructure (table `discussion_attachments`, bucket et policies Storage) existait depuis 7A.

**Décisions :**
- Les pièces jointes sont rattachées aux cartes uniquement, pas aux messages.
- Carte close = lecture seule totale : les pièces jointes restent consultables et téléchargeables, mais on ne peut ni en ajouter ni en supprimer. Ce blocage est appliqué côté interface (la RLS ne l'impose pas pour les pièces jointes).
- La suppression d'une pièce jointe est réservée à celui qui l'a déposée (imposé par la RLS).
- Ouverture des fichiers via une URL signée dans un nouvel onglet plutôt qu'un téléchargement forcé : plus confortable, en particulier sur mobile pour les images et les PDF.

**Fichiers ajoutés :**
- Module Discussion : `discussionStorage.js`, `AttachmentChip.jsx`, `CardAttachments.jsx`.
- SQL : `docs/sql/7D-1-attachments-realtime.sql`.

**Fichiers modifiés :**
- `useCard.js` : chargement des pièces jointes, mutations d'ajout et de suppression, Realtime.
- `CardPage.jsx` : intégration de la section pièces jointes entre la description et le fil.
- `DiscussionCard.jsx` : branchement des pièces jointes sur la vue carte.

**Limitations connues :**
- Ajouter une pièce jointe ne met pas à jour `last_activity_at` de la carte (le trigger SQL ne couvre que les messages) : une pièce jointe ajoutée ne fait pas remonter la carte ni n'allume le point de non-lu.
- À la suppression d'une carte, la cascade SQL efface les lignes `discussion_attachments` mais pas les fichiers du bucket Storage : ces fichiers deviennent orphelins — inaccessibles (sans fuite de données), simplement de l'espace de stockage perdu.

Le module Discussion est désormais complet (étapes 7A à 7D).

   - 7D — Polish : recherche globale étendue à Discussion (titres tableaux + cartes), compteurs de non lus persistants (point coloré niveau tableau via `discussion_board_members.last_read_at`, compteur numérique niveau carte via `discussion_card_reads`), états vides illustrés (liste tableaux vide, tableau sans cartes, filtre Closes vide, chat vide), tests multi-utilisateurs (permissions par rôle, Realtime cross-session, edge cases invitation / désinvitation / carte close).
8. ✓ **Étape 8 — FAITE** — Module Événements (sous-étapes 8A → 8H)
   - 8A : Schéma SQL — tables `evenements`, `evenement_fichiers`, `evenement_reponses` + RLS (10 policies) + index + triggers + Realtime sur `evenements` + bucket Storage `evenements` + 3 storage policies. Colonne `couleur` ajoutée en 8A-5. SQL versionné `docs/sql/8A-1` à `8A-5`.
   - 8B : Helpers de permissions (`canCreateEvenement`, `canEditEvenement`, `canDeleteEvenement`, `canRespondToSondage`) + hooks `useEvenements` / `useEvenement` + helper `evenementStorage.js`.
   - 8C : Page liste `/evenements` (recherche, filtre À venir / Passés, bloc-date coloré, état vide) + tuile Home câblée.
   - 8D : Modale `EvenementFormModal` (création) avec `ColorPicker` et interrupteur sondage.
   - 8E : Page détail `/evenements/:id` (résumé, description, menu trois-points) + édition + suppression (`ConfirmDialog`).
   - 8F : Section documents (hook `useEvenementFichiers`, `EvenementUploadModal`, liste avec icônes par type, téléchargement, suppression).
   - 8G : Sondage de présence (hook `useSondage`, `PollSection` Oui / Non / Peut-être, optimistic UI, résultats).
   - 8H : Tests multi-rôles + mise à jour doc.
9. ✓ **Étape 9 — FAITE** (sous-étapes 9A → 9G) — Module SIM (Drive restreint)
   - 9A : Fondations SQL — tables `sim_dossiers` + `sim_fichiers`, fonction `is_sim_member()` `SECURITY DEFINER`, RLS + 8 policies (SELECT/INSERT par rôle, UPDATE/DELETE par rôle + auteur), bucket Storage `sim` (privé, 25 Mo) + 3 storage policies. Scripts archivés dans `docs/sql/9A-1` à `9A-5`.
   - 9B : Fondations React — helpers `canAccessSim` / `canEditSim` / `canDeleteSim` dans `permissions.js`, hooks `useSimRoot` / `useSimFolder` + helper `filterByTerm` (`useSim.js`), helper `simStorage.js` (open, download, removeBlob).
   - 9C : Page racine `/sim` — `Sim.jsx` avec garde d'accès et décoration par élément (calcul de `canEdit`/`canDelete`/`canMenu` par dossier et fichier), 6 composants `features/sim/` adaptés de Cabinet pratique (`DrivePage` avec props `subtitle` et `accent`, `NewFolderModal`, `UploadModal`, `ActionsMenu` qui masque les actions interdites, `RenameModal`, `DeleteConfirmModal`). Route `/sim` dans `App.jsx`, navigation de la tuile SIM ajoutée dans `Home.jsx`.
   - 9D : Navigation arborescente — page `SimFolder.jsx` (route `/sim/:id`) calquée sur `CabinetFolder.jsx`, breadcrumb 2 segments, redirection vers `/sim` si dossier introuvable, décoration par auteur identique à la racine.
   - 9G : Tests multi-rôles formels + mise à jour de la documentation.
10. ✓ **Étape 10 — FAITE** (sous-étapes 10A → 10D + alignement visuel 10D-2-bis) — Module Immobilier
    - 10A : Fondations SQL — 6 tables `immobilier_*`, 5 fonctions SECURITY DEFINER (`is_immobilier_member`, `is_immobilier_board_member`, `is_immobilier_board_owner`, `can_create_immobilier_board`, `mark_immobilier_board_read`), trigger auto-owner, RLS + 21 policies, bucket Storage `immobilier-attachments` (privé, 25 Mo), Realtime sur 4 tables, REPLICA IDENTITY FULL. Helpers permissions React + hook racine `useImmobilier`. Stub de route + tuile Home conditionnelle.
    - 10B : Page liste `/immobilier` (recherche, filtre Actifs/Archivés, tile cliquable) + modale création tableau (ColorPicker 6 swatches + MemberPicker filtré non-remplaçants).
    - 10C-1 : Vue tableau `/immobilier/:boardId` (header avec avatars, filtre Ouvertes/Closes/Toutes, CTA `+ Carte` teinté, CRUD cartes via modale d'édition légère).
    - 10C-2a : Menu trois-points tableau (Modifier, Archiver/Désarchiver, Supprimer en super_admin uniquement) + bandeau « tableau archivé » + redirection après suppression.
    - 10C-2b : Modale gestion participants (liste membres avec badge owner, désinvitation, invitation multi-sélect via MemberPicker avec `excludeIds`) + action « Quitter le tableau » + garde-fou dernier owner.
    - 10D-1 : Vue carte plein écran `/immobilier/:boardId/:cardId` (sans AppLayout), fil de messages temps réel via `useCard`, envoi/édition/suppression de ses messages, séparateurs de jour, carte close = lecture seule, tracking lu/non-lu à deux niveaux (compteur par carte, point coloré par tableau), tile carte enrichie (dernier message + compteur).
    - 10D-2a : Pièces jointes — helper `immobilierStorage.js` (validation taille + types calqués sur Discussion 7D), `AttachmentChip` (preview ou download selon MIME), `CardAttachments` (chips horizontales scrollables, bouton d'ajout, suppression auteur uniquement, désactivés si carte close). REPLICA IDENTITY FULL ajouté pour propagation des DELETE en Realtime. Suppressions optimistes côté client pour latence perçue.
    - 10D-2b : Recherche globale `/recherche` étendue à Immobilier (tableaux + cartes) **et à Discussion** (rattrapage d'une dette annoncée en 7D). Affichage par sections (Médecins / Discussion / Immobilier) avec compteur. Normalisation des noms anglais Discussion vers le français côté affichage.
    - 10D-2c : Tests multi-rôles formels + mise à jour de la doc + clôture commit.
    - 10D-2-bis : Alignement visuel sur Discussion en 4 sous-blocs :
      - 10D-2-bis-a : fondations (correction signature helpers profileFormat, MemberAvatars utilise getAvatarPalette centralisé pour cohérence inter-modules — clé `${prenom} ${nom}`).
      - 10D-2-bis-b1 : StatusBadge en dot+label sans fond ; immobilierColors expose les 5 classes (cta, bubble, tileBg, tileText, dot) au lieu de (bg, text, ring).
      - 10D-2-bis-b2 : CardTile refondue (statut+titre+chevron+unread / aperçu / méta avec compteur messages et date), header de tableau en 3 lignes avec onglets et compteurs intégrés, EmptyBoard riche et BoardSkeleton.
      - 10D-2-bis-c1 : header vue carte avec badge statut au-dessus du titre, composer avec bouton Send circulaire + spinner Loader2, plus d'alert() natif. **Fix collatéral** : `useCard.setCardStatus` avec mise à jour optimiste (corrige bug où le composer restait visible après clôture de carte).
      - 10D-2-bis-c2 : refonte CardMessage (retrait avatar latéral, édition inline avec textarea dans la bulle, confirmation suppression inline en zone rouge, mention « modifié · 14:32 », menu actions en texte sous bulle, plus de prompt()/confirm()/alert() natifs). **Fix collatéral** : zone scrollable du fil sur `bg-carte` au lieu de `bg-fond` pour que les bulles `bg-fond` des autres ressortent.
      - 10D-2-bis-c3 : finitions PJ (état vide explicite « Aucune piece jointe. » en italique, suppression via ConfirmModal au lieu de confirm() natif). Nettoyage similaire de la suppression de carte dans CardPage.
      - 10D-2-bis-d : refonte de la page liste `/immobilier` (bouton + rond canard, sous-header « Mes tableaux · N » avec filtre Actifs/Archives discret, tile en item de liste avec icône bulle colorée, divide-y, état vide riche et skeleton). Ajout de `openCardsCount` et `membersCount` dans `useImmobilier`.
    - Spécificités Immobilier préservées : accent canard, déroulement horizontal des PJ, sous-titre du tableau parent dans la vue carte.
11. ✓ **Étape 11 — FAITE** (sous-étapes 11A → 11E) — Page Profil + gestion des RIB (`profiles_compta`)
    - 11A : Réécriture RLS de `profiles_compta`. Abandon du modèle 2C « chacun gère sa propre ligne » au profit d'un modèle centralisé : SELECT pour super_admin / associe_gerant / associe ; INSERT / UPDATE / DELETE pour super_admin uniquement. 2 fonctions SECURITY DEFINER (`is_super_admin()`, `can_read_compta()`) sur le pattern de `is_sim_member()`. 4 policies (une par commande). SQL archivé `docs/sql/11A-1-profiles-compta-rls.sql` (répare au passage l'absence d'archivage SQL de l'étape 2C).
    - 11B : Hook `useProfilCompta(profileId)` (lecture d'une ligne RIB, pattern calqué sur `useEntreeAnnuaire`) + helpers `canViewCompta(role)` / `canEditCompta(role)` dans `permissions.js` (miroirs React des fonctions Postgres).
    - 11C : Section RIB dans la fiche médecin. Composant `MedecinCompta` monté dans `MedecinDetail` (mode lecture), visible si `canViewCompta`. Lecture seule pour associe / associe_gerant, édition inline (ajout / modif / suppression via ConfirmDialog) pour super_admin. Upsert sur la PK `id` (= id médecin, FK profiles). Validation IBAN mod-97 (ISO 13616) sans dépendance externe.
    - 11D : Refonte de la page `/profil` au standard DS (header sticky, bloc identité centré avec avatar/rôle, sections en cartes, classes typo composées). Comportement inchangé (infos compte, lien Installer, déconnexion). Pas de RIB dans Profil — le RIB vit exclusivement dans le Trombinoscope.
    - 11E : Tests multi-rôles + mise à jour doc.
12. ✓ **Étape 12 — FAITE** (sous-étapes 12A → 12F) — Configuration PWA complète
    - 12A : Setup `vite-plugin-pwa` (mode `autoUpdate`, `devOptions.enabled` pour tester en dev) + premier build qui génère `dist/sw.js`, `dist/workbox-*.js` et `dist/manifest.webmanifest`.
    - 12B : Génération des 5 icônes PWA à partir du logo source Omnès Orga (PNG 500×500). Tailles produites : `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png` (logo centré avec marge 10% pour la safe zone Android), `apple-touch-icon.png` (180×180), `favicon.ico` (multi-sizes 16+32). Toutes déposées dans `public/`.
    - 12C : Manifest complet — `name`, `short_name`, `description`, `theme_color` marine (#1a3a52), `background_color` fond (#F5F7F9), `display: standalone`, `orientation: portrait`, `start_url: /`, `scope: /`, `lang: fr`, `categories: [medical, productivity, business]`, 3 icônes (any + maskable). Balises `<link rel="apple-touch-icon">`, `<meta name="apple-mobile-web-app-capable">` et `<meta name="theme-color">` ajoutées dans `index.html`.
    - 12D : Service worker en stratégie **shell uniquement** via Workbox. `globPatterns` couvre js/css/html/ico/png/svg/webp/woff2. `navigateFallback: index.html` pour le SPA. `navigateFallbackDenylist` exclut `*supabase.co*` et les assets binaires. `runtimeCaching` pour les polices Google (`StaleWhileRevalidate` sur le CSS, `CacheFirst` sur les .woff2, expiration 1 an). `skipWaiting + clientsClaim` pour activation immédiate des nouvelles versions. Page `public/offline.html` autoporteuse (CSS inline, référence `/apple-touch-icon.png`) comme fallback de secours. Au build, 18 entrées précachées (~900 ko).
    - 12D-bis : Bannière hors-ligne — hook `useOnlineStatus` (écoute des événements `online`/`offline` du window), composant `OfflineBanner` (barre brique en haut avec icône `WifiOff`, `env(safe-area-inset-top)` pour les iPhones à encoche, `role="status"` + `aria-live="polite"`). Monté dans `AppLayout` donc visible sur toutes les pages protégées. Limite connue de DevTools : le mode "Network → Offline" ne déclenche pas `navigator.onLine = false`, seul un vrai mode avion ou couper le Wi-Fi le fait. Validé en conditions réelles iPhone.
    - 12E : Install prompt en 4 sous-blocs.
      - 12E-1 : Hook `useInstallPrompt` — détection plateforme (`ios` / `android` / `desktop` / `other`) via UA + `navigator.maxTouchPoints` pour iPad récent ; détection installation (`navigator.standalone` iOS + `matchMedia('(display-mode: standalone)')`) ; capture de l'événement `beforeinstallprompt` (Android) ; gestion du "Plus tard" via `localStorage.installPrompt:dismissedAt` avec délai 7 jours. Expose `triggerInstall()` et `dismiss()`.
      - 12E-2 : Composant `InstallPromptModal` — bottom-sheet via `createPortal(document.body)`, animation `slide-up`, overlay marine/40, fermeture par tap dehors ou bouton `X`. Variantes selon plateforme : Android → bouton "Installer" qui appelle `triggerInstall()` (déclenche le prompt natif Chrome) ; iOS → instructions visuelles en 3 étapes (Partager → Sur l'écran d'accueil → Ajouter) avec icônes `Share` et `Plus` canard. Auto-géré : lit lui-même `useInstallPrompt`, aucune prop à passer.
      - 12E-3 : Page permanente `/installer` — accessible depuis Profil ("Installer l'application" avec icône `Smartphone` canard + chevron). 4 états selon la plateforme détectée : déjà installé (confirmation olive), iOS Safari (3 étapes + bandeau canard "ouvrir dans Safari obligatoire"), Android Chrome (bouton install natif ou instructions menu), desktop/other (message "ouvrez sur votre mobile"). Bloc "Pourquoi installer l'application" en bas avec 3 bénéfices.
      - 12E-4 : Intégration — `InstallPromptModal` monté dans `AppLayout` après `BottomNav`. S'affiche automatiquement sur mobile non-installé non-dismissé, sur toutes les pages protégées (pas sur Login).
    - 12F : Tests + polish + doc en 6 sous-étapes.
      - 12F-1 : Ajout de `webp` au `globPatterns` Workbox pour précacher `logo-omnes.webp` (utilisé sur Login).
      - 12F-2 : Tests fonctionnels Mac validés (bannière offline en coupant le Wi-Fi, modale iOS simulée, dismiss + délai 7j, service worker activé, cache rempli).
      - 12F-3 : Tests iPhone via IP locale (`npm run preview -- --host`). Affichage mobile OK, modale d'installation iOS s'affiche correctement, navigation fluide, bannière offline en mode avion OK. **Confirmé** : sur Safari iOS en HTTP, le raccourci d'installation se crée et le mode standalone s'active, mais le service worker ne s'enregistre **pas** (Safari iOS exige HTTPS sauf sur localhost direct, pas sur IP locale). Test offline réel reporté à l'étape 13 (Vercel = HTTPS).
      - 12F-4 : Audit Lighthouse en navigation privée — **Best Practices 100/100**, **Performance 86/100**. La catégorie "Progressive Web App" a été retirée de Lighthouse fin 2023 ; la validation PWA passe désormais par Application → Manifest dans DevTools.
      - 12F-bonus : Screenshots PWA dans le manifest pour le "Richer PWA Install UI" (`screenshot-mobile.png` 776×1689 `form_factor: narrow`, `screenshot-desktop.png` 1920×1080 `form_factor: wide`). Plus de warnings dans Application → Manifest.
      - 12F-5 : Mise à jour de la documentation projet (ce bloc).
      - 12F-6 : Commit Git final de l'étape 12.
    - ✓ **Étape 12 bis — Alignement du design system** — FAITE (sauf alignement nommage Discussion, reporté). Passe de mise au standard DS des écrans antérieurs à l'étape 6.0, en 3 sous-chantiers :
      - **Shell** : Home (HomeHeader DS + ModuleTile avec icône top-left + shadow-tile), Login (refonte identité marque — wordmark Archivo Black étiré + logo Omnès + filigrane), AppLayout et BottomNav vérifiés au standard. Filigrane unifié (cercle + triangle, opacité 0.05) appliqué à toutes les pages via AppLayout. Chevron retour ajouté sur Discussion / Événements / Annuaire / Immobilier (pages liste) ; harmonisation `ArrowLeft → ChevronLeft` sur Discussion/Immobilier (board + card vues) et sur Recherche. Pages Trombinoscope/Cabinet/SIM gardaient déjà ChevronLeft.
      - **Trombinoscope** : page liste avec header sticky DS + skeletons + empty state riche ; carte médecin refondue (`shadow-card`, typo Inter pour le nom, helper `getAvatarPalette` partagé) ; fiche détail variante "tile centrée" (avatar 108×108 + sections Contact/Disponibilités/Notes + 2 boutons côte à côte Modifier + Désactiver/Réactiver) ; formulaire d'édition refondu (labels `.text-field-label`, inputs `bg-fond`, toggle iOS pour "Compte actif", section admin séparée).
      - **Annuaire** : page liste refondue (header sticky + recherche avec bouton clear + pills catégories scrollables + liste card unique avec divider interne + empty state riche + no-results state) ; fiche détail variante "tile ocre avec initiale" (108×108 + sections Contact/Note + méta auteur/date + bouton Modifier unique) ; formulaire refondu avec suggestions catégorie en pills cliquables ocre pastel (remplace `<datalist>`) + bandeau d'info en création + **zone danger déplacée du détail vers le formulaire d'édition** (pattern UX moderne).
      - **Nouveau composant partagé `Pill.jsx`** (`src/components/common/Pill.jsx`) : variants `soft` et `solid`, 6 couleurs DS + ocre-fonce, tailles `sm` et `md`, uppercase tracking optionnel. Utilisé pour rôles, catégories, statuts. Premier usage en lot annuaire-b (catégories), désormais réutilisable transversalement.
      - **Nouvelle couleur `ocre-fonce` (#A06A0E)** ajoutée à `tailwind.config.js` : permet un texte ocre lisible sur fond ocre pastel (utilisé dans Pill variant ocre, suggestions catégorie, empty state Annuaire).
      - **Reporté** : alignement du nommage Discussion (camelCase EN → snake_case FR pour cohérence avec Immobilier). Non livré dans 12 bis car refacto SQL + RLS + hooks + composants risquée et sans bénéfice utilisateur visible. Traité en 12 ter ou après le déploiement Vercel.
13. ✓ **Étape 13 — FAITE** — Déploiement Vercel + validation PWA réelle iOS
    - 13A : Ajout de `vercel.json` à la racine (`rewrites` SPA : toute requête → `/index.html`) pour que React Router gère les routes profondes (`/installer`, `/trombinoscope/:id`, etc.) au refresh et en accès direct, sans 404 Vercel.
    - 13B : Création du compte Vercel (Sign up GitHub) + import du repo `omnes-orga`. Preset Vite auto-détecté (build `npm run build`, output `dist`). URL de production stable : `https://omnes-orga.vercel.app` (≠ URL de déploiement à hash, qui change à chaque build).
    - 13C : Variables d'environnement Vercel — uniquement les 2 Supabase à cette étape (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Les 5 `VITE_FIREBASE_*` volontairement non renseignées (étape 14, aucun code ne les référence encore). Clé `anon` exposée côté client (protégée par RLS) ; `service_role` jamais en `VITE_*`.
    - 13D : Config Supabase Authentication → URL Configuration — Site URL = `https://omnes-orga.vercel.app`, Redirect URLs += `https://omnes-orga.vercel.app/**` (localhost conservé pour le dev local).
    - 13E : Tests réels iPhone (Safari, HTTPS) — login OK ; installation écran d'accueil (apple-touch-icon correct, lancement en mode `standalone` plein écran) OK ; **offline réel en mode avion** OK (shell servi depuis le précache → SW actif et enregistré, bannière « Hors ligne » affichée, modules Supabase en erreur = comportement « shell uniquement » assumé en 12D).
    - **Point 12F-3 levé** : l'enregistrement du service worker, impossible en HTTP sur IP locale (Safari iOS exige HTTPS), est confirmé fonctionnel en HTTPS sur Vercel. Le test offline réel, reporté depuis 12F-3, est validé.
    - **Note exploitation** : SW en `autoUpdate` + `skipWaiting`/`clientsClaim` (12A/12D) → chaque push sur `main` redéploie via Vercel et se propage aux apps installées au prochain chargement, sans réinstallation côté utilisateurs.
14. ✓ **Étape 14 — FAITE** (sous-étapes 14A → 14E) — Audit auth + durcissement + création de médecin depuis l'app
   - 14A : Audit complet de l'auth existante (configuration Supabase, Login.jsx, useAuth.js, ProtectedRoute.jsx, trigger `handle_new_user`). Hygiène : désactivation de "Allow new users to sign up" côté Supabase (fermeture du signup public), suppression d'une URL de redirection obsolète, nettoyage de la fonction `signUp` morte dans `useAuth.js`. Politique de mot de passe Supabase durcie à 10 caractères + 4 classes (lowercase, uppercase, digits, symbols). Validation côté `Login.jsx` volontairement maintenue à 6 caractères minimum pour ne pas bloquer les comptes existants antérieurs au durcissement (la politique stricte ne s'applique qu'à la création/changement, pas à la connexion). Setup compte Resend (sandbox `onboarding@resend.dev`, propriétaire `mcadennes@gmail.com`) et installation locale du Supabase CLI lié au projet. Edge Function `create-medecin` créée et déployée : auth custom (JWT + check rôle super_admin via `SERVICE_ROLE_KEY`), validation des entrées, détection d'email déjà utilisé (cas actif et désactivé distingués), génération de mot de passe sécurisé 12 chars / 4 classes / sans caractères ambigus, création de l'AuthUser, UPDATE `profiles`, rollback automatique en cas d'échec post-création. Testée via 5 scénarios cURL (sans JWT, body invalide, rôle invalide, email déjà existant, création nominale). Reset password livré ultérieurement en étape 15.
   - 14B : Helper `canCreateMedecin(role)` ajouté à `src/lib/permissions.js` (true uniquement pour super_admin). Bouton "+ Nouveau médecin" ajouté à `/trombinoscope` dans le header sticky (rond canard 40×40, icône `Plus`, position à droite, visible super_admin uniquement via la conditionnelle `canCreate &&`). À ce stade le bouton ne fait que logger en console.
   - 14C : Deux modales bottom-sheet via React Portal créées dans `src/components/trombinoscope/`. `CreateMedecinModal` (14C-1) : formulaire à 4 champs (email, prénom, nom, rôle avec dropdown 4 options), validation côté UI (email regex, champs non vides), états `submitting` avec spinner, gestion d'erreur avec bandeau brique, focus auto sur le premier champ après slide-up de 250ms, body scroll lock + touche Escape. `MedecinCreatedModal` (14C-2) : affichage email et mot de passe sur fond canard pastel avec `select-all`, bandeau ocre d'avertissement "ce mot de passe ne sera plus affiché", deux boutons de copie via `navigator.clipboard.writeText` avec feedback olive de 2.5s, fermeture par Escape et overlay volontairement désactivée pour forcer un clic conscient sur "Terminer". Branchement complet (14C-3) : appel à l'Edge Function via `supabase.functions.invoke`, propagation des résultats au parent, refresh automatique du Trombinoscope via `refetch()` du hook `useMedecins`, lecture du message d'erreur métier depuis `invokeError.context.json()` (l'objet `context` étant directement une `Response` dans `supabase-js` v2 sur erreur HTTP non-2xx).
   - 14D : Intégration Resend pour l'envoi optionnel du mot de passe par email. Variable d'environnement `RESEND_API_KEY` stockée côté Supabase via `supabase secrets set`. Edge Function étendue avec un helper `sendTempPasswordEmail` qui appelle l'API Resend en POST sur `/emails` avec un payload HTML + texte brut (sujet "Votre acces a l'application Omnes Medecins", expéditeur `onboarding@resend.dev` en sandbox), envoi non-bloquant (l'échec d'envoi n'annule pas la création). Modale `CreateMedecinModal` complétée avec une case à cocher "Envoyer aussi par email" décochée par défaut, qui passe `sendEmail: true` dans le body. Modale `MedecinCreatedModal` complétée avec un bandeau vert olive "Email envoyé au médecin" si succès, ou bandeau ocre "Envoi par email échoué" avec le détail Resend en cas d'échec.
   - 14E : Tests multi-rôles validés (bouton invisible pour associé / remplaçant, RLS côté Edge Function via cURL en 14A), nettoyage des comptes test créés pendant les phases de test, mise à jour de la documentation projet.

14 bis. ✓ **Étape 14 bis — FAITE** — Vérification du sous-domaine `app.omnesmedecins.fr` dans Resend
   - Audit de la zone DNS OVH (21 records existants, dont MX `mx1/2/3.mail.ovh.net` et SPF `v=spf1 include:mx.ovh.com ~all` à préserver).
   - Création du sous-domaine `app.omnesmedecins.fr` dans Resend (région Frankfurt, eu-west-1 côté infra SES).
   - Ajout de 3 enregistrements DNS dans la zone OVH du domaine `omnesmedecins.fr` : DKIM TXT sur `resend._domainkey.app`, MX `10 feedback-smtp.eu-west-1.amazonses.com.` sur `send.app`, SPF TXT `v=spf1 include:amazonses.com ~all` sur `send.app`. Aucune collision avec les records OVH existants (zone séparée `send.app.*` vs racine `@`).
   - DMARC volontairement non configuré (optionnel côté Resend, à traiter en passe d'hygiène ultérieure avec service de monitoring dédié).
   - Propagation DNS effective en ~15 minutes, vérification Resend automatique.
   - Mise à jour de l'Edge Function `create-medecin` : changement de l'expéditeur `from` de `onboarding@resend.dev` (sandbox) vers `Omnès Médecins <noreply@app.omnesmedecins.fr>` (domaine vérifié). Test d'envoi vers une adresse autre que `mcadennes@gmail.com` pour confirmer la levée de la limite sandbox.

15. ✓ **Étape 15 — FAITE** (sous-étapes 15A → 15D) — Reset password complet (« Mot de passe oublié »)
   - 15A : Configuration de l'infrastructure email. SMTP custom Resend activé dans Supabase (Authentication → SMTP Settings : host `smtp.resend.com`, port `465`, username `resend`, password = clé API Resend dédiée « Supabase SMTP » en `Sending access` sur le domaine `app.omnesmedecins.fr`, sender `noreply@app.omnesmedecins.fr`). Rate limit laissé à 30 emails/heure (largement suffisant pour ~30 médecins). Template « Reset Password » personnalisé en français aux couleurs DS (carte blanche centrée, bouton marine, footer Omnès Médecins), sujet « Réinitialisation de votre mot de passe Omnès Médecins », variable Supabase `{{ .ConfirmationURL }}` injectée par le bouton CTA. Test validé via dashboard Supabase (Authentication → Users → ⋮ → Send password recovery) : email reçu depuis le domaine vérifié, template français correctement rendu.
   - 15B : Page publique `/mot-de-passe-oublie` (`src/pages/MotDePasseOublie.jsx`). Formulaire à un champ (email) avec icône `Mail`, validation regex simple côté UI, appel `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${window.location.origin}/nouveau-mot-de-passe })` (`window.location.origin` s'adapte auto dev/prod, pas besoin de variable d'environnement). **Message anti-énumération** : sur succès, écran de confirmation générique « Si un compte existe avec cet email, vous recevrez un lien dans quelques minutes » affiché peu importe que l'email existe ou pas dans la base — comportement de `resetPasswordForEmail` qui ne renvoie pas d'erreur sur email inconnu (anti découverte de comptes). Gestion d'erreur en double couche (erreur métier Supabase + try/catch réseau). Visuel calqué sur `Login.jsx` (header wordmark Archivo Black étiré + filigrane + carte blanche centrée + footer tagline). Route publique ajoutée dans `App.jsx` au même niveau que `/login`, **hors `ProtectedRoute`**.
   - 15C : Page publique `/nouveau-mot-de-passe` (`src/pages/NouveauMotDePasse.jsx`). C'est la page la plus subtile techniquement de l'étape 15 : quand l'utilisateur clique sur le lien dans l'email, Supabase crée une **session authentifiée temporaire** côté client (token valide pendant 1h) et redirige vers cette page. Trois mécanismes en parallèle convergent vers `recoveryReady=true` pour détecter cet état : (a) `supabase.auth.onAuthStateChange` qui capte les events `PASSWORD_RECOVERY` et `SIGNED_IN`, (b) `supabase.auth.getSession()` au montage pour le cas où l'event est arrivé avant que le `useEffect` se monte (race condition possible), (c) un timer de fallback à 5s qui bascule sur `linkInvalid=true` si rien n'a confirmé la session. Cleanup propre du listener + clearTimeout + flag `cancelled` au démontage. **Politique de mot de passe** alignée sur la politique Supabase durcie en 14A (10 caractères + 4 classes : minuscule, majuscule, chiffre, symbole), avec **indicateur visuel temps réel** : liste de 5 critères avec puces `CheckCircle` olive si rempli / `Circle` faint sinon, transition de couleur sur le texte. Second champ « Confirmer le mot de passe » avec vérification d'égalité inline. Bouton submit désactivé tant que `policy.allOk && passwordsMatch && passwordConfirm.length > 0`. Bouton œil (`Eye`/`EyeOff`) partagé entre les deux champs pour comparer visuellement. Appel `supabase.auth.updateUser({ password })`. Après succès : **pas de déconnexion** (Option B), bouton « Continuer vers l'application » qui fait `navigate('/', { replace: true })` — la session de reset est légitime (token validé par Supabase), pas de raison de la casser. Quatre états visuels gérés par cascade conditionnelle : `linkInvalid` (alerte brique + lien retour vers `/mot-de-passe-oublie`) > `!recoveryReady` (spinner « Vérification du lien… ») > `success` (confirmation olive + bouton continuer) > formulaire. Route publique dans `App.jsx`, hors `ProtectedRoute`.
   - 15D : Lien « Mot de passe oublié ? » sur la page Login (`src/pages/Login.jsx`). Insertion d'un `<Link to="/mot-de-passe-oublie">` discret en couleur canard, aligné à droite (convention universelle Gmail/Outlook/GitHub), positionné entre le bandeau d'erreur conditionnel et le bouton « Se connecter » — emplacement où l'utilisateur en galère cherche naturellement. Import `Link` ajouté à react-router-dom. Tests prod end-to-end validés sur `https://omnes-orga.vercel.app` : email reçu depuis `noreply@app.omnesmedecins.fr`, lien dans l'email pointe bien vers le domaine de prod (pas localhost), flow complet clic email → changement MDP → reconnexion avec le nouveau MDP fonctionne. Ancien MDP correctement refusé après changement.

15 bis. ✓ **Étape 15 bis — FAITE** — Fix PJ non ouvrables en PWA standalone iOS
   - Symptôme : depuis le déploiement Vercel (étape 13), cliquer sur une pièce jointe ne déclenchait rien sur iPhone en app installée, alors que ça marchait sur Mac et en Safari iOS classique. Le menu « ... → Télécharger » continuait à fonctionner (download Blob synchrone).
   - Cause racine : Safari iOS bloque silencieusement `window.open()` et `<a target="_blank">` lorsqu'ils sont appelés après une opération asynchrone (typiquement après le `await` d'un `createSignedUrl`), uniquement en mode `standalone` (PWA installée). Sur Mac et en Safari iOS non-installé, la même chaîne de promesses passait.
   - Solution : nouveau helper transverse `src/lib/storageOpen.js` exposant `openOrDownload(...)` et `isStandaloneMode()`. La détection standalone combine `window.matchMedia('(display-mode: standalone)').matches` (Android/desktop installé) et `window.navigator.standalone === true` (iOS Safari, propriété historique). En mode standalone, on bascule sur un téléchargement Blob systématique (même pour les types previewable). Le fichier s'ouvre alors via la feuille de partage native iOS (Aperçu pour PDF, Photos pour images, etc.).
   - Refactor des 5 helpers de module pour déléguer à `openOrDownload` :
     - `cabinetStorage.openCabinetFile`
     - `simStorage.openSimFile`
     - `evenementStorage.openEvenementFile`
     - `discussionStorage.openAttachment`
     - `immobilierStorage.openAttachment`
   - **Aucun changement de signature** des helpers publics : les composants appelants n'ont pas été modifiés. L'encapsulation reste stable, seul le détail d'implémentation a changé.
   - Gains secondaires :
     - `isPreviewable` factorisé (était dupliqué 5 fois)
     - Immobilier passe de `fetch().blob()` à `supabase.storage.download()` (un round-trip réseau en moins, plus de souci CORS potentiel)
     - `video/mp4` et `audio/*` désormais previewable dans Immobilier (était restreint à 5 types, maintenant aligné sur les 4 autres modules)
   - Compromis UX assumé : sur PWA installée iOS, les images ne s'ouvrent plus directement dans un onglet mais passent par la feuille de partage (tap supplémentaire pour ouvrir dans Aperçu/Photos). Acceptable car c'est le comportement iOS natif standard, prévisible et fiable. Les PDF continuent à s'ouvrir directement (viewer PDF natif iOS). Comportement sur Mac et Safari iOS non-installé totalement inchangé.

15 ter. ✓ **Étape 15 ter — FAITE** — Filigrane logo Omnès teinté par module dans les headers
   - Objectif : remplacer le filigrane décoratif plein écran (cercle + triangle, opacité 0.05) par un filigrane logo Omnès positionné dans le header sticky de chaque page, **teinté de la couleur du module**. Identification visuelle rapide du contexte au coup d'œil, identité de marque renforcée.
   - Asset : `public/watermark-mask.png` — PNG noir opaque (~16 ko) du mark Omnès, fourni par Claude Design. Renommé depuis `logo-omnes-mark-mask.png` pour éviter la confusion avec `logo-omnes.webp` (logo Login). Le PNG est utilisé en `mask-image` CSS, colorisé par `background-color` : une seule image, n couleurs.
   - Composant atomique : `src/components/common/LogoOmnes.jsx`. Affiche le logo dans n'importe quelle couleur DS (`marine`, `canard`, `ocre`, `olive`, `brique`, `fuchsia`) ou n'importe quelle valeur CSS libre (hex, `currentColor`, `var(--…)`). Props : `color`, `width`, `height`, `opacity`, `className`, `style`. Préfixes `-webkit-mask-*` inclus pour Safari/iOS, indispensables pour la PWA.
   - Wrapper filigrane : `src/components/common/HeaderWatermark.jsx`. Positionne `LogoOmnes` en `position: absolute` dans un header parent `relative`, opacité par défaut 0.18, taille `md` (150×60) avec presets `sm` / `md` / `lg`, décalage à droite de -10px par défaut (effet « déborde hors écran »). Props : `color`, `size`, `opacity`, `offsetRight`, `verticalAlign` ('center' par défaut / 'top' pour les headers multi-lignes). Le composant est en `pointer-events-none` + `select-none` : purement décoratif, n'intercepte ni les clics ni la sélection.
   - Pattern d'intégration dans un header : (a) ajouter `relative overflow-hidden` à la className du `<header>`, (b) ajouter `relative z-10` à chaque `<div>` enfant direct contenant des éléments interactifs (pattern défensif d'empilement), (c) placer `<HeaderWatermark color="..." />` comme dernier enfant du `<header>` juste avant la fermeture.
   - Couleurs par module : Trombinoscope canard, Annuaire ocre, Cabinet pratique marine, Discussion brique, Événements fuchsia, SIM olive, Immobilier canard. Home, Profil, Recherche : marine (couleur système, pages BottomNav non-module).
   - Cas particuliers :
     - **Headers à 3 lignes (BoardPage Discussion et Immobilier)** : `verticalAlign="top"` (top: 8px) au lieu du centrage vertical par défaut. Sans ce paramètre, le watermark se positionnait pile à hauteur du bouton « + Nouvelle carte » de la ligne 2 et était entièrement masqué.
     - **Headers non-sticky (`EvenementDetail.jsx`, `Recherche.jsx`)** : watermark intégré quand même, il scrolle avec le contenu — cohérent avec un header non-sticky. Pas de pattern défensif `relative z-10` car ces headers n'ont pas de `<div>` enfant englobant (flex direct sur les boutons et le titre) ; le watermark est pointer-events-none donc ne capte pas les clics.
     - **Vue carte plein écran (`CardPage` Discussion et Immobilier)** : header `shrink-0` (pas sticky) car la page entière est en flex 100vh hors `AppLayout` (pattern messagerie). Watermark intégré pareil. Cas particulièrement utile : c'est l'écran le plus immersif (pas de BottomNav), le filigrane couleur module est un ancrage discret pour rappeler le contexte.
     - **Home** : utilise `LogoOmnes` directement, pas le wrapper `HeaderWatermark`. Sémantiquement différent — c'est un élément d'identité de marque, pas un filigrane d'arrière-plan. Taille 320×128, opacité 0.07, `position: absolute` à droite avec `top: 40` et `right: -30` pour déborder du viewport. Effet « grand logo fond de page ». Le bloc texte « MARDI 2 JUIN » + « Bonjour {prenom} » est en `relative z-10` pour rester au-dessus.
   - `AppLayout.jsx` : retrait de `<Filigrane />` (cercle + triangle plein écran) et de la prop `showFiligrane` désormais inutile. Le composant `src/components/layout/Filigrane.jsx` reste en place car utilisé sur les 3 pages publiques d'authentification (`Login`, `MotDePasseOublie`, `NouveauMotDePasse`) qui gardent leur identité visuelle actuelle (filigrane cercle + triangle conservé, étape 12 bis).
   - Total : 22 fichiers touchés (3 nouveaux + 19 modifiés). Aucune migration SQL, aucun changement de signature publique des composants existants, aucun impact sur les permissions ou la sécurité.

16. **Étape 16** — Notifications push Firebase FCM (à faire après que la PWA fonctionne).

---

## Limitations connues

- **Création d'un médecin sans UI dédiée** — RÉSOLU à l'étape 14. Le super_admin peut désormais créer un médecin directement depuis `/trombinoscope` via le bouton "+ Nouveau médecin". La voie dashboard Supabase reste disponible mais n'est plus le chemin nominal.
- **Filtrage des champs sensibles côté frontend** — la RLS `profiles_select_all_authenticated` autorise la lecture de toute la table `profiles` à tout utilisateur authentifié. Le masquage de `jours_disponibles` et `notes_internes` pour les remplaçants se fait côté React. Si on a besoin d'une sécurité forte (les remplaçants ne doivent jamais voir ces données via une requête manuelle), migrer vers une vue PostgreSQL filtrée par rôle.
- **Gestion des RIB centralisée sur le super_admin** — depuis l'étape 11, les RIB (`profiles_compta`) sont saisis et modifiés uniquement par le super_admin, depuis la fiche Trombinoscope de chaque médecin. Les médecins associés (associe / associe_gerant) les consultent en lecture pour payer les remplaçants. Les remplaçants n'ont aucun accès (ni lecture ni écriture). Pas de validation BIC (seul l'IBAN est validé par checksum mod-97). Pas d'historique des modifications de RIB (hard delete, dernière valeur écrase).
- **Cohérence du nommage Discussion** — le module Discussion utilise des noms anglais (`title`, `status`, `archived`, `created_by`) en BDD, hooks et composants, alors qu'Immobilier utilise le français (`titre`, `statut`, `archive`, `auteur_id`). Cette dette de nommage transverse rend la lecture du code plus pénible (helpers de normalisation en transit dans `Recherche.jsx`) mais n'a pas d'impact utilisateur. Renommage prévu en étape 12 ter ou après le déploiement Vercel : impacte les colonnes Postgres, les RLS, les fonctions SECURITY DEFINER (`is_board_member`, `is_board_owner`, `mark_board_read`), les hooks (`useDiscussion`, `useBoard`, `useCard`), les composants et la doc. Sous-chantiers prévus : (a) SQL + RLS + fonctions, (b) hooks JS, (c) composants et UI, (d) doc et limitations.
- **Breadcrumb des Drives à 2 segments** — les modules Cabinet pratique et SIM affichent un breadcrumb réduit à `Module > NomDossierActuel` quel que soit le niveau d'imbrication. Au-delà du 2e niveau, le contexte intermédiaire n'est pas visible dans le fil ; le retour racine se fait en un clic. Un breadcrumb complet (remontée des `parent_id`) sera ajouté en transverse sur les deux modules si le besoin se confirme avec l'usage.
- **Images en PWA standalone iOS : feuille de partage au lieu d'onglet** — depuis l'étape 15 bis, en PWA installée sur iPhone, cliquer sur une image (JPG, PNG, etc.) ne l'ouvre plus directement dans un onglet inline mais passe par la feuille de partage native iOS (un tap supplémentaire pour choisir « Aperçu », « Photos » ou « Fichiers »). Les PDF continuent à s'ouvrir directement dans le viewer PDF natif iOS, comme avant. Compromis assumé : c'était soit accepter ce tap supplémentaire pour les images, soit conserver le bug iOS standalone où aucune PJ ne s'ouvrait. Comportement strictement inchangé sur Mac, Windows, Android, et Safari iOS non-installé.
- **Service worker en HTTP iOS** — sur Safari iOS, l'enregistrement du service worker n'est possible **qu'en HTTPS** (sauf sur `localhost` direct, pas sur une IP de réseau local). En conséquence, le test du précache et du mode offline réel n'est pas faisable avant le déploiement Vercel (étape 13). Sur Android Chrome, l'enregistrement marche en HTTP local — non testé puisque la cible principale est iOS. Le shell visuel s'installe correctement sur iPhone même en HTTP (raccourci sur écran d'accueil, mode standalone OK), mais sans le SW, l'app n'est pas utilisable hors ligne. ✓ Résolu en étape 13 : SW enregistré et offline réel validés en HTTPS sur Vercel.
- **`navigator.onLine` non simulable dans DevTools** — la case "Network → Offline" ainsi que la case "Application → Service Workers → Offline" de Chrome DevTools coupent les requêtes mais ne déclenchent **pas** l'événement JS `offline` ni ne changent `navigator.onLine`. La bannière "Hors ligne" se teste donc uniquement en conditions réelles (couper le Wi-Fi du Mac, ou mode avion sur l'iPhone). Validé OK dans les deux modes en 12F.
- **Pas de cache des données Supabase** — choix assumé en 12D ("shell uniquement"). Hors ligne, le shell de l'app s'affiche depuis le précache mais les modules tombent en erreur (pas de Trombinoscope, pas d'Annuaire, etc.) puisque les requêtes Supabase passent par le réseau. La bannière "Hors ligne" signale clairement l'état dégradé. Pour une expérience offline plus riche (lecture seule des données déjà consultées), il faudrait passer en stratégie intermédiaire avec runtime caching côté Supabase, sujet à part qu'on n'a pas voulu mêler à la 12 (risques sur Realtime Discussion/Immobilier, sur les 401 quand la session expire, etc.).
- **Envoi mail Resend en mode sandbox** — RÉSOLU. Le sous-domaine `app.omnesmedecins.fr` a été configuré dans Resend avec DKIM + SPF + MX (3 enregistrements DNS dans la zone OVH du domaine principal `omnesmedecins.fr`, sur `resend._domainkey.app` et `send.app`). L'envoi peut désormais atteindre n'importe quelle adresse. DMARC volontairement non configuré à cette étape (optionnel côté Resend, à traiter dans un second temps).
- **Validation de mot de passe côté Login.jsx légère** — la fonction `validate()` ne contrôle que la longueur minimale à 6 caractères (anti-typo), pas la politique stricte (10 chars + 4 classes) qui est portée côté Supabase. Ceci est intentionnel : la politique stricte ne s'applique qu'à la création/changement de mot de passe, pas à la connexion. Sinon, durcir la politique en cours d'exploitation bloquerait l'accès aux utilisateurs dont le mot de passe a été créé avant le durcissement.
- **Pas de changement forcé de mot de passe à la première connexion** — décision pragmatique (étape 14). Le mot de passe temporaire reste valide tant que le médecin ne le change pas. Les médecins changeront leur mot de passe quand ils en auront besoin (via le reset password livré en étape 15, ou via une future page "Modifier mon mot de passe" dans Profil).
- **Politique Pro Supabase non activée** — les options "Secure password change", "Require current password when updating" et "Prevent use of leaked passwords" (cette dernière nécessite le plan Pro à $25/mois) sont laissées OFF. À reconsidérer si le projet passe sur un plan Pro pour d'autres raisons.
- **Meta tag `apple-mobile-web-app-capable` déprécié** — un warning console signale que cette balise est dépréciée au profit de `mobile-web-app-capable`. À traiter dans une passe d'hygiène ultérieure, sans impact fonctionnel.

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

**Test rapide de la PWA en local** : `npm run build && npm run preview` (port 4173) plutôt que `npm run dev`. Le SW et le précache ne sont actifs qu'en build prod. Pour tester sur iPhone via IP locale, utiliser `npm run preview -- --host` (cf. étape 12F-3). Limite : Safari iOS refuse d'enregistrer le SW en HTTP même sur IP locale ; le test offline réel ne sera possible qu'après le déploiement Vercel.

⚠️ Pour tester l'installation PWA et les push, il faut un **HTTPS réel** : ce ne sera donc possible qu'après déploiement sur Vercel (HTTPS automatique).