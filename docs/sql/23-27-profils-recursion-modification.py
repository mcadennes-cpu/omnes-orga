#!/usr/bin/env python3
"""Rendre a chacun le droit de modifier sa fiche (recursion RLS sur profiles).

    OMNES_CIBLE=test python3 docs/sql/23-27-profils-recursion-modification.py       # simulation
    OMNES_CIBLE=test python3 docs/sql/23-27-profils-recursion-modification.py --go  # corrige
    OMNES_CIBLE=test python3 docs/sql/23-27-profils-recursion-modification.py --retour-arriere --go
    python3 docs/sql/23-27-profils-recursion-modification.py --go                   # PRODUCTION

A lancer DEPUIS LA RACINE du depot. SIMULATION PAR DEFAUT : sans --go, le
script mesure l'etat actuel, affiche ce qu'il executerait, et ne touche a rien.

LE DEFAUT (trouve le 28/09/2026, etape 8R-6)
Depuis la pose du chantier D en production (23-21, 21/09/2026), AUCUNE fiche
de `public.profiles` ne peut plus etre modifiee par l'application :
    ERROR 42P17: infinite recursion detected in policy for relation "profiles"
Ni sa propre fiche (jeton de notification, photo), ni celle d'un autre, meme
par un super_admin (Trombinoscope). Derniere modification reussie en base :
21/09 a 10h20. Le defaut est passe inapercu une semaine : la suite 23-22 ne
testait que la LECTURE. Il est apparu quand Charlotte n'a pas pu enregistrer
son jeton de notification (« Token obtenu mais non enregistre »).

LA CAUSE (isolee sur l'environnement de test, transactions annulees)
La policy `profiles_update_own_safe_fields` (etape 4D) verifie qu'on ne change
ni son role ni son statut actif en RELISANT la table profiles :
    role  = (select role  from profiles where id = auth.uid())
    actif = (select actif from profiles where id = auth.uid())
Cette relecture passe par les policies de LECTURE de profiles. Depuis 23-21,
elles comptent la restrictive `exiger_compte_actif_lecture`, et PostgreSQL
voit la table se relire elle-meme dans sa propre policy : il abandonne.
    tel quel                                    -> recursion
    sans exiger_compte_actif_lecture            -> passe
    sans exiger_compte_actif_modif              -> recursion
C'est donc la combinaison de la relecture (4D) et de la lecture restrictive
(23-21) qui casse -- ni l'une ni l'autre seule.

LA CORRECTION
On garde le chantier D intact et on reecrit la seule policy 4D, a controle
IDENTIQUE, en passant par deux fonctions qui existent deja :
    role  = public.current_user_role()   -- security definer, deja utilisee
    actif = public.est_actif()           -- security definer, posee par 23-21
Une fonction security definer lit la table sans repasser par ses policies :
plus de relecture, plus de recursion. `est_actif()` renvoie le statut actif
de l'appelant, exactement ce que relisait le sous-select.

CE QUE CA NE FAIT PAS
  . aucune ligne de donnees n'est modifiee (les controles tournent dans des
    transactions ANNULEES) ;
  . les 3 restrictives du chantier D et les autres policies de profiles ne
    sont pas touchees (compte verifie avant et apres) ;
  . aucune fonction n'est creee ni modifiee.

RETOUR ARRIERE
`--retour-arriere --go` remet la policy d'origine. Son texte est porte en dur
ci-dessous ; l'empreinte md5 de (using | with check), relevee en base le
28/09/2026, est identique en production et sur l'environnement de test. Le
script refuse d'ecrire si ce qu'il trouve en base n'est pas ce qu'il croit
remplacer, et revalide l'empreinte apres coup.
"""
import base64
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

GO = "--go" in sys.argv
RETOUR = "--retour-arriere" in sys.argv

PROJET_PROD = "ydihrgnixthrraprclox"          # OMNES ORGA
PROJET_TEST = "yjttfdwjbyufpavwxcpy"          # environnement de test (23-18)
ARCHIVES = Path.home() / "Documents/claude-projets/archives/orga-sauvegardes"

CIBLE = os.environ.get("OMNES_CIBLE", "prod").strip().lower()
if CIBLE not in ("prod", "test"):
    raise SystemExit("OMNES_CIBLE vaut 'prod' (defaut) ou 'test'.")
SUR_TEST = CIBLE == "test"
PROJET = PROJET_TEST if SUR_TEST else PROJET_PROD

if not Path("docs/sql").is_dir():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()

POLICY = "profiles_update_own_safe_fields"

# Texte de la policy, avant (etape 4D) et apres. Seul le WITH CHECK change ;
# USING, commande, roles et caractere permissif sont identiques.
USING = "id = auth.uid()"
CHECK_AVANT = ("id = auth.uid()"
               " and role = (select profiles_1.role from profiles profiles_1"
               " where profiles_1.id = auth.uid())"
               " and actif = (select profiles_1.actif from profiles profiles_1"
               " where profiles_1.id = auth.uid())")
