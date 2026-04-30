# Spécifications visuelles — Omnès Médecins
> Document compagnon de `cabinet-medical-app.md`
> À fournir à Claude Code en début de session, en plus du document de référence projet.

---

## 1. Palette de couleurs

À déclarer dans `tailwind.config.js` sous `theme.extend.colors`.

```js
colors: {
  // Couleurs principales (extraites du logo Omnès Médecins)
  marine:  '#1C3D52',  // bleu marine — couleur principale, headers, textes, bouton principal
  canard:  '#2A8FA8',  // bleu canard — actions, focus, lien, accent secondaire
  ocre:    '#E8A135',  // module Annuaire
  olive:   '#6B7A3A',  // module SIM
  brique:  '#D4503A',  // module Discussion + badges de notification
  fuchsia: '#D94F7E',  // module Événements

  // Couleurs neutres
  fond:    '#F5F7F9',  // fond général de l'application
  carte:   '#FFFFFF',  // fond des cartes blanches
}
```

### Couleurs sémantiques (textes et bordures)

À utiliser via classes Tailwind utilitaires, ou définir dans `theme.extend` :

```js
// Couleurs de texte basées sur le marine avec opacité
'ink':    '#1C3D52',           // texte principal (= marine)
'muted':  'rgba(28,61,82,0.55)', // texte secondaire (descriptions)
'faint':  'rgba(28,61,82,0.35)', // texte tertiaire (labels, métadonnées)
'border': 'rgba(28,61,82,0.08)', // bordures fines des cartes
```

### Mapping module → couleur

| Module | Couleur | Code |
|---|---|---|
| Trombinoscope | canard | `#2A8FA8` |
| Annuaire | ocre | `#E8A135` |
| Cabinet pratique | marine | `#1C3D52` |
| Discussion | brique | `#D4503A` |
| Événements | fuchsia | `#D94F7E` |
| SIM | olive | `#6B7A3A` |
| Immobilier | canard | `#2A8FA8` |

---

## 2. Typographie

### Polices

Charger via Google Fonts dans `index.html` :

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Archivo:wght@700;800;900&display=swap" rel="stylesheet">
```

Configuration Tailwind :

```js
fontFamily: {
  sans:    ['Inter', 'system-ui', 'sans-serif'],     // corps de texte par défaut
  display: ['Archivo', 'Inter', 'system-ui', 'sans-serif'], // titres marquants
}
```

### Usage typographique

- **Inter** (corps de texte) : tout le contenu courant, formulaires, boutons, listes
- **Archivo** (display) : grands titres ("Bienvenue", "Bonjour [Prénom]", logo wordmark "OMNÈS MÉDECINS")

### Tailles et poids de référence

| Élément | Police | Taille | Poids | Notes |
|---|---|---|---|---|
| Wordmark logo | Archivo | 22px | 900 | Majuscules, letter-spacing -0.005em |
| Titre de page (h1) | Archivo | 22-24px | 800 | letter-spacing -0.01em |
| Salutation header | Archivo | 24px | 800 | "Bonjour [Prénom]" |
| Corps de texte | Inter | 14-15px | 400-500 | |
| Boutons | Inter | 15px | 600 | letter-spacing 0.01em |
| Labels formulaire | Inter | 11px | 600 | Majuscules, letter-spacing 0.14em |
| Sections (ex. "ACTIVITÉ RÉCENTE") | Inter | 11px | 600 | Majuscules, letter-spacing 0.16em |
| Tagline footer | Inter | 11px | 500 | Majuscules, letter-spacing 0.22em |

---

## 3. Style général

### Coins arrondis

| Usage | Rayon |
|---|---|
| Tuiles modules (page d'accueil) | 18px |
| Cartes (activité, listes) | 16px |
| Inputs, boutons | 14px |
| Petits éléments (icônes, badges) | 8-10px |

### Ombres

```css
/* Ombre carte standard */
box-shadow: 0 1px 2px rgba(28,61,82,0.04);

/* Ombre tuile module (avec accent couleur) */
box-shadow: 0 6px 14px -8px [color]99, 0 1px 0 rgba(255,255,255,0.5) inset;

/* Ombre bouton principal */
box-shadow: 0 8px 20px -8px rgba(28,61,82,0.5), 0 2px 4px rgba(28,61,82,0.15);
```

### Fond avec dégradés radiaux subtils

Pour donner de la profondeur sans surcharger, fond avec dégradés radiaux très légers (~10% opacité) basés sur la palette :

```css
background:
  radial-gradient(120% 60% at 80% -10%, rgba(42,143,168,0.10), transparent 55%),
  radial-gradient(100% 50% at 0% 100%, rgba(232,161,53,0.07), transparent 55%);
