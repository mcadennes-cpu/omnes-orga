"""Test de bout en bout du journal d'activite du module Agenda (MOD2-A).

    python3 docs/sql/22-MOD2A-2-test-journal-activite.py

A lancer DEPUIS LA RACINE du depot (le script lit .env et importe l'outil
22-6-outil-comparer-roulement-fichiers.py par chemin relatif).

POURQUOI CE SCRIPT EXISTE
Le journal est verrouille par des policies RLS et alimente par des
declencheurs SECURITY DEFINER. Ces deux mecanismes se comportent
differemment selon le role : une verification faite en role postgres, via
l'API d'administration, ne prouve RIEN sur ce que voit un utilisateur.
MOD-1 l'a appris deux fois, dont une fuite de lecture en 6G. Ce script
passe donc par le CHEMIN DU NAVIGATEUR : jeton JWT signe avec le secret
du projet, appels PostgREST en role "authenticated", policies actives.

Il est concu pour etre REJOUE : MOD2-B change la nature de la suppression
(deleted_at) et MOD2-D ajoute la restauration -- les deux touchent a ce
qui est verifie ici.

⚠ CE SCRIPT ECRIT DANS LA BASE. Il cree une garde de test au 24/11/2027
(tres au-dela du calendrier reel), la manipule, puis efface la garde ET
les entrees de journal qu'il a produites. Il ouvre aussi temporairement
l'acces beta a un associe -- voir la section "Comptes" plus bas.
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
DATE_TEST = "2027-11-24"

if not Path("docs/sql").is_dir() or not Path(".env").is_file():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

spec = importlib.util.spec_from_file_location(
    "outil", "docs/sql/22-6-outil-comparer-roulement-fichiers.py")
o = importlib.util.module_from_spec(spec)
spec.loader.exec_module(o)

# Le secret de signature des jetons, recupere par l'API Management. C'est
# ce qui permet de fabriquer un jeton valide pour n'importe quel compte,
# et donc de tester ce que chaque role voit reellement.
cfg = json.load(urllib.request.urlopen(urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{PROJET}/postgrest",
    headers={"Authorization": f"Bearer {o.jeton_supabase()}",
             "User-Agent": "omnes-orga-script/1.0"})))
env = dict(l.split("=", 1) for l in Path(".env").read_text().splitlines()
           if "=" in l and not l.startswith("#"))
URL = env["VITE_SUPABASE_URL"].strip()
ANON = env["VITE_SUPABASE_ANON_KEY"].strip()


def b64(d):
    return base64.urlsafe_b64encode(d).rstrip(b"=")


def jeton(uid):
    """Fabrique un jeton d'acces identique a celui qu'emettrait Supabase."""
    entete = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    charge = b64(json.dumps({"sub": uid, "role": "authenticated",
                             "aud": "authenticated", "iat": int(time.time()),
                             "exp": int(time.time()) + 900}).encode())
    signature = b64(hmac.new(cfg["jwt_secret"].encode(),
                             entete + b"." + charge, hashlib.sha256).digest())
    return (entete + b"." + charge + b"." + signature).decode()


def rest(methode, chemin, uid, corps=None, prefer=None):
    """Appel PostgREST en tant que l'utilisateur uid, schema agenda."""
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
# ⚠ Les 2 seuls comptes ayant agenda_beta_access (Matthieu et Charlotte)
# sont AUSSI coordinateurs depuis 6A. Sans compte "medecin", la cloison
# de lecture du journal ne peut pas etre testee : peut_acceder() bloque
# en amont et le controle passe A VIDE, en affichant OK.
#
# On ouvre donc l'acces beta a un associe le temps du test, et on le
# retire dans tous les cas (atexit). Le jour ou un troisieme compte beta
# non coordinateur existera, cette manipulation deviendra inutile.
# ---------------------------------------------------------------------
coord = o.interroger("""select id, prenom||' '||nom as nom from public.profiles
                         where is_agenda_coordinator order by nom limit 1""")[0]
