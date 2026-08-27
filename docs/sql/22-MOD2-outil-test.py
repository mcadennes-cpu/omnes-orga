"""Harnais commun aux tests de MOD-2, par le CHEMIN DU NAVIGATEUR.

Importe par les scripts 22-MOD2*-test-*.py. Ne fait rien tout seul.

POURQUOI CE HARNAIS EXISTE
Le module est protege par des policies RLS et par des fonctions
SECURITY DEFINER. Ces deux mecanismes se comportent differemment selon le
role : une verification faite en role postgres, via l'API
d'administration, ne prouve RIEN sur ce que voit un utilisateur. MOD-1
l'a appris deux fois, dont une fuite de lecture en 6G.

Ce harnais fabrique donc de vrais jetons d'acces, signes avec le secret
du projet, et appelle PostgREST exactement comme le ferait le navigateur
(role authenticated, Content-Profile: agenda, policies actives).

    import importlib.util, pathlib
    spec = importlib.util.spec_from_file_location(
        "outil_test", "docs/sql/22-MOD2-outil-test.py")
    t = importlib.util.module_from_spec(spec); spec.loader.exec_module(t)

    t.rest("GET", "shifts?select=id", t.MEDECIN)
    t.verifier("titre du controle", condition, detail)
    t.bilan()
"""
import atexit
import base64
import hashlib
import hmac
import importlib.util
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

PROJET = "ydihrgnixthrraprclox"

if not Path("docs/sql").is_dir() or not Path(".env").is_file():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

_spec = importlib.util.spec_from_file_location(
    "outil", "docs/sql/22-6-outil-comparer-roulement-fichiers.py")
outil = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(outil)

#: Requete SQL en role postgres (API d'administration). Pour PREPARER et
#: CONSTATER, jamais pour prouver ce que voit un utilisateur.
sql = outil.interroger

_cfg = json.load(urllib.request.urlopen(urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{PROJET}/postgrest",
    headers={"Authorization": f"Bearer {outil.jeton_supabase()}",
             "User-Agent": "omnes-orga-script/1.0"})))
_env = dict(l.split("=", 1) for l in Path(".env").read_text().splitlines()
            if "=" in l and not l.startswith("#"))
URL = _env["VITE_SUPABASE_URL"].strip()
ANON = _env["VITE_SUPABASE_ANON_KEY"].strip()


def _b64(d):
    return base64.urlsafe_b64encode(d).rstrip(b"=")


def jeton(uid):
    """Fabrique un jeton d'acces identique a celui qu'emettrait Supabase."""
    entete = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    charge = _b64(json.dumps({"sub": uid, "role": "authenticated",
                              "aud": "authenticated", "iat": int(time.time()),
                              "exp": int(time.time()) + 900}).encode())
    signature = _b64(hmac.new(_cfg["jwt_secret"].encode(),
                              entete + b"." + charge, hashlib.sha256).digest())
    return (entete + b"." + charge + b"." + signature).decode()


def rest(methode, chemin, uid, corps=None, prefer=None):
    """Appel PostgREST en tant que l'utilisateur uid, schema agenda.

    Retourne (ok, donnees) ou (False, "HTTP nnn -- message").
    """
    en_tetes = {"apikey": ANON, "Authorization": f"Bearer {jeton(uid)}",
                "Content-Type": "application/json",
                "Accept-Profile": "agenda", "Content-Profile": "agenda"}
    if prefer:
        en_tetes["Prefer"] = prefer
    req = urllib.request.Request(
        f"{URL}/rest/v1/{chemin}",
        data=json.dumps(corps).encode() if corps is not None else None,
        headers=en_tetes, method=methode)
    try:
        with urllib.request.urlopen(req) as r:
            brut = r.read().decode()
            return True, (json.loads(brut) if brut.strip() else [])
    except urllib.error.HTTPError as e:
        detail = e.read().decode()
        try:
            detail = json.loads(detail).get("message") or detail
        except Exception:
            pass
        return False, f"HTTP {e.code} -- {detail}"


# ---------------------------------------------------------------------
# Comptes
#
# Il faut un compte COORDINATEUR et un compte MEDECIN. Sans le second,
# toute verification de cloison passe A VIDE en affichant OK :
# peut_acceder() bloque en amont, et on croit tester une policy qu'on
# n'atteint jamais. Le defaut a ete rencontre pour de vrai en MOD2-A.
#
# Jusqu'au 27/08/2026, aucun compte beta n'etait non coordinateur : le
# harnais ouvrait donc l'acces a un associe le temps du test, puis le
# refermait. Depuis 23-7, un troisieme compte beta existe (Airelle
# Sauvage) et l'emprunt n'a plus lieu d'etre -- on ne touche plus a la
# table des profils.
#
# L'emprunt est CONSERVE en secours, pour le cas ou ce compte perdrait
# son acces : le harnais doit continuer de fonctionner sans intervention.
# ---------------------------------------------------------------------
_coord = sql("""select id, prenom||' '||nom as nom from public.profiles
                 where is_agenda_coordinator order by nom limit 1""")[0]

_titulaires = sql("""select id, prenom||' '||nom as nom from public.profiles
                      where coalesce(is_agenda_coordinator,false)=false
                        and actif and agenda_beta_access
                      order by nom limit 1""")
_EMPRUNT = not _titulaires
_medecin = _titulaires[0] if _titulaires else sql(
    """select id, prenom||' '||nom as nom from public.profiles
        where coalesce(is_agenda_coordinator,false)=false
          and actif and coalesce(agenda_beta_access,false)=false
        order by nom limit 1""")[0]

COORDINATEUR = _coord["id"]
MEDECIN = _medecin["id"]
NOM_COORDINATEUR = _coord["nom"]
NOM_MEDECIN = _medecin["nom"]

_BETA_ATTENDUS = sql(
    "select count(*) as n from public.profiles where agenda_beta_access")[0]["n"]

if _EMPRUNT:
    sql(f"update public.profiles set agenda_beta_access = true where id = '{MEDECIN}'")

    @atexit.register
    def _rendre_letat_initial():
        sql("update public.profiles set agenda_beta_access = false "
            f"where id = '{MEDECIN}'")
        reste = sql("select count(*) as n from public.profiles "
                    "where agenda_beta_access")[0]["n"]
        etat = "OK" if reste == _BETA_ATTENDUS else f"ANOMALIE (attendu {_BETA_ATTENDUS})"
        print(f"\nAcces beta rendu -- {reste} compte(s) en beta : {etat}")


# ---------------------------------------------------------------------
# Comptage des controles
# ---------------------------------------------------------------------
_resultats = []


def verifier(titre, ok, detail=""):
    _resultats.append((titre, bool(ok)))
    print(f"  {'OK   ' if ok else 'ECHEC'} {titre}"
          + (f"  -- {detail}" if detail and not ok else ""))


def bilan():
    """Affiche le total et sort en code 1 si un controle a echoue."""
    echecs = [t for t, ok in _resultats if not ok]
    print(f"\n{'='*62}")
    print(f"{len(_resultats)-len(echecs)}/{len(_resultats)} controles au vert")
    if echecs:
        print("ECHECS : " + " | ".join(echecs))
        raise SystemExit(1)


def entete():
    print(f"Coordinateur : {NOM_COORDINATEUR}")
    print(f"Medecin      : {NOM_MEDECIN}"
          + ("  (acces beta ouvert le temps du test)" if _EMPRUNT
             else "  (compte beta permanent, 23-7)") + "\n")
