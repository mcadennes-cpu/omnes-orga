---
name: design-system-omnes
description: Regles de design et patterns UI verifies dans le code du projet Omnes Medecins (couleurs, typographie, radii, bouton retour, modales, defilement horizontal, avatars). A consulter et appliquer SYSTEMATIQUEMENT avant de creer ou modifier un ecran, un composant, une modale, un bouton ou une icone, meme si l'utilisateur ne le demande pas explicitement. Empeche de reinventer un pattern deja existant ou de faire varier accidentellement le style d'un module a l'autre.
---

# Design system — Omnès Médecins

Ce fichier documente des décisions déjà prises et déjà appliquées dans le code
(vérifiées directement dans le repo, pas des intentions). Objectif : que tout
nouvel écran ou composant s'intègre visuellement sans qu'on ait à le repréciser
à chaque session.

## Couleurs (source de vérité : `tailwind.config.js`)

Ne jamais écrire une couleur en dur (hex ou rgba) dans un composant — toujours
utiliser les classes Tailwind qui pointent vers ces tokens.

| Token | Valeur | Usage |
|---|---|---|
| `marine` | #1C3D52 | Primary / CTA / module Cabinet pratique |
| `canard` | #2A8FA8 | Trombinoscope, Immobilier, liens |
| `ocre` | #E8A135 | Annuaire |
| `ocre-fonce` | #A06A0E | Texte sur fond ocre pastel (contraste WCAG) |
| `olive` | #6B7A3A | SIM |
| `brique` | #D4503A | Discussion, actions dangereuses/destructives |
| `fuchsia` | #D94F7E | Événements |
| `fond` | #F5F7F9 | Fond de page |
| `carte` | #FFFFFF | Surfaces (cartes, modales) |
| `ink` / `muted` / `faint` / `border` / `overlay` | opacités du marine (100/55/35/8/40%) | Textes secondaires, bordures, overlays de modale |

**Règle module → couleur** : chaque module a une seule couleur d'accent fixe
(cf. tableau ci-dessus). Si un nouveau module est créé, proposer une des 6
couleurs de marque existantes plutôt que d'en inventer une nouvelle — demander
confirmation à l'utilisateur avant de trancher.

## Typographie

Toujours utiliser les classes composées définies dans `src/index.css`
(`@layer components`), jamais recomposer à la main avec des classes Tailwind
brutes (`text-[15px] font-semibold` etc.) :

- `.text-h1` / `.text-h2` — titres, police Archivo (`font-display`)
- `.text-wordmark` — logo/titre de marque
- `.text-body-l` / `.text-body-m` — texte courant, police Inter
- `.text-caption` — texte secondaire (couleur `muted` incluse)
- `.text-eyebrow` / `.text-tagline` / `.text-field-label` — labels en
  majuscules avec tracking (`.text-field-label` pour les labels de formulaire)
- `.text-button` — texte des boutons

## Radii et ombres (`tailwind.config.js`)

| Classe | Valeur | Usage |
|---|---|---|
| `rounded-tile` | 18px | Tuiles de modules (grille Home) |
| `rounded-card` | 16px | Cartes, dialogs, feuilles bottom-sheet |
| `rounded-input` | 14px | Champs de formulaire, CTA primary |
| `rounded-pill` | 10px | Chips, boutons icônes |
| `shadow-card` | — | Cartes / éléments de liste (subtile) |
| `shadow-button` | — | CTA primary (plus marquée) |
| `shadow-tile` | — | Tuiles de modules colorées |

Toutes les ombres utilisent une teinte marine, jamais du noir pur (`rgba(28,61,82,…)`).

## Bouton retour

**Toujours `ChevronLeft` de `lucide-react`, jamais `ArrowLeft`.**
Vérifié à l'identique dans 15 fichiers du repo (aucune exception restante) :
`size={20}` à `size={22}`, `strokeWidth={2}`, généralement
`className="text-marine"`.

```jsx
import { ChevronLeft } from 'lucide-react'
<ChevronLeft size={20} strokeWidth={2} className="text-marine" />
```

## Modales

Pattern **bottom-sheet** obligatoire pour toute modale de contenu (formulaire,
confirmation, sélection). Pas de modale centrée classique dans ce projet.

Structure type (calquée sur `AvatarUploadModal.jsx`, `InstallPromptModal.jsx`,
`ConfirmDialog.jsx`) :

