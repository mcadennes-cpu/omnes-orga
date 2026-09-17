#!/usr/bin/env python3
"""Bloquer les comptes des medecins qui ne travaillent plus au cabinet.

    python3 docs/sql/23-11-agenda-bloquer-anciens-comptes.py                 # simulation
    python3 docs/sql/23-11-agenda-bloquer-anciens-comptes.py --go            # execute
    python3 docs/sql/23-11-agenda-bloquer-anciens-comptes.py --annuler       # simulation du retour
    python3 docs/sql/23-11-agenda-bloquer-anciens-comptes.py --annuler --go  # retour arriere

A lancer DEPUIS LA RACINE du depot. Etape 8F-2.

POURQUOI CE SCRIPT EXISTE
Mesure du 17/09/2026, en preparant l'ouverture : dans Orga, `actif = false`
n'est PAS une barriere de securite. Ni la connexion ni les policies du
schema public (codes d'acces, profils, annuaire, evenements) ne le
verifient -- seul l'agenda l'exige. Or, depuis 8C-1 (03/09), les 27
remplacants ont dans Orga le mot de passe qu'ils utilisent sur Bolt.
Prouve par le chemin du navigateur (jeton forge, GET seulement) : un
remplacant « inactif » lit les 4 codes d'acces du cabinet. Aucun ne s'est
jamais connecte a Orga.

Le meme jour, Matthieu confirme que six remplacants ne travaillent plus au
cabinet, et decide du meme traitement pour le compte fictif Essai DUPONT.
Les desactiver ne suffirait pas -- ils le sont deja. D'ou ce script.

CE QU'IL FAIT, pour chaque compte de la liste ANCIENS
  1. Blocage par l'API d'administration (ban_duration = 100 ans) : la
     connexion est refusee, quel que soit le mot de passe. C'est la voie
     prevue par Supabase ; elle ne touche ni aux gardes, ni aux demandes,
     ni a l'historique, ni a l'empreinte du mot de passe.
  2. is_agenda_doctor = false : le compte n'est plus propose a
     l'attribution ni dans le filtre par medecin. Son nom reste sur ses
     anciennes gardes (il est lu par jointure sur le profil, pas dans
     cette liste). La liste passe de 37 a 30 medecins.

Le blocage devient aussi le MARQUEUR d'un ancien : le script d'ouverture du
soir J (23-12) n'activera que des remplacants NON bloques.

CE QU'IL NE FAIT PAS
Il ne supprime rien : ces comptes portent des gardes passees (cles
etrangeres). Il ne touche pas a Bolt, ou ces personnes existent toujours
jusqu'a son extinction.

GARDE-FOUS, tous verifies AVANT la moindre ecriture
  . identite : chaque identifiant existe, et le prenom, le nom, le role et
    l'adresse sont ceux ecrits a la main ci-dessous ;
  . jamais un compte actif, jamais un coordinateur ;
  . aucune garde a venir, aucune demande en attente, aucune regle de plan
    de roulement -- sinon on bloquerait quelqu'un dont le planning depend.
Relance : il constate que tout est deja fait et n'ecrit rien.
"""
import base64
import hashlib
import hmac
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

GO = "--go" in sys.argv
ANNULER = "--annuler" in sys.argv
ORGA = "ydihrgnixthrraprclox"

