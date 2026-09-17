#!/usr/bin/env python3
"""Preuve, sur un compte d'essai jetable : mot de passe court et blocage.

    python3 docs/sql/23-13-agenda-preuve-mot-de-passe-court-et-blocage.py        # annonce
    python3 docs/sql/23-13-agenda-preuve-mot-de-passe-court-et-blocage.py --go   # prouve

A lancer DEPUIS LA RACINE du depot. Etape 8F-3.

DEUX QUESTIONS QUE PERSONNE NE PEUT VERIFIER SUR UN VRAI COMPTE
Personne au cabinet ne connait le mot de passe d'un remplacant. Deux
affirmations dont depend la bascule restent donc des suppositions tant
qu'on ne les rejoue pas sur un compte dont on choisit le mot de passe.

1. UN MOT DE PASSE BOLT COURT OUVRE-T-IL ORGA ?
   Orga exige 10 caracteres (reglage Auth du projet), Bolt n'en exigeait
   que 6. 8C-1 a recopie les empreintes de Bolt ; 8C-1b a prouve que la
   copie ouvre la session -- mais avec des mots de passe de 24 caracteres.
   Rien ne disait qu'un mot de passe de 6 a 9 caracteres, accepte par Bolt,
   ne serait pas refuse a la connexion par la regle d'Orga. Si c'etait le
   cas, une partie des 21 remplacants ne pourrait pas entrer le soir J.

2. UN COMPTE BLOQUE PAR 23-11 NE PEUT-IL VRAIMENT PLUS SE CONNECTER ?
   23-11 a bloque 7 comptes (ban de 100 ans). La base le confirme, mais une
   colonne remplie ne prouve pas une porte fermee.

CE QU'IL FAIT, sur UN compte cree pour l'occasion (@fictif.local)
    1. le compte accepte son mot de passe long                (temoin)
    2. on lui pose l'empreinte d'un mot de passe de 6 caracteres, au format
       exact de Bolt ($2a$10$, calculee par pgcrypto) -- meme geste que 8C-1
    3. l'ancien mot de passe long est refuse                  (temoin : c'est
       bien la nouvelle empreinte qui est lue)
    4. LE MOT DE PASSE DE 6 CARACTERES OUVRE LA SESSION       <-- preuve 1
    5. le jeton obtenu lit l'API                              (session utile)
    6. blocage par l'API d'administration, meme appel que 23-11
    7. LE BON MOT DE PASSE EST REFUSE                         <-- preuve 2
    8. la session ouverte avant le blocage ne se renouvelle plus
    9. debloque, la connexion repasse -- c'est le retour arriere de 23-11

Les temoins 1 et 3 ne sont pas du remplissage : sans eux, un 4 au vert ne
prouverait rien (un compte qui accepte tout donnerait le meme resultat), et
sans le 4, un 7 au vert ne prouverait rien non plus (un mot de passe faux
est refuse, bloque ou pas).

CE QU'IL N'ECRIT PAS
    la base Bolt     jamais ouverte.
    un compte reel   il ne touche qu'au compte qu'il vient de creer.
Le compte est supprime a la fin, y compris en cas d'echec (finally), et un
passage precedent interrompu est nettoye au demarrage. Le profil suit
(ON DELETE CASCADE), verifie a la fin.

RESERVE ASSUMEE, comme en 8C-1b : handle_new_user cree le profil actif ; le
script le desactive dans la seconde. Nom « ESSAI 23-13 », adresse
@fictif.local, mot de passe connu du seul script.
"""
import base64
import hashlib
import hmac
import json
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

GO = "--go" in sys.argv
PROJET = "ydihrgnixthrraprclox"          # OMNES ORGA
ESSAI = "essai-23-13@fictif.local"
COURT = "Omn3s!"                          # 6 caracteres : le minimum de Bolt
BAN = "876000h"                           # celui de 23-11

if not Path("docs/sql").is_dir() or not Path(".env").is_file():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

print("=== 23-13 PREUVE : MOT DE PASSE COURT ET BLOCAGE (compte d'essai) ===")
print(f"projet : {PROJET} (Orga)   -- la base Bolt n'est pas ouverte")
if not GO:
    print("\n[annonce] cree le compte jetable", ESSAI, "puis le supprime.")
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
        data=json.dumps({"query": requete}).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {_TOK}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "curl/8.4.0")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or "null"), None
    except urllib.error.HTTPError as e:
        return None, e.read().decode()[:300]


# Jeton service_role forge avec le secret du projet : meme procede que 8C-1b.
_cfg = json.load(urllib.request.urlopen(urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{PROJET}/postgrest",
    headers={"Authorization": f"Bearer {_TOK}",
             "User-Agent": "omnes-orga-script/1.0"})))


def _b64(d):
    return base64.urlsafe_b64encode(d).rstrip(b"=")


def jeton_service():
    entete = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    charge = _b64(json.dumps({"role": "service_role", "iss": "supabase",
                              "iat": int(time.time()),
                              "exp": int(time.time()) + 900}).encode())
    sig = _b64(hmac.new(_cfg["jwt_secret"].encode(),
                        entete + b"." + charge, hashlib.sha256).digest())
    return (entete + b"." + charge + b"." + sig).decode()


