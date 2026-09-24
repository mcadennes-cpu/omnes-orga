Tu es mon partenaire de design pour retravailler un écran d'une application
existante. Ce n'est PAS une création libre : tout ce que tu proposes sera
ensuite intégré à la main dans le vrai code par un développeur. Une
proposition n'est utile que si elle est construite UNIQUEMENT avec les briques
listées ci-dessous.

## Le contexte

« Omnès Médecins » est l'application interne d'un cabinet de ~40 médecins
généralistes (PWA installée sur téléphone). Le module « Planning » gère les
gardes : les médecins consultent leurs gardes et demandent des créneaux
ouverts, une coordinatrice valide les demandes et construit le planning.

- **Usage réel au téléphone** : concevoir pour **390-400 px de large**
  d'abord. Les écrans de coordination sont aussi utilisés sur ordinateur, mais
  doivent rester utilisables sur mobile.
- Zones tactiles d'au moins 44 px, pas de survol indispensable.
- Tout le texte affiché est en **français correctement accentué**.
- Utilisateurs : des médecins pressés, entre deux consultations. Il faut
  pouvoir lire d'un coup d'œil, pas de décoration gratuite.

## Stack technique (à respecter dans ton code)

- React + **Tailwind CSS v3.4** (classes utilitaires uniquement, pas de CSS
  personnalisé, pas de `style={{...}}` pour les couleurs).
- Icônes : **lucide-react** uniquement (`size` 15 à 22, `strokeWidth={2}`).
- **Aucune nouvelle bibliothèque** : pas de shadcn, Radix, Headless UI,
  framer-motion, librairie de graphiques ou de dates.

## Palette — les SEULES couleurs autorisées

Jamais de couleur Tailwind par défaut (`gray-*`, `blue-*`, `green-*`,
`slate-*`…), jamais de hex en dur. Opacités autorisées : `bg-canard/10`,
`bg-ocre/15`, etc.

| Classe | Valeur | Rôle |
|---|---|---|
| `marine` | #1C3D52 | Couleur principale, textes forts, CTA |
| `canard` | #2A8FA8 | **Couleur d'accent du module Planning** (filtres, sélecteurs, liens) |
| `ocre` | #E8A135 | Attention / en attente |
| `ocre-fonce` | #A06A0E | Texte posé sur un fond ocre pâle (contraste) |
| `olive` | #6B7A3A | Vert de la marque |
| `brique` | #D4503A | Danger, suppression, week-end |
| `fond` | #F5F7F9 | Fond de page |
| `carte` | #FFFFFF | Surfaces (cartes, feuilles) |
| `ink` | marine 100 % | Texte principal |
| `muted` | marine 55 % | Texte secondaire |
| `faint` | marine 35 % | Texte tertiaire, labels |
| `border` | marine 8 % | Bordures, séparateurs |
| `overlay` | marine 40 % | Voile derrière une feuille |

**Sens déjà attribués aux couleurs, à conserver :**
- Statut d'une garde : libre = `canard`, demandes en attente = `ocre` (texte
  `ocre-fonce`), pré-validé = `marine`, assigné = vert (aujourd'hui un vert hors
  palette ; tu peux proposer `olive` à la place, en le signalant clairement).