```

À placer en `position: absolute; inset: 0; pointer-events: none;` derrière le contenu.

---

## 4. Filigrane décoratif

Présent en arrière-plan sur Login et Home. Référence au logo Omnès Médecins (cercle + triangle géométrique). Opacité très faible (~5-7%), positions fixes, **non interactif** dans la version production.

### Login — filigrane

```jsx
<svg
  viewBox="0 0 375 812"
  preserveAspectRatio="xMidYMid slice"
  className="absolute inset-0 w-full h-full pointer-events-none"
>
  {/* Cercle en haut à droite */}
  <circle cx="433" cy="393" r="200" fill="none" stroke="#1C3D52" strokeOpacity="0.05" strokeWidth="2.2" />
  {/* Triangle en bas à gauche */}
  <path d="M -51 375 L -51 725 L 124 725" fill="none" stroke="#1C3D52" strokeOpacity="0.05" strokeWidth="2.2" strokeLinejoin="round" />
  <path d="M -51 375 L 124 725" fill="none" stroke="#1C3D52" strokeOpacity="0.05" strokeWidth="2.2" strokeLinecap="round" />
</svg>
```

### Home — filigrane (variante A)

```jsx
<svg
  viewBox="0 0 375 812"
  preserveAspectRatio="xMidYMid slice"
  className="absolute inset-0 w-full h-full pointer-events-none"
>
  <path d="M 405 -30 L 405 220 L 175 -30" fill="none" stroke="#1C3D52" strokeOpacity="0.07" strokeWidth="2" />
  <path d="M 175 -30 L 405 220" fill="none" stroke="#1C3D52" strokeOpacity="0.07" strokeWidth="2" strokeLinecap="round" />
  <circle cx="-40" cy="730" r="170" fill="none" stroke="#1C3D52" strokeOpacity="0.07" strokeWidth="2" />
</svg>
```

---

## 5. Composants à créer (architecture React)

### Composants de base réutilisables

```
src/components/
├── ui/
│   ├── Button.jsx          ← bouton principal (marine), secondaire, danger
│   ├── Input.jsx           ← input avec icône à gauche, focus ring canard
│   ├── Card.jsx            ← carte blanche avec border + shadow standard
│   ├── Badge.jsx           ← badge notification rouge style WhatsApp
│   └── PageHeader.jsx      ← header avec titre Archivo + sous-titre
├── layout/
│   ├── AppLayout.jsx       ← layout général (fond + filigrane optionnel + bottom nav)
│   ├── BottomNav.jsx       ← 3 onglets : Accueil / Rechercher / Profil
│   └── Filigrane.jsx       ← composant filigrane SVG (variants : login | home)
└── home/
    ├── HomeHeader.jsx      ← "MARDI 28 AVRIL" + "Bonjour [Prénom]"
    ├── ModuleTile.jsx      ← tuile colorée carrée (icône + libellé + badge optionnel)
    └── ActivityList.jsx    ← liste d'activité récente avec puces colorées