# Liste NOMMEE, ecrite a la main : chaque ligne est une decision de Matthieu
# (17/09/2026), jamais le resultat d'une requete « sans garde depuis N mois ».
ANCIENS = [
    {"id": "67908d3c-a027-49b0-b2e9-9c58735648d7", "prenom": "Mathilde",
     "nom": "LEDOUX", "role": "remplacant", "email": "ledouxm@hotmail.fr"},
    {"id": "2b93b66b-121e-4e69-995b-f6240f70eb42", "prenom": "Prescilia",
     "nom": "PHILIPS", "role": "remplacant", "email": "presciliaphilips.pp@gmail.com"},
    {"id": "c81b73ad-f710-4864-8dab-580159558a96", "prenom": "Sarah",
     "nom": "GUARAGNA", "role": "remplacant", "email": "sarahguaragna@gmail.com"},
    {"id": "65709453-6c2b-4c3a-9930-9e33950640ba", "prenom": "Aymeric",
     "nom": "GOUVERNEUR", "role": "remplacant", "email": "gouverneur.aymeric@gmail.com"},
    {"id": "68efb3e5-914b-4b46-9b58-285e911a258d", "prenom": "Anne-Eugénie",
     "nom": "CHAUSSENOT", "role": "remplacant", "email": "aechaussenot@gmail.com"},
    {"id": "4b6be430-ff3d-4997-b14e-f3bea58c89a8", "prenom": "Caroline",
     "nom": "DE CONTENSON", "role": "remplacant", "email": "carolinedecontenson@ymail.com"},
    # Compte fictif de l'etape 4B, designe medecin par la regle par role de 23-3.
    {"id": "04b20730-65b7-4bb9-8955-67d84da41053", "prenom": "Essai",
     "nom": "DUPONT", "role": "associe", "email": "dr.dupont@fictif.local"},
]

# Effectif de la liste des medecins apres blocage (37 le 17/09/2026, moins 7).
MEDECINS_APRES = 30
MEDECINS_AVANT = MEDECINS_APRES + len(ANCIENS)

BAN = "876000h"  # 100 ans : la duree « definitive » de l'API d'administration

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


# Jeton service_role forge avec le secret JWT du projet : meme procede que
# 22-8C-1b et 23-9.
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


IDS = ", ".join(lit(a["id"]) for a in ANCIENS)

print("=== 23-11 BLOQUER LES ANCIENS COMPTES ===")
print("sens :", "RETOUR ARRIERE (--annuler)" if ANNULER else "blocage")
print("mode :", "EXECUTION REELLE" if GO else "simulation (ajouter --go pour executer)")

# ---------------------------------------------------------------- etat
etat = {r["id"]: r for r in sql(f"""
    select p.id, p.prenom, p.nom, p.role, lower(u.email) as email, p.actif,
           coalesce(p.is_agenda_coordinator, false) as coordinateur,
           p.is_agenda_doctor as medecin,
           coalesce(u.banned_until > now() + interval '50 years', false) as bloque,
           (select count(*) from agenda.shifts s
             where s.assigned_doctor_id = p.id and s.deleted_at is null
               and s.date >= current_date) as gardes_a_venir,
           (select count(*) from agenda.requests r
             where r.doctor_id = p.id and r.status = 'pending') as demandes_en_attente,
           (select count(*) from agenda.rotation_plan_rules r
             where r.doctor_id = p.id) as regles_plan
      from public.profiles p join auth.users u on u.id = p.id
     where p.id in ({IDS});""")}

# ----------------------------------------------------- 1. garde-fous
print(f"\n--- 1. Controles ({len(ANCIENS)} comptes) ---")
for a in ANCIENS:
    e = etat.get(a["id"])
    qui = f"{a['prenom']} {a['nom']}"
    if not e:
        stop(f"{qui} : aucun profil d'identifiant {a['id']}")
    for champ in ("prenom", "nom", "role", "email"):
        if e[champ] != a[champ]:
            stop(f"{qui} : {champ} en base = {e[champ]!r}, attendu {a[champ]!r}")
    if e["actif"]:
        stop(f"{qui} : le compte est ACTIF -- on ne bloque jamais un compte actif")
    if e["coordinateur"]:
        stop(f"{qui} : le compte est coordinateur")
    if not ANNULER:
        for cle, libelle in (("gardes_a_venir", "garde(s) a venir"),
                             ("demandes_en_attente", "demande(s) en attente"),
                             ("regles_plan", "regle(s) de plan de roulement")):
            if e[cle]:
                stop(f"{qui} : {e[cle]} {libelle} -- a regler avant de bloquer")
    print(f"  OK   {qui:28} bloque={str(e['bloque']):5}  medecin={e['medecin']}")

