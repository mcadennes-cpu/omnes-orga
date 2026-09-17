#!/usr/bin/env python3
"""Ouverture du module Agenda a tous les medecins -- LE SOIR DE LA BASCULE.

    python3 docs/sql/23-12-agenda-ouverture.py                  # simulation
    python3 docs/sql/23-12-agenda-ouverture.py --repetition     # ecrit puis ANNULE (rollback)
    python3 docs/sql/23-12-agenda-ouverture.py --go             # execute (soir J)
    python3 docs/sql/23-12-agenda-ouverture.py --annuler        # simulation du retour
    python3 docs/sql/23-12-agenda-ouverture.py --annuler --go   # retour arriere

A lancer DEPUIS LA RACINE du depot. Etape 8F-4.
Place dans la sequence du soir J : APRES 22-8A-1 --go et son controle,
23-6, 23-10 et 23-5 -- voir le plan arrete en 8E (integration-agenda.md).

CE QU'IL FAIT, en une transaction
  1. active les remplacants inactifs NON BLOQUES (21 le 17/09/2026) ;
  2. pose agenda_beta_access = true sur tous les comptes actifs, non
     bloques, des quatre roles medecins (31 comptes apres ouverture).

POURQUOI PAR LE DRAPEAU (decision de Matthieu, 17/09/2026)
Le soir J ne comporte ainsi aucun deploiement : le code en production est
celui verifie les jours precedents, et l'ouverture est du SQL reversible,
repete a l'avance. Le retrait du drapeau du code viendra apres J.
PIEGE jusque-la : un compte medecin cree apres J n'a pas le drapeau (valeur
par defaut false) -- il faudra le lui poser a la main.

QUI EST TOUCHE, ET QUI NE L'EST PAS
  . les remplacants a activer sont designes par une requete, mais ils sont
    CONFRONTES au mapping : chacun doit y porter le statut
    REMPLACANT_A_CREER, et leur nombre est un fil tendu (NB_A_ACTIVER). Un
    compte inattendu fait tomber le script au lieu d'etre ouvert en silence ;
  . le BLOCAGE est le marqueur d'un ancien (23-11) : un compte bloque n'est
    ni active ni drapeau, par construction ET par controle ;
  . poste_bureau n'est pas un role medecin : il ne recoit pas le drapeau,
    ce qui suffit a l'ecarter de l'agenda (peut_acceder ne verifie aucun
    role -- releve en 8E) ;
  . chaque remplacant ouvert doit avoir une empreinte au format Bolt et une
    adresse confirmee : sans elles il ne pourrait pas se connecter
    (8C-1b, 23-13), et on ouvrirait une porte qui ne s'ouvre pas.

RETOUR ARRIERE
--go ecrit d'abord l'etat de chaque compte touche dans
docs/sql/23-12-etat-avant-ouverture.json. --annuler le relit et remet
exactement ces valeurs. --repetition prouve les deux sans rien garder :
ouverture puis rollback, et ouverture + retour arriere puis rollback.

APRES --go, la preuve par le chemin du navigateur (jetons forges, GET) :
un remplacant ouvert lit les gardes et pas le journal ; le poste de bureau
ne lit aucune garde.
"""
import base64
import csv
import hashlib
import hmac
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

GO = "--go" in sys.argv
ANNULER = "--annuler" in sys.argv
REPETITION = "--repetition" in sys.argv
ORGA = "ydihrgnixthrraprclox"
MAPPING = Path("docs/mapping-comptes-agenda.csv")
ETAT = Path("docs/sql/23-12-etat-avant-ouverture.json")

ROLES_MEDECINS = ("super_admin", "associe_gerant", "associe", "remplacant")

# Fils tendus, a ajuster PAR DECISION si un compte est ajoute ou bloque :
# 27 remplacants (8C-2) moins 6 bloques par 23-11 = 21 ; 10 comptes actifs
# des roles medecins (2 super_admin, 3 associes gerants, 5 associes) + 21.
NB_A_ACTIVER = 21
NB_DRAPEAU_APRES = 31

if not Path("docs/sql").is_dir() or not Path(".env").is_file():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")
if REPETITION and (GO or ANNULER):
    raise SystemExit("--repetition se lance seul.")

_env = dict(l.split("=", 1) for l in Path(".env").read_text().splitlines()
            if "=" in l and not l.startswith("#"))
URL = _env["VITE_SUPABASE_URL"].strip()
ANON = _env["VITE_SUPABASE_ANON_KEY"].strip()

_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()


def stop(msg):
    raise SystemExit(f"\nARRET : {msg}\nRien n'a ete ecrit par cette etape.")


