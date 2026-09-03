#!/usr/bin/env python3
"""Repetition du transfert d'empreinte, sur comptes d'essai jetables.

    python3 docs/sql/22-8C-1b-repetition-transfert-mots-de-passe.py

A lancer DEPUIS LA RACINE du depot.

CE QU'IL PROUVE, ET POURQUOI IL EXISTE
La verification finale de 22-8C-1 relit les deux bases et compare les
empreintes. Elle prouve que LA COPIE A EU LIEU -- pas qu'ON PEUT SE
CONNECTER. Ce n'est pas la meme chose, et c'est exactement l'ecart qui se
paie le soir de la bascule.

Or personne au cabinet ne connait le mot de passe d'un remplacant : le
transfert reel n'est donc pas verifiable par une connexion avant que
quelqu'un n'essaie pour de bon. Ce script comble ce trou autrement : il
rejoue le mecanisme de bout en bout sur des comptes fabriques pour
l'occasion, dont il choisit lui-meme les mots de passe.

    compte A   mot de passe connu du script
    compte B   AUTRE mot de passe, connu du script

    1. B accepte son propre mot de passe                (le temoin)
    2. B refuse celui de A                              (les deux different)
    3. on copie l'empreinte de A sur B -- meme SQL que 8C-1
    4. B accepte desormais le mot de passe de A         <-- LA PREUVE
    5. B refuse son ancien mot de passe

Les controles 1 et 2 ne sont pas du remplissage : sans eux, un controle 4
au vert ne prouverait rien -- un compte qui accepte tout, ou deux mots de
passe identiques par accident, donneraient le meme resultat.

Le script mesure aussi ce que vaut email_confirmed_at sur CE projet, en
retirant la confirmation puis en retentant la connexion. La reponse n'est
pas devinable : elle depend d'un reglage GoTrue du projet, pas du code.

CE QU'IL N'ECRIT PAS
    la base Bolt        jamais ouverte. Ce script ne parle qu'a Orga.
    un compte reel      il ne touche qu'aux deux comptes qu'il vient de
                        creer, reperes par une adresse en @fictif.local.
    le schema agenda    aucun rapport.

Les deux comptes sont supprimes a la fin, y compris si le script echoue
en cours de route (bloc finally) -- et un passage precedent interrompu est
nettoye au demarrage. profiles.id porte un ON DELETE CASCADE vers
auth.users : supprimer le compte emporte le profil, verifie a la fin.

RESERVE ASSUMEE : le declencheur handle_new_user cree le profil avec
actif = true et le role par defaut « remplacant ». Le script le repasse a
false dans la seconde qui suit, mais il existe une fenetre d'un instant ou
deux profils d'essai sont actifs dans la base du cabinet. Ils portent le
nom « ESSAI 8C-1b » et une adresse @fictif.local, precisement pour etre
reconnaissables si quelqu'un tombe dessus.
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

PROJET = "ydihrgnixthrraprclox"          # OMNES ORGA
SOURCE = "essai-8c1b-source@fictif.local"
CIBLE = "essai-8c1b-cible@fictif.local"

if not Path("docs/sql").is_dir() or not Path(".env").is_file():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

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


# Jeton service_role forge avec le secret du projet -- meme procede que le
# harnais 22-MOD2-outil-test.py, qui fabrique des jetons « authenticated ».
# C'est ce qui donne acces a /auth/v1/admin, seule voie propre pour creer un
# compte : une insertion directe dans auth.users obligerait a reproduire a la
# main ce que GoTrue met dans auth.identities, et un oubli la-dedans ferait
# echouer la connexion pour une raison etrangere a ce qu'on teste.
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


def admin(methode, chemin, corps=None):
    # apikey = la VRAIE cle anon, Authorization = le jeton service_role forge.
    # Le projet valide l'entete apikey contre ses cles reelles (« Invalid API
    # key » sinon), mais accepte un Authorization signe avec le secret JWT --
    # c'est le partage des roles qu'exploite deja 22-MOD2-outil-test.py.
    req = urllib.request.Request(
        f"{URL}/auth/v1/{chemin}",
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={"apikey": ANON, "Authorization": f"Bearer {jeton_service()}",
                 "Content-Type": "application/json"}, method=methode)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or "null"), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code} -- {e.read().decode()[:200]}"


def connexion(email, mot_de_passe):
    """Vraie connexion, par la porte d'entree publique. (ok, message)"""
    req = urllib.request.Request(
        f"{URL}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": mot_de_passe}).encode(),
        headers={"apikey": ANON, "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            return bool(json.loads(r.read()).get("access_token")), "connecte"
    except urllib.error.HTTPError as e:
        corps = e.read().decode()[:200]
        try:
            corps = json.loads(corps).get("error_description") or \
                json.loads(corps).get("msg") or corps
        except Exception:
            pass
        return False, f"HTTP {e.code} -- {corps}"


_resultats = []


def verifier(titre, ok, detail=""):
    _resultats.append((titre, bool(ok)))
    print(f"  {'OK   ' if ok else 'ECHEC'} {titre}"
          + (f"  -- {detail}" if detail and not ok else ""))


def creer(email):
    """Cree un compte d'essai confirme, profil aussitot desactive."""
    mdp = secrets.token_urlsafe(18)
    donnees, err = admin("POST", "admin/users",
                         {"email": email, "password": mdp,
                          "email_confirm": True})
    if err:
        raise SystemExit(f"ARRET : creation de {email} : {err}")
    uid = donnees["id"]
    _, err = sql(f"""update public.profiles
                        set nom = 'ESSAI 8C-1b', prenom = 'Compte',
                            actif = false
                      where id = '{uid}';""")
    if err:
        raise SystemExit(f"ARRET : desactivation du profil {email} : {err}")
    return uid, mdp


def supprimer(email):
    """Supprime le compte s'il existe. Le profil suit (ON DELETE CASCADE)."""
    lignes, err = sql("select id from auth.users where lower(email) = "
                      f"'{email}';")
    if err or not lignes:
        return
    for l in lignes:
        admin("DELETE", f"admin/users/{l['id']}")


print("=== REPETITION DU TRANSFERT D'EMPREINTE (comptes d'essai) ===")
print(f"projet : {PROJET} (Orga)   -- la base Bolt n'est pas ouverte\n")

# Un passage precedent interrompu laisserait des comptes derriere lui, et la
# creation echouerait sur une adresse deja prise.
supprimer(SOURCE)
supprimer(CIBLE)

uid_source = uid_cible = None
try:
    uid_source, mdp_source = creer(SOURCE)
    uid_cible, mdp_cible = creer(CIBLE)
    print(f"  deux comptes d'essai crees, profils desactives\n")

    # --- les temoins, sans lesquels la preuve ne prouverait rien
    ok, msg = connexion(CIBLE, mdp_cible)
    verifier("la cible accepte son propre mot de passe", ok, msg)

    ok, msg = connexion(CIBLE, mdp_source)
    verifier("la cible refuse le mot de passe de la source", not ok,
             "elle l'accepte deja : les deux mots de passe se confondent")

    # --- le transfert, mot pour mot celui de 22-8C-1
    _, err = sql(f"""
        update auth.users cible
           set encrypted_password = source.encrypted_password,
               email_confirmed_at = source.email_confirmed_at,
               updated_at = now()
          from auth.users source
         where source.id = '{uid_source}' and cible.id = '{uid_cible}';""")
    verifier("l'empreinte est copiee sans erreur", not err, str(err))

    lignes, err = sql(f"""
        select (select encrypted_password from auth.users where id='{uid_source}')
             = (select encrypted_password from auth.users where id='{uid_cible}')
               as identiques;""")
    verifier("les deux empreintes sont identiques en base",
             not err and lignes and lignes[0]["identiques"], str(err))

    # --- LA PREUVE
    ok, msg = connexion(CIBLE, mdp_source)
    verifier("LA CIBLE ACCEPTE LE MOT DE PASSE DE LA SOURCE", ok, msg)

    ok, msg = connexion(CIBLE, mdp_cible)
    verifier("la cible refuse desormais son ancien mot de passe", not ok,
             "l'ancien mot de passe fonctionne encore")

    # --- ce que vaut email_confirmed_at sur ce projet
    # Reponse non devinable : elle depend du reglage « Confirm email » de
    # GoTrue, pas du code. Si la connexion passe sans confirmation, la
    # colonne est une precaution ; si elle est refusee, elle est vitale --
    # et 22-8C-1 la transporte dans les deux cas.
    _, err = sql(f"update auth.users set email_confirmed_at = null "
                 f"where id = '{uid_cible}';")
    if err:
        raise SystemExit(f"ARRET : retrait de la confirmation : {err}")
    ok_sans, msg_sans = connexion(CIBLE, mdp_source)

    _, err = sql(f"update auth.users set email_confirmed_at = now() "
                 f"where id = '{uid_cible}';")
    if err:
        raise SystemExit(f"ARRET : remise de la confirmation : {err}")
    ok_avec, msg_avec = connexion(CIBLE, mdp_source)
    verifier("la confirmation remise, la connexion repasse", ok_avec, msg_avec)

    print()
    if ok_sans:
        print("  > email_confirmed_at n'est PAS exige par ce projet pour se")
        print("    connecter. 22-8C-1 le transporte quand meme : le reglage")
        print("    GoTrue peut changer, et un compte non confirme reste une")
        print("    anomalie visible dans le tableau de bord Supabase.")
    else:
        print("  > email_confirmed_at est INDISPENSABLE : sans lui la")
        print(f"    connexion est refusee ({msg_sans}).")
        print("    Sans cette colonne, transferer le mot de passe des 27")
        print("    comptes n'aurait servi a rien -- ils seraient restes")
        print("    bloques, sur un message qui ne dit pas pourquoi.")

finally:
    supprimer(SOURCE)
    supprimer(CIBLE)
    restes, err = sql(
        "select count(*) n from auth.users "
        f"where lower(email) in ('{SOURCE}', '{CIBLE}');")
    profils, err2 = sql("select count(*) n from public.profiles "
                        "where nom = 'ESSAI 8C-1b';")
    print()
    verifier("les comptes d'essai ont disparu",
             not err and restes and restes[0]["n"] == 0,
             f"il en reste {restes[0]['n'] if restes else '?'}")
    verifier("leurs profils ont suivi (ON DELETE CASCADE)",
             not err2 and profils and profils[0]["n"] == 0,
             f"il en reste {profils[0]['n'] if profils else '?'}")

echecs = [t for t, ok in _resultats if not ok]
print(f"\n{'='*62}")
print(f"{len(_resultats)-len(echecs)}/{len(_resultats)} controles au vert")
if echecs:
    print("ECHECS : " + " | ".join(echecs))
    sys.exit(1)
print("\nLe mecanisme de 22-8C-1 est prouve : recopier une empreinte suffit")
print("a rendre un mot de passe valide sur le compte cible.")
