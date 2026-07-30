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

### 6. Triggers `updated_at` manquants sur 4 tables

`rotation_assignment_rules`, `rotation_settings`, `week_templates` et
`week_template_items` ont une colonne `updated_at` avec un `DEFAULT now()`, mais
**aucun trigger ne la met à jour**. Elle reste donc figée à la date de création.
À ajouter en 7C — c'est précisément ce type d'horodatage qui a permis de
reconstituer l'incident du 29/07.

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

## Suite du découpage

| | Contenu | Écrit en base ? |
|---|---|---|
| **7A** | ✓ Inventaire du schéma réel, écarts, décisions d'architecture. | Non |
| **7B-1** | ✓ Correspondance des comptes, `mapping-comptes-agenda.csv`, arbitrages. | Non |
| **7B-2** | ✓ Création des 26 comptes de remplaçants dans Orga (inactifs, sans invitation). | Fait |
| **7C-1** | ✓ Schéma `agenda`, 14 tables, contraintes, 75 index, vue `profiles`, colonne `is_agenda_coordinator`. | Fait |
| **7C-2** | Fonctions et triggers, dont `update_shift_status` et les 4 `updated_at` manquants. | Oui, Orga |
| **7C-3** | Les 65 policies RLS réécrites + désignation de Charlotte comme coordinatrice. | Oui, Orga |
| **7D** | Import des données avec remappage des identifiants + vérifications. | Oui, Orga |
| **7E** | Bascule du module sur le client unique, suppression de l'écran de liaison. | Non |
| **7F** | Script de re-synchronisation rejouable pour le soir de la bascule. | Préparé |

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
