#!/usr/bin/env python3
"""Fermer les fichiers aux comptes inactifs et aux non-membres -- D-8b.

    OMNES_CIBLE=test python3 docs/sql/23-24-storage-compte-actif.py           # simulation
    OMNES_CIBLE=test python3 docs/sql/23-24-storage-compte-actif.py --go
    OMNES_CIBLE=test python3 docs/sql/23-24-storage-compte-actif.py --retour-arriere --go
    python3 docs/sql/23-24-storage-compte-actif.py --go                       # PRODUCTION

A lancer DEPUIS LA RACINE du depot. SIMULATION PAR DEFAUT.

DEUX TROUS MESURES LE 21/09/2026 SUR LES 20 POLICIES DE storage

1. AUCUNE ne teste `actif`. Dix d'entre elles lisent `profiles`, mais sur
   `role` uniquement. Une fiche desactivee dont le compte n'est pas bloque
   garde donc l'acces a tous les fichiers de son perimetre.

2. `immobilier_storage_select` n'exige RIEN d'autre que le bucket :
       using (bucket_id = 'immobilier-attachments')
   Tout compte connecte peut donc LISTER et LIRE les 4 fichiers du module
   immobilier -- alors que la table `immobilier_attachments`, elle, exige
   `is_immobilier_board_member(board_id)`, et que l'ecriture dans ce meme
   bucket exige `is_immobilier_member()`. La porte de derriere est plus
   ouverte que la porte d'entree, et lister les objets donne les chemins.

CE QU'ON POSE : DEUX POLICIES RESTRICTIVES, AUCUNE MODIFIEE
Meme raisonnement qu'en 23-21 : les 20 policies existantes sont PERMISSIVE
(combinees par OU), une RESTRICTIVE s'ajoute par ET. On verrouille sans
toucher aux serrures, et le retour arriere est un DROP POLICY.
  . `exiger_compte_actif`             : un compte actif, pour tout bucket ;
  . `restreindre_immobilier_aux_membres` : pour le seul bucket immobilier,
    la meme condition que l'ecriture y applique deja. La forme
    `bucket_id <> '...' or ...` ne contraint QUE ce bucket et laisse les
    cinq autres exactement comme avant.

CE QU'ON NE TOUCHE PAS, ET POURQUOI
  . le bucket `avatars` est `public = true` : ses 26 photos sont servies
    par URL publique, SANS passer par la RLS. Restreindre la policy de
    lecture ne changerait donc rien a leur exposition reelle, et risquerait
    de casser le trombinoscope. A traiter separement si on veut fermer
    l'acces public au bucket lui-meme -- c'est une decision de produit,
    pas une correction de policy.
  . `supabase_storage_admin` possede `storage.objects` sans `force_rls` :
    la RLS ne s'applique pas a lui, le service de stockage n'est pas gene.
    Verifie le 21/09/2026, comme `rolbypassrls` sur postgres/service_role.

DEPENDANCE
`public.est_actif()` doit exister : c'est 23-21 qui la cree. Sur la
production, 23-21 doit donc etre passe AVANT ce script.
"""
import base64
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

PROJET_PROD = "ydihrgnixthrraprclox"
PROJET_TEST = "yjttfdwjbyufpavwxcpy"
ARCHIVES = Path.home() / "Documents/claude-projets/archives/orga-sauvegardes"

CIBLE = os.environ.get("OMNES_CIBLE", "prod").strip().lower()
if CIBLE not in ("prod", "test"):
    raise SystemExit("OMNES_CIBLE vaut 'prod' (defaut) ou 'test'.")
SUR_TEST = CIBLE == "test"
PROJET = PROJET_TEST if SUR_TEST else PROJET_PROD

BUCKET_IMMO = "immobilier-attachments"
NOMS = ("exiger_compte_actif", "restreindre_immobilier_aux_membres")

if not Path("docs/sql").is_dir():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()


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
            detail = e.read().decode()
            try:
                detail = json.loads(detail).get("message") or detail
            except Exception:
                pass
            return None, detail[:400]
        except OSError as e:
            return None, str(e)


def lire(requete):
    lignes, err = _appel("begin transaction read only;\n"
                         "select current_setting('transaction_read_only') as ro, x.*\n"
                         f"from ({requete}) x;\ncommit;\n")
    if err:
        stop(f"lecture refusee -- {err}")
    for ligne in lignes:
        if ligne.pop("ro") != "on":
            stop("la lecture ne s'est pas faite en read only.")
    return lignes


def ecrire(instructions, titre):
    """Tout ou rien : une seule transaction, `commit` sur sa propre ligne."""
    corps = "begin;\n" + ";\n".join(instructions) + ";\n" + "commit;\n"
    _, err = _appel(corps)
    if err:
        stop(f"{titre} refuse par la base, transaction annulee --\n  {err}")
    print(f"  {titre} : {len(instructions)} instructions appliquees.")


def titre(texte):
    print("\n" + "=" * 74 + f"\n{texte}\n" + "=" * 74)