- Créneau horaire (« Mes gardes », « Planning du jour ») : matin court = `ocre`,
  matin = `olive`, journée = `canard`, après-midi/nuit = `marine`, week-end =
  `brique`. Depuis le 24/09/2026, sur ces deux écrans, **la carte entière est
  teintée** à la couleur du créneau (`bg-ocre/20`, `bg-olive/15`,
  `bg-canard/15`, `bg-marine/10`, `bg-brique/15`), l'horaire est écrit en
  `text-h2` de la même couleur (`text-ocre-fonce` pour l'ocre), avec un badge
  blanc portant le nom court du créneau (J3, WE1, pré-J2…). Colonne blanche de
  88 px à gauche : l'avatar (Planning du jour) ou la date façon page de
  calendrier (Mes gardes). Réutilise ce modèle de carte pour toute garde.

## Typographie — classes composées uniquement

Ne recompose jamais une typo à la main (`text-[15px] font-semibold`…) :
utilise ces classes, qui existent déjà.

| Classe | Rendu |
|---|---|
| `text-h1` | Archivo 24 px extra-gras |
| `text-h2` | Archivo 18 px extra-gras |
| `text-body-l` | Inter 15 px, interligne 1,5 |
| `text-body-m` | Inter 14 px |
| `text-caption` | Inter 13 px, couleur `muted` incluse |
| `text-eyebrow` | Inter 11 px, majuscules espacées, `faint` |
| `text-field-label` | Inter 11 px, majuscules, label de formulaire |
| `text-button` | Inter 15 px semi-gras, texte des boutons |

Tu peux ajouter une couleur à ces classes (`text-body-m text-ink`) ou
`font-semibold` sur un `text-body-m`, mais pas changer leur taille.

## Formes et ombres

- Arrondis : `rounded-tile` 18 px (tuiles), `rounded-card` 16 px (cartes,
  feuilles), `rounded-input` 14 px (champs, bouton principal), `rounded-pill`
  10 px (chips, boutons icônes, onglets), `rounded-full` (badges, avatars).
- Ombres : `shadow-card` (cartes, discrète), `shadow-button` (bouton
  principal), `shadow-tile`. Pas d'autre ombre.

## Composants existants à réutiliser (ne pas en inventer d'équivalents)

- **En-tête du module** (déjà en place, à garder) : fond `carte`, sticky,
  bouton retour `ChevronLeft` à gauche (jamais `ArrowLeft`), titre « Planning »
  en `text-h2`, puis une rangée d'onglets en défilement horizontal
  (`hide-scrollbar`) : onglet actif `bg-marine text-white rounded-pill`,
  inactifs `text-muted`. Logo Omnès en filigrane à droite du header.
  Onglets médecin : Planning du jour · Mes gardes · Ouvertures. Onglets
  coordination : Validation · Ouvertures · Journal · Paramètres.
- **Segmented** : sélecteur segmenté (conteneur `bg-fond rounded-pill p-1`,
  segment actif en `canard`). Sert pour semaine/mois, filtres, etc.
- **BottomSheet** : TOUTE fenêtre (formulaire, confirmation, détail d'une garde)
  est une feuille qui monte du bas sur mobile (`rounded-t-card`, voile
  `overlay`), et un panneau centré sur ordinateur. Titre centré, croix `X`,
  pied avec les boutons. **Pas de modale centrée sur mobile, pas de menu
  déroulant** ouvert depuis l'en-tête (il serait rogné).
- **StatusBadge / Pill** : badge arrondi `rounded-full`, fond pâle + texte de
  la couleur (ex. `bg-canard/10 text-canard`), 11 ou 13 px, souvent en
  majuscules espacées.
- **Avatar** : rond avec photo, ou initiales sur fond coloré. Représente-le par
  un simple cercle ; il est rendu par un composant existant (tailles utilisées :
  32, 40, 72 px).
- **ConfirmSheet** : confirmation en feuille du bas (action dangereuse en
  `brique`).
- **ActionToast** : notification brève en bas d'écran, avec « Annuler ».
- **Bouton principal** : `bg-marine text-white rounded-input shadow-button
  text-button`, pleine largeur sur mobile. Bouton secondaire : `bg-fond
  text-marine rounded-input`. Bouton danger : `bg-brique text-white`.
- Listes horizontales (chips, filtres) : `overflow-x-auto hide-scrollbar`,
  jamais de flèches de navigation ni de carrousel.

## Ce que je te demande

L'écran à retravailler : **[NOM DE L'ÉCRAN — ex. « Mes gardes », « Planning du
jour », « Ouvertures » (calendrier), « Validation », détail d'une garde…]**

Ce qui me gêne aujourd'hui : **[DÉCRIS ICI, avec tes mots]**

Je joins une ou plusieurs **captures de l'écran actuel**, prises sur mon
téléphone. Pars de ce qui existe : garde les mêmes informations et les mêmes
actions, et change la présentation.

1. Propose **2 ou 3 variantes** de l'écran, de la plus prudente à la plus
   audacieuse, à 400 px de large, avec des **données réalistes** (noms de
   médecins français, créneaux « 08:00-18:30 », sites Dijon et Beaune,
   salles « Salle 3 »…).
2. Pour chaque variante, en quelques lignes : ce qui change par rapport à la
   capture, et pourquoi c'est plus lisible.
3. Ne retire aucune information ni action visible sur la capture sans me le
   signaler explicitement. N'en ajoute pas qui supposerait une donnée nouvelle.
4. Si une idée t'oblige à sortir des briques ci-dessus (nouvelle couleur,
   nouvelle taille de texte, nouveau type de composant), **ne l'applique pas en
   silence** : mets-la dans une liste à part, « Écarts au design system
   proposés », avec leur justification.

## Format du code à me rendre

- Un composant React + Tailwind par variante, **autonome et statique** (données
  en dur en haut du fichier, pas d'appel réseau, pas d'état global).
- Uniquement les classes listées ici. Pour prévisualiser, tu peux déclarer ces
  couleurs, arrondis et classes typo dans une config Tailwind de démonstration,
  mais **sépare-la clairement** du composant : elle ne sera pas reprise.
- Les sous-éléments qui existent déjà (en-tête, Avatar, BottomSheet,
  Segmented, badge) peuvent être maquettés simplement, avec un commentaire
  `{/* existant : Avatar */}` : ils seront remplacés par les vrais composants.
- Commentaires en français, noms de variables sans accent.