medecin = o.interroger("""select id, prenom||' '||nom as nom from public.profiles
                           where coalesce(is_agenda_coordinator,false)=false
                             and actif and coalesce(agenda_beta_access,false)=false
                           order by nom limit 1""")[0]

BETA_ATTENDUS = o.interroger(
    "select count(*) as n from public.profiles where agenda_beta_access")[0]["n"]
o.interroger("update public.profiles set agenda_beta_access = true "
             f"where id = '{medecin['id']}'")


@atexit.register
def rendre_letat_initial():
    o.interroger("update public.profiles set agenda_beta_access = false "
                 f"where id = '{medecin['id']}'")
    o.interroger(f"delete from agenda.shifts where date = date '{DATE_TEST}'")
    reste = o.interroger("select count(*) as n from public.profiles "
                         "where agenda_beta_access")[0]["n"]
    etat = "OK" if reste == BETA_ATTENDUS else f"ANOMALIE (attendu {BETA_ATTENDUS})"
    print(f"\nAcces beta rendu -- {reste} compte(s) en beta : {etat}")


print(f"Coordinateur : {coord['nom']}")
print(f"Medecin      : {medecin['nom']}  (acces beta ouvert le temps du test)\n")

reference = o.interroger("""select site_id, room_id, shift_type_id,
                                   location, room, shift_type
                              from agenda.shifts
                             where site_id is not null limit 1""")[0]
depart = o.interroger("select coalesce(max(id),0) as m from agenda.activity_log")[0]["m"]
o.interroger(f"delete from agenda.shifts where date = date '{DATE_TEST}'")

resultats = []


def verifier(titre, ok, detail=""):
    resultats.append((titre, ok))
    print(f"  {'OK   ' if ok else 'ECHEC'} {titre}"
          + (f"  -- {detail}" if detail and not ok else ""))


# --- 1. Cloison de lecture -------------------------------------------
print("--- 1. Qui lit le journal ---")
ok, r = rest("GET", "activity_log?select=id&limit=1", medecin["id"])
verifier("un medecin ne voit rien du journal", ok and r == [], f"{ok} {r}")
ok, r = rest("GET", "activity_log?select=id&limit=1", coord["id"])
verifier("le coordinateur y accede", ok, str(r))

# --- 2. Le journal est infalsifiable ---------------------------------
# Un journal que l'application pourrait reecrire ne vaudrait rien comme
# trace. Aucun grant d'ecriture, aucune policy INSERT/UPDATE/DELETE.
print("\n--- 2. Ecriture directe dans le journal ---")
ok, r = rest("POST", "activity_log", coord["id"],
             {"txid": 1, "table_name": "shifts", "operation": "INSERT", "row_count": 1})
verifier("le coordinateur ne peut pas y inserer", not ok, str(r))
ok, r = rest("PATCH", "activity_log?id=gt.0", coord["id"], {"row_count": 0})
verifier("ni modifier une entree", not ok, str(r))
ok, r = rest("DELETE", "activity_log?id=gt.0", coord["id"])
verifier("ni en supprimer", not ok, str(r))

# --- 3. Une action reelle laisse une trace, et une seule -------------
print("\n--- 3. Creation d'une garde par le coordinateur ---")
ok, r = rest("POST", "shifts", coord["id"],
             {"date": DATE_TEST, "location": reference["location"],
              "room": reference["room"], "shift_type": reference["shift_type"],
              "site_id": reference["site_id"], "room_id": reference["room_id"],
              "shift_type_id": reference["shift_type_id"], "status": "free"},
             prefer="return=representation")
if not ok:
    raise SystemExit(f"  ECHEC creation de la garde de test : {r}")
shift_id = r[0]["id"]

j = o.interroger(f"""select table_name, operation, actor_id, target_ids::text
                       from agenda.activity_log where id > {depart} order by id""")