CHECK_APRES = ("id = auth.uid()"
               " and role = public.current_user_role()"
               " and actif = public.est_actif()")

# md5(pg_get_expr(using) || '|' || pg_get_expr(with check)), releve le 28/09.
EMPREINTE_AVANT = "40ea2e4de3e545cd4e5b16e186873863"
EMPREINTE_APRES = "5f766806711c41bc5d715d6944363f98"


def stop(msg):
    raise SystemExit(f"\nARRET : {msg}\nRien n'a ete ecrit.")


def _appel(requete):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJET}/database/query",
        data=json.dumps({"query": requete}).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {_TOK}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "omnes-orga-script/1.0")
    for tentative in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read() or "null"), None
        except urllib.error.HTTPError as e:
            if e.code == 429 and tentative < 3:
                time.sleep(30)
                continue
            return None, e.read().decode()[:500]
        except OSError as e:
            return None, str(e)


def lire(requete):
    """SELECT en transaction read only, confirmee par la base."""
    lignes, err = _appel("begin transaction read only;\n"
                         "select current_setting('transaction_read_only') as ro, x.*\n"
                         f"from ({requete}) x;\ncommit;\n")
    if err:
        stop(f"lecture refusee -- {err}")
    for ligne in lignes:
        if ligne.pop("ro") != "on":
            stop("la lecture ne s'est pas faite en read only.")
    return lignes


def titre(texte):
    print("\n" + "=" * 74 + f"\n{texte}\n" + "=" * 74)


def etat_policy():
    lignes = lire(f"""
        select p.polcmd::text as cmd, p.polpermissive as permissive,
               p.polroles::regrole[]::text as roles,
               md5(coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '|' ||
                   coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) as h
          from pg_policy p
         where p.polrelid = 'public.profiles'::regclass and p.polname = '{POLICY}'""")
    return lignes[0] if len(lignes) == 1 else None


def nb_policies():
    return lire("""select count(*) as n from pg_policy
                    where polrelid = 'public.profiles'::regclass""")[0]["n"]


# ---------------------------------------------------------------------
# LES CONTROLES -- chacun dans une transaction ANNULEE, sous l'identite
# d'un vrai compte (ce que lit auth.uid()), en role `authenticated`.
# ---------------------------------------------------------------------
REMPLACANT = "select id::text from public.profiles where role = 'remplacant' and actif order by id limit 1"
INACTIF = "select id::text from public.profiles where not actif order by id limit 1"
SUPER_ADMIN = "select id::text from public.profiles where role = 'super_admin' and actif order by id limit 1"

CONTROLES = [
    # (libelle, qui, update, attendu)  attendu : nombre de lignes, ou 'refus'
    ("remplacant : enregistre son jeton", REMPLACANT,
     "update public.profiles set fcm_token = fcm_token where id = auth.uid()", 1),
    ("remplacant : fiche d'un autre", REMPLACANT,
     "update public.profiles set fcm_token = fcm_token where id <> auth.uid()", 0),
    ("remplacant : change son propre role", REMPLACANT,
     "update public.profiles set role = 'super_admin' where id = auth.uid()", "refus"),
    ("remplacant : se desactive lui-meme", REMPLACANT,
     "update public.profiles set actif = false where id = auth.uid()", "refus"),
    ("compte inactif : sa propre fiche", INACTIF,
     "update public.profiles set fcm_token = fcm_token where id = auth.uid()", 0),
    ("super_admin : enregistre son jeton", SUPER_ADMIN,
     "update public.profiles set fcm_token = fcm_token where id = auth.uid()", 1),
    ("super_admin : fiche d'un remplacant", SUPER_ADMIN,
     f"update public.profiles set notes_internes = notes_internes where id = ({REMPLACANT})::uuid", 1),
]


def controler():
    """Joue les 7 controles, tous annules. Renvoie le nombre d'ecarts."""
    ecarts = 0
    for libelle, qui, update, attendu in CONTROLES:
        lignes, err = _appel(
            "begin;\n"
            "select set_config('request.jwt.claims', json_build_object("
            f"'sub', ({qui}), 'role', 'authenticated')::text, true);\n"
            "set local role authenticated;\n"
            f"with u as ({update} returning 1) select count(*) as n from u;\n"
            "rollback;\n")
        if err:
            obtenu = "recursion" if "42P17" in err else ("refus" if "42501" in err else f"erreur : {err[:80]}")
        else:
            obtenu = lignes[-1]["n"] if lignes else "?"
        ok = obtenu == attendu
        ecarts += not ok
        print(f"  {'OK ' if ok else 'ECART'}  {libelle:<40} attendu {attendu!s:<6} obtenu {obtenu}")
    return ecarts


# ---------------------------------------------------------------------
# GARDE-FOUS
# ---------------------------------------------------------------------
print(f"cible : {'ENVIRONNEMENT DE TEST' if SUR_TEST else 'PRODUCTION'} "
      f"-- projet {PROJET}")
print(f"mode  : {'RETOUR ARRIERE' if RETOUR else 'CORRECTION'}"
      f" -- {'EXECUTION REELLE' if GO else 'SIMULATION'}")

