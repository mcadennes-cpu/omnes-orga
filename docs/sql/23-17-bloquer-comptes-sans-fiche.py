#!/usr/bin/env python3
"""Bloquer les 8 comptes de connexion qui n'ont aucune fiche dans l'appli.

    python3 docs/sql/23-17-bloquer-comptes-sans-fiche.py                 # simulation
    python3 docs/sql/23-17-bloquer-comptes-sans-fiche.py --go            # execute
    python3 docs/sql/23-17-bloquer-comptes-sans-fiche.py --annuler       # simulation du retour
    python3 docs/sql/23-17-bloquer-comptes-sans-fiche.py --annuler --go  # retour arriere

A lancer DEPUIS LA RACINE du depot. Chantier B d'apres J.

POURQUOI CE SCRIPT EXISTE
Mesure du 17/09/2026 : `auth.users` porte 48 comptes pour 40 fiches. Les 8
comptes sans fiche sont des essais de mai et juin (adresses fictives ou
adresses de Matthieu), dont deux se sont connectes en juin. Tous ont leur
adresse confirmee : ils peuvent encore se connecter.

CE QU'ILS VOIENT AUJOURD'HUI, et pourquoi ce n'est pas rien
Deux policies du schema public s'ouvrent a TOUT compte connecte, sans
verifier qu'il a une fiche (`using true`) : `public.profiles` (41 fiches,
avec les emails, les 11 telephones renseignes, les jours de disponibilite et
les notes internes) et `public.annuaire` (143 fiches). Tout le reste exige
une fiche ou un role -- codes d'acces et lieux (`can_read_codes()`),
evenements, fichiers du cabinet, SIM, discussions, et tout l'agenda.
C'est le meme defaut de fond que le chantier D : une regle qui dit « tout
compte connecte » la ou il faudrait « tout membre du cabinet ».

CE QU'IL FAIT
Blocage par l'API d'administration (`ban_duration` = 100 ans), comme 23-11 :
la connexion est refusee quel que soit le mot de passe. Rien d'autre --
aucune fiche a modifier, puisque ces comptes n'en ont pas.

CE QU'IL NE FAIT PAS
Il ne supprime pas les comptes. Matthieu a dit « bloquer voire supprimer » ;
le blocage est reversible, donc on commence par la. La suppression restera
possible ensuite, sans rien casser : le script verifie qu'aucun de ces
identifiants n'apparait nulle part dans la base.

GARDE-FOUS, tous verifies AVANT la moindre ecriture
  . chaque identifiant existe dans auth.users et porte EXACTEMENT l'adresse
    ecrite a la main ci-dessous ;
  . aucun de ces comptes n'a de fiche dans public.profiles -- c'est le
    garde-fou central : on ne bloque jamais un membre du cabinet ;
  . aucune trace : le script relit le catalogue et cherche ces identifiants
    dans TOUTES les colonnes de type uuid des schemas public, agenda et
    storage. Une seule occurrence arrete tout ;
  . le nombre de comptes a bloquer est un fil tendu (NB_COMPTES).
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
# (18/09/2026) -- « toutes les autres etaient des adresses fictives ou les
# miennes pour des tests, inutiles maintenant ». Pour imen94@hotmail.it :
# « Imane El Gari se connectera avec ses identifiants de l'app planning »
# (elle a son propre compte, avec sa fiche : celui-ci ne sert a rien).
SANS_FICHE = [
    {"id": "f358d826-644e-458f-8901-570eddd5986b", "email": "dr.martin@fictif.local"},
    {"id": "76661b0e-088e-4ee1-8b73-89867ed85b37", "email": "dr.bernard@fictif.local"},
    {"id": "a7e9b9ea-2340-41eb-84f9-5f5d7aca0d92", "email": "famillecadennes@gmail.com"},
    {"id": "621adb32-8284-4784-ae9e-903bd53bf361", "email": "mcadennes+1@gmail.com"},
    {"id": "00c287a4-343a-4e7e-b201-1444e251992d", "email": "mireille@hello.com"},
    {"id": "66f10f24-e967-4107-b0d9-f5d09b41fecb", "email": "airelle@hello.com"},
    {"id": "01fdc225-4245-4430-8efd-797393ee8a6b", "email": "charlotte@hello.fr"},
    {"id": "82980d16-581d-4c1c-a797-364ba2fa03b8", "email": "imen94@hotmail.it"},
]

NB_COMPTES = 8            # fil tendu : un compte de plus ou de moins arrete tout
BLOQUES_AVEC_FICHE = 7    # les anciens remplacants de 23-11, qui ne bougent pas
BAN = "876000h"           # 100 ans : la duree « definitive » de l'API d'administration

if not Path("docs/sql").is_dir() or not Path(".env").is_file():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")
if len(SANS_FICHE) != NB_COMPTES:
    raise SystemExit("La liste ne compte pas NB_COMPTES comptes.")

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


def _b64(d):
    return base64.urlsafe_b64encode(d).rstrip(b"=")


_cfg = None


def admin(methode, chemin, corps=None):
    """Appel a l'API d'administration, jeton service_role forge avec le secret
    du projet -- meme procede que 23-11."""
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


IDS = ", ".join(lit(c["id"]) for c in SANS_FICHE)

print("=== 23-17 BLOQUER LES COMPTES SANS FICHE ===")
print("sens :", "RETOUR ARRIERE (--annuler)" if ANNULER else "blocage")
print("mode :", "EXECUTION REELLE" if GO else "simulation (ajouter --go pour executer)")

# ------------------------------------------------------------- 1. etat
etat = {r["id"]: r for r in sql(f"""
    select u.id, lower(u.email) as email,
           coalesce(u.banned_until > now() + interval '50 years', false) as bloque,
           exists (select 1 from public.profiles p where p.id = u.id) as a_une_fiche,
           u.last_sign_in_at is not null as s_est_connecte
      from auth.users u
     where u.id in ({IDS});""")}

print(f"\n--- 1. Controles ({len(SANS_FICHE)} comptes) ---")
for c in SANS_FICHE:
    e = etat.get(c["id"])
    if not e:
        stop(f"{c['email']} : aucun compte d'identifiant {c['id']}")
    if e["email"] != c["email"].lower():
        stop(f"{c['id']} : adresse en base = {e['email']!r}, attendu {c['email']!r}")
    if e["a_une_fiche"]:
        stop(f"{c['email']} : ce compte a une FICHE dans l'appli -- "
             f"on ne bloque jamais un membre du cabinet par ce script")
    print(f"  OK   {c['email']:28} sans fiche, bloque={str(e['bloque']):5} "
          f"deja connecte={e['s_est_connecte']}")

# --- 2. aucune trace de ces comptes nulle part (catalogue relu a chaque fois)
colonnes = sql("""
    select table_schema as s, table_name as t, column_name as c
      from information_schema.columns
     where data_type = 'uuid'
       and table_schema in ('public', 'agenda', 'storage')
     order by 1, 2, 3;""")
morceaux = []
for d in colonnes:
    endroit = d["s"] + "." + d["t"] + "." + d["c"]
    table = '"' + d["s"] + '"."' + d["t"] + '"'
    morceaux.append("select " + lit(endroit) + " as endroit, count(*) as n from "
                    + table + ' where "' + d["c"] + '" in (' + IDS + ")")
traces = sql("select * from (\n" + "\nunion all\n".join(morceaux)
             + "\n) x where n > 0 order by 1;")
print(f"\n--- 2. Traces dans la base ({len(colonnes)} colonnes d'identifiants examinees) ---")
if traces:
    for t in traces:
        print(f"  TROUVE {t['endroit']} : {t['n']}")
    stop("ces comptes ont cree quelque chose : a examiner avant de les bloquer")
print("  OK   aucune trace : ces comptes n'ont rien cree dans l'appli")

# ---------------------------------------------------------- 3. a faire
if ANNULER:
    a_traiter = [c for c in SANS_FICHE if etat[c["id"]]["bloque"]]
    print(f"\n--- 3. Retour arriere : {len(a_traiter)} deblocage(s) ---")
else:
    a_traiter = [c for c in SANS_FICHE if not etat[c["id"]]["bloque"]]
    print(f"\n--- 3. A faire : {len(a_traiter)} blocage(s) ---")
for c in SANS_FICHE:
    geste = ("debloquer" if ANNULER else "bloquer") if c in a_traiter else "rien (deja fait)"
    print(f"  {c['email']:28} {geste}")

if not a_traiter:
    print("\nRien a faire.")
elif not GO:
    print("\n[simulation] rien n'a ete ecrit. Ajouter --go pour executer.")
    raise SystemExit(0)
else:
    print("\n--- 4. Ecriture ---")
    for c in a_traiter:
        _, err = admin("PUT", f"admin/users/{c['id']}",
                       {"ban_duration": "none" if ANNULER else BAN})
        if err:
            stop(f"{c['email']} : API d'administration -- {err}")
        print(f"  {'debloque' if ANNULER else 'bloque':9} {c['email']}")

# ---------------------------------------------------- 5. verification
print("\n--- 5. Verification ---")
v = sql(f"""
    select count(*) filter (where u.banned_until > now() + interval '50 years'
                              and u.id in ({IDS}))                  as vises_bloques,
           count(*) filter (where u.banned_until > now()
                              and p.id is not null)                 as bloques_avec_fiche,
           count(*) filter (where u.banned_until > now())            as bloques_dans_la_base,
           count(*)                                                 as comptes,
           (select count(*) from public.profiles)                    as fiches
      from auth.users u
      left join public.profiles p on p.id = u.id;""")[0]

attendu = {"vises_bloques": 0 if ANNULER else NB_COMPTES,
           "bloques_avec_fiche": BLOQUES_AVEC_FICHE,
           "bloques_dans_la_base": BLOQUES_AVEC_FICHE + (0 if ANNULER else NB_COMPTES)}
echecs = 0
for cle, val in attendu.items():
    ok = v[cle] == val
    echecs += not ok
    print(f"  {'OK   ' if ok else 'ECHEC'} {cle:22} {v[cle]:>3}  (attendu {val})")
print(f"  info  auth.users = {v['comptes']}, fiches = {v['fiches']}")
if echecs:
    raise SystemExit(f"\n{echecs} controle(s) en echec.")
print("\nEtat conforme.")