# ------------------------------------------------------- 2. a faire
if ANNULER:
    a_bannir = [a for a in ANCIENS if etat[a["id"]]["bloque"]]
    a_designer = [a for a in ANCIENS if not etat[a["id"]]["medecin"]]
    print(f"\n--- 2. Retour arriere : {len(a_bannir)} deblocage(s), "
          f"{len(a_designer)} remise(s) dans la liste des medecins ---")
else:
    a_bannir = [a for a in ANCIENS if not etat[a["id"]]["bloque"]]
    a_designer = [a for a in ANCIENS if etat[a["id"]]["medecin"]]
    print(f"\n--- 2. A faire : {len(a_bannir)} blocage(s), "
          f"{len(a_designer)} retrait(s) de la liste des medecins ---")
for a in ANCIENS:
    gestes = []
    if a in a_bannir:
        gestes.append("debloquer" if ANNULER else "bloquer")
    if a in a_designer:
        gestes.append("remettre medecin" if ANNULER else "retirer de la liste")
    qui = f"{a['prenom']} {a['nom']}"
    print(f"  {qui:28} {' + '.join(gestes) or 'rien (deja fait)'}")

if not a_bannir and not a_designer:
    print("\nRien a faire.")
elif not GO:
    print("\n[simulation] rien n'a ete ecrit. Ajouter --go pour executer.")
    raise SystemExit(0)
else:
    # ------------------------------------------------- 3. ecriture
    print("\n--- 3. Ecriture ---")
    for a in a_bannir:
        _, err = admin("PUT", f"admin/users/{a['id']}",
                       {"ban_duration": "none" if ANNULER else BAN})
        if err:
            stop(f"{a['prenom']} {a['nom']} : API d'administration -- {err}")
        print(f"  {'debloque' if ANNULER else 'bloque':9} {a['prenom']} {a['nom']}")
    if a_designer:
        ids = ", ".join(lit(a["id"]) for a in a_designer)
        # Le filtre « not actif » est redit dans l'UPDATE lui-meme : aucun
        # chemin ne doit pouvoir retirer un medecin en exercice de la liste.
        sql(f"""update public.profiles set is_agenda_doctor = {'true' if ANNULER else 'false'}
                 where id in ({ids}) and not actif;""")
        print(f"  {len(a_designer)} profil(s) : is_agenda_doctor = {ANNULER}")

# --------------------------------------------------- 4. verification
print("\n--- 4. Verification ---")
v = sql(f"""
    select count(*) filter (where u.banned_until > now() + interval '50 years'
                              and p.id in ({IDS}))                 as anciens_bloques,
           count(*) filter (where not p.is_agenda_doctor and p.id in ({IDS})) as anciens_hors_liste,
           count(*) filter (where u.banned_until > now())            as bloques_dans_la_base,
           count(*) filter (where p.is_agenda_doctor)                as medecins,
           count(*) filter (where p.role = 'remplacant' and not p.actif
                              and (u.banned_until is null or u.banned_until <= now())
                              and p.is_agenda_doctor)                as remplacants_a_ouvrir
      from public.profiles p join auth.users u on u.id = p.id;""")[0]

n = len(ANCIENS)
if ANNULER:
    attendu = {"anciens_bloques": 0, "anciens_hors_liste": 0,
               "bloques_dans_la_base": 0, "medecins": MEDECINS_AVANT,
               "remplacants_a_ouvrir": 27}
else:
    attendu = {"anciens_bloques": n, "anciens_hors_liste": n,
               "bloques_dans_la_base": n, "medecins": MEDECINS_APRES,
               "remplacants_a_ouvrir": 21}
echecs = 0
for cle, val in attendu.items():
    ok = v[cle] == val
    echecs += not ok
    print(f"  {'OK   ' if ok else 'ECHEC'} {cle:22} {v[cle]:>3}  (attendu {val})")
if echecs:
    raise SystemExit(f"\n{echecs} controle(s) en echec.")
print("\nEtat conforme.")