def sql(requete):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ORGA}/database/query",
        data=json.dumps({"query": requete}).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {_TOK}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "curl/8.4.0")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        stop(f"requete SQL refusee : {e.read().decode()[:300]}")


def lit(v):
    return "'" + str(v).replace("'", "''") + "'"


def ids_sql(comptes):
    return ", ".join(f"{lit(c['id'])}::uuid" for c in comptes) or "null"


# --- chemin du navigateur : jeton « authenticated » forge, comme le harnais
_cfg = None


def _b64(d):
    return base64.urlsafe_b64encode(d).rstrip(b"=")


def compter_en_tant_que(uid, table):
    """Nombre de lignes de agenda.<table> visibles par uid, via PostgREST."""
    global _cfg
    if _cfg is None:
        _cfg = json.load(urllib.request.urlopen(urllib.request.Request(
            f"https://api.supabase.com/v1/projects/{ORGA}/postgrest",
            headers={"Authorization": f"Bearer {_TOK}",
                     "User-Agent": "omnes-orga-script/1.0"})))
    entete = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    charge = _b64(json.dumps({"sub": uid, "role": "authenticated",
                              "aud": "authenticated", "iat": int(time.time()),
                              "exp": int(time.time()) + 300}).encode())
    sig = _b64(hmac.new(_cfg["jwt_secret"].encode(), entete + b"." + charge,
                        hashlib.sha256).digest())
    req = urllib.request.Request(
        f"{URL}/rest/v1/{table}?select=id&limit=1", method="GET",
        headers={"apikey": ANON, "Accept-Profile": "agenda", "Prefer": "count=exact",
                 "Authorization": f"Bearer {(entete + b'.' + charge + b'.' + sig).decode()}"})
    try:
        with urllib.request.urlopen(req) as r:
            return int(r.headers.get("Content-Range", "*/-1").split("/")[-1])
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}"


# ------------------------------------------------------------------ SQL
def sql_ouverture(a_activer, a_drapeau):
    return f"""
        update public.profiles set actif = true
         where id in ({ids_sql(a_activer)}) and role = 'remplacant' and not actif;
        update public.profiles set agenda_beta_access = true
         where id in ({ids_sql(a_drapeau)}) and not agenda_beta_access;"""


def sql_retour(etat):
    valeurs = ", ".join(f"({lit(c['id'])}::uuid, {str(c['actif']).lower()}, "
                        f"{str(c['drapeau']).lower()})" for c in etat)
    return f"""
        update public.profiles p
           set actif = a.actif, agenda_beta_access = a.drapeau
          from (values {valeurs}) as a(id, actif, drapeau)
         where p.id = a.id
           and (p.actif, p.agenda_beta_access) is distinct from (a.actif, a.drapeau);"""


SQL_BILAN = """
    select count(*) filter (where p.role = 'remplacant' and p.actif)            as remplacants_actifs,
           count(*) filter (where p.agenda_beta_access)                         as drapeaux,
           count(*) filter (where p.agenda_beta_access
                              and p.role not in ('super_admin','associe_gerant','associe','remplacant'))
                                                                                as drapeaux_hors_medecins,
           count(*) filter (where (p.actif or p.agenda_beta_access)
                              and u.banned_until > now())                       as bloques_ouverts,
           count(*) filter (where p.is_agenda_coordinator)                      as coordinateurs,
           count(*) filter (where p.actif)                                      as actifs
      from public.profiles p join auth.users u on u.id = p.id"""


def sql_ecarts(etat):
    valeurs = ", ".join(f"({lit(c['id'])}::uuid, {str(c['actif']).lower()}, "
                        f"{str(c['drapeau']).lower()})" for c in etat)
    return f"""
    select count(*) as ecarts
      from (values {valeurs}) as a(id, actif, drapeau)
      join public.profiles p on p.id = a.id
     where (p.actif, p.agenda_beta_access) is distinct from (a.actif, a.drapeau)"""


def controler_bilan(v, attendu, titre):
    print(f"\n--- {titre} ---")
    echecs = 0
    for cle, val in attendu.items():
        ok = v[cle] == val
        echecs += not ok
        print(f"  {'OK   ' if ok else 'ECHEC'} {cle:24} {v[cle]:>3}  (attendu {val})")
    return echecs


print("=== 23-12 OUVERTURE DU MODULE AGENDA ===")
print("mode :", "REPETITION (rollback)" if REPETITION else
      ("RETOUR ARRIERE" if ANNULER else "ouverture")
      + (" -- EXECUTION REELLE" if GO else " -- simulation"))