def appel(methode, url, corps=None, jeton=None, profil=None):
    """(ok, donnees ou message). jeton=None -> cle anon seule."""
    en_tetes = {"apikey": ANON, "Content-Type": "application/json"}
    if jeton:
        en_tetes["Authorization"] = f"Bearer {jeton}"
    if profil:
        en_tetes["Accept-Profile"] = profil
    req = urllib.request.Request(
        url, data=json.dumps(corps).encode() if corps is not None else None,
        headers=en_tetes, method=methode)
    try:
        with urllib.request.urlopen(req) as r:
            return True, json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        brut = e.read().decode()[:200]
        try:
            d = json.loads(brut)
            brut = d.get("msg") or d.get("error_description") or d.get("message") or brut
        except Exception:
            pass
        return False, f"HTTP {e.code} -- {brut}"


def admin(methode, chemin, corps=None):
    return appel(methode, f"{URL}/auth/v1/{chemin}", corps, jeton_service())


def connexion(mot_de_passe):
    """Vraie connexion, par la porte d'entree publique de l'appli."""
    ok, d = appel("POST", f"{URL}/auth/v1/token?grant_type=password",
                  {"email": ESSAI, "password": mot_de_passe})
    if ok and not (d or {}).get("access_token"):
        return False, "reponse sans jeton"
    return ok, d


_resultats = []


def verifier(titre, ok, detail=""):
    _resultats.append((titre, bool(ok)))
    print(f"  {'OK   ' if ok else 'ECHEC'} {titre}"
          + (f"  -- {detail}" if detail and not ok else ""))


def supprimer():
    lignes, err = sql(f"select id from auth.users where lower(email) = '{ESSAI}';")
    for l in (lignes or []):
        admin("DELETE", f"admin/users/{l['id']}")


supprimer()  # un passage precedent interrompu
try:
    long_mdp = secrets.token_urlsafe(18)
    ok, d = admin("POST", "admin/users",
                  {"email": ESSAI, "password": long_mdp, "email_confirm": True})
    if not ok:
        raise SystemExit(f"ARRET : creation du compte d'essai : {d}")
    uid = d["id"]
    _, err = sql(f"""update public.profiles
                        set nom = 'ESSAI 23-13', prenom = 'Compte', actif = false
                      where id = '{uid}';""")
    if err:
        raise SystemExit(f"ARRET : desactivation du profil d'essai : {err}")
    print("  compte d'essai cree, profil desactive\n")

    print("--- 1. Mot de passe court ---")
    ok, d = connexion(long_mdp)
    verifier("temoin : le compte accepte son mot de passe long", ok, str(d))

    # Meme geste que 8C-1 : on pose une empreinte, on ne passe pas par GoTrue.
    lignes, err = sql(f"""
        update auth.users
           set encrypted_password = extensions.crypt({"'" + COURT + "'"},
                                                     extensions.gen_salt('bf', 10)),
               updated_at = now()
         where id = '{uid}'
     returning left(encrypted_password, 7) as prefixe;""")
    verifier(f"empreinte d'un mot de passe de {len(COURT)} caracteres posee au format Bolt",
             not err and lignes and lignes[0]["prefixe"] == "$2a$10$",
             str(err or lignes))

    ok, d = connexion(long_mdp)
    verifier("temoin : l'ancien mot de passe long est refuse", not ok,
             "il est encore accepte -- la nouvelle empreinte n'est pas lue")

    ok, session = connexion(COURT)
    verifier(f"LE MOT DE PASSE DE {len(COURT)} CARACTERES OUVRE LA SESSION", ok, str(session))
    if ok:
        faible = session.get("weak_password")
        print(f"         (GoTrue signale un mot de passe faible : "
              f"{'oui -- ' + json.dumps(faible) if faible else 'non'} ; "
              "l'appli n'en tient pas compte)")
        ok_api, d = appel("GET", f"{URL}/rest/v1/profiles?select=id&limit=1",
                          jeton=session["access_token"], profil="public")
        verifier("le jeton obtenu lit l'API", ok_api, str(d))

    print("\n--- 2. Blocage ---")
    ok, d = admin("PUT", f"admin/users/{uid}", {"ban_duration": BAN})
    verifier("le compte est bloque sans erreur (appel de 23-11)", ok, str(d))

    ok, d = connexion(COURT)
    verifier("LE BON MOT DE PASSE EST REFUSE AU COMPTE BLOQUE", not ok,
             "la connexion passe malgre le blocage")
    if not ok:
        print(f"         (reponse : {d})")

    if session and isinstance(session, dict) and session.get("refresh_token"):
        ok, d = appel("POST", f"{URL}/auth/v1/token?grant_type=refresh_token",
                      {"refresh_token": session["refresh_token"]})
        verifier("la session ouverte avant le blocage ne se renouvelle plus",
                 not ok, "le renouvellement passe malgre le blocage")

    ok, d = admin("PUT", f"admin/users/{uid}", {"ban_duration": "none"})
    verifier("debloque sans erreur (retour arriere de 23-11)", ok, str(d))
    ok, d = connexion(COURT)
    verifier("debloque, la connexion repasse", ok, str(d))

finally:
    supprimer()
    restes, err = sql(f"select count(*) n from auth.users where lower(email) = '{ESSAI}';")
    profils, err2 = sql("select count(*) n from public.profiles where nom = 'ESSAI 23-13';")
    print()
    verifier("le compte d'essai a disparu",
             not err and restes and restes[0]["n"] == 0, str(err or restes))
    verifier("son profil a suivi (ON DELETE CASCADE)",
             not err2 and profils and profils[0]["n"] == 0, str(err2 or profils))

echecs = [t for t, ok in _resultats if not ok]
print(f"\n{'='*62}")
print(f"{len(_resultats)-len(echecs)}/{len(_resultats)} controles au vert")
if echecs:
    print("ECHECS : " + " | ".join(echecs))
    sys.exit(1)