temoin = lire("""select count(*) as n from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                  where c.relname = '_environnement_de_test' and n.nspname = 'public'""")[0]["n"]
if SUR_TEST and not temoin:
    stop(f"OMNES_CIBLE=test mais le projet {PROJET} n'a pas la table temoin "
         "`public._environnement_de_test` posee par 23-18.\n"
         "Ce n'est pas l'environnement de test : on n'y ecrit pas.")
if not SUR_TEST and temoin:
    stop(f"le projet {PROJET} porte la table temoin de l'environnement de "
         "test alors que la cible est la PRODUCTION. Incoherence.")

if GO and not SUR_TEST:
    # Regle du projet (8J) : pas d'ecriture en production sans sauvegarde
    # fraiche. On l'exige mecaniquement plutot que de s'en souvenir.
    recentes = sorted(d.name for d in ARCHIVES.glob("20*")
                      if d.is_dir() and not d.name.endswith("-en-cours"))
    if not recentes:
        stop(f"aucune sauvegarde dans {ARCHIVES}.\n"
             "Lancer d'abord : python3 docs/sql/23-16-sauvegarde-orga.py --go")
    derniere = recentes[-1]
    try:
        quand = datetime.strptime(derniere, "%Y-%m-%d-%Hh%M")
    except ValueError:
        stop(f"sauvegarde au nom inattendu : {derniere}")
    age = datetime.now() - quand
    print(f"derniere sauvegarde : {derniere} (il y a {age.days} j "
          f"{age.seconds // 3600} h)")
    if age > timedelta(hours=6):
        stop(f"la derniere sauvegarde date de {derniere}, soit plus de 6 h.\n"
             "Lancer d'abord : python3 docs/sql/23-16-sauvegarde-orga.py --go")

# ---------------------------------------------------------------------
# ETAT DE DEPART -- relu en base, jamais deduit
# ---------------------------------------------------------------------
attendue = EMPREINTE_APRES if RETOUR else EMPREINTE_AVANT
visee = EMPREINTE_AVANT if RETOUR else EMPREINTE_APRES
check_vise = CHECK_AVANT if RETOUR else CHECK_APRES

titre("1. Etat de depart")
etat = etat_policy()
if etat is None:
    stop(f"policy {POLICY} introuvable (ou en double) sur public.profiles.")
policies_avant = nb_policies()
print(f"  {POLICY} : commande {etat['cmd']}, permissive {etat['permissive']}, "
      f"roles {etat['roles']}")
print(f"  empreinte : {etat['h']}")
print(f"  policies sur profiles : {policies_avant}")
if etat["h"] == visee:
    print("\n  Deja dans l'etat vise : rien a faire.")
    titre("Controles (transactions annulees)")
    sys.exit(1 if controler() else 0)
if etat["h"] != attendue:
    stop(f"empreinte inattendue ({etat['h']}). Attendu {attendue}.\n"
         "La policy a change depuis le 28/09 : relire avant d'ecrire.")
if (etat["cmd"], etat["permissive"], etat["roles"]) != ("w", True, "{authenticated}"):
    stop("commande, caractere permissif ou roles inattendus.")

titre("2. Mesure avant (transactions annulees)")
controler()

# ---------------------------------------------------------------------
# ECRITURE -- drop + create dans UNE transaction : jamais d'instant sans
# policy de modification (qui fermerait l'auto-modification a tous), jamais
# deux versions a la fois.
# ---------------------------------------------------------------------
corps = (
    "begin;\n"
    f"drop policy {POLICY} on public.profiles;\n"
    f"create policy {POLICY} on public.profiles as permissive for update\n"
    f"  to authenticated using ({USING}) with check ({check_vise});\n"
    "commit;\n")

titre("3. Ecriture" + ("" if GO else " (SIMULATION : rien n'est execute)"))
print(corps)
if not GO:
    print("Simulation terminee. Relancer avec --go pour appliquer.")
    sys.exit(0)

_, err = _appel(corps)
if err:
    stop(f"ecriture refusee par la base, transaction annulee --\n  {err}")
print("  policy remplacee.")

# ---------------------------------------------------------------------
# VERIFICATION
# ---------------------------------------------------------------------
titre("4. Verification")
etat = etat_policy()
policies_apres = nb_policies()
print(f"  empreinte : {etat and etat['h']} (attendu {visee})")
print(f"  policies sur profiles : {policies_apres} (avant {policies_avant})")
erreurs = 0
if not etat or etat["h"] != visee:
    print("  ECART : empreinte")
    erreurs += 1
if policies_apres != policies_avant:
    print("  ECART : nombre de policies")
    erreurs += 1

if RETOUR:
    print("\n  Retour arriere : les controles doivent retrouver la recursion.")
controles = controler()
if not RETOUR:
    erreurs += controles

print("\n" + ("TOUT EST CONFORME." if not erreurs else f"{erreurs} ECART(S) -- a examiner."))
sys.exit(1 if erreurs else 0)
