#!/usr/bin/env python3
"""Integrer un remplacant cree dans Bolt APRES 7B-2 : compte Orga + mapping.

    python3 docs/sql/23-9-agenda-integrer-remplacant.py        # simulation
    python3 docs/sql/23-9-agenda-integrer-remplacant.py --go   # execute

A lancer DEPUIS LA RACINE du depot. Ensuite :
    python3 docs/sql/22-8C-1-transfert-mots-de-passe.py        # puis --go

POURQUOI CE SCRIPT EXISTE
Les 26 remplacants ont ete crees dans Orga le 30/07/2026 (7B-2) par un
script jamais versionne. Le 03/09/2026, un nouveau remplacant est cree dans
Bolt : Dr Vincent D'ALESIO. Il n'a ni compte Orga ni ligne de mapping, et
22-8A-1 refuse donc de resynchroniser -- ses 3 gardes seraient importees
sans medecin. Releve le 17/09 ; Matthieu confirme le meme jour qu'il s'agit
d'un remplacant, a integrer avec les autres pour la bascule.

CE QU'IL FAIT, pour chaque compte de la liste NOUVEAUX
  1. Compte d'authentification par l'API d'administration, mot de passe
     aleatoire jamais conserve, email_confirm = false : AUCUN EMAIL ENVOYE.
     Meme procede que 7B-2. Le vrai mot de passe arrive ensuite par 22-8C-1,
     qui recopie aussi email_confirmed_at.
  2. Profil complete a l'identique des 26 -- mesure le 17/09 colonne par
     colonne, pas suppose. Deux colonnes different des valeurs par defaut :
        actif             false  (defaut true)  -- la porte de l'appli
        is_agenda_doctor  true   (defaut false) -- VOIR LE PIEGE CI-DESSOUS
  3. Ligne REMPLACANT_A_CREER ajoutee a docs/mapping-comptes-agenda.csv,
     au format exact du fichier (fins de ligne CRLF, sans guillemets). C'est
     ce statut que lisent 22-8A-1 (resynchronisation) et 22-8C-1 (mots de
     passe) : rien d'autre n'est a modifier dans ces deux scripts.

LE PIEGE DE is_agenda_doctor
Cette colonne n'est pas calculee : 23-3 l'a posee UNE FOIS, par UPDATE, sur
les comptes existants. Un compte cree apres herite du defaut false -- il
serait absent de la liste des medecins a qui attribuer une garde, exactement
le defaut que 23-3 avait corrige. Rien ne l'aurait signale avant qu'on
cherche son nom dans un menu deroulant.

CE QU'IL NE FAIT PAS
  - ouvrir l'appli : actif reste a false, comme pour les 26 ;
  - transferer le mot de passe : c'est 22-8C-1 ;
  - toucher aux gardes : 22-8A-1 les rattachera le soir de la bascule ;
  - ecrire dans Bolt : jamais.

REPRENABLE ET IDEMPOTENT
Un compte Orga deja present a cette adresse est reutilise (s'il est bien un
remplacant -- un associe arrete le script), le profil est remis a l'etat
cible, la ligne de mapping n'est ajoutee que si elle manque. Relance apres
succes : « rien a faire ».
"""
import base64
import csv
import hashlib
import hmac
import json
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

GO = "--go" in sys.argv
BOLT = "kldgvjxuojeeqhdrmaia"
ORGA = "ydihrgnixthrraprclox"
MAPPING = Path("docs/mapping-comptes-agenda.csv")

# Liste NOMMEE, jamais une requete « tous les profils Bolt sans mapping » :
# chaque ajout est une decision (associe ou remplacant, Bolt ne le distingue
# pas), et le nom est decoupe par une personne, pas par une regle.
NOUVEAUX = [
    # Remplacant, confirme par Matthieu le 17/09/2026.
    {"bolt_id": "d9a8f51e-11cd-499c-a7b0-255ec940559e",
     "email": "vincent.dalesio@orange.fr",
     "prenom": "Vincent", "nom": "D'ALESIO"},
]

if not Path("docs/sql").is_dir() or not Path(".env").is_file():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

_env = dict(l.split("=", 1) for l in Path(".env").read_text().splitlines()
            if "=" in l and not l.startswith("#"))
URL = _env["VITE_SUPABASE_URL"].strip()
ANON = _env["VITE_SUPABASE_ANON_KEY"].strip()

_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()


def stop(msg):
    raise SystemExit(f"\nARRET : {msg}")


def sql(ref, requete):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": requete}).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {_TOK}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "curl/8.4.0")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or "null"), None
    except urllib.error.HTTPError as e:
        return None, e.read().decode()[:300]


