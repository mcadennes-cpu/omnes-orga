# Omnès Médecins — Application collaborative de cabinet médical

Application React (Vite) + Supabase, distribuée en PWA, pour la gestion
collaborative d'un cabinet médical (trombinoscope, annuaire, discussion,
événements, SIM, immobilier...).

**Doc de référence complète** : `docs/cabinet-medical-app.md` (stack, rôles,
modules, schéma Supabase, plan de développement, limitations connues). La
lire en début de session si le contexte du projet n'est pas déjà clair, et
la tenir à jour après chaque étape livrée.

**Module Agenda (étape 22) — ouvert à tous le 17/09/2026** : doc dédiée
`docs/integration-agenda.md` (plan en 8 étapes + suivi d'avancement, entrée
8H pour la bascule) — la lire avant tout travail sur ce module. Branche
`feature/module-agenda`, fusionnée dans `main` le 17/09. Le code source de
l'agenda d'origine est dans `reference-agenda/` : lecture seule, ne **jamais**
le modifier. Depuis la bascule, le schéma `agenda` est la production du
cabinet et l'appli Bolt est en pause : ne **plus jamais** lancer
`22-8A-1 ... --go`, et les suites de test qui écrivent sont bloquées (8F-5).

## Règles à appliquer systématiquement

### Accents (français)

| Contexte | Accents |
|---|---|
| Texte UI (JSX : labels, boutons, messages) | **Oui** |
| Documentation Markdown (`docs/*.md`, ce fichier) | **Oui** |
| Code : variables, fonctions, fichiers, tables/colonnes SQL | **Non** |
| Requêtes SQL, migrations | **Non** |
| Messages de commit Git | **Non** |

### Rythme de travail (règle modifiée le 17/11/2026)

Matthieu est médecin généraliste, débutant en code — il pilote le projet et
apprend en même temps. En conséquence :

- **Un plan d'abord, validé par lui** : en début d'étape, proposer le plan
  (découpage, choix d'architecture, questions de cadrage) et attendre son
  accord. Une fois le plan accepté, **enchaîner le travail de l'étape** sans
  faire valider chaque sous-étape une à une (plus besoin de montrer chaque
  fichier modifié au fil de l'eau).
- **S'arrêter et lui demander** seulement :
  - en cas de doute, ou quand un choix entre plusieurs options lui revient
    (produit, droits d'accès, sécurité, juridique) ;
  - quand un essai en réel est nécessaire (téléphone, vrais comptes, mails) ;
  - **avant toute écriture en production** : script SQL sur la base de prod,
    déploiement d'une Edge Function, pose d'un secret, push sur `main`.
- En fin d'étape (ou de bloc important), résumer ce qui a été fait, les
  fichiers touchés et ce qui a été vérifié (lint, build, suites de test).
- **Ne jamais lancer `npm install`** (ou équivalent) sans validation
  préalable, même pour un paquet mineur.
- Expliquer brièvement le "pourquoi" des choix d'architecture (nouvelle
  table, RLS, pattern de composant...), pas seulement le "quoi".
- **Git** : proposer soi-même le `git add` + `commit` dès qu'un bloc cohérent
  est terminé et vérifié (lint, build, tests) — Matthieu approuve via la
  demande de permission. Ne pas lui faire coller les commandes. Message clair
  et **sans accent**. Le push sur `main` (= mise en production Vercel)
  attend toujours son « go ».

### Design UI

Consulter le skill `design-system-omnes` avant de créer ou modifier un
écran, composant, modale ou bouton — il documente les patterns déjà
utilisés dans le projet (couleurs, radii, avatars, défilement horizontal...).