# ================================================================ ANNULER
if ANNULER:
    if not ETAT.is_file():
        stop(f"{ETAT} introuvable : aucune ouverture a defaire par ce script.")
    etat = json.loads(ETAT.read_text())["comptes"]
    ecarts = sql(sql_ecarts(etat))[0]["ecarts"]
    print(f"\n{len(etat)} comptes dans l'etat avant ouverture ; {ecarts} different aujourd'hui.")
    if not ecarts:
        print("Rien a faire.")
        raise SystemExit(0)
    if not GO:
        print("\n[simulation] rien n'a ete ecrit. Ajouter --go pour executer.")
        raise SystemExit(0)
    r = sql("begin;" + sql_retour(etat) + sql_ecarts(etat) + ";\ncommit;")
    if r[0]["ecarts"] != 0:
        raise SystemExit(f"ECHEC : {r[0]['ecarts']} ecart(s) apres le retour arriere.")
    ETAT.rename(ETAT.with_name(f"23-12-etat-avant-ouverture.annule-{datetime.now():%Y%m%d-%H%M}.json"))
    print("Retour arriere fait : les comptes ont retrouve leur etat d'avant l'ouverture.")
    raise SystemExit(0)

# ================================================================ ETAT
comptes = sql("""
    select p.id, p.prenom, p.nom, p.role, p.actif, p.agenda_beta_access as drapeau,
           coalesce(p.is_agenda_coordinator, false) as coordinateur,
           p.is_agenda_doctor as medecin,
           coalesce(u.banned_until > now(), false) as bloque,
           left(u.encrypted_password, 7) as empreinte,
           u.email_confirmed_at is not null as confirme
      from public.profiles p join auth.users u on u.id = p.id
     order by p.role, p.nom""")

mapping = {r["new_profile_id"]: r["statut"]
           for r in csv.DictReader(MAPPING.open(encoding="utf-8"))}

a_activer = [c for c in comptes
             if c["role"] == "remplacant" and not c["actif"] and not c["bloque"]]
id_activer = {c["id"] for c in a_activer}
cibles = [c for c in comptes
          if c["role"] in ROLES_MEDECINS and not c["bloque"]
          and (c["actif"] or c["id"] in id_activer)]
a_drapeau = [c for c in cibles if not c["drapeau"]]

# ================================================================ GARDE-FOUS
print(f"\n--- 1. Controles ---")
deja_ouvert = not a_activer and not a_drapeau
if not deja_ouvert:
    if len(a_activer) != NB_A_ACTIVER:
        stop(f"{len(a_activer)} remplacant(s) a activer, {NB_A_ACTIVER} attendus -- "
             "un compte a ete cree ou bloque sans que NB_A_ACTIVER suive")
    for c in a_activer:
        qui = f"{c['prenom']} {c['nom']}"
        if mapping.get(c["id"]) != "REMPLACANT_A_CREER":
            stop(f"{qui} : absent du mapping en REMPLACANT_A_CREER ({mapping.get(c['id'])})")
        if c["empreinte"] != "$2a$10$":
            stop(f"{qui} : empreinte {c['empreinte']!r}, pas celle de Bolt -- 22-8C-1 a-t-il tourne ?")
        if not c["confirme"]:
            stop(f"{qui} : adresse non confirmee -- la connexion serait refusee")
        if not c["medecin"]:
            stop(f"{qui} : is_agenda_doctor = false")
    if len(cibles) != NB_DRAPEAU_APRES:
        stop(f"{len(cibles)} compte(s) porteraient le drapeau, {NB_DRAPEAU_APRES} attendus")
    if any(c["bloque"] for c in a_activer + cibles):
        stop("un compte bloque serait ouvert")
    coord = [c for c in comptes if c["coordinateur"]]
    if len(coord) != 2 or any(c["id"] not in {x["id"] for x in cibles} for c in coord):
        stop("les 2 coordinateurs ne sont pas tous deux parmi les comptes ouverts")
    print(f"  OK   {len(a_activer)} remplacants, tous au mapping, empreinte Bolt, adresse confirmee")
    print(f"  OK   {len(cibles)} comptes porteront le drapeau, aucun bloque, aucun hors role medecin")
    print(f"  OK   les 2 coordinateurs en font partie")

bloques = [c for c in comptes if c["bloque"]]
print(f"\n--- 2. A faire ---")
print(f"  activer ({len(a_activer)}) : " + ", ".join(f"{c['prenom']} {c['nom']}" for c in a_activer))
print(f"  drapeau ({len(a_drapeau)}) : " + ", ".join(f"{c['prenom']} {c['nom']}" for c in a_drapeau))
print(f"  ecartes : {len(bloques)} bloques, "
      + ", ".join(f"{c['prenom']} {c['nom']} ({c['role']})" for c in comptes
                  if c["role"] not in ROLES_MEDECINS))

