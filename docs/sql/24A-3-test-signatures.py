#!/usr/bin/env python3
"""Prouver les droits et les verrous du module Signatures (etape 24).

    OMNES_CIBLE=test python3 docs/sql/24A-3-test-signatures.py
    OMNES_CIBLE=prod python3 docs/sql/24A-3-test-signatures.py   # apres bascule

A lancer DEPUIS LA RACINE du depot.

CE QUE CETTE SUITE N'ECRIT PAS
Chaque scenario tourne dans UNE transaction ANNULEE (`rollback`) : demandes,
signatures et lignes de journal creees pour le test disparaissent a la fin.
C'est ce qui permet de la jouer aussi en production apres la bascule. La
variable OMNES_CIBLE est OBLIGATOIRE : pas de cible par defaut.

COMMENT ON TESTE
Comme 23-22 : on prend le role `authenticated` et on pose les claims dans la
transaction (`set local request.jwt.claims`), ce que lit `auth.uid()`. Les
gestes du serveur (Edge Function) sont joues en role postgres, qui appelle
les memes fonctions SQL que l'Edge Function. Chaque etape est un bloc `do`
qui note son resultat -- ou l'erreur qu'elle a levee -- dans une table
temporaire : une erreur ATTENDUE ne casse donc pas la suite.

LES TROIS SCENARIOS
  1. parcours complet, signature en parallele : droits de creation, verrous
     du brouillon, droits par colonne, cloison entre roles, code faux puis
     blocage, document altere, scellement, journal intact puis falsifie ;
  2. ordre impose, refus, relance, annulation ;
  3. suppression d'un brouillon (seul cas ou une demande peut disparaitre).
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
H_BON, H_FAUX = "a" * 64, "b" * 64          # HMAC du bon code / d'un faux
EMPREINTE, EMPREINTE_AUTRE = "c" * 64, "d" * 64


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


# ---------------------------------------------------------------------------
# Construction d'un scenario
# ---------------------------------------------------------------------------
class Scenario:
    def __init__(self, nom):
        self.nom = nom
        self.etapes = []          # (libelle, attendu)
        self.sql = [
            "begin;",
            "create temp table _r (n serial, etape text, res text) on commit drop;",
            "create temp table _v (k text primary key, val text) on commit drop;",
            "grant all on _r, _v to authenticated, anon;",
            "grant usage on sequence _r_n_seq to authenticated, anon;",
        ]

    def etape(self, libelle, qui, corps, attendu):
        """`corps` est du PL/pgSQL qui peut affecter `v` (texte).
        `qui` : uuid d'un profil, 'anon', ou None (= serveur, role postgres).
        `attendu` : valeur exacte, ou 'ERREUR' / 'ERREUR:<extrait>'."""
        self.etapes.append((libelle, attendu))
        if qui == "anon":
            self.sql.append("set local role anon;")
        elif qui:
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
        if qui:
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
            print(f"  [{'OK ' if ok else 'ECHEC'}] {libelle:58} {obtenu[:70]}")


def val(k):
    return f"(select val from _v where k = '{k}')"


def poser(k, expr):
    return f"insert into _v values ('{k}', ({expr})::text) on conflict (k) do update set val = excluded.val;"


# ---------------------------------------------------------------------------
print(f"cible : {CIBLE.upper()} -- projet {PROJET}")
if CIBLE == "test" and not lire(
        "select 1 from pg_class where relname = '_environnement_de_test'"):
    raise SystemExit("ARRET : OMNES_CIBLE=test mais la table temoin de 23-18 est absente.")

comptes = lire("""
    select distinct on (role, actif) role::text as role, actif, id::text as id
      from public.profiles
     where coalesce(email, '') <> ''
     order by role, actif, id""")
par = {(c["role"], c["actif"]): c["id"] for c in comptes}
SA = par.get(("super_admin", True))
AG = par.get(("associe_gerant", True))
AS = par.get(("associe", True))
RP = par.get(("remplacant", True))
PB = par.get(("poste_bureau", True))
INACTIF = next((c["id"] for c in comptes if not c["actif"]), None)
manque = [n for n, x in (("super_admin", SA), ("associe_gerant", AG), ("associe", AS),
                         ("remplacant", RP), ("poste_bureau", PB), ("inactif", INACTIF)) if not x]
if manque:
    raise SystemExit(f"ARRET : comptes temoins manquants : {manque}")
print(f"  super_admin {SA}\n  associe_gerant {AG}\n  associe {AS}\n"
      f"  remplacant {RP}\n  poste_bureau {PB}\n  inactif {INACTIF}")

D = val("d")
SIG_AG = f"(select id from signature_signataires where demande_id = {D}::uuid and profil_id = '{AG}')"
SIG_RP = f"(select id from signature_signataires where demande_id = {D}::uuid and profil_id = '{RP}')"


def creer_brouillon(s, ordre_impose="false"):
    s.etape("super_admin cree un brouillon", SA,
            "insert into signature_demandes (type, titre, createur_id, ordre_impose) "
            f"values ('avenant', 'Test 24A-3', '{SA}', {ordre_impose}) returning id into v; "
            + poser("d", "v"), "UUID")


def envoyer(s):
    s.etape("super_admin depose le document (brouillon)", SA,
            f"update signature_demandes set source_chemin = {D} || '/source.pdf', "
            f"source_nom = 'test.pdf', source_taille = 1000 where id = {D}::uuid; "
            "get diagnostics n = row_count; v := n::text;", "1")
    s.etape("serveur : envoi (fige le document)", None,
            f"perform signature_envoyer({D}::uuid, '{SA}', '{EMPREINTE}', 1000, '10.0.0.1', 'suite 24A-3');",
            "ok")


def signer(s, libelle, sig, qui, hmac=H_BON, empreinte=EMPREINTE, attendu="signe"):
    s.etape(libelle, None,
            f"v := signature_signer({sig}, '{qui}', '{hmac}', '{empreinte}', "
            "'Je consens', 'v1', '10.0.0.2', 'suite 24A-3')->>'resultat';", attendu)


def preparer(s, libelle, sig, qui, attendu="pret"):
    s.etape(libelle, None,
            f"v := signature_preparer_code({sig}, '{qui}', '{H_BON}')->>'resultat';", attendu)


# --- Scenario 1 --------------------------------------------------------------
s = Scenario("1. PARCOURS COMPLET (signature en parallele)")
creer_brouillon(s)
for qui, nom in ((AG, "associe_gerant"), (RP, "remplacant"), (PB, "poste_bureau"), (INACTIF, "inactif")):
    s.etape(f"{nom} ne peut pas creer de demande", qui,
            f"insert into signature_demandes (titre, createur_id) values ('x', '{qui}');",
            "ERREUR:row-level security")
s.etape("ajout signataire associe_gerant (ordre 1)", SA,
        f"insert into signature_signataires (demande_id, profil_id, ordre) values ({D}::uuid, '{AG}', 1);", "ok")
s.etape("ajout signataire remplacant (ordre 2)", SA,
        f"insert into signature_signataires (demande_id, profil_id, ordre) values ({D}::uuid, '{RP}', 2);", "ok")
s.etape("poste_bureau refuse comme signataire", SA,
        f"insert into signature_signataires (demande_id, profil_id, ordre) values ({D}::uuid, '{PB}', 3);",
        "ERREUR:role non autorise")
s.etape("compte inactif refuse comme signataire", SA,
        f"insert into signature_signataires (demande_id, profil_id, ordre) values ({D}::uuid, '{INACTIF}', 3);",
        "ERREUR:inactif")
s.etape("brouillon : preuve pre-remplie refusee (meme serveur)", None,
        f"update signature_signataires set statut = 'signe' where id = {SIG_AG};", "ERREUR:preuve")
s.etape("l'appli ne peut pas nommer la colonne statut", SA,
        f"update signature_demandes set statut = 'en_cours' where id = {D}::uuid;", "ERREUR:permission denied")
s.etape("l'appli ne peut pas poser l'empreinte", SA,
        f"update signature_demandes set source_empreinte = '{EMPREINTE}' where id = {D}::uuid;",
        "ERREUR:permission denied")
s.etape("chemin du fichier impose (pas celui d'une autre demande)", SA,
        f"update signature_demandes set source_chemin = 'autre/source.pdf' where id = {D}::uuid;",
        "ERREUR:check constraint")
s.etape("un signataire ne voit pas le brouillon", AG,
        f"select count(*) into n from signature_demandes where id = {D}::uuid; v := n::text;", "0")
s.etape("un non-createur ne compose pas le brouillon", AG,
        f"insert into signature_signataires (demande_id, profil_id, ordre) values ({D}::uuid, '{AS}', 9);",
        "ERREUR:row-level security")
envoyer(s)
for qui, nom, attendu in ((SA, "super_admin", "1"), (AG, "associe_gerant signataire", "1"),
                          (RP, "remplacant signataire", "1"), (AS, "associe NON signataire", "0"),
                          (PB, "poste_bureau", "0"), (INACTIF, "compte inactif", "0")):
    s.etape(f"apres envoi, {nom} voit la demande", qui,
            f"select count(*) into n from signature_demandes where id = {D}::uuid; v := n::text;", attendu)
s.etape("identite figee a l'envoi", None,
        f"select count(*) into n from signature_signataires where demande_id = {D}::uuid "
        "and nom_fige is not null and email_fige is not null; v := n::text;", "2")
s.etape("ip des signataires illisible pour l'appli", AG,
        f"select count(ip) into n from signature_signataires where demande_id = {D}::uuid;",
        "ERREUR:permission denied")
s.etape("colonnes autorisees lisibles", AG,
        f"select count(id) into n from signature_signataires where demande_id = {D}::uuid; v := n::text;", "2")
s.etape("codes invisibles pour l'appli", AG,
        "select count(*) into n from signature_codes;", "ERREUR:permission denied")
s.etape("non connecte : aucun acces", "anon",
        "select count(*) into n from signature_demandes;", "ERREUR:permission denied")
s.etape("demande envoyee : le createur ne modifie plus (0 ligne)", SA,
        f"update signature_demandes set titre = 'x' where id = {D}::uuid; "
        "get diagnostics n = row_count; v := n::text;", "0")
s.etape("demande envoyee : meme le serveur ne modifie plus", None,
        f"update signature_demandes set titre = 'x' where id = {D}::uuid;", "ERREUR:fige")
s.etape("demande envoyee : suppression refusee au serveur", None,
        f"delete from signature_demandes where id = {D}::uuid;", "ERREUR:suppression interdite")
s.etape("demande envoyee : signataire non retirable", None,
        f"delete from signature_signataires where id = {SIG_AG};", "ERREUR:ne peut plus etre retire")
s.etape("demande envoyee : signataire non ajoutable", None,
        f"insert into signature_signataires (demande_id, profil_id, ordre) values ({D}::uuid, '{AS}', 3);",
        "ERREUR:aucun signataire ne peut etre ajoute")
preparer(s, "code refuse tant que le document n'est pas ouvert", SIG_AG, AG, "ERREUR:Ouvrez le document")
s.etape("associe_gerant ouvre le document", AG, f"perform signature_marquer_consulte({D}::uuid);", "ok")
s.etape("remplacant ouvre le document", RP, f"perform signature_marquer_consulte({D}::uuid);", "ok")
preparer(s, "un autre ne peut pas demander mon code", SIG_AG, RP, "ERREUR:pas votre signature")
preparer(s, "code prepare pour associe_gerant", SIG_AG, AG)
for restants in (4, 3, 2, 1):
    signer(s, f"code faux -> code_faux ({restants} essai(s) restant(s))", SIG_AG, AG, hmac=H_FAUX,
           attendu="code_faux")
signer(s, "5e code faux -> bloque", SIG_AG, AG, hmac=H_FAUX, attendu="bloque")
signer(s, "le bon code ne sert plus apres blocage", SIG_AG, AG, attendu="aucun_code")
preparer(s, "nouveau code", SIG_AG, AG)
signer(s, "document altere -> signature refusee", SIG_AG, AG, empreinte=EMPREINTE_AUTRE,
       attendu="document_altere")
signer(s, "associe_gerant signe", SIG_AG, AG)
signer(s, "signer deux fois est refuse", SIG_AG, AG, attendu="ERREUR:Deja traite")
s.etape("signataire signe : ligne figee", None,
        f"update signature_signataires set nb_relances = 9 where id = {SIG_AG};", "ERREUR:figee")
s.etape("scellement refuse tant qu'il reste un signataire", None,
        f"perform signature_sceller({D}::uuid, '{EMPREINTE_AUTRE}', 'x');", "ERREUR:n'ont pas signe")
preparer(s, "code prepare pour remplacant", SIG_RP, RP)
s.etape("remplacant signe -> c'est le dernier", None,
        f"v := (signature_signer({SIG_RP}, '{RP}', '{H_BON}', '{EMPREINTE}', 'Je consens', 'v1', "
        "'10.0.0.3', 'suite 24A-3')->>'derniere');", "true")
s.etape("journal lisible par un signataire", AG,
        f"select count(*) into n from signature_journal where demande_id = {D}::uuid and evenement = 'signature'; "
        "v := n::text;", "2")
s.etape("journal : l'appli ne peut rien y ecrire", AG,
        f"update signature_journal set details = '{{}}' where demande_id = {D}::uuid;",
        "ERREUR:permission denied")
s.etape("journal : le serveur ne peut pas le modifier", None,
        f"update signature_journal set details = '{{}}' where demande_id = {D}::uuid;", "ERREUR:ajout seul")
s.etape("journal : le serveur ne peut pas en supprimer", None,
        f"delete from signature_journal where demande_id = {D}::uuid;", "ERREUR:ajout seul")
s.etape("journal : le serveur ne peut pas le vider", None,
        "truncate signature_journal;", "ERREUR:ajout seul")
s.etape("scellement refuse si le journal cite a bouge", None,
        f"perform signature_sceller({D}::uuid, '{EMPREINTE_AUTRE}', 'pas-le-bon');", "ERREUR:journal a change")
s.etape("scellement", None,
        f"perform signature_sceller({D}::uuid, '{EMPREINTE_AUTRE}', "
        f"(select empreinte from signature_journal where demande_id = {D}::uuid order by id desc limit 1));"
        f"select statut into v from signature_demandes where id = {D}::uuid;", "terminee")
s.etape("journal intact : 0 maillon casse", None,
        f"v := signature_verifier_journal({D}::uuid)::text;", "0")
s.etape("demande terminee : annulation refusee", None,
        f"perform signature_annuler({D}::uuid, '{SA}', 'motif test', null, null);", "ERREUR:en cours")
s.etape("falsification (verrou desactive par l'admin) DETECTEE", None,
        "alter table signature_journal disable trigger signature_journal_interdit_ligne; "
        f"update signature_journal set details = '{{\"falsifie\": true}}' "
        f"where demande_id = {D}::uuid and evenement = 'envoi'; "
        f"v := (signature_verifier_journal({D}::uuid) > 0)::text;", "true")
s.jouer()

# --- Scenario 2 --------------------------------------------------------------
s = Scenario("2. ORDRE IMPOSE, REFUS, RELANCE, ANNULATION")
creer_brouillon(s, ordre_impose="true")
s.etape("signataires : associe_gerant (1) puis remplacant (2)", SA,
        f"insert into signature_signataires (demande_id, profil_id, ordre) values "
        f"({D}::uuid, '{AG}', 1), ({D}::uuid, '{RP}', 2);", "ok")
envoyer(s)
s.etape("remplacant ouvre le document", RP, f"perform signature_marquer_consulte({D}::uuid);", "ok")
preparer(s, "remplacant : pas encore son tour", SIG_RP, RP, "ERREUR:pas encore votre tour")
s.etape("relance par un non-createur refusee", None,
        f"perform signature_relancer({D}::uuid, '{AG}', null, null);", "ERREUR:reservee")
s.etape("relance : seul le 1er de la file est relance", None,
        f"v := signature_relancer({D}::uuid, '{SA}', null, null)->>'relances';", "1")
s.etape("relance repetee dans l'heure : personne", None,
        f"v := signature_relancer({D}::uuid, '{SA}', null, null)->>'relances';", "0")
s.etape("refus sans motif refuse", None,
        f"perform signature_refuser({SIG_AG}, '{AG}', '', null, null);", "ERREUR:Motif")
s.etape("associe_gerant refuse, avec motif", None,
        f"perform signature_refuser({SIG_AG}, '{AG}', 'Clause 3 a revoir', null, null);", "ok")
s.etape("signataire qui a refuse : ligne figee", None,
        f"update signature_signataires set consulte_at = now() where id = {SIG_AG};", "ERREUR:figee")
preparer(s, "apres un refus, pas de code", SIG_RP, RP, "ERREUR")
s.etape("annulation par un non-createur refusee", None,
        f"perform signature_annuler({D}::uuid, '{AG}', 'motif', null, null);", "ERREUR:reservee")
s.etape("annulation sans motif refusee", None,
        f"perform signature_annuler({D}::uuid, '{SA}', '', null, null);", "ERREUR:Motif")
s.etape("annulation par le createur", None,
        f"perform signature_annuler({D}::uuid, '{SA}', 'Refus de la clause 3', null, null); "
        f"select statut into v from signature_demandes where id = {D}::uuid;", "annulee")
s.etape("demande annulee : plus aucune modification", None,
        f"update signature_demandes set statut = 'en_cours' where id = {D}::uuid;", "ERREUR:close")
s.etape("journal intact", None, f"v := signature_verifier_journal({D}::uuid)::text;", "0")
s.jouer()

# --- Scenario 3 --------------------------------------------------------------
s = Scenario("3. SUPPRESSION D'UN BROUILLON")
creer_brouillon(s)
s.etape("ajout d'un signataire", SA,
        f"insert into signature_signataires (demande_id, profil_id, ordre) values ({D}::uuid, '{AG}', 1);", "ok")
s.etape("un autre compte ne supprime pas le brouillon d'autrui", AG,
        f"delete from signature_demandes where id = {D}::uuid; get diagnostics n = row_count; v := n::text;", "0")
s.etape("le createur supprime son brouillon (et ses signataires)", SA,
        f"delete from signature_demandes where id = {D}::uuid; get diagnostics n = row_count; "
        f"select n::text || '/' || (select count(*) from signature_signataires where demande_id = {D}::uuid) into v;",
        "1/0")
s.jouer()

# --- Scenario 4 (24B) ---------------------------------------------------------
# Comme 23-22 : les objets temoins sont poses DANS la transaction annulee.
OBJ = f"{D} || '/source.pdf'"


def objet(qui, nom_expr):
    return (f"insert into storage.objects (bucket_id, name, owner, metadata) values "
            f"('signatures', {nom_expr}, '{qui}', '{{\"mimetype\": \"application/pdf\"}}');")


def compter_objets():
    return (f"select count(*) into n from storage.objects where bucket_id = 'signatures' "
            f"and name like {D} || '/%'; v := n::text;")


s = Scenario("4. FICHIERS (bucket signatures, 24B)")
if not lire("select 1 from storage.buckets where id = 'signatures'"):
    raise SystemExit("ARRET : bucket signatures absent (24B-1 non execute).")
creer_brouillon(s)
s.etape("ajout d'un signataire", SA,
        f"insert into signature_signataires (demande_id, profil_id, ordre) values ({D}::uuid, '{AG}', 1);", "ok")
s.etape("le createur depose source.pdf", SA, objet(SA, OBJ), "ok")
s.etape("le createur ne depose pas un autre nom", SA, objet(SA, f"{D} || '/autre.pdf'"),
        "ERREUR:row-level security")
s.etape("le createur ne depose pas final.pdf", SA, objet(SA, f"{D} || '/final.pdf'"),
        "ERREUR:row-level security")
s.etape("un autre compte ne depose rien", AG, objet(AG, f"{D} || '/source.pdf'"),
        "ERREUR")
s.etape("brouillon : le signataire ne voit pas le fichier", AG, compter_objets(), "0")
# Supabase interdit la suppression directe en base (trigger storage.protect_delete) ;
# l'API Storage leve ce verrou par le reglage ci-dessous, ce qui laisse la policy decider.
s.etape("brouillon : le createur peut supprimer puis redeposer", SA,
        "perform set_config('storage.allow_delete_query', 'true', true); "
        f"delete from storage.objects where bucket_id = 'signatures' and name = {OBJ}; "
        "get diagnostics n = row_count; v := n::text; " + objet(SA, OBJ), "1")
envoyer(s)
for qui, nom, attendu in ((SA, "createur", "1"), (AG, "signataire", "1"), (AS, "associe non signataire", "0"),
                          (RP, "remplacant non signataire", "0"), (PB, "poste_bureau", "0"),
                          (INACTIF, "compte inactif", "0")):
    s.etape(f"apres envoi, {nom} voit le fichier", qui, compter_objets(), attendu)
s.etape("apres envoi, le createur ne remplace plus le fichier (0 ligne)", SA,
        f"update storage.objects set metadata = '{{}}' where bucket_id = 'signatures' and name = {OBJ}; "
        "get diagnostics n = row_count; v := n::text;", "0")
s.etape("apres envoi, le createur ne supprime plus le fichier", SA,
        "perform set_config('storage.allow_delete_query', 'true', true); "
        f"delete from storage.objects where bucket_id = 'signatures' and name = {OBJ}; "
        "get diagnostics n = row_count; v := n::text;", "0")
s.etape("non connecte : aucun fichier", "anon",
        "select count(*) into n from storage.objects where bucket_id = 'signatures'; v := n::text;", "0")
s.jouer()


# ---------------------------------------------------------------------------
print("\n" + "=" * 78)
if ECHECS:
    print(f"{len(ECHECS)} ECHEC(S) :")
    for e in ECHECS:
        print(f"  - {e}")
    sys.exit(1)
print("TOUS LES CONTROLES SONT AU VERT (aucune ecriture conservee : transactions annulees).")