def lit(v):
    """Litteral SQL. Indispensable ici : « D'ALESIO » contient une apostrophe."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    return "'" + str(v).replace("'", "''") + "'"


# Jeton service_role forge avec le secret JWT du projet : meme procede que
# 22-8C-1b. C'est la seule voie propre pour creer un compte -- une insertion
# directe dans auth.users obligerait a reproduire a la main auth.identities.
_cfg = None


def _b64(d):
    return base64.urlsafe_b64encode(d).rstrip(b"=")


def admin(methode, chemin, corps=None):
    global _cfg
    if _cfg is None:
        _cfg = json.load(urllib.request.urlopen(urllib.request.Request(
            f"https://api.supabase.com/v1/projects/{ORGA}/postgrest",
            headers={"Authorization": f"Bearer {_TOK}",
                     "User-Agent": "omnes-orga-script/1.0"})))
    entete = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    charge = _b64(json.dumps({"role": "service_role", "iss": "supabase",
                              "iat": int(time.time()),
                              "exp": int(time.time()) + 900}).encode())
    sig = _b64(hmac.new(_cfg["jwt_secret"].encode(), entete + b"." + charge,
                        hashlib.sha256).digest())
    jeton = (entete + b"." + charge + b"." + sig).decode()
    req = urllib.request.Request(
        f"{URL}/auth/v1/{chemin}",
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={"apikey": ANON, "Authorization": f"Bearer {jeton}",
                 "Content-Type": "application/json"}, method=methode)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or "null"), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code} -- {e.read().decode()[:200]}"


def normalise(nom_complet):
    return re.sub(r"\s+", " ", nom_complet or "").strip().lower()


print("=== INTEGRATION DE REMPLACANTS CREES DANS BOLT APRES 7B-2 ===")
print("mode :", "EXECUTION REELLE" if GO else "simulation (ajouter --go pour executer)")

with MAPPING.open(encoding="utf-8", newline="") as f:
    lecteur = csv.DictReader(f)
    COLONNES = lecteur.fieldnames
    mapping = list(lecteur)
brut = MAPPING.read_bytes()
if not brut.endswith(b"\r\n") or b"\r\n" not in brut:
    stop("le mapping n'est plus en fins de ligne CRLF -- format inattendu, "
         "rien ecrit. Verifier le fichier avant de relancer.")

a_faire = 0
for n in NOUVEAUX:
    email = n["email"].strip().lower()
    print(f"\n-- {n['prenom']} {n['nom']} <{email}>")

    # ------------------------------------------ 1. controles cote Bolt
    b, err = sql(BOLT, f"""
        select p.full_name, p.role, lower(p.email) as email,
               substr(u.encrypted_password, 1, 7) as empreinte,
               (select count(*) from shifts where assigned_doctor_id = p.id) as nb_gardes,
               (select count(*) from requests where doctor_id = p.id) as nb_demandes,
               (select count(*) from rotation_assignment_rules where doctor_id = p.id) as nb_regles
          from profiles p left join auth.users u on u.id = p.id
         where p.id = {lit(n['bolt_id'])};""")
    if err:
        stop(f"lecture Bolt : {err}")
    if not b:
        stop(f"aucun profil Bolt d'identifiant {n['bolt_id']}")
    b = b[0]
    if b["email"] != email:
        stop(f"adresse Bolt differente : {b['email']}")
    if b["role"] != "doctor":
        stop(f"role Bolt inattendu : {b['role']}")
    # Le decoupage prenom / nom est ecrit a la main : on le confronte au nom
    # complet de Bolt, prefixe « Dr » compris, plutot que de le croire.
    if normalise(b["full_name"]) != normalise(f"Dr {n['prenom']} {n['nom']}"):
        stop(f"decoupage du nom a revoir : Bolt dit « {b['full_name']} »")
    if b["empreinte"] != "$2a$10$":
        stop(f"empreinte Bolt au format {b['empreinte']} : 22-8C-1 ne saurait "
             "pas la transferer")
    print(f"   Bolt  : {b['full_name']}, {b['nb_gardes']} gardes, "
          f"{b['nb_demandes']} demandes, {b['nb_regles']} regles")

    # ------------------------------------------ 2. controles cote mapping
    ligne = next((r for r in mapping if r["old_profile_id"] == n["bolt_id"]), None)
    autre = [r for r in mapping if r["old_profile_id"] != n["bolt_id"]
             and email in (r["email_planning"].lower(), r["email_orga"].lower())]
    if autre:
        stop(f"adresse deja portee par une autre ligne du mapping : "
             f"{autre[0]['full_name']}")
    if ligne and ligne["statut"] != "REMPLACANT_A_CREER":
        stop(f"deja au mapping avec le statut {ligne['statut']}")

    # ------------------------------------------ 3. controles cote Orga
    o, err = sql(ORGA, f"""
        select u.id, p.role, p.nom, p.prenom, p.actif, p.is_agenda_doctor,
               p.is_agenda_coordinator, p.agenda_beta_access,
               u.email_confirmed_at is not null as confirme,
               u.last_sign_in_at is not null as deja_connecte
          from auth.users u left join public.profiles p on p.id = u.id
         where lower(u.email) = {lit(email)};""")
    if err:
        stop(f"lecture Orga : {err}")
    uid = o[0]["id"] if o else None
    if o and o[0]["role"] != "remplacant":
        stop(f"un compte Orga existe deja a cette adresse avec le role "
             f"{o[0]['role']} -- jamais touche par ce script")
    if ligne and ligne["new_profile_id"] and ligne["new_profile_id"] != uid:
        stop("le mapping pointe vers un autre compte Orga que celui de cette adresse")

    cible = {"role": "remplacant", "nom": n["nom"], "prenom": n["prenom"],
             "actif": False, "is_agenda_doctor": True,
             "is_agenda_coordinator": False, "agenda_beta_access": False}
    profil_ok = bool(o) and all(o[0][k] == v for k, v in cible.items())
    etapes = []
    if not uid:
        etapes.append("creer le compte d'authentification (aucun email envoye)")
    if not profil_ok:
        etapes.append("completer le profil : nom, prenom, actif=false, is_agenda_doctor=true")
    if not ligne:
        etapes.append("ajouter la ligne REMPLACANT_A_CREER au mapping")
    if not etapes:
        print("   rien a faire : compte, profil et mapping deja en place")
        continue
    a_faire += 1
    for e in etapes:
        print(f"   {'->' if GO else 'a faire :'} {e}")
    if not GO:
        continue

    # ------------------------------------------ 4. ecriture
    if not uid:
        donnees, err = admin("POST", "admin/users",
                             {"email": email,
                              "password": secrets.token_urlsafe(24),
                              "email_confirm": False})
        if err:
            stop(f"creation du compte : {err}")
        uid = donnees["id"]
        print(f"   compte cree : {uid}")

    # Filtre sur le role : meme si tout ce qui precede a ete contourne, ce
    # script ne peut pas reecrire le profil d'un associe.
    maj, err = sql(ORGA, f"""
        update public.profiles
           set nom = {lit(n['nom'])}, prenom = {lit(n['prenom'])},
               actif = false, is_agenda_doctor = true
         where id = {lit(uid)} and role = 'remplacant'
        returning id;""")
    if err or not maj:
        stop(f"mise a jour du profil : {err or '0 ligne -- role inattendu'}")

    if not ligne:
        with MAPPING.open("a", encoding="utf-8", newline="") as f:
            csv.DictWriter(f, fieldnames=COLONNES, lineterminator="\r\n").writerow({
                "statut": "REMPLACANT_A_CREER",
                "old_profile_id": n["bolt_id"], "new_profile_id": uid,
                "full_name": b["full_name"],
                "email_planning": email, "email_orga": email,
                "nb_gardes": b["nb_gardes"], "nb_demandes": b["nb_demandes"],
                "nb_regles": b["nb_regles"]})
        mapping.append({"old_profile_id": n["bolt_id"], "new_profile_id": uid,
                        "statut": "REMPLACANT_A_CREER"})

if not GO:
    print(f"\n[simulation] {a_faire} compte(s) a integrer, rien n'a ete ecrit. "
          "Ajouter --go pour executer.")
    sys.exit(0)

# ---------------------------------------------- 5. verification
print("\n=== VERIFICATION ===")
with MAPPING.open(encoding="utf-8", newline="") as f:
    mapping = list(csv.DictReader(f))
ko = 0
for n in NOUVEAUX:
    email = n["email"].strip().lower()
    o, _ = sql(ORGA, f"""
        select u.id, p.role, p.nom, p.prenom, p.actif, p.is_agenda_doctor,
               p.is_agenda_coordinator, p.agenda_beta_access,
               u.last_sign_in_at is null as jamais_connecte
          from auth.users u join public.profiles p on p.id = u.id
         where lower(u.email) = {lit(email)};""")
    ligne = next((r for r in mapping if r["old_profile_id"] == n["bolt_id"]), None)
    controles = [
        ("un seul compte Orga a cette adresse", o is not None and len(o) == 1),
        ("role remplacant", bool(o) and o[0]["role"] == "remplacant"),
        ("nom et prenom", bool(o) and (o[0]["nom"], o[0]["prenom"]) == (n["nom"], n["prenom"])),
        ("actif = false : l'appli ne lui est pas ouverte", bool(o) and o[0]["actif"] is False),
        ("is_agenda_doctor = true : il figure parmi les medecins", bool(o) and o[0]["is_agenda_doctor"] is True),
        ("ni coordinateur ni beta", bool(o) and not o[0]["is_agenda_coordinator"] and not o[0]["agenda_beta_access"]),
        ("jamais connecte", bool(o) and o[0]["jamais_connecte"]),
        ("mapping : ligne presente et pointant vers ce compte",
         bool(ligne and o) and ligne["new_profile_id"] == o[0]["id"]),
    ]
    for titre, ok in controles:
        ko += not ok
        print(f"  {'OK   ' if ok else 'ECHEC'} {titre}")
print(f"\n{sum(1 for _ in NOUVEAUX) * 8 - ko}/{len(NOUVEAUX) * 8} controles au vert")
print("Suite : python3 docs/sql/22-8C-1-transfert-mots-de-passe.py (simulation, puis --go)")
sys.exit(1 if ko else 0)