etat_avant = [{"id": c["id"], "prenom": c["prenom"], "nom": c["nom"], "role": c["role"],
               "actif": c["actif"], "drapeau": c["drapeau"]} for c in cibles]
actifs_avant = sum(1 for c in comptes if c["actif"])
ATTENDU = {"remplacants_actifs": NB_A_ACTIVER, "drapeaux": NB_DRAPEAU_APRES,
           "drapeaux_hors_medecins": 0, "bloques_ouverts": 0, "coordinateurs": 2,
           "actifs": actifs_avant + len(a_activer)}

# ================================================================ REPETITION
if REPETITION:
    if deja_ouvert:
        stop("deja ouvert : rien a repeter")
    v = sql("begin;" + sql_ouverture(a_activer, a_drapeau) + SQL_BILAN + ";\nrollback;")[0]
    echecs = controler_bilan(v, ATTENDU, "3a. Ouverture, puis rollback")
    r = sql("begin;" + sql_ouverture(a_activer, a_drapeau) + sql_retour(etat_avant)
            + sql_ecarts(etat_avant) + ";\nrollback;")[0]
    ok = r["ecarts"] == 0
    echecs += not ok
    print(f"\n--- 3b. Ouverture + retour arriere, puis rollback ---")
    print(f"  {'OK   ' if ok else 'ECHEC'} ecarts avec l'etat avant    {r['ecarts']:>3}  (attendu 0)")
    apres = sql(SQL_BILAN)[0]
    ok = apres["remplacants_actifs"] == 0 and apres["drapeaux"] == len(cibles) - len(a_drapeau)
    echecs += not ok
    print(f"\n--- 3c. Apres les rollbacks, la base n'a pas bouge ---")
    print(f"  {'OK   ' if ok else 'ECHEC'} remplacants actifs {apres['remplacants_actifs']}, "
          f"drapeaux {apres['drapeaux']}")
    if echecs:
        raise SystemExit(f"\n{echecs} controle(s) en echec.")
    print("\nRepetition conforme. Rien n'a ete conserve.")
    raise SystemExit(0)

# ================================================================ GO
if deja_ouvert:
    print("\nRien a faire : deja ouvert.")
elif not GO:
    print("\n[simulation] rien n'a ete ecrit. --repetition pour essayer en rollback, --go pour executer.")
    raise SystemExit(0)
else:
    if ETAT.exists():
        stop(f"{ETAT} existe deja : une ouverture a deja commence. Examiner avant de relancer.")
    ETAT.write_text(json.dumps({"script": "23-12", "ecrit_le": datetime.now().isoformat(timespec="seconds"),
                                "comptes": etat_avant}, ensure_ascii=False, indent=2) + "\n")
    print(f"\n  etat avant ecrit dans {ETAT}")
    v = sql("begin;" + sql_ouverture(a_activer, a_drapeau) + SQL_BILAN + ";\ncommit;")[0]
    if controler_bilan(v, ATTENDU, "3. Ouverture"):
        raise SystemExit("\nECHEC -- voir --annuler pour revenir a l'etat avant.")

# ================================================================ PREUVE
v = sql(SQL_BILAN)[0]
echecs = controler_bilan(v, ATTENDU, "4. Etat en base")
ouverts = sorted((c for c in comptes if c["role"] == "remplacant" and not c["bloque"]),
                 key=lambda c: c["nom"])
bureau = [c for c in comptes if c["role"] == "poste_bureau"]
print("\n--- 5. Chemin du navigateur ---")
qui = f"{ouverts[0]['prenom']} {ouverts[0]['nom']}"
gardes = compter_en_tant_que(ouverts[0]["id"], "shifts")
journal = compter_en_tant_que(ouverts[0]["id"], "activity_log")
gardes_bureau = compter_en_tant_que(bureau[0]["id"], "shifts") if bureau else 0
for titre, n, ok in (
        (f"{qui} (remplacant) lit les gardes", gardes, isinstance(gardes, int) and gardes > 0),
        (f"{qui} ne lit pas le journal", journal, journal == 0),
        ("le poste de bureau ne lit aucune garde", gardes_bureau, gardes_bureau == 0)):
    echecs += not ok
    print(f"  {'OK   ' if ok else 'ECHEC'} {titre}  ({n})")
if echecs:
    raise SystemExit(f"\n{echecs} controle(s) en echec.")
print("\nModule ouvert.")