- Rendue via `createPortal(document.body)`
- Conteneur avec `role="dialog"`
- Feuille du bas avec la classe `animate-slide-up` et `rounded-t-card`
- Scroll-lock du body à l'ouverture (`document.body.style.overflow = 'hidden'`),
  restauré au cleanup du `useEffect`
- Fermeture sur la touche Escape (`keydown` listener), sauf pendant un submit
  en cours
- Overlay avec la couleur `overlay` (marine 40%)

**Exception** : la vue "carte" plein écran (Discussion, Immobilier) n'est PAS
une modale — c'est une page routée à part entière, sans `AppLayout` ni
`BottomNav`, avec un comportement type messagerie (header fixe, fil
scrollable, composer sticky en bas).

## Défilement horizontal

Pour toute liste qui défile horizontalement (chips de catégories, pièces
jointes en chips, filtres) : classe utilitaire `.hide-scrollbar` (définie
dans `index.css`) — garde le scroll natif au doigt/trackpad mais masque la
barre de défilement visuellement. Ne pas réinventer un autre mécanisme
(pas de flèches de nav, pas de librairie de carousel).

## Filigrane logo dans les headers

Tout header sticky de page/module doit porter le logo Omnès en filigrane,
teinté de la couleur du module (identification visuelle immédiate du
contexte). Composant `HeaderWatermark` (`src/components/common/HeaderWatermark.jsx`),
réglage standard utilisé partout dans l'app :

```jsx
import HeaderWatermark from '../components/common/HeaderWatermark'

<header className="relative overflow-hidden ...">
  <div className="relative z-10">
    {/* titre, boutons, recherche... */}
  </div>
  <HeaderWatermark color="canard" fill offsetRight={64} />
</header>
```

Points à respecter :
- `fill` (le logo épouse toute la hauteur du header, quel que soit le nombre
  de lignes) + `offsetRight={64}` : réglage uniforme utilisé sur tous les
  headers de l'app (Trombinoscope, Annuaire, Cabinet pratique, SIM, Discussion,
  Événements, Immobilier). Ne pas repasser en mode taille fixe (`sm`/`md`/`lg`)
  sauf cas particulier déjà justifié dans le code (ex. Home, qui utilise
  `LogoOmnes` directement et pas ce wrapper, car c'est un élément de marque,
  pas un filigrane de header).
- `color` = la couleur d'accent du module (cf. tableau des couleurs plus haut),
  pas `marine` par défaut sauf pour Home/Profil/Recherche (pages système sans
  couleur de module propre).
- Le `<header>` parent doit être `relative overflow-hidden`, et le(s) `<div>`
  enfant(s) contenant des éléments cliquables doivent être `relative z-10`
  (sinon le filigrane, en `pointer-events-none`, passe quand même visuellement
  devant si l'empilement n'est pas géré).
- Sur les vues "carte" plein écran (Discussion/Immobilier), le même filigrane
  est aussi posé en fond derrière le fil de messages (composant `LogoOmnes`
  direct, opacité ~0.05, centré, fixe pendant que les bulles défilent
  au-dessus) — effet "fond d'écran" du chat.

## Avatars

Toujours passer par le composant `<Avatar>` (`src/components/common/Avatar.jsx`)
et le helper `getAvatarPalette` (`src/lib/avatarColor.js`) pour la couleur de
fallback déterministe. Ne jamais recoder un rond d'initiales à la main : le
composant gère déjà le cache d'URL signée, le fallback si `photo_url` absent,
et le `onError` silencieux si l'URL expire.

## Avant de créer un nouvel écran ou composant

1. Vérifier s'il existe déjà un composant/pattern équivalent ailleurs dans le
   projet (Trombinoscope, Annuaire, Cabinet pratique, Discussion, Événements,
   SIM, Immobilier ont souvent des patterns déjà résolus : header sticky avec
   recherche, état vide illustré, skeleton de chargement, menu trois-points
   en bottom-sheet).
2. Réutiliser les classes typo/couleurs/radii ci-dessus plutôt que d'improviser.
3. Si une déviation semble nécessaire (nouvelle couleur, nouveau pattern de
   modale, etc.), le signaler explicitement à l'utilisateur avant de l'implémenter
   plutôt que de trancher seul.