# ---------------------------------------------------------------------
# GARDE-FOUS
# ---------------------------------------------------------------------
print(f"cible : {'ENVIRONNEMENT DE TEST' if SUR_TEST else 'PRODUCTION'} "
      f"-- projet {PROJET}")
print(f"mode  : {'RETOUR ARRIERE' if RETOUR else 'POSE DE LA COUCHE'}"
      f" -- {'EXECUTION REELLE' if GO else 'SIMULATION'}")

temoin = lire("""select count(*) as n from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                  where c.relname = '_environnement_de_test' and n.nspname='public'""")[0]["n"]
if SUR_TEST and not temoin:
    stop("OMNES_CIBLE=test mais la table temoin de 23-18 est absente.")
if not SUR_TEST and temoin:
    stop("la cible est la PRODUCTION mais le projet porte la table temoin "
         "de l'environnement de test. Incoherence.")

if not RETOUR:
    dep = lire("""select count(*) as n from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='est_actif'""")[0]["n"]
    if not dep:
        stop("la fonction public.est_actif() n'existe pas sur cette base.\n"
             "Lancer d'abord : python3 docs/sql/23-21-exiger-compte-actif.py --go")
    dep2 = lire("""select count(*) as n from pg_proc p
                     join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname='public' and p.proname='is_immobilier_member'""")[0]["n"]
    if not dep2:
        stop("la fonction public.is_immobilier_member() n'existe pas.")

if GO and not SUR_TEST:
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
# ETAT AVANT
# ---------------------------------------------------------------------
avant = lire("""
    select policyname as nom, cmd, permissive from pg_policies
     where schemaname = 'storage' order by permissive, policyname""")
deja = [p for p in avant if p["nom"] in NOMS]
buckets = lire("select id from storage.buckets order by id")

titre("ETAT AVANT")
print(f"  policies storage      : {len(avant)} "
      f"({sum(1 for p in avant if p['permissive'] == 'PERMISSIVE')} permissives, "
      f"{sum(1 for p in avant if p['permissive'] == 'RESTRICTIVE')} restrictives)")
print(f"  buckets               : {len(buckets)} -- "
      + ", ".join(b["id"] for b in buckets))
print(f"  couche deja en place  : {len(deja)}")
if not any(b["id"] == BUCKET_IMMO for b in buckets):
    print(f"  ATTENTION : le bucket {BUCKET_IMMO} est absent de cette base.")

# ---------------------------------------------------------------------
# INSTRUCTIONS
# ---------------------------------------------------------------------
if RETOUR:
    instructions = [f'drop policy if exists "{n}" on storage.objects'
                    for n in NOMS]
else:
    instructions = [
        'create policy "exiger_compte_actif" on storage.objects '
        "as restrictive for all to authenticated "
        "using (public.est_actif()) with check (public.est_actif())",
        # `bucket_id <> ... or ...` : ne contraint QUE le bucket immobilier.
        # Les cinq autres buckets satisfont la premiere branche et restent
        # exactement comme avant.
        'create policy "restreindre_immobilier_aux_membres" on storage.objects '
        "as restrictive for select to authenticated "
        f"using (bucket_id <> '{BUCKET_IMMO}' or public.is_immobilier_member())",
    ]

titre("INSTRUCTIONS" + ("" if GO else " (SIMULATION -- rien ne sera execute)"))
for i, ins in enumerate(instructions, 1):
    print(f"  {i}. {' '.join(ins.split())}")

if not RETOUR and deja:
    stop(f"{len(deja)} policie(s) de la couche sont deja en place.\n"
         "Pour les refaire : --retour-arriere --go, puis --go.")

if not GO:
    titre("SIMULATION TERMINEE")
    print("  Rien n'a ete ecrit. Relancer avec --go pour executer.")
    raise SystemExit(0)

titre("EXECUTION")
ecrire(instructions, "retour arriere" if RETOUR else "pose de la couche")

# ---------------------------------------------------------------------
# VERIFICATION -- relue en base
# ---------------------------------------------------------------------
titre("VERIFICATION (relue en base)")
apres = lire("""
    select policyname as nom, cmd, permissive from pg_policies
     where schemaname = 'storage' order by permissive, policyname""")
posees = [p for p in apres if p["nom"] in NOMS]
permissives = [p for p in apres if p["permissive"] == "PERMISSIVE"]

print(f"  policies storage au total : {len(apres)}")
print(f"  dont PERMISSIVE d'origine : {len(permissives)}")
print(f"  dont couche D-8           : {len(posees)}")

if len(permissives) != 20:
    print(f"  ATTENTION : {len(permissives)} policies permissives, 20 attendues.")

if RETOUR:
    if posees:
        stop("le retour arriere n'a pas tout retire.")
    print("\n  RETOUR ARRIERE COMPLET : les 20 policies d'origine sont intactes.")
else:
    if len(posees) != 2:
        stop(f"{len(posees)} policies posees, 2 attendues.")
    print("\n  COUCHE POSEE sur storage.objects :")
    print("    . un compte actif est exige pour tout bucket ;")
    print(f"    . le bucket {BUCKET_IMMO} exige en plus d'etre membre.")
    print("  Retour arriere : --retour-arriere --go (quelques secondes).")

print("\n(termine)")
