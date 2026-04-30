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
| Super administrateur | `super_admin` | Gère les comptes, les rôles, les paramètres globaux |
| Associé gérant | `associe_gerant` | Accès cabinet complet + accès espace SIM |
| Associé | `associe` | Accès cabinet, pas d'accès SIM |
| Remplaçant | `remplacant` | Accès limité selon les modules |

### Table `profiles` (Supabase)

```
id          uuid      lié à auth.users
nom         text
prenom      text
role        enum      super_admin / associe_gerant / associe / remplacant
specialite  text      (optionnel)
photo_url   text      (optionnel, Supabase Storage)
telephone   text      (optionnel)
email       text
actif       boolean   pour activer/désactiver les comptes
fcm_token   text      token Firebase pour les notifications push
```

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

**Contenu d'une carte :**
- Photo du médecin
- Nom, prénom, spécialité
- Téléphone, email
- Informations utiles (jours de présence, bureau…)

**Droits :**
| Action | super_admin | associe_gerant | associe | remplacant |
|---|:---:|:---:|:---:|:---:|
| Voir les cartes | ✓ | ✓ | ✓ lecture | — |
| Créer / modifier une carte | ✓ | ✓ | — | — |
| Supprimer une carte | ✓ | — | — | — |

Pas de chat dans ce module.

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
| Trombinoscope | ✓ édition | ✓ édition | ✓ lecture | — |
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

## Structure du projet

```
cabinet-app/
├── public/
│   ├── icons/                      ← icônes PWA (192, 512, maskable)
│   ├── manifest.webmanifest        ← généré par vite-plugin-pwa
│   └── apple-touch-icon.png        ← icône spécifique iOS
├── src/
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Home.jsx                ← grille des 7 icônes
│   │   ├── Trombinoscope.jsx
│   │   ├── Annuaire.jsx
│   │   ├── CabinetPratique.jsx
│   │   ├── Discussion.jsx
│   │   ├── Evenements.jsx
│   │   ├── SIM.jsx
│   │   ├── Immobilier.jsx
│   │   └── InstallGuide.jsx        ← guide d'installation iOS/Android
│   ├── components/
│   │   ├── Layout.jsx
│   │   ├── ProtectedRoute.jsx
│   │   ├── BottomNav.jsx           ← navigation mobile bas d'écran
│   │   ├── ModuleIcon.jsx          ← icône de la page d'accueil
│   │   ├── TrelloBoard.jsx         ← composant Kanban réutilisable
│   │   ├── DriveFolder.jsx         ← composant Drive réutilisable
│   │   ├── ChatThread.jsx          ← composant chat réutilisable
│   │   └── InstallPrompt.jsx       ← invitation à installer la PWA
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useRole.js
│   │   ├── useNotifications.js     ← gestion FCM
│   │   └── useInstallPrompt.js     ← détection installable PWA
│   └── lib/
│       ├── supabaseClient.js
│       └── firebase.js
├── vite.config.js                  ← configure vite-plugin-pwa
├── .env
├── .env.example
└── README.md
```

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

1. **Étape 1** — Initialiser le projet React + Vite + Tailwind + Supabase
2. **Étape 2** — Authentification, table `profiles`, routes protégées par rôle
3. **Étape 3** — Page d'accueil mobile (grille 7 icônes, masquage selon rôle)
4. **Étape 4** — Module Trombinoscope (cartes, photo, droits)
5. **Étape 5** — Module Annuaire (liste collaborative)
6. **Étape 6** — Module Cabinet pratique (Drive)
7. **Étape 7** — Module Événements (Drive)
8. **Étape 8** — Module SIM (Drive restreint)
9. **Étape 9** — Composants réutilisables : TrelloBoard + ChatThread
10. **Étape 10** — Module Discussion (tableaux + invitations + chat)
11. **Étape 11** — Module Immobilier (mêmes composants que Discussion)
12. **Étape 12** — Configuration PWA (manifest, service worker, icônes, page guide d'installation)
13. **Étape 13** — Déploiement Vercel + tests installation iOS et Android
14. **Étape 14** — Notifications push Firebase FCM (à faire après que la PWA fonctionne)

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