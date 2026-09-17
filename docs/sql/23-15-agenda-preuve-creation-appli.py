#!/usr/bin/env python3
"""Preuve : un medecin cree par l'appli est ouvert au Planning (23-14).

    python3 docs/sql/23-15-agenda-preuve-creation-appli.py        # annonce
    python3 docs/sql/23-15-agenda-preuve-creation-appli.py --go   # prouve

A lancer DEPUIS LA RACINE du depot. Etape 8I.

POURQUOI CE SCRIPT
23-14 a ete repete en rollback avec un compte insere directement dans
auth.users. C'est le bon declencheur, mais pas le chemin reel : l'appli
passe par la fonction serveur create-medecin, qui cree le compte PUIS
applique le role -- la creation en deux temps que 23-14 doit traverser.
Ce script prend ce chemin-la, mot pour mot : meme URL, meme corps de
requete que CreateMedecinModal, au nom d'un super_admin (Matthieu), avec
sendEmail = false. Aucun email n'est envoye, le mot de passe temporaire
renvoye n'est jamais affiche.

CE QU'IL VERIFIE, pour trois comptes jetables (@fictif.local)
    remplacant   -> is_agenda_doctor = true,  agenda_beta_access = true
    associe      -> is_agenda_doctor = true,  agenda_beta_access = true
    super_admin  -> is_agenda_doctor = false, agenda_beta_access = true
puis, par le chemin du navigateur, que le remplacant cree LIT les gardes :
c'est la question de Matthieu (« il n'apparait pas dans Planning »).

Les comptes sont supprimes a la fin, y compris en cas d'echec (finally) ;
un passage precedent interrompu est nettoye au demarrage. Reserve assumee,
comme 8C-1b et 23-13 : ils existent quelques secondes dans le
Trombinoscope, sous le nom « Essai 23-15 ».
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
PROJET = "ydihrgnixthrraprclox"
ESSAIS = [("remplacant", True, True), ("associe", True, True), ("super_admin", False, True)]


def adresse(role):
    return f"essai-23-15-{role.replace('_', '-')}@fictif.local"


if not Path("docs/sql").is_dir() or not Path(".env").is_file():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

print("=== 23-15 PREUVE : CREATION PAR L'APPLI -> OUVERT AU PLANNING ===")
if not GO:
    print("[annonce] cree 3 comptes jetables par create-medecin, verifie, supprime.")
    print("Rien n'a ete ecrit. Ajouter --go pour lancer la preuve.")
    raise SystemExit(0)

_env = dict(l.split("=", 1) for l in Path(".env").read_text().splitlines()
            if "=" in l and not l.startswith("#"))
URL = _env["VITE_SUPABASE_URL"].strip()
ANON = _env["VITE_SUPABASE_ANON_KEY"].strip()
_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()


def sql(requete):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJET}/database/query",
        data=json.dumps({"query": requete}).encode(), method="POST",
        headers={"Authorization": f"Bearer {_TOK}", "Content-Type": "application/json",
                 "User-Agent": "curl/8.4.0"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or "null")


_cfg = json.load(urllib.request.urlopen(urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{PROJET}/postgrest",
    headers={"Authorization": f"Bearer {_TOK}", "User-Agent": "omnes-orga-script/1.0"})))


def _b64(d):
    return base64.urlsafe_b64encode(d).rstrip(b"=")


def jeton(charge):
    entete = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    c = _b64(json.dumps({**charge, "iat": int(time.time()), "exp": int(time.time()) + 600}).encode())
    return (entete + b"." + c + b"." + _b64(hmac.new(_cfg["jwt_secret"].encode(),
            entete + b"." + c, hashlib.sha256).digest())).decode()


def appel(methode, url, jeton_, corps=None, profil=None, prefer=None):
    h = {"apikey": ANON, "Authorization": f"Bearer {jeton_}", "Content-Type": "application/json"}
    if profil:
        h["Accept-Profile"] = profil
    if prefer:
        h["Prefer"] = prefer
    req = urllib.request.Request(url, data=json.dumps(corps).encode() if corps is not None else None,
                                 headers=h, method=methode)
    # Le corps et les en-tetes sont lus DANS le with : une fois la connexion
    # refermee, read() renvoie une chaine vide (defaut du premier passage).
    try:
        with urllib.request.urlopen(req) as r:
            return True, r.read().decode(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code} -- {e.read().decode()[:200]}", {}


SERVICE = {"role": "service_role", "iss": "supabase"}
_resultats = []


def verifier(titre, ok, detail=""):
    _resultats.append((titre, bool(ok)))
    print(f"  {'OK   ' if ok else 'ECHEC'} {titre}" + (f"  -- {detail}" if detail and not ok else ""))


def nettoyer():
    for role, _, _ in ESSAIS:
        for l in sql(f"select id from auth.users where lower(email) = '{adresse(role)}'"):
            appel("DELETE", f"{URL}/auth/v1/admin/users/{l['id']}", jeton(SERVICE))


moi = sql("""select id from public.profiles
              where role = 'super_admin' and actif and prenom = 'Matthieu' and nom = 'CADENNES'""")[0]["id"]
nettoyer()
try:
    for role, medecin_attendu, drapeau_attendu in ESSAIS:
        print(f"\n--- {role} ---")
        ok, texte, _ = appel("POST", f"{URL}/functions/v1/create-medecin",
                             jeton({"sub": moi, "role": "authenticated", "aud": "authenticated"}),
                             {"email": adresse(role), "prenom": "Essai", "nom": f"23-15 {role}",
                              "role": role, "sendEmail": False})
        reponse = json.loads(texte) if ok else texte
        verifier("create-medecin cree le compte (au nom de Matthieu, sans email)",
                 ok and reponse.get("success"), str(reponse)[:200])
        if not ok:
            continue
        p = sql(f"""select p.role, p.actif, p.is_agenda_doctor, p.agenda_beta_access
                      from public.profiles p where p.id = '{reponse['userId']}'""")[0]
        verifier(f"role applique : {p['role']}", p["role"] == role, str(p))
        verifier(f"liste des medecins = {medecin_attendu}", p["is_agenda_doctor"] is medecin_attendu, str(p))
        verifier(f"drapeau Planning = {drapeau_attendu}", p["agenda_beta_access"] is drapeau_attendu, str(p))
        if role == "remplacant":
            ok2, texte2, entetes = appel("GET", f"{URL}/rest/v1/shifts?select=id&limit=1",
                                         jeton({"sub": reponse["userId"], "role": "authenticated",
                                                "aud": "authenticated"}),
                                         profil="agenda", prefer="count=exact")
            n = int(entetes.get("Content-Range", "*/0").split("/")[-1]) if ok2 else texte2
            verifier("le remplacant cree lit les gardes du Planning", ok2 and n > 0, str(n))
finally:
    nettoyer()
    restes = sql("select count(*) n from auth.users where email like 'essai-23-15-%@fictif.local'")[0]["n"]
    profils = sql("select count(*) n from public.profiles where nom like '23-15 %'")[0]["n"]
    print()
    verifier("les comptes d'essai ont disparu", restes == 0, str(restes))
    verifier("leurs profils ont suivi", profils == 0, str(profils))

echecs = [t for t, ok in _resultats if not ok]
print(f"\n{'='*62}\n{len(_resultats)-len(echecs)}/{len(_resultats)} controles au vert")
if echecs:
    print("ECHECS : " + " | ".join(echecs))
    sys.exit(1)
