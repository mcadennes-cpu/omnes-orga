---
name: workflow-mentorat-omnes
description: Regles de fonctionnement pour travailler avec Matthieu sur le projet Omnes Medecins (medecin generaliste, debutant en code). Couvre les conventions d'accents FR, le rythme de validation par phases, la regle sur les installations de paquets, et le niveau d'explication pedagogique attendu. A appliquer SYSTEMATIQUEMENT des le debut de chaque session, sans que Matthieu ait a le repreciser.
---

# Workflow de travail — Matthieu / Omnès Médecins

Matthieu est médecin généraliste, débutant en code. Il pilote le projet avec
l'aide de Claude.ai en amont (qui mentore, valide les choix, prépare le code
à coller) et de Claude Code en exécution. Les règles ci-dessous s'appliquent
que ce soit toi qui codes directement ou que tu reçoives du code déjà préparé
par Claude.ai à intégrer.

## Accents : où oui, où non

| Contexte | Accents |
|---|---|
| Texte affiché à l'utilisateur dans l'UI (JSX : labels, boutons, messages) | **Oui**, français correctement accentué |
| Documentation Markdown du projet (`docs/*.md`) | **Oui**, français correctement accentué |
| Code : noms de variables, fonctions, fichiers, tables/colonnes SQL | **Non**, jamais d'accent |
| Requêtes SQL, migrations | **Non**, jamais d'accent (vérifié : aucun accent dans `docs/sql/*.sql` du projet) |
| Messages de commit Git | **Non**, jamais d'accent |
| Commentaires de code (`//`, `/* */`) | Tolérant — le code existant est inconsistant sur ce point (certains commentaires accentués, d'autres non). Pas la peine de corriger l'existant ; pour du nouveau code, accents autorisés mais pas obligatoires. Ne jamais bloquer dessus. |

## Rythme de validation

**Règle modifiée le 17/11/2026, à la demande de Matthieu** (même texte que
CLAUDE.md, qui fait foi) :

1. **Un plan d'abord** : en début d'étape, proposer le plan (découpage,
   choix d'architecture, questions de cadrage) et attendre son accord.
2. Une fois le plan accepté, **enchaîner le travail de l'étape** sans faire
   valider chaque sous-étape ni afficher chaque fichier au fil de l'eau.
3. **S'arrêter et demander** seulement : en cas de doute ou de choix entre
   options qui lui revient (produit, droits, sécurité, juridique) ; quand un
   essai en réel est nécessaire ; **avant toute écriture en production**
   (SQL sur la prod, déploiement de fonction, secret, push sur `main`).
4. En fin d'étape, résumer ce qui a été fait, les fichiers touchés et ce qui
   a été vérifié (lint, build, suites de test).

## Installation de paquets

**Ne jamais lancer `npm install` (ou équivalent) sans validation préalable.**
Proposer le paquet, expliquer pourquoi il est nécessaire, et attendre le feu
vert avant d'installer — même pour un paquet très courant ou une dépendance
mineure.

## Pédagogie

Matthieu n'est pas développeur de formation. Quand un choix architectural
est fait (nouvelle table, RLS, pattern de composant, nouvelle dépendance...),
expliquer brièvement le "pourquoi" et pas seulement le "quoi" — surtout si
le choix a des implications qu'il devra comprendre pour la suite (ex : soft
delete vs hard delete, RLS vs filtrage frontend, `SECURITY DEFINER`...).
Pas besoin de cours magistral à chaque fois : une ou deux phrases suffisent
si le concept est simple ou déjà vu dans le projet.

## Git

**Règle modifiée le 01/08/2026, puis le 17/11/2026.** Claude Code propose
lui-même le `git add` + `commit` dès qu'un bloc cohérent est terminé et
vérifié (lint, build, tests) : Matthieu approuve d'un clic via la demande de
permission. Ne pas lui faire coller les commandes à la main.

Message de commit clair et **sans accent** (cf. tableau des accents).

Le push sur `main` (= mise en production Vercel) attend toujours son « go ».

## Documentation projet

`docs/cabinet-medical-app.md` est le fichier de référence du projet (stack,
modules, plan de développement, limitations connues). Le lire en début de
session si le contexte n'est pas déjà clair. Le mettre à jour après chaque
étape/sous-étape livrée, dans le même style que l'existant (sections
"Livré" / "Écarts au plan initial" / "Limitations connues" quand pertinent).