```

### Pages

```
src/pages/
├── Login.jsx
├── Home.jsx
├── Trombinoscope.jsx
├── Annuaire.jsx
├── CabinetPratique.jsx
├── Discussion.jsx
├── Evenements.jsx
├── SIM.jsx
├── Immobilier.jsx
├── Profil.jsx
└── Admin.jsx
```

---

## 6. Spécifications par écran

### Login

- **Fond** : `bg-fond` (#F5F7F9) avec dégradés radiaux subtils + filigrane SVG
- **Bloc logo en haut** : logo image + wordmark "OMNÈS MÉDECINS" en Archivo 22px / 900 + sous-titre "Organisation du cabinet"
- **Bloc formulaire** :
  - Titre "Bienvenue" (Archivo 22px / 800)
  - Sous-titre "Connectez-vous avec votre adresse e-mail." (Inter 14px, muted)
  - Label "ADRESSE E-MAIL" (Inter 11px, 600, uppercase, letter-spacing 0.14em, faint)
  - Input email (hauteur 54px, padding-left 46px pour l'icône, radius 14px, border `border` 1px)
  - Label "MOT DE PASSE"
  - Input password avec bouton œil à droite pour afficher/masquer
  - Ligne "Rester connecté" (checkbox canard) | "Mot de passe oublié ?" (lien canard)
- **Bouton "Se connecter"** : pleine largeur, hauteur 54px, fond marine, texte blanc, flèche → à droite, ombre prononcée
- **Footer** : tagline "UNE ÉQUIPE · 7J/7 · SUR RENDEZ-VOUS" (Inter 11px, 500, uppercase, letter-spacing 0.22em, faint, séparateurs = points)

### Home

- **Header** : "MARDI 28 AVRIL" (label uppercase faint) + "Bonjour [Prénom]" (Archivo 24px / 800, marine). **Pas d'avatar à droite** (supprimé).
- **Grille de tuiles** : 3 colonnes, gap ~9px, padding latéral ~16-22px, tuiles aspect-ratio 1/1
  - Chaque tuile : fond couleur du module, radius 18px, padding ~14px
  - Icône en haut à gauche dans pastille blanche translucide (rgba(255,255,255,0.18))
  - Libellé en bas à gauche, blanc, Inter 11-12px, 600
  - Badge notification : pastille blanche en haut à droite, texte couleur du module
  - **Modules invisibles selon rôle** (pas grisés, pas affichés du tout) → la grille se recompacte automatiquement, pas de trou
- **Section "ACTIVITÉ RÉCENTE"** sous la grille :
  - Titre Inter 11px, 600, uppercase, faint, letter-spacing 0.16em
  - Liste blanche dans une carte radius 16px avec bordures fines
  - Chaque item : puce colorée (couleur du module concerné) + titre + sous-titre muted + horodatage faint à droite
- **Bottom nav fixe en bas** : 3 onglets uniquement (Accueil / Rechercher / Profil), fond blanc translucide avec backdrop-blur, border-top fine

---

## 7. Bottom nav (BottomNav.jsx)

3 onglets exactement :

| # | Clé | Libellé | Icône |
|---|---|---|---|
| 1 | `home` | Accueil | maison |
| 2 | `search` | Rechercher | loupe |
| 3 | `user` | Profil | silhouette |

- Hauteur ~62px (incluant padding-bottom 28px pour la safe-area iOS)
- Fond `rgba(255,255,255,0.92)` + `backdrop-blur(20px)`
- Border-top `border` (1px, rgba marine 0.08)
- Onglet actif : icône + label en `marine`, label en weight 600
- Onglet inactif : icône + label en `faint`

---

## 8. Tuile module (ModuleTile.jsx)

Composant central réutilisé pour les 7 modules de la page d'accueil.

### Props

```jsx
<ModuleTile
  label="Trombinoscope"
  icon="team"
  color="canard"          // une des 6 couleurs de la palette
  badge={3}               // optionnel, nombre de notifications
  onClick={...}
/>
```

### Comportement

- aspect-ratio 1/1 (carré parfait)
- radius 18px
- fond = couleur passée en prop
- icône blanche dans pastille translucide blanche en haut à gauche
- libellé blanc en bas à gauche
- badge optionnel : pastille blanche en haut à droite, texte couleur de la tuile
- ombre colorée pour donner de la profondeur

### Liste des icônes utilisées (SVG inline ou lucide-react)

| Module | Icône (nom lucide ou custom) |
|---|---|
| Trombinoscope | `Users` (groupe de personnes) |
| Annuaire | `BookOpen` (carnet ouvert) |
| Cabinet pratique | `Building2` (immeuble) |
| Discussion | `MessageSquare` (bulle) |
| Événements | `Calendar` (calendrier) |
| SIM | `FileText` (document) |
| Immobilier | `Home` (maison) |

Recommandation : utiliser **`lucide-react`** comme bibliothèque d'icônes (cohérente, légère, bien maintenue, déjà compatible Tailwind).

---

## 9. À NE PAS reprendre du code Claude Design

Pour mémoire, ces éléments du prototype Claude Design ne doivent **pas** être portés dans le projet final :

1. **Tout le système `useTweaks` et `TweaksPanel`** — outil de prototypage interne
2. **Tout `ios-frame.jsx`** (`IOSDevice`, `IOSStatusBar`, `IOSNavBar`, `IOSGlassPill`, `IOSList`, `IOSKeyboard`) — l'app tournera dans un vrai navigateur mobile, pas besoin de mock device
3. **`WatermarkLayer` interactive** (drag & drop du filigrane) — on garde uniquement le filigrane statique
4. **La variante `HomeB`** (tuiles blanches) — on garde seulement HomeA (tuiles colorées)
5. **Les onglets "Discussion" et "Alertes"** dans la TabBar — bottom nav finale = 3 onglets
6. **L'avatar "CD" en haut à droite de la Home** — supprimé
7. **L'attribut `gated` + cadenas + opacité 0.5** sur la tuile SIM — les modules non accessibles n'apparaissent pas du tout, pas de cadenas
8. **Les données en dur "Camille", "il y a 2h", etc.** — à remplacer par les vraies données Supabase
9. **Tous les styles inline** (`style={{...}}`) — à réécrire en classes Tailwind

---

## 10. Conseils pour Claude Code à l'étape 1

Lors de l'initialisation du projet, demander explicitement :

1. Configuration Tailwind avec la palette ci-dessus dès la création du projet
2. Import des polices Google Fonts dans `index.html`
3. Test de la config en créant une page de démo qui affiche un échantillon de chaque couleur et chaque police, pour valider visuellement avant de continuer
4. **Ne pas commencer à coder Login ou Home tant que la config de base n'est pas validée**