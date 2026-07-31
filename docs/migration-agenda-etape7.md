# Étape 7 — Migration de l'agenda vers la base Omnès-Orga
> Document de travail de l'étape 7 · Complète `integration-agenda.md`
> Ouvert le 30/07/2026

L'étape 7 est réalisée **avant** l'étape 6 (MOD-1 / MOD-2) : ces deux chantiers
exigent de créer des tables et de modifier des contraintes, ce qui est interdit
sur la base Planning tant que l'appli Bolt tourne dessus. Justification complète
dans l'encadré du plan de développement de `integration-agenda.md`.

---

## 7A — Inventaire du schéma réel (FAIT le 30/07/2026)

Relevé directement sur le projet Supabase Planning de production
(`kldgvjxuojeeqhdrmaia`) via l'API Management, **en lecture seule**, puis
recoupé avec les 34 migrations d'origine conservées dans
`reference-agenda/supabase/migrations/`.

### Volumétrie

| Table | Lignes | | Table | Lignes |
|---|---:|---|---|---:|
| `shifts` | 2 684 | | `sites` | 2 |
| `requests` | 2 493 | | `opening_week_templates` | 2 |
| `rotation_assignment_rules` | 282 | | `week_templates` | 2 |
| `opening_week_template_items` | 101 | | `rotation_settings` | 1 |
| `week_template_items` | 76 | | `undo_buffer` | 1 |
| `profiles` | 39 | | `fixed_duty_patterns` | 0 |
| `shift_types` | 15 | | `events` | 0 |
| `rooms` | 12 | | | |
| `fixed_duty_series` | 9 | | **Total** | **~5 700** |

Volume faible : la migration tient largement dans des `INSERT` générés, sans
outillage lourd. `psql` n'est pas installé sur la machine — on passera par
l'API Management, comme pour tous les scripts `docs/sql/`.

### Objets à recréer

- **14 tables** + 1 vue (sur les 16 tables d'origine : `events` est écartée et
  `profiles` devient une vue sur `public.profiles` — voir plus bas)
