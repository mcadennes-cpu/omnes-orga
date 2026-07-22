# Omnès Médecins — Application collaborative de cabinet médical

Application React (Vite) + Supabase, distribuée en PWA, pour la gestion
collaborative d'un cabinet médical (trombinoscope, annuaire, discussion,
événements, SIM, immobilier...).

**Doc de référence complète** : `docs/cabinet-medical-app.md` (stack, rôles,
modules, schéma Supabase, plan de développement, limitations connues). La
lire en début de session si le contexte du projet n'est pas déjà clair, et
la tenir à jour après chaque étape livrée.

## Règles à appliquer systématiquement

### Accents (français)

| Contexte | Accents |
|---|---|
| Texte UI (JSX : labels, boutons, messages) | **Oui** |
| Documentation Markdown (`docs/*.md`, ce fichier) | **Oui** |
| Code : variables, fonctions, fichiers, tables/colonnes SQL | **Non** |
| Requêtes SQL, migrations | **Non** |
| Messages de commit Git | **Non** |

### Rythme de travail

Matthieu est médecin généraliste, débutant en code — il pilote le projet et
apprend en même temps. En conséquence :

- Travailler **par phases explicitement découpées** (étape → sous-étapes),
  ne pas enchaîner plusieurs sous-étapes d'affilée sans repasser par lui.
- Après chaque sous-bloc, montrer le(s) fichier(s) modifié(s) et attendre
  une confirmation avant de continuer (sauf consigne contraire donnée pour
  la tâche en cours).
- **Ne jamais lancer `npm install`** (ou équivalent) sans validation
  préalable, même pour un paquet mineur.
- Expliquer brièvement le "pourquoi" des choix d'architecture (nouvelle
  table, RLS, pattern de composant...), pas seulement le "quoi".
- Ne pas lancer `git add` / `commit` / `push` automatiquement — c'est
  Matthieu qui les exécute, sauf demande explicite. Proposer un message de
  commit clair et sans accent en fin de sous-étape.

### Design UI

Consulter le skill `design-system-omnes` avant de créer ou modifier un
écran, composant, modale ou bouton — il documente les patterns déjà
utilisés dans le projet (couleurs, radii, avatars, défilement horizontal...).