verifier("une entree, et une seule", len(j) == 1, f"{len(j)} entrees")
if j:
    verifier("table et operation justes",
             j[0]["table_name"] == "shifts" and j[0]["operation"] == "INSERT",
             f"{j[0]['table_name']}/{j[0]['operation']}")
    verifier("l'auteur est le coordinateur", j[0]["actor_id"] == coord["id"],
             str(j[0]["actor_id"]))
    verifier("la garde creee est referencee", shift_id in j[0]["target_ids"],
             j[0]["target_ids"])

# --- 4. Une instruction sans effet ne cree rien ----------------------
print("\n--- 4. UPDATE ne touchant aucune ligne ---")
avant = o.interroger("select count(*) as n from agenda.activity_log")[0]["n"]
rest("PATCH", "shifts?date=eq.1999-01-01", coord["id"], {"coordinator_note": "neant"})
apres = o.interroger("select count(*) as n from agenda.activity_log")[0]["n"]
verifier("aucune entree pour un WHERE qui ne trouve rien", avant == apres,
         f"{avant} -> {apres}")

# --- 5. Le regroupement par transaction ------------------------------
# Une demande de garde ecrit dans requests, ce qui reveille le declencheur
# metier update_shift_status qui ecrit a son tour dans shifts : deux
# instructions, une seule action utilisateur. Le txid les rattache.
print("\n--- 5. Regroupement par txid (demande de garde) ---")
borne = o.interroger("select max(id) as m from agenda.activity_log")[0]["m"]
ok, r = rest("POST", "requests", medecin["id"],
             {"shift_id": shift_id, "doctor_id": medecin["id"], "status": "pending"},
             prefer="return=representation")
verifier("le medecin demande la garde", ok, str(r))
j = o.interroger(f"""select table_name, operation, txid from agenda.activity_log
                      where id > {borne} order by id""")
print(f"     entrees produites : {[(x['table_name'], x['operation']) for x in j]}")
verifier("deux instructions journalisees", len(j) == 2, str(len(j)))
verifier("regroupees sous un meme txid", len({x["txid"] for x in j}) == 1,
         str({x["txid"] for x in j}))
verifier("la garde est bien passee en attente",
         o.interroger(f"select status from agenda.shifts "
                      f"where id='{shift_id}'")[0]["status"] == "pending")

# --- 6. La suppression conserve l'etat d'avant -----------------------
# ⚠ MOD2-B : quand la suppression douce arrivera, la suppression reelle
# ci-dessous devra devenir un UPDATE de deleted_at, et ce bloc suivra.
print("\n--- 6. Suppression (etat d'avant conserve) ---")
borne = o.interroger("select max(id) as m from agenda.activity_log")[0]["m"]
o.interroger(f"delete from agenda.shifts where id = '{shift_id}'")
j = o.interroger(f"""select table_name, operation,
                            rows_before->0->>'status' as statut_avant, actor_id
                       from agenda.activity_log where id > {borne} order by id""")
print(f"     entrees produites : {[(x['table_name'], x['operation']) for x in j]}")
sup = [x for x in j if x["table_name"] == "shifts" and x["operation"] == "DELETE"]
verifier("la suppression de la garde est tracee", len(sup) == 1, str(len(sup)))
if sup:
    verifier("l'etat d'avant est conserve", sup[0]["statut_avant"] == "pending",
             str(sup[0]["statut_avant"]))
    # Ecriture faite par l'API d'administration : aucun utilisateur connecte.
    # Un acteur nul est une information ("ecrit hors application"), pas un defaut.
    verifier("acteur nul hors application", sup[0]["actor_id"] is None,
             str(sup[0]["actor_id"]))

# --- Menage ----------------------------------------------------------
o.interroger(f"delete from agenda.shifts where date = date '{DATE_TEST}'")
o.interroger(f"delete from agenda.activity_log where id > {depart}")
reste = o.interroger("select count(*) as n from agenda.activity_log")[0]["n"]

echecs = [t for t, ok in resultats if not ok]
print(f"\n{'='*62}")
print(f"{len(resultats)-len(echecs)}/{len(resultats)} controles au vert"
      f" -- journal ramene a {reste} entree(s)")
if echecs:
    print("ECHECS : " + " | ".join(echecs))
    raise SystemExit(1)