- **65 policies RLS** (69 moins les 4 d'`events`) — **toutes à réécrire**, elles
  reposent sur `profiles.role = 'coordinator'` qui n'existe plus côté Orga
- **58 index** hors clés primaires et contraintes d'unicité
- **5 fonctions** et **9 triggers**

### Configuration en place

- Sites : **Beaune** (Salle 1 à 6) et **Dijon** (Cabinet B1 à B6) — 6 salles par
  site, conforme à `desiderata.yaml`.
- Roulement : 1 ligne de `rotation_settings`, 282 règles d'affectation.

---

## Les objets métier à préserver absolument

Trois éléments portent de la logique métier réelle et doivent être migrés
fidèlement — ce ne sont pas des détails techniques.

**`update_shift_status()`** (fonction + trigger sur `requests`) — le cœur du
circuit de validation. C'est elle qui bascule une garde en `pending` quand une
demande arrive, en `assigned` quand elle est approuvée, qui rejette
automatiquement les demandes concurrentes, et qui relibère la garde quand la
dernière demande est annulée. **Elle ne réagit qu'aux écritures sur `requests`** :
c'est ce qui avait rendu 42 gardes invisibles lors de l'incident du 29/07, un
`UPDATE` de masse ayant été fait directement sur `shifts`. À reproduire à
l'identique, y compris ce comportement.

**`unique_doctor_per_day`** — index unique partiel :
`UNIQUE (assigned_doctor_id, date) WHERE assigned_doctor_id IS NOT NULL AND status = 'assigned'`.
Règle métier implicite : **un médecin ne peut pas avoir deux gardes assignées le
même jour**. À conserver, et à vérifier avant l'import (un historique non
conforme ferait échouer la création de l'index).

**`unique_active_doctor_shift_request`** — index unique partiel :
`UNIQUE (shift_id, doctor_id) WHERE status IN ('pending','on_hold','approved')`.
Un médecin ne peut pas avoir deux demandes actives sur la même garde, mais peut
redemander après un refus.

---

## Écarts et défauts relevés — décisions pour 7C

### 1. Table `events` — à ne pas migrer

Présente en base avec 4 policies RLS et un trigger, mais **0 ligne** et
**aucune référence dans le code** (ni dans le module porté, ni dans le source
Bolt d'origine). Vestige d'un prompt abandonné. Écartée de la migration.

### 2. `shifts` est dénormalisée — à conserver en l'état pour l'instant

La table porte **deux fois** la même information :

```
location    text NOT NULL   +   site_id       uuid  → sites(id)
room        text NOT NULL   +   room_id       uuid  → rooms(id)
shift_type  text NOT NULL   +   shift_type_id uuid  → shift_types(id)
```

Les colonnes texte sont un vestige de la première version (avant l'introduction
des tables de configuration), mais elles sont **toujours activement lues**
(`MyScheduleView`, `DailyScheduleView`, `WeekView`, `DoctorWeekSummaryView`) et
**écrites** à la création (`CreateShiftModal`, `weekTemplateUtils`).

**Décision : migrer à l'identique.** Supprimer les colonnes texte suppose de
retoucher une dizaine de fichiers du module ; le faire pendant la migration
mélangerait deux risques. À traiter comme un chantier propre après l'étape 7.
**Risque connu en attendant** : renommer un site ou une salle dans les
paramètres ne met pas à jour les libellés déjà stockés dans `shifts`.

### 3. `shifts_location_check` fige les sites en dur — à supprimer

```sql
CHECK (location = ANY (ARRAY['Dijon'::text, 'Beaune'::text]))
```

Une contrainte en dur sur les noms de sites, alors que `sites` est justement une
table configurable. **Ouvrir un troisième site est aujourd'hui impossible sans
migration SQL** — ce qui contredit frontalement le cas d'usage « ouverture d'un
nouveau lieu » prévu par MOD-1. À ne pas reconduire.

### 4. `unique_shift` porte sur les libellés, pas sur les clés

```sql
UNIQUE (date, location, room, shift_type)
```

L'unicité d'une garde repose sur les colonnes texte. Conséquence : renommer une
salle permettrait de créer un doublon de la même garde. À basculer sur
`(date, site_id, room_id, shift_type_id)` — mais seulement une fois le point 2
traité, les deux sont liés. **Reconduite à l'identique en 7C**, corrigée après.

### 5. Clés étrangères incohérentes — à uniformiser

Quatre colonnes référencent `auth.users` là où toutes les autres référencent
`profiles` :

| Table | Colonne | Référence actuelle |
|---|---|---|
| `fixed_duty_patterns` | `default_doctor_id` | `auth.users` |
| `fixed_duty_series` | `created_by` | `auth.users` |
| `rotation_settings` | `updated_by` | `auth.users` |
| `week_templates` | `created_by` | `auth.users` |

**Décision : tout ramener sur `public.profiles`** côté Orga. Sans quoi le
remappage des identifiants devrait suivre deux chemins différents lors de
l'import, pour un résultat identique. Aucune perte : dans Planning, `profiles.id`
*est* `auth.users.id`.

### 6. Triggers `updated_at` manquants sur 3 tables

`rotation_assignment_rules`, `rotation_settings` et `week_templates` ont une
colonne `updated_at` avec un `DEFAULT now()`, mais **aucun trigger ne la met à
jour**. Elle reste donc figée à la date de création. Ajoutés en 7C-2 — c'est
précisément ce type d'horodatage qui a permis de reconstituer l'incident du
29/07.

*(Rectification : ce point annonçait 4 tables au relevé initial.
`week_template_items` n'a pas de colonne `updated_at` du tout, il n'y avait donc
rien à corriger de ce côté.)*

### 7. Policies RLS en double

Quatre tables ont deux policies `SELECT` qui se recouvrent (`shifts`,
`rotation_settings`, `opening_week_templates`, `opening_week_template_items`) —
héritage de l'empilement de prompts. Comme les policies sont **entièrement
réécrites** de toute façon, elles seront dédupliquées au passage.

### 8. `profiles.role` disparaît

Le `CHECK (role IN ('coordinator','doctor'))` de Planning n'a plus lieu d'être :
côté Orga, le rôle applicatif est différent et le rôle coordinateur devient une
désignation explicite (`is_agenda_coordinator`, voir ci-dessous).

---

## Architecture retenue

### Un schéma PostgreSQL dédié `agenda`

Les 14 tables sont créées dans un schéma `agenda`, pas dans `public`.

**Pourquoi** : les noms `shifts`, `sites`, `rooms`, `requests` sont trop
génériques pour cohabiter avec les tables de l'appli principale. Surtout, le
client Supabase se configure **une seule fois** avec `db: { schema: 'agenda' }`,
et les quelque 40 fichiers du module gardent leurs `.from('shifts')` inchangés.
Avec un préfixe `agenda_`, il faudrait retoucher chaque appel.

### Une vue `agenda.profiles` sur `public.profiles`

Le module lit partout une table `profiles` au format Planning
(`id`, `email`, `full_name`, `role`, `is_active`). Côté Orga, le format diffère :
`nom` et `prenom` sont séparés, `actif` remplace `is_active`, et le rôle n'a pas
les mêmes valeurs.

Une **vue** fait la traduction :

```sql
create view agenda.profiles with (security_invoker = true) as
  select id,
         email,
         prenom || ' ' || nom              as full_name,
         case when is_agenda_coordinator
              then 'coordinator' else 'doctor' end as role,
         actif                              as is_active
  from public.profiles;
```

**Pourquoi une vue** : c'est le **point unique** de traduction Orga → agenda, au
lieu de disperser le mapping dans le code. Le module n'écrit plus dans `profiles`
depuis l'étape 3A (les écrans de gestion de comptes ont été supprimés), donc une
vue en lecture suffit. `security_invoker = true` fait que les RLS de
`public.profiles` continuent de s'appliquer normalement.

### Le rôle coordinateur devient une désignation explicite

Colonne `profiles.is_agenda_coordinator boolean NOT NULL DEFAULT false`, à créer
en 7C. Le mapping depuis le rôle applicatif est **insuffisant** : Matthieu et
Charlotte sont tous deux `super_admin` sur Orga, mais une seule est
coordinatrice. Ce point était déjà identifié depuis l'étape 4.

### Validation technique (test réalisé le 30/07/2026)

**La question critique était : PostgREST sait-il embarquer une vue ?** Le module
fait partout des `select('*, profiles(...)')`, et la relation n'existe que sur la
table sous-jacente — la clé étrangère pointe vers `public.profiles`, pas vers la
vue.

Test mené sur le projet Orga avec des objets jetables préfixés `zz_test_`
(table portant une clé étrangère vers `public.profiles` + vue en
`security_invoker`), puis supprimés. **Résultat : la jointure imbriquée
fonctionne** — PostgREST infère la relation depuis la clé étrangère de la table
de base et retourne bien l'objet imbriqué, `full_name` concaténé compris :

```json
{"id":"…","date":"2026-07-30",
 "zz_test_profiles":{"full_name":"Christophe BERTRAND","is_active":true}}
```

**Note** : le test n'a pas été fait dans un schéma séparé, car exposer un nouveau
schéma modifie la configuration PostgREST du projet et **provoque un redémarrage
de l'API** — à ne pas déclencher sur la base de production de l'appli principale
pour un simple essai. Le mécanisme d'inférence testé est le même, mais **deux
points restent à confirmer en 7C**, au moment où le schéma `agenda` sera
réellement créé :

1. **L'ambiguïté de nom.** Une fois `agenda` exposé, deux objets s'appellent
   `profiles` : la table `public.profiles` et la vue `agenda.profiles`. Le client
   étant configuré sur le schéma `agenda`, c'est la vue qui doit primer — à
   vérifier, une ambiguïté se signalerait par une erreur `PGRST201`.
2. **Le comportement RLS de la vue.** Le test a tourné avec la clé
   `service_role`, qui contourne la RLS : il ne prouve donc rien sur
   `security_invoker`. À revérifier avec une vraie session utilisateur en 7E.

Repli si l'un des deux échoue : une **table** `agenda.doctors` synchronisée par
trigger depuis `public.profiles`, au lieu d'une vue. Plus lourd, mais sûr.

### ⚠️ À prévoir en 7C : un redémarrage de l'API

Ajouter le schéma `agenda` à la liste des schémas exposés est une modification de
configuration du projet Supabase, qui **redémarre PostgREST** — quelques secondes
pendant lesquelles l'appli principale ne répond pas. À faire à une heure creuse,
et à annoncer si nécessaire.

---

## 7B-1 — Correspondance des comptes (FAIT le 30/07/2026)

Exports des `profiles` des deux côtés, rapprochement par email normalisé, puis
arbitrage manuel des cas restants avec Matthieu. Résultat dans
**`docs/mapping-comptes-agenda.csv`** (39 lignes).

| Statut | Nombre | Suite |
|---|---:|---|
| `ASSOCIE_MAPPE` | 8 | Rapprochés automatiquement par email |
| `ASSOCIE_MAPPE_MANUEL` | 1 | Xavier BAUDRILLART — double adresse, arbitré |
| `REMPLACANT_A_CREER` | 26 | Comptes à créer dans Orga (7B-2) |
| `ECARTE_TEST` | 4 | Non migrés |

Planning comptait **39 profils** contre **12** côté Orga : l'essentiel du travail
de 7B-2 est donc la création des **26 comptes de remplaçants**, et non le
rapprochement des associés.

### Les 9 associés du roulement — et les initiales du fichier Excel

En isolant les profils porteurs de règles de roulement, on obtient exactement
**9 profils** : ce sont les 9 associés du roulement, et ils correspondent trait
pour trait aux 9 initiales du fichier Excel. **La table de correspondance
initiales → comptes, annoncée comme indispensable et impossible à deviner pour
MOD-1, est donc établie** — et déduite des données plutôt que saisie à la main.

| Initiales | Médecin | Règles |
|---|---|---:|
| `MY` | Mireille YUAN | 36 |
| `TE` | Thomas ETIENNE | 32 |
| `XB` | Xavier BAUDRILLART | 32 |
| `AS` | Airelle SAUVAGE | 31 |
| `CB` | Christophe BERTRAND | 31 |
| `IEG` | Imane EL GARI | 31 |
| `CC` | Caroline CHAUVET | 30 |
| `LD` | Laurène DAUDIN | 30 |
| `MC` | Matthieu CADENNES | 29 |

### Arbitrages rendus par Matthieu

**Xavier BAUDRILLART** — seul associé sans correspondance d'email : il possède
deux adresses, une par application. Confirmé comme une seule et même personne ;
ses 165 gardes et 32 règles sont rattachées à son compte Orga. Après migration,
l'authentification passe par Omnès-Orga et l'adresse Planning devient sans objet.

**Le coordinateur devient nominatif.** Le seul compte `coordinator` de Planning
s'appelle `Coordinateur Admin` : un compte **générique et partagé**, sans aucune
activité nominative, avec lequel Charlotte Franzino se connecte. Il n'est pas
migré. Après bascule, **Charlotte est la seule coordinatrice**
(`is_agenda_coordinator = true` sur son compte personnel).

**Les associés gérants n'ont pas les droits coordinateur** — cette question
restait ouverte depuis l'étape 1, elle est tranchée : seule Charlotte est
coordinatrice. Caroline Chauvet, Thomas Étienne et Xavier Baudrillart restent
`doctor` sur l'agenda malgré leur rôle `associe_gerant` côté Orga. C'est ce qui
justifie la colonne `is_agenda_coordinator` plutôt qu'un mapping depuis le rôle
applicatif.

**Comptes écartés** : `Dr One`, `Dr two`, `Dr 3` et `Coordinateur Admin`. Coût
assumé : **1 garde et 4 demandes de test** abandonnées. `Dr Mathilde LEDOUX`,
sans activité mais vraie remplaçante, **est conservée** et fait partie des 26
comptes à créer.

---

## 7B-2 — Création des comptes de remplaçants (FAIT le 30/07/2026)

**26 comptes créés dans Omnès-Orga, 0 échec.** Le mapping est désormais complet :
les 35 lignes à migrer ont toutes un identifiant cible, seules les 4 lignes
`ECARTE_TEST` restent sans correspondance, volontairement.

### Pourquoi maintenant et pas à l'étape 8

`profiles.id` est une clé étrangère vers `auth.users` : **on ne peut pas créer un
profil sans compte d'authentification**. Or les 2 684 gardes et 2 493 demandes à
importer référencent ces médecins. Sans ces comptes, l'import échoue. L'étape 8
se limitera donc à les **activer** et à envoyer les invitations.

### Procédé

Pour chacun des 26 (script `creer-remplacants.py`) :

1. `POST /auth/v1/admin/users` avec un mot de passe aléatoire et
   `email_confirm: false` — **aucun email envoyé, personne n'est notifié**. Le
   mot de passe n'est conservé nulle part : l'accès se fera par réinitialisation
   à l'étape 8.
2. Le trigger `handle_new_user` crée le profil, mais avec **nom et prénom vides**
   et `actif = true` — d'où la troisième étape.
3. `UPDATE profiles` : `nom`, `prenom` et `actif = false`.

Le découpage `full_name` → prénom/nom applique la règle « les mots en majuscules
sont le nom » après retrait du préfixe `Dr`. Vérifiée sur les 26, particules
comprises (`LE MOUËLLE`, `DE CONTENSON`, `DE MONTAIGNE DE PONCINS`) et prénoms
composés (`Marie-Fleur`, `Anne-Eugénie`). Zéro cas douteux.

**Garde-fou** exécuté avant toute écriture : aucun des 26 emails ne devait déjà
exister dans `auth.users`. Vérifié, le script s'arrêtait sinon.

### Contrôles après création

| Contrôle | Résultat |
|---|---|
| Profils au total | 38 (12 + 26) |
| Remplaçants créés, tous `actif = false` | 26 |
| Profils sans nom | 0 |
| **Médecins visibles au trombinoscope** | **10 — inchangé** |
| Nouveaux comptes confirmés à tort | 0 |
| Nouveaux comptes déjà connectés | 0 |

**Aucun effet visible pour les associés** : les cinq endroits de l'appli
principale qui lisent `profiles` (trombinoscope, sélecteur de membres,
destinataires des sondages d'événements…) filtrent tous sur `actif = true`.

**Réversibilité** : tant que l'import 7D n'a pas eu lieu, un `DELETE` sur les
comptes `auth.users` correspondants supprime tout en cascade.

### Constat annexe — 8 comptes d'authentification orphelins

Relevé au passage, **sans rapport avec l'agenda** : la base Orga contient
8 comptes `auth.users` **sans profil associé**, créés entre mai et juin 2026.
Ce sont manifestement des comptes de test du développement de l'appli principale
(`dr.martin@fictif.local`, `mireille@hello.com`, `mcadennes+1@gmail.com`…) dont
le profil a été supprimé sans supprimer le compte. Deux d'entre eux se sont
connectés en juin.

Ils sont sans effet sur la migration, mais un utilisateur qui se connecterait
avec l'un d'eux se retrouverait sans profil, dans un état non prévu par l'appli.
**À nettoyer un jour, hors périmètre de l'étape 7** — aucune action prise.

---

## 7C-1 — Création du schéma et des tables (FAIT le 30/07/2026)

Script `docs/sql/22-7C-1-agenda-schema-tables.sql`, exécuté sur le projet Orga.

| Objet | Résultat |
|---|---|
| Tables créées dans `agenda` | 14 |
| Vue `agenda.profiles` | 1 |
| Index | 75 |
| Tables avec RLS activée | 14 |
| Colonne `is_agenda_coordinator` | créée |

**Contrôle par comparaison directe avec le schéma Planning** : les 14 tables sont
identiques **colonne par colonne** (types compris), et le nombre d'index
correspond **table par table**, 75 des deux côtés. La vue renvoie bien le format
attendu par le module (`full_name` concaténé, `role` calculé, `is_active`).

### Choix d'implémentation

**Les clés étrangères pointent vers `public.profiles`, pas vers la vue** —
PostgreSQL n'autorise pas de clé étrangère vers une vue. La vue sert à la lecture
par le module ; l'intégrité référentielle s'appuie sur la table réelle. C'est
exactement la configuration validée par le test PostgREST de 7A.

**RLS activée dès la création, sans aucune policy** : tout est fermé jusqu'à
7C-3. À aucun moment une table n'est ouverte en grand.

**Droits accordés à `authenticated` seulement, pas à `anon`.** Supabase accorde
par défaut aux deux sur `public`, en s'en remettant à la RLS ; ici le module
exige une session, autant ne pas ouvrir un accès anonyme inutile.

**Index** : 55 index explicites (les 58 d'origine moins les 3 de `profiles`,
devenue vue), auxquels s'ajoutent 14 clés primaires et 6 contraintes d'unicité
en ligne — soit les 75 relevés.

Le script **n'est pas idempotent** : le rejouer échouerait. Volontaire. Les
instructions étant envoyées en un seul appel, PostgreSQL les traite comme une
transaction unique — un échec en cours de route annule tout.

**Reste à faire en 7C-3** : poser `is_agenda_coordinator = true` sur le compte de
Charlotte Franzino. Sans policy, la colonne n'a encore aucun effet.

---

## 7C-2 — Fonctions et triggers (FAIT le 30/07/2026)

Script `docs/sql/22-7C-2-agenda-fonctions-triggers.sql`. **2 fonctions, 10
triggers.** Principe appliqué : **iso-comportement**.

### Le workflow de pré-validation, expliqué par Matthieu

Explication métier recueillie le 30/07/2026, absente de toute documentation
jusque-là — elle éclaire le « pourquoi » de tout le circuit :

> La pré-validation est **le brouillon de travail de la coordinatrice**.
> Charlotte voit toutes les demandes sur un ou deux mois et pré-valide au fur et
> à mesure (la case passe en bleu). **Le médecin n'est pas prévenu.** Elle peut
> revenir en arrière et remplacer un médecin par un autre — parce qu'il a moins
> de gardes, ou pour éviter une série trop longue. Tout cela est invisible des
> médecins, sinon ils recevraient des notifications d'assignation et
> d'annulation en permanence. Quand le planning entier lui convient, elle valide
> définitivement en une fois : c'est seulement à ce moment que les médecins
> voient leurs gardes.

Conséquence directe : **pendant toute la phase de brouillon, la garde reste en
`pending`**. Elle ne passe en `assigned` qu'à la validation finale.

### Pourquoi migrer à l'identique plutôt que corriger

L'analyse du trigger a fait apparaître une **asymétrie** : le retrait d'une
pré-validation libère la garde **sans vérifier** qu'elle est encore en `pending`,
alors que le refus et l'annulation, eux, le vérifient.

L'explication du workflow montre que c'est **sans effet dans le flux réel** : au
moment où Charlotte retire une pré-validation, la garde est forcément encore en
attente. Le cas ne devient atteignable que par un chemin de traverse — une
**attribution directe** qui croiserait une pré-validation encore active sur la
même garde. Rare, mais réel, et c'est le même schéma que l'incident du 29/07 :
une action dont le périmètre dépasse ce qu'elle annonce.

Décision : **conservé tel quel**, et documenté en commentaire dans le SQL. Une
migration à comportement constant est vérifiable — toute différence constatée
après la bascule est un vrai problème, et non un changement qu'on aurait
introduit soi-même. La correction relève de MOD-2, qui prévoit déjà le journal
d'activité et le garde-fou de cohérence.

### Écarts assumés, sans effet observable

- Les **3 fonctions `updated_at` d'origine étaient strictement identiques**
  (même corps, caractère pour caractère) : une seule est reprise,
  `agenda.set_updated_at()`.
- **3 triggers `updated_at` ajoutés** (voir écart n°6).
- `create_profile_for_user` **non reprise** : gestion des comptes, du ressort de
  l'appli principale depuis l'étape 3A.
- `search_path` passé de `'public'` à `'agenda'` — indispensable, la fonction
  référence `shifts` et `requests` sans qualifier leur schéma.
- `SECURITY DEFINER` **conservé** : un médecin qui crée une demande n'a pas le
  droit d'écrire dans `shifts`. C'est la fonction, exécutée avec les droits de
  son propriétaire, qui fait basculer la garde. Sans cela le circuit se bloque
  dès la première demande.
- La note de rejet automatique reste en anglais (`Another doctor was assigned to
  this shift`, 962 occurrences en base). Elle n'est **affichée nulle part** dans
  l'interface ; la traduire créerait deux formulations dans l'historique.

### Test de bout en bout

Le circuit complet a été rejoué sur des données jetables, puis effacé (tables
vérifiées vides ensuite) :

| Étape | Résultat |
|---|---|
| Garde créée | `free` |
| Le Dr A demande | garde → `pending` |
| Le Dr B demande aussi | les deux demandes coexistent |
| Pré-validation du Dr A | garde reste `pending`, Dr A posé dessus |
| Retrait de la pré-validation | garde reste `pending` (demande du Dr B active), plus aucun médecin posé |
| Validation du Dr B | garde → `assigned`, attribuée au Dr B |
| Demande concurrente du Dr A | passée en `rejected` automatiquement |

Le circuit se comporte exactement comme le workflow décrit ci-dessus.

---

## 7C-3 — Policies RLS (FAIT le 30/07/2026)

Script `docs/sql/22-7C-3-agenda-rls-policies.sql`. **57 policies** sur les 14
tables — les 61 de Planning (65 moins les 4 de `profiles`, devenue une vue qui
hérite des RLS de `public.profiles`), moins **4 doublons `SELECT`** fusionnés.

### Deux fonctions plutôt que le même test recopié 57 fois

L'inventaire a montré que **29 policies sur 65** disaient exactement la même
chose : « je suis coordinateur », sous la forme d'un `EXISTS` de quatre lignes
répété à l'identique. Le mapping vers Orga aurait donc consisté à recopier 57
fois la même traduction.

À la place, deux fonctions centralisent les conditions :

```sql
agenda.peut_acceder()      -- compte actif + agenda_beta_access
agenda.est_coordinateur()  -- + is_agenda_coordinator
```

Les policies deviennent lisibles (`using (agenda.peut_acceder())`), et surtout
**la sortie de bêta devient une seule ligne à retirer dans une fonction**, au
lieu de reprendre 57 policies. Les fonctions sont `stable` (évaluées une fois par
requête et non par ligne) et `security definer` (elles lisent `public.profiles`
sans dépendre des policies de cette table, ce qui écarte tout risque de
récursion entre policies).

### Décisions

**Le filtre bêta est dans la base, pas seulement dans l'interface.** À partir de
7D, les données vivent dans la base que les 10 associés utilisent quotidiennement
avec leur session : ce n'est plus la tuile masquée qui protège l'agenda, ce sont
les policies. Ce qui serait exposé sans ce filtre : non pas le planning (que tout
le monde voit de toute façon), mais les **demandes des autres médecins** et les
**notes du coordinateur**.

**Les comptes désactivés sont bloqués par la base** (choix de Matthieu) —
durcissement par rapport à Planning, qui ne vérifiait pas ce point. Concerne
directement les 26 remplaçants créés en 7B-2, et tout départ futur.

**Le faux filtre `is_active` est conservé tel quel.** Les policies d'origine
nommées « voir les sites/salles/créneaux **actifs** » avaient pour condition
`is_active = true OR auth.uid() IS NOT NULL` — toujours vraie pour un utilisateur
connecté. Elles ne filtraient donc rien, et c'est heureux : un vrai filtre
masquerait le lieu des gardes passées rattachées à un site depuis désactivé.
Reconduit en `peut_acceder()`, avec le commentaire qui l'explique.

**Simplification à la création d'une demande** : la policy d'origine exigeait en
plus `role = 'doctor'`. Redondant — un coordinateur est déjà couvert par sa
propre policy. Résultat identique.

### Test par usurpation d'identité

Policies testées en se faisant passer pour quatre profils réels (données
jetables, supprimées ensuite ; tables vérifiées vides) :

| Profil | Gardes | Demandes | Modèles de semaine | |
|---|---:|---:|---:|---|
| **Charlotte** (coordinatrice) | 2 | 2 | 1 | voit tout |
| **Matthieu** (médecin, bêta) | 2 | **1** | **0** | ne voit que **sa** demande, pas les modèles |
| **Associé hors bêta** | **0** | **0** | — | `peut_acceder()` = faux |
| **Remplaçant désactivé** | **0** | — | — | `peut_acceder()` = faux |

Les quatre comportements attendus sont vérifiés : planning ouvert à tous,
demandes cloisonnées par médecin, outils de coordination réservés, et double
verrou bêta + compte actif effectif au niveau de la base.

**Charlotte Franzino** est désignée coordinatrice (`is_agenda_coordinator`), et
elle dispose bien de l'accès bêta.

---

## 7D — Import des données (FAIT le 30/07/2026)

**5 664 lignes importées** dans le schéma `agenda` de la base Orga, avec
remappage complet des identifiants de profils. Script `import-7d.py`.

| Table | Lignes | | Table | Lignes |
|---|---:|---|---|---:|
| `shifts` | 2 681 | | `rooms` | 12 |
| `requests` | 2 481 | | `fixed_duty_series` | 9 |
| `rotation_assignment_rules` | 282 | | `sites` | 2 |
| `opening_week_template_items` | 101 | | `week_templates` | 2 |
| `week_template_items` | 76 | | `opening_week_templates` | 2 |
| `shift_types` | 15 | | `rotation_settings` | 1 |

`undo_buffer` n'est pas importée (données jetables, structure seule).
`fixed_duty_patterns` était déjà vide.

### Contrôles préalables — historique sain

Avant tout import, vérifié côté Planning : **aucun** doublon médecin/jour (qui
aurait fait échouer `unique_doctor_per_day`), **aucun** doublon de demande
active, **aucun** doublon `unique_shift`, **aucune** demande orpheline, **aucune**
garde sans site, salle ou créneau. La réparation du 29/07 a laissé une base
propre.

### Le trigger métier désactivé pendant l'import

`trigger_update_shift_status` a été **désactivé** le temps d'insérer `requests`,
puis réactivé (état vérifié : `ACTIF`). Sans cela, chaque demande insérée aurait
réécrit le statut de la garde correspondante — l'import se serait « corrigé »
lui-même et aurait produit un état différent de l'original.

### Découverte : `Coordinateur Admin` est le compte de travail de Charlotte

Prévu comme compte de test à écarter en 7B-1, l'inventaire des références a
montré qu'il est en réalité l'auteur de :

- **259 gardes**
- **282 règles de roulement — la totalité**
- **2 modèles de semaine**

Et `week_templates.created_by` étant `NOT NULL`, l'écarter aurait fait **échouer**
l'import des modèles. Décision de Matthieu : **tout rattacher à Charlotte
Franzino**. Son travail est ainsi conservé et attribué nominativement, tandis que
le compte générique disparaît. Vérifié après import : 259 gardes et 282 règles
portent bien son nom.

Restent écartés : `Dr One`, `Dr two`, `Dr 3` — avec **1 garde** (assignée à
`Dr 3`) et **6 demandes** (4 de `Dr One`, 2 portant sur la garde écartée).

### Autre constat : `reviewed_by` n'est jamais renseigné

**Aucune** des 2 487 demandes ne porte de validateur. La colonne existe et le
trigger sait la remplir, mais l'interface ne la transmet jamais. On ne peut donc
pas savoir qui a validé quoi — un manque que le journal d'activité de MOD-2
comblerait.

### Vérifications après import

| Contrôle | Résultat |
|---|---|
| Gardes `assigned` sans médecin | 0 |
| Gardes `free` avec un médecin | 0 |
| Demandes orphelines | 0 |
| Gardes sans site, salle ou créneau | 0 |
| Médecins distincts sur les gardes | 33 |
| Médecins distincts sur les demandes | 28 |
| Trigger métier | ACTIF |
| Amplitude des données | 29/12/2025 → 03/01/2027 |
| Gardes à venir | 1 149, dont 137 libres |

### ⚠️ La photo est déjà périmée — et c'est beaucoup plus rapide que prévu

La comparaison des statuts après import montre des écarts (gardes `assigned`
−6, demandes `pending` +15…). Vérification faite, ils **ne viennent pas de
l'import** mais de l'activité réelle : au moment de la copie, Planning
enregistrait **199 demandes validées et 109 gardes modifiées dans les 30
dernières minutes** — Charlotte était en pleine session de validation du
planning.

**Enseignement pour la bascule** : le delta n'est pas un détail. Une session de
travail de la coordinatrice produit plusieurs centaines de modifications en une
demi-heure. Le script 7F doit donc être une vraie resynchronisation, et la
bascule doit se faire à un moment où personne ne travaille dans Bolt.

---

## 7E — Bascule du module sur la base Orga (FAIT le 31/07/2026)

Le module ne parle plus au projet Planning. Il lit et écrit dans le schéma
`agenda` du projet principal, avec la session Omnès-Orga de l'utilisateur.

### Exposition du schéma — le redémarrage annoncé

`db_schema` est passé de `public,graphql_public` à
`public,graphql_public,agenda` via l'API Management. Vérifié juste après :
l'appli principale répond toujours (HTTP 200 sur `public.profiles`).

**Le rôle `anon` est refusé sur le schéma `agenda`** (`permission denied`) —
conforme à la conception de 7C-1, qui n'accorde `usage` qu'à `authenticated`.

### Le point PostgREST resté ouvert depuis 7A est résolu

Les trois formes de jointure utilisées par le module ont été testées sur les
données réelles :

| Requête | Résultat |
|---|---|
| `shifts` → `assigned_doctor:profiles!assigned_doctor_id(...)` | ✓ « Hortense NAUDION » |
| `shifts` → `sites`, `rooms`, `shift_types` imbriqués | ✓ Beaune / Salle 1 / J1 Beaune |
| `requests` → `doctor:profiles!doctor_id(...)` + `shifts!inner(...)` | ✓ |

**Aucune ambiguïté `PGRST201`** malgré la coexistence de `public.profiles` et
`agenda.profiles` : le client étant scopé sur `agenda`, c'est la vue qui prime.
Et le `full_name` est bien reconstitué à la volée depuis les colonnes d'Orga.

Les hints du module sont des **noms de colonnes** (`profiles!assigned_doctor_id`)
et non des noms de contraintes : rien ne dépendait donc des noms générés par
PostgreSQL.

### Bascule du client en un point unique

`lib/supabase.ts` n'instancie plus de second client : il réexporte celui de
l'appli principale, scopé au schéma.

```ts
export const supabase = clientOrga.schema('agenda');  // requêtes de données
export const supabaseOrga = clientOrga;               // auth et temps réel
```

Les ~40 fichiers qui font `.from('shifts')` sont **inchangés** — c'était tout
l'intérêt du schéma dédié (décision de 7A).

**Piège rencontré** : `.schema()` renvoie un client PostgREST, qui porte
`.from()` et `.rpc()` mais **ni `.auth` ni `.channel()`**. Les 4 appels
d'authentification et les 12 abonnements temps réel ont donc été redirigés vers
le client complet. Sans cela, le module plantait au premier rendu de chaque vue.

**Deux imports manquants** (`AssignDoctorModal`, `useShiftDetail`) ont été
attrapés par un contrôle systématique des symboles utilisés sans import : le
build ne les signale pas, faute de vérification de types. Illustration concrète
de la dette « pas de `tsc` sur le module » identifiée à l'étape 4 — ces deux
oublis auraient produit une erreur au premier clic.

### Le temps réel n'a jamais fonctionné

Les 12 abonnements écoutaient `schema: 'public'` alors que les tables sont
maintenant dans `agenda` — corrigé. Mais en vérifiant la publication
`supabase_realtime`, **côté Planning aucune table n'y a jamais été ajoutée** :
ces abonnements n'ont donc jamais rien reçu, ni dans Bolt ni dans le module. Les
vues se rafraîchissent uniquement à la navigation ou après une action.

**Non activé pour l'instant** : ce serait un changement de comportement au
milieu d'une migration. Mais le travail est fait — les abonnements pointent
désormais sur le bon schéma, et l'activer ne demandera qu'une ligne SQL
(`alter publication supabase_realtime add table agenda.shifts, agenda.requests;`).
Gain attendu : Charlotte verrait les demandes arriver en direct, les médecins
verraient les gardes se libérer. **À proposer en étape 8.**

### Les vraies photos des médecins

La vue de 7C-1 n'exposait que le format strict de Planning : `<Avatar>` ne
pouvait donc afficher que des initiales, alors que les vraies photos étaient
annoncées comme un bénéfice de l'étape 7. Corrigé par
`docs/sql/22-7E-1-agenda-vue-profiles-avatars.sql`, qui ajoute `prenom`, `nom`,
`photo_url` et `updated_at` à la vue. `DailyScheduleView` passe désormais le
profil réel à `<Avatar>` au lieu de le reconstruire depuis le nom.

Sur les **33 médecins** présents au planning, **9 ont une photo** (les associés)
et 24 gardent leurs initiales colorées — les remplaçants, dont les comptes
viennent d'être créés.

### Supprimé

- `hooks/useAgendaSession.ts` et `components/PlanningLinkPage.tsx` — l'écran de
  liaison et la session Planning n'ont plus d'objet.
- Le bouton « Délier le compte Planning » du header.
- Les variables `VITE_AGENDA_SUPABASE_URL` / `VITE_AGENDA_SUPABASE_ANON_KEY`
  du `.env`, et l'écran d'erreur de configuration qui les mentionnait.
- `mapOrgaRoleToAgenda()` — le mapping depuis le rôle applicatif, remplacé par
  la désignation explicite `is_agenda_coordinator`.

`buildAgendaUser()` construit maintenant l'utilisateur à partir du seul profil
Orga, dans exactement le même format que la vue `agenda.profiles`.

**Build** : 2 003 modules, aucune erreur.

### Validation par Matthieu (31/07/2026)

**Vues médecin testées et validées** dans le navigateur après bascule :
ouverture directe de `/planning` sans écran de liaison, calendrier, « Mes
gardes » et « Planning du jour » corrects, photos affichées. La chaîne complète
fonctionne — session Omnès-Orga, lecture du schéma `agenda`, jointures vers la
vue `agenda.profiles`.

**Reste à tester : les vues coordinateur** (Demandes, Paramètres). Elles ne
s'affichent que pour un profil `is_agenda_coordinator`, et ce sont les écrans
les plus complexes du module : validation en masse des pré-validations,
roulement, modèles de semaine, export. Se poser temporairement le drapeau
suffit — sans risque désormais, le module travaillant sur une copie.

---

## 7F — Script de resynchronisation (FAIT le 31/07/2026)

`docs/sql/22-7F-resynchronisation-agenda.py`. **Il remplace le script de 7D**,
dont il reprend l'import en y ajoutant une purge préalable et des garde-fous.

```
python3 docs/sql/22-7F-resynchronisation-agenda.py        # simulation (défaut)
python3 docs/sql/22-7F-resynchronisation-agenda.py --go   # exécute
```

Le mode **simulation est le comportement par défaut** : un script destructif ne
doit pas s'exécuter par simple inadvertance. Il affiche le différentiel table
par table sans rien toucher.

### Recopie complète plutôt que différentiel

Avec ~5 700 lignes et une minute d'exécution, tout recopier est **plus sûr** que
calculer un delta : aucune suppression ne peut être oubliée, il n'y a pas de
logique de comparaison à maintenir (et donc pas de bug possible dedans), et le
script est idempotent — on peut le rejouer autant qu'on veut.

### Le garde-fou qui compte

Si Charlotte crée un compte de remplaçant dans Bolt d'ici la bascule, ce profil
n'existera pas côté Orga. Ses gardes seraient alors importées **sans médecin,
silencieusement**. Le script détecte ce cas, nomme les profils concernés et
**s'arrête** :

```
Profils présents dans Planning mais absents du mapping :
  - Dr Untel
ARRET : créer ces comptes dans Omnès-Orga et compléter
docs/mapping-comptes-agenda.csv avant de resynchroniser
```

Il refuse également de tourner si l'historique Planning présente une
incohérence (doublon médecin/jour, demande orpheline), et vérifie après coup
les comptages table par table ainsi que l'intégrité.

La décision sur `Coordinateur Admin` a été inscrite **dans le mapping**
(`COMPTE_GENERIQUE_RATTACHE`) plutôt qu'en dur dans le code.

### Exécution réelle du 31/07/2026

Le script a été exécuté pour de bon — à la fois pour le valider avant le jour J
et pour rafraîchir la copie de travail. **5 669 lignes** réimportées, trigger
métier désactivé puis réactivé, intégrité vérifiée (0 garde attribuée sans
médecin, 0 garde libre avec médecin, 0 orpheline).

**Comparaison finale des deux bases** :

| | Planning | Orga | Écart |
|---|---:|---:|---:|
| Gardes attribuées | 2 309 | 2 308 | −1 |
| Gardes libres | 255 | 255 | 0 |
| Gardes en attente | 118 | 118 | 0 |
| Demandes approuvées | 836 | 834 | −2 |
| Demandes annulées | 366 | 363 | −3 |
| Demandes refusées | 1 124 | 1 123 | −1 |
| Demandes en attente | 166 | 166 | 0 |

Les écarts correspondent **exactement** aux exclusions volontaires : la garde de
`Dr 3`, les 4 demandes de `Dr One` (3 annulées, 1 approuvée) et les 2 demandes
portant sur la garde écartée. **Aucune dérive** : la copie est fidèle à la ligne
près.

### ⚠️ Ne plus l'exécuter après la bascule

Une fois Bolt éteint, la base Orga devient la référence et Planning cesse d'être
à jour. Rejouer le script écraserait alors le travail fait dans la nouvelle
application. Cet avertissement figure en tête du fichier.

---

## Suite du découpage

| | Contenu | Écrit en base ? |
|---|---|---|
| **7A** | ✓ Inventaire du schéma réel, écarts, décisions d'architecture. | Non |
| **7B-1** | ✓ Correspondance des comptes, `mapping-comptes-agenda.csv`, arbitrages. | Non |
| **7B-2** | ✓ Création des 26 comptes de remplaçants dans Orga (inactifs, sans invitation). | Fait |
| **7C-1** | ✓ Schéma `agenda`, 14 tables, contraintes, 75 index, vue `profiles`, colonne `is_agenda_coordinator`. | Fait |
| **7C-2** | ✓ 2 fonctions, 10 triggers, circuit métier testé de bout en bout. | Fait |
| **7C-3** | ✓ 57 policies RLS via 2 fonctions centralisées, testées par usurpation. Charlotte désignée coordinatrice. | Fait |
| **7D** | ✓ 5 664 lignes importées et vérifiées, identifiants remappés. | Fait |
| **7E** | ✓ Schéma exposé, module basculé sur la base Orga, écran de liaison supprimé, vraies photos. | Fait |
| **7F** | ✓ Script de resynchronisation complet, testé en réel. Remplace celui de 7D. | Fait |

---

## Découverte annexe — les `shift_types` ne correspondent pas aux codes du fichier Excel

Relevé en passant, mais **directement utile à MOD-1** (l'un des éléments à
fournir avant l'étape 6 est justement « les `shift_types` correspondent-ils aux
codes J1–J8 ? »). **La réponse est non.**

Les 15 créneaux déclarés en base **incluent le site dans leur nom** et ne
recouvrent pas les codes du fichier de roulement :

| En base | Horaire | Correspondance avec `desiderata.yaml` |
|---|---|---|
| `Pré J2 Dijon ` | 08:00–14:00 | horaire de `J6`, mais nom différent |
| `J1 Beaune` | 08:00–16:00 | conforme |
| `J3 Beaune` | 08:00–18:30 | conforme |
| `J5 Dijon` | **12:00–20:00** | ⚠️ la doc annonce 08:00–18:30 |
| `J2 Dijon` | 14:00–22:00 | conforme |
| `J2 Beaune` | **10:00–22:00** | ⚠️ la doc annonce 14:00–22:00 |
| `J3 Dijon`, `J4 Dijon`, `J7 Dijon`, `J8 Dijon` | 08:00–18:30 | conforme |
| `J5 bis Dijon` | 12:00–20:00 | ⚠️ absent de la doc |
| `WE1 beaune 08h-20h`, `WE2 beaune 08h-20h`, `WE1 Dijon `, `WE 2 Dijon ` | 08:00–20:00 | le fichier Excel dit `Garde` / `Doublon` |

Aucun créneau ne s'appelle `J6`. Plusieurs noms portent des espaces en fin ou
une casse irrégulière (`beaune`, `WE 2 Dijon `).

**Conséquences pour MOD-1** :
- L'**écran de correspondance** de l'import Excel n'est pas un confort, c'est une
  **nécessité** : la correspondance code du fichier → `shift_type` en base ne peut
  pas être devinée automatiquement.
- Un créneau du fichier (`J1`) correspond à **plusieurs** `shift_types` selon le
  site — la correspondance est donc un couple (code, site), pas un simple code.
- Trois écarts d'horaire sont à arbitrer avec Matthieu : **quelle est la source
  de vérité, la base ou `desiderata.yaml` ?**
