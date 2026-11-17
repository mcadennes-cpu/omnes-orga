#!/usr/bin/env python3
"""Prouver les droits du module Contrats (etape 25 : fusion SIM + Signatures).

    OMNES_CIBLE=test python3 docs/sql/25A-5-test-contrats.py
    OMNES_CIBLE=prod python3 docs/sql/25A-5-test-contrats.py   # apres bascule

A lancer DEPUIS LA RACINE du depot, apres 25A-1 a 25A-4.

CE QUE CETTE SUITE N'ECRIT PAS
Comme 24A-3 : chaque scenario tourne dans UNE transaction ANNULEE. Les
dossiers, fichiers, objets du bucket et demandes crees pour le test
disparaissent a la fin. Jouable en production apres la bascule.

COMMENT ON TESTE
On prend le role `authenticated` avec les claims d'un vrai compte de chaque
role (ce que lit `auth.uid()`), on teste la LECTURE et l'ECRITURE (lecon du
28/09/2026 : une couche de securite se teste sur chaque commande). Les gestes
du serveur sont joues en role postgres, qui appelle les memes fonctions SQL
que l'Edge Function.

LES SCENARIOS
  1. qui voit quels dossiers et fichiers (membres, associe, remplacant,
     poste_bureau, inactif), heritage d'un dossier ouvert, personnes
     concernees, archivage personnel, ecritures refusees ;
  2. classement d'un document signe : rejouable sans doublon, concernes =
     signataires, verrous (renommage, suppression), destination modifiable
     apres cloture, rien d'autre ;
  3. fichiers du bucket `sim` : lecture par les concernes, suppression du
     blob d'un document signe reservee au super_admin.
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

PROJETS = {"prod": "ydihrgnixthrraprclox", "test": "yjttfdwjbyufpavwxcpy"}
CIBLE = os.environ.get("OMNES_CIBLE", "").strip().lower()
if CIBLE not in PROJETS:
    raise SystemExit("Preciser OMNES_CIBLE=test ou OMNES_CIBLE=prod.")
PROJET = PROJETS[CIBLE]
if not Path("docs/sql").is_dir():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()

ECHECS = []
H_BON = "a" * 64
EMPREINTE, EMPREINTE_FINALE = "c" * 64, "d" * 64


def appel(requete):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJET}/database/query",
        data=json.dumps({"query": requete}).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {_TOK}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "omnes-orga-script/1.0")
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"\nARRET : requete refusee -- {e.read().decode()[:600]}")


def lire(requete):
    return appel(f"begin transaction read only;\nselect x.* from ({requete}) x;\ncommit;\n")


class Scenario:
    """Meme harnais que 24A-3 (une transaction annulee par scenario)."""

    def __init__(self, nom):
        self.nom = nom
        self.etapes = []
        self.sql = [
            "begin;",
            "create temp table _r (n serial, etape text, res text) on commit drop;",
            "create temp table _v (k text primary key, val text) on commit drop;",
            "grant all on _r, _v to authenticated, anon;",
            "grant usage on sequence _r_n_seq to authenticated, anon;",
        ]

    def etape(self, libelle, qui, corps, attendu):
        self.etapes.append((libelle, attendu))
        if qui is None:
            # Serveur : comme l'Edge Function (cle service_role), aucun
            # utilisateur -- auth.uid() est nul. Sans ce reglage, les claims
            # de l'etape precedente resteraient poses (reset role ne les
            # efface pas) et le serveur passerait pour un utilisateur.
            self.sql.append("""set local request.jwt.claims = '{"role": "service_role"}';""")
        elif qui == "anon":
            self.sql.append("set local request.jwt.claims = '{\"role\": \"anon\"}';")
            self.sql.append("set local role anon;")
        else:
            claims = json.dumps({"sub": qui, "role": "authenticated"})
            self.sql.append("set local role authenticated;")
            self.sql.append(f"set local request.jwt.claims = '{claims}';")
        lib = libelle.replace("'", "''")
        self.sql.append(
            "do $e$ declare v text; n integer; begin\n"
            f"{corps}\n"
            f"insert into _r (etape, res) values ('{lib}', coalesce(v, 'ok'));\n"
            "exception when others then\n"
            f"insert into _r (etape, res) values ('{lib}', 'ERREUR: ' || sqlerrm);\n"
            "end $e$;")
        if qui is not None:
            self.sql.append("reset role;")

    def jouer(self):
        print("\n" + "=" * 78 + f"\n{self.nom}\n" + "=" * 78)
        self.sql.append("select etape, res from _r order by n;")
        self.sql.append("rollback;")
        lignes = appel("\n".join(self.sql))
        if len(lignes) != len(self.etapes):
            ECHECS.append(f"{self.nom} : {len(lignes)} resultats pour {len(self.etapes)} etapes")
        for (libelle, attendu), ligne in zip(self.etapes, lignes):
            obtenu = ligne["res"]
            if attendu == "UUID":
                ok = len(obtenu) == 36 and obtenu.count("-") == 4
            elif attendu.startswith("ERREUR"):
                extrait = attendu[7:] if attendu.startswith("ERREUR:") else ""
                ok = obtenu.startswith("ERREUR") and extrait.lower() in obtenu.lower()
            else:
                ok = obtenu == attendu
            if not ok:
                ECHECS.append(f"{self.nom} / {libelle} : obtenu « {obtenu} », attendu « {attendu} »")
            print(f"  [{'OK ' if ok else 'ECHEC'}] {libelle:62} {obtenu[:66]}")


def val(k):
    return f"(select val from _v where k = '{k}')"


def poser(k, expr):
    return f"insert into _v values ('{k}', ({expr})::text) on conflict (k) do update set val = excluded.val;"


# ---------------------------------------------------------------------------
print(f"cible : {CIBLE.upper()} -- projet {PROJET}")
if CIBLE == "test" and not lire(
        "select 1 from pg_class where relname = '_environnement_de_test'"):
    raise SystemExit("ARRET : OMNES_CIBLE=test mais la table temoin de 23-18 est absente.")
if not lire("select 1 from information_schema.tables where table_name = 'sim_fichiers_concernes'"):
    raise SystemExit("ARRET : 25A-1 a 25A-4 ne sont pas executes sur cette base.")

comptes = lire("""
    select role::text as role, actif, id::text as id,
           row_number() over (partition by role, actif order by id) as rang
      from public.profiles
     where coalesce(email, '') <> ''""")
par = {(c["role"], c["actif"], c["rang"]): c["id"] for c in comptes}
SA = par.get(("super_admin", True, 1))
AG = par.get(("associe_gerant", True, 1))
AS = par.get(("associe", True, 1))
RP = par.get(("remplacant", True, 1))
RP2 = par.get(("remplacant", True, 2))
PB = par.get(("poste_bureau", True, 1))
INACTIF = next((c["id"] for c in comptes if not c["actif"] and c["role"] != "poste_bureau"), None)
manque = [n for n, x in (("super_admin", SA), ("associe_gerant", AG), ("associe", AS),
                         ("remplacant", RP), ("2e remplacant", RP2), ("poste_bureau", PB),
                         ("inactif", INACTIF)) if not x]
if manque:
    raise SystemExit(f"ARRET : comptes temoins manquants : {manque}")
print(f"  super_admin {SA}\n  associe_gerant {AG}\n  associe {AS}\n  remplacant {RP}\n"
      f"  2e remplacant {RP2}\n  poste_bureau {PB}\n  inactif {INACTIF}")

F1, F1A, F2, F2A = val("f1"), val("f1a"), val("f2"), val("f2a")
X1, X2, X3 = val("x1"), val("x2"), val("x3")
TEST_DOSSIERS = f"id in ({F1}::uuid, {F1A}::uuid, {F2}::uuid, {F2A}::uuid)"
TEST_FICHIERS = f"id in ({X1}::uuid, {X2}::uuid, {X3}::uuid)"


def dossier(s, cle, nom, parent, ouvert):
    parent_sql = f"{val(parent)}::uuid" if parent else "null"
    s.etape(f"super_admin cree le dossier {nom}", SA,
            "insert into sim_dossiers (nom, parent_id, auteur_id, ouvert_associes) "
            f"values ('{nom}', {parent_sql}, '{SA}', {ouvert}) returning id into v; "
            + poser(cle, "v"), "UUID")


def fichier(s, cle, nom, dossier_cle):
    s.etape(f"super_admin depose le fichier {nom}", SA,
            "insert into sim_fichiers (nom, dossier_id, taille_octets, mime_type, auteur_id) "
            f"values ('{nom}', {val(dossier_cle)}::uuid, 1000, 'application/pdf', '{SA}') "
            "returning id into v; " + poser(cle, "v"), "UUID")


def voit_dossiers(s, libelle, qui, attendu):
    s.etape(libelle, qui,
            f"select count(*) into n from sim_dossiers where {TEST_DOSSIERS}; v := n::text;", attendu)


def voit_fichiers(s, libelle, qui, attendu):
    s.etape(libelle, qui,
            f"select count(*) into n from sim_fichiers where {TEST_FICHIERS}; v := n::text;", attendu)


def rattacher(s, libelle, qui, fichier_cle, profil, attendu="ok"):
    s.etape(libelle, qui,
            "insert into sim_fichiers_concernes (fichier_id, profil_id) "
            f"values ({val(fichier_cle)}::uuid, '{profil}');", attendu)


# --- Scenario 1 --------------------------------------------------------------
s = Scenario("1. QUI VOIT QUOI (dossiers, fichiers, personnes concernees)")
dossier(s, "f1", "Test ferme", None, "false")
dossier(s, "f1a", "Test ferme / sous-dossier", "f1", "false")
dossier(s, "f2", "Test ouvert", None, "true")
dossier(s, "f2a", "Test ouvert / sous-dossier", "f2", "false")
fichier(s, "x1", "ferme-sous.pdf", "f1a")
fichier(s, "x2", "ouvert-sous.pdf", "f2a")
fichier(s, "x3", "ferme.pdf", "f1")

for qui, nom, nd, nf in ((SA, "super_admin", "4", "3"), (AG, "associe_gerant", "4", "3"),
                         (AS, "associe", "2", "1"), (RP, "remplacant", "0", "0"),
                         (PB, "poste_bureau", "0", "0"), (INACTIF, "compte inactif", "0", "0")):
    voit_dossiers(s, f"{nom} voit {nd} dossier(s) sur 4", qui, nd)
    voit_fichiers(s, f"{nom} voit {nf} fichier(s) sur 3", qui, nf)
s.etape("associe : le sous-dossier herite de l'ouverture", AS,
        f"select count(*) into n from sim_dossiers where id = {F2A}::uuid; v := n::text;", "1")
# anon garde ses droits de table (limite connue du chantier D) : c'est la RLS
# (policies « to authenticated ») qui lui renvoie zero ligne.
s.etape("non connecte : aucun dossier, aucun fichier", "anon",
        "select (select count(*) from sim_dossiers) + (select count(*) from sim_fichiers) "
        "into n; v := n::text;", "0")
s.etape("non connecte : personnes concernees refusees", "anon",
        "select count(*) into n from sim_fichiers_concernes;", "ERREUR:permission denied")

# Personnes concernees
rattacher(s, "super_admin rattache le remplacant au fichier ferme", SA, "x3", RP)
rattacher(s, "super_admin rattache l'associe au fichier ferme-sous", SA, "x1", AS)
rattacher(s, "associe_gerant ne rattache personne", AG, "x3", RP2, "ERREUR:row-level security")
rattacher(s, "poste_bureau ne peut pas etre concerne", SA, "x3", PB, "ERREUR:row-level security")
rattacher(s, "un compte inactif peut etre rattache (ancien contrat)", SA, "x3", INACTIF)
voit_fichiers(s, "remplacant concerne : voit SON fichier", RP, "1")
voit_dossiers(s, "remplacant concerne : ne voit toujours aucun dossier", RP, "0")
voit_fichiers(s, "2e remplacant : ne voit pas le fichier d'un autre", RP2, "0")
voit_fichiers(s, "associe : dossier ouvert + son fichier = 2", AS, "2")
voit_dossiers(s, "associe : le dossier de son fichier reste invisible", AS, "2")
voit_fichiers(s, "compte inactif concerne : ne voit rien", INACTIF, "0")
s.etape("remplacant : ne lit que sa propre ligne de concernes", RP,
        f"select count(*) into n from sim_fichiers_concernes where fichier_id = {X3}::uuid; v := n::text;", "1")
s.etape("2e remplacant : aucune ligne", RP2,
        "select count(*) into n from sim_fichiers_concernes "
        f"where fichier_id in ({X1}::uuid, {X3}::uuid); v := n::text;", "0")
s.etape("associe_gerant : voit toutes les lignes (3)", AG,
        "select count(*) into n from sim_fichiers_concernes "
        f"where fichier_id in ({X1}::uuid, {X3}::uuid); v := n::text;", "3")

# Archivage personnel
s.etape("remplacant archive sa ligne", RP,
        f"update sim_fichiers_concernes set archive_at = now() where fichier_id = {X3}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "1")
s.etape("remplacant n'archive pas la ligne d'un autre (0)", RP,
        f"update sim_fichiers_concernes set archive_at = now() where fichier_id = {X1}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "0")
s.etape("remplacant ne change pas de fichier (colonne interdite)", RP,
        f"update sim_fichiers_concernes set fichier_id = {X1}::uuid where fichier_id = {X3}::uuid;",
        "ERREUR:permission denied")
s.etape("remplacant ne se detache pas lui-meme (0)", RP,
        f"delete from sim_fichiers_concernes where fichier_id = {X3}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "0")
voit_fichiers(s, "fichier archive : toujours lisible", RP, "1")

# Ecritures refusees
s.etape("associe ne cree pas de dossier, meme dans un dossier ouvert", AS,
        f"insert into sim_dossiers (nom, parent_id, auteur_id) values ('x', {F2}::uuid, '{AS}');",
        "ERREUR:row-level security")
s.etape("associe ne depose pas de fichier", AS,
        "insert into sim_fichiers (nom, dossier_id, taille_octets, auteur_id) "
        f"values ('x', {F2}::uuid, 1, '{AS}');", "ERREUR:row-level security")
s.etape("associe ne renomme pas un fichier visible (0)", AS,
        f"update sim_fichiers set nom = 'x' where id = {X2}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "0")
s.etape("remplacant ne supprime pas son fichier (0)", RP,
        f"delete from sim_fichiers where id = {X3}::uuid; get diagnostics n = row_count; v := n::text;", "0")
s.etape("associe_gerant cree son dossier", AG,
        f"insert into sim_dossiers (nom, auteur_id) values ('Test gerant', '{AG}') returning id into v; "
        + poser("g", "v"), "UUID")
s.etape("associe_gerant n'ouvre pas son dossier aux associes", AG,
        f"update sim_dossiers set ouvert_associes = true where id = {val('g')}::uuid;", "ERREUR:super_admin")
s.etape("associe_gerant ne cree pas un dossier deja ouvert", AG,
        f"insert into sim_dossiers (nom, auteur_id, ouvert_associes) values ('x', '{AG}', true);",
        "ERREUR:super_admin")
s.etape("associe_gerant renomme son dossier (inchange)", AG,
        f"update sim_dossiers set nom = 'Test gerant 2' where id = {val('g')}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "1")
s.etape("super_admin ouvre le dossier ferme", SA,
        f"update sim_dossiers set ouvert_associes = true where id = {F1}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "1")
voit_dossiers(s, "associe voit alors les 4 dossiers", AS, "4")
voit_fichiers(s, "et les 3 fichiers", AS, "3")
voit_fichiers(s, "le remplacant, lui, n'en voit toujours qu'un", RP, "1")
s.jouer()


# --- Scenario 2 --------------------------------------------------------------
D = val("d")
SIG_AG = f"(select id from signature_signataires where demande_id = {D}::uuid and profil_id = '{AG}')"
SIG_RP = f"(select id from signature_signataires where demande_id = {D}::uuid and profil_id = '{RP}')"


def signer(s, qui, sig):
    s.etape("ouverture du document", qui, f"perform signature_marquer_consulte({D}::uuid);", "ok")
    s.etape("code prepare", None,
            f"v := signature_preparer_code({sig}, '{qui}', '{H_BON}')->>'resultat';", "pret")
    s.etape("signature", None,
            f"v := signature_signer({sig}, '{qui}', '{H_BON}', '{EMPREINTE}', "
            "'Je consens', 'v1', '10.0.0.2', 'suite 25A-5')->>'resultat';", "signe")


s = Scenario("2. CLASSEMENT D'UN DOCUMENT SIGNE")
dossier(s, "f1", "Test destination", None, "false")
dossier(s, "f2", "Test autre", None, "false")
s.etape("super_admin cree un brouillon avec destination", SA,
        "insert into signature_demandes (type, titre, createur_id, sim_dossier_id) "
        f"values ('avenant', 'Test 25A-5', '{SA}', {F1}::uuid) returning id into v; " + poser("d", "v"),
        "UUID")
s.etape("la destination se change en brouillon", SA,
        f"update signature_demandes set sim_dossier_id = {F2}::uuid where id = {D}::uuid; "
        f"update signature_demandes set sim_dossier_id = {F1}::uuid where id = {D}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "1")
s.etape("signataires : associe_gerant et remplacant", SA,
        "insert into signature_signataires (demande_id, profil_id, ordre) "
        f"values ({D}::uuid, '{AG}', 1), ({D}::uuid, '{RP}', 2);", "ok")
s.etape("depot du document", SA,
        f"update signature_demandes set source_chemin = {D} || '/source.pdf', "
        f"source_nom = 'test.pdf', source_taille = 1000 where id = {D}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "1")
s.etape("serveur : envoi", None,
        f"perform signature_envoyer({D}::uuid, '{SA}', '{EMPREINTE}', 1000, '10.0.0.1', 'suite 25A-5');",
        "ok")
s.etape("classement refuse tant que ce n'est pas signe", None,
        f"perform signature_classer_sim({D}::uuid, 'Test.pdf', 1200);", "ERREUR:entierement signe")
s.etape("l'appli ne peut pas appeler le classement", SA,
        f"perform signature_classer_sim({D}::uuid, 'Test.pdf', 1200);", "ERREUR:permission denied")
signer(s, AG, SIG_AG)
signer(s, RP, SIG_RP)
s.etape("scellement", None,
        f"perform signature_sceller({D}::uuid, '{EMPREINTE_FINALE}', "
        f"(select empreinte from signature_journal where demande_id = {D}::uuid order by id desc limit 1));"
        f"select statut into v from signature_demandes where id = {D}::uuid;", "terminee")
s.etape("serveur : classement -> l'id du fichier est celui de la demande", None,
        f"v := (signature_classer_sim({D}::uuid, 'Test 25A-5 - signé.pdf', 1200) = {D}::uuid)::text;",
        "true")
s.etape("second classement : meme fichier, pas de doublon", None,
        f"perform signature_classer_sim({D}::uuid, 'autre nom.pdf', 1200); "
        f"select count(*) into n from sim_fichiers where signature_demande_id = {D}::uuid; v := n::text;",
        "1")
s.etape("classe dans le dossier choisi, au nom du createur", None,
        f"select (dossier_id = {F1}::uuid and auteur_id = '{SA}' and nom = 'Test 25A-5 - signé.pdf')::text "
        f"into v from sim_fichiers where id = {D}::uuid;", "true")
s.etape("concernes = les 2 signataires", None,
        f"select count(*) into n from sim_fichiers_concernes where fichier_id = {D}::uuid; v := n::text;", "2")
for qui, nom, attendu in ((SA, "super_admin", "1"), (AG, "associe_gerant signataire", "1"),
                          (RP, "remplacant signataire", "1"), (RP2, "autre remplacant", "0"),
                          (AS, "associe non signataire (dossier ferme)", "0"),
                          (PB, "poste_bureau", "0")):
    s.etape(f"{nom} voit le document classe", qui,
            f"select count(*) into n from sim_fichiers where id = {D}::uuid; v := n::text;", attendu)
s.etape("l'appli ne classe pas elle-meme un document signe", SA,
        "insert into sim_fichiers (nom, taille_octets, auteur_id, signature_demande_id) "
        f"values ('faux.pdf', 1, '{SA}', {D}::uuid);", "ERREUR:serveur")
s.etape("associe_gerant ne renomme pas le document signe (0)", AG,
        f"update sim_fichiers set nom = 'x' where id = {D}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "0")
s.etape("associe_gerant ne supprime pas le document signe (0)", AG,
        f"delete from sim_fichiers where id = {D}::uuid; get diagnostics n = row_count; v := n::text;",
        "0")
# Le verrou tient meme si un gerant etait l'auteur (aujourd'hui seul un
# super_admin cree une demande, mais la regle ne doit pas en dependre).
s.etape("(serveur) le gerant devient auteur du document signe", None,
        f"update sim_fichiers set auteur_id = '{AG}' where id = {D}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "1")
s.etape("gerant auteur : renommage refuse par le verrou", AG,
        f"update sim_fichiers set nom = 'x' where id = {D}::uuid;", "ERREUR:super_admin")
s.etape("gerant auteur : suppression refusee par le verrou", AG,
        f"delete from sim_fichiers where id = {D}::uuid;", "ERREUR:super_admin")
s.etape("le lien vers la demande est immuable (meme serveur)", None,
        f"update sim_fichiers set signature_demande_id = null where id = {D}::uuid;", "ERREUR:immuable")
s.etape("super_admin peut renommer le document signe", SA,
        f"update sim_fichiers set nom = 'Renomme.pdf' where id = {D}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "1")
s.etape("demande close : la destination peut encore bouger (serveur)", None,
        f"update signature_demandes set sim_dossier_id = {F2}::uuid where id = {D}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "1")
s.etape("demande close : rien d'autre ne bouge (titre)", None,
        f"update signature_demandes set titre = 'x' where id = {D}::uuid;", "ERREUR:close")
s.etape("demande close : ni destination + titre ensemble", None,
        f"update signature_demandes set sim_dossier_id = {F1}::uuid, titre = 'x' where id = {D}::uuid;",
        "ERREUR:close")
s.etape("dossier vide vise par une demande close : supprimable", SA,
        f"delete from sim_dossiers where id = {F2}::uuid; get diagnostics n = row_count; v := n::text;", "1")
s.etape("... et la destination repasse a vide", None,
        f"select coalesce(sim_dossier_id::text, 'vide') into v from signature_demandes where id = {D}::uuid;",
        "vide")
s.etape("journal toujours intact", None, f"v := signature_verifier_journal({D}::uuid)::text;", "0")
s.etape("super_admin supprime le document signe (ligne)", SA,
        f"delete from sim_fichiers where id = {D}::uuid; get diagnostics n = row_count; v := n::text;", "1")
s.etape("ses personnes concernees partent avec lui", None,
        f"select count(*) into n from sim_fichiers_concernes where fichier_id = {D}::uuid; v := n::text;", "0")
s.jouer()


# --- Scenario 3 --------------------------------------------------------------
def objet(nom_expr):
    return (f"insert into storage.objects (bucket_id, name, owner, metadata) values "
            f"('sim', {nom_expr}, '{SA}', '{{\"mimetype\": \"application/pdf\"}}');")


def voit_objet(s, libelle, qui, nom_expr, attendu):
    s.etape(libelle, qui,
            f"select count(*) into n from storage.objects where bucket_id = 'sim' and name = {nom_expr}; "
            "v := n::text;", attendu)


def supprimer_objet(s, libelle, qui, nom_expr, attendu):
    s.etape(libelle, qui,
            "perform set_config('storage.allow_delete_query', 'true', true); "
            f"delete from storage.objects where bucket_id = 'sim' and name = {nom_expr}; "
            "get diagnostics n = row_count; v := n::text;", attendu)


s = Scenario("3. FICHIERS DU BUCKET sim")
if not lire("select 1 from storage.buckets where id = 'sim'"):
    raise SystemExit("ARRET : bucket sim absent.")
dossier(s, "f1", "Test ferme", None, "false")
dossier(s, "f2", "Test ouvert", None, "true")
fichier(s, "x1", "ferme.pdf", "f1")
fichier(s, "x2", "ouvert.pdf", "f2")
s.etape("blobs poses (serveur)", None, objet(X1) + objet(X2), "ok")
s.etape("blob au nom inattendu (serveur)", None, objet("'pas-un-uuid.pdf'"), "ok")
rattacher(s, "remplacant concerne par le fichier ferme", SA, "x1", RP)
for qui, nom, a1, a2 in ((AG, "associe_gerant", "1", "1"), (AS, "associe", "0", "1"),
                         (RP, "remplacant concerne", "1", "0"), (RP2, "autre remplacant", "0", "0"),
                         (PB, "poste_bureau", "0", "0"), (INACTIF, "inactif", "0", "0")):
    voit_objet(s, f"{nom} : blob du dossier ferme", qui, X1, a1)
    voit_objet(s, f"{nom} : blob du dossier ouvert", qui, X2, a2)
voit_objet(s, "nom inattendu : ignore sans erreur (remplacant)", RP, "'pas-un-uuid.pdf'", "0")
s.etape("associe ne depose pas de blob", AS, objet(f"'{'0' * 8}-0000-0000-0000-{'0' * 12}'"),
        "ERREUR:row-level security")

# Document signe : son blob est protege
s.etape("le fichier ferme devient un document signe (serveur)", None,
        "insert into signature_demandes (id, type, titre, createur_id) "
        f"values ({X1}::uuid, 'autre', 'Test blob', '{SA}'); "
        "alter table sim_fichiers disable trigger sim_fichiers_verrou; "
        f"update sim_fichiers set signature_demande_id = {X1}::uuid where id = {X1}::uuid; "
        "alter table sim_fichiers enable trigger sim_fichiers_verrou;", "ok")
supprimer_objet(s, "associe_gerant ne supprime pas le blob signe", AG, X1, "0")
voit_objet(s, "le blob signe est toujours la", AG, X1, "1")
supprimer_objet(s, "associe_gerant supprime toujours un blob ordinaire", AG, X2, "1")
supprimer_objet(s, "super_admin peut supprimer le blob signe", SA, X1, "1")
s.jouer()


# ---------------------------------------------------------------------------
print("\n" + "=" * 78)
if ECHECS:
    print(f"{len(ECHECS)} ECHEC(S) :")
    for e in ECHECS:
        print(f"  - {e}")
    sys.exit(1)
print("TOUS LES CONTROLES SONT AU VERT (aucune ecriture conservee : transactions annulees).")
