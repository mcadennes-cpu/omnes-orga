#!/usr/bin/env python3
"""Cloner les buckets et les policies STORAGE vers l'environnement de test.

    python3 docs/sql/23-23-cloner-storage-env-test.py           # simulation
    python3 docs/sql/23-23-cloner-storage-env-test.py --go      # clone
    python3 docs/sql/23-23-cloner-storage-env-test.py --effacer --go

A lancer DEPUIS LA RACINE du depot. Chantier D, sous-etape D-8a.

POURQUOI CE SCRIPT EXISTE
23-18 clone `public` et `agenda`, mais PAS `storage` : mesure du 21/09/2026,
l'environnement de test portait 99 policies public, 51 agenda, et **0
storage**, contre 20 en production. Le chantier D-8 (exiger un compte actif
pour les fichiers) ne pouvait donc pas se repeter avant la production --
exactement ce qu'on s'interdit.

POURQUOI PAS DANS 23-18
Les tables de `storage` appartiennent a Supabase (`supabase_storage_admin`)
et existent deja sur tout projet : les ajouter a la liste des schemas de
23-18 lui ferait tenter de les RECREER, et casserait la construction. Le
clonage storage demande donc un traitement a part -- celui-ci.

CE QU'IL CLONE
  . les 6 buckets (id, nom, public, taille maximale, types autorises) ;
  . les policies du schema storage, rendues par Postgres lui-meme
    (`pg_policies`), jamais reecrites de memoire.
CE QU'IL NE CLONE PAS
  . le CONTENU des fichiers : `storage.objects` reste vide sur le test.
    Les suites qui ont besoin de fichiers posent leurs propres lignes
    temoins dans une transaction annulee (voir 23-22).

DEUX BASES, DEUX SENS UNIQUES
  . PRODUCTION : lecture seule, en transaction `read only` que la base
    confirme -- une ecriture y serait refusee par Postgres ;
  . TEST : les ecritures, et rien qu'elles. La table temoin
    `public._environnement_de_test` posee par 23-18 est exigee avant tout.
"""
import base64
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

GO = "--go" in sys.argv
EFFACER = "--effacer" in sys.argv

PROD = "ydihrgnixthrraprclox"          # OMNES ORGA -- lecture seule ici
TEST = "yjttfdwjbyufpavwxcpy"          # environnement de test -- les ecritures
TEMOIN = "_environnement_de_test"

if PROD == TEST:
    raise SystemExit("PROD et TEST ne peuvent pas designer le meme projet.")
if not Path("docs/sql").is_dir():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()


def stop(msg):
    raise SystemExit(f"\nARRET : {msg}\nRien n'a ete ecrit.")


def _appel(projet, requete):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{projet}/database/query",
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


def lire(projet, requete):
    """SELECT en transaction read only, sur l'un ou l'autre projet."""
    lignes, err = _appel(projet, "begin transaction read only;\n"
                         "select current_setting('transaction_read_only') as ro, x.*\n"
                         f"from ({requete}) x;\ncommit;\n")
    if err:
        stop(f"lecture refusee sur {projet} -- {err}")
    for ligne in lignes:
        if ligne.pop("ro") != "on":
            stop("la lecture ne s'est pas faite en read only.")
    return lignes


def ecrire_test(instructions, titre):
    """Ecrit SUR LE PROJET DE TEST, et nulle part ailleurs.

    Tout ou rien : une seule transaction, `commit` sur sa propre ligne
    (piege connu de l'API Management).
    """
    if not instructions:
        print(f"  {titre:40} rien a faire")
        return
    corps = "begin;\n" + ";\n".join(instructions) + ";\n" + "commit;\n"
    _, err = _appel(TEST, corps)
    if err:
        stop(f"{titre} refuse, transaction annulee --\n  {err}")
    print(f"  {titre:40} {len(instructions)} instructions")


def q(ident):
    return '"' + ident.replace('"', '""') + '"'


def litteral(valeur):
    if valeur is None:
        return "null"
    return "'" + str(valeur).replace("'", "''") + "'"


def titre(texte):
    print("\n" + "=" * 74 + f"\n{texte}\n" + "=" * 74)


# ---------------------------------------------------------------------
# GARDE-FOUS
# ---------------------------------------------------------------------
print(f"source : PRODUCTION {PROD} (lecture seule)")
print(f"cible  : TEST       {TEST}")
print(f"mode   : {'EFFACEMENT' if EFFACER else 'CLONAGE'}"
      f" -- {'EXECUTION REELLE' if GO else 'SIMULATION'}")

temoin = lire(TEST, f"""select count(*) as n from pg_class c
                          join pg_namespace n on n.oid = c.relnamespace
                         where c.relname = '{TEMOIN}' and n.nspname = 'public'""")[0]["n"]
if not temoin:
    stop(f"le projet {TEST} n'a pas la table temoin `public.{TEMOIN}` posee "
         "par 23-18.\nCe n'est pas l'environnement de test : on n'y ecrit pas.")

# ---------------------------------------------------------------------
# RELEVE DE LA PRODUCTION
# ---------------------------------------------------------------------
buckets = lire(PROD, """
    select id, name, public, file_size_limit,
           array_to_string(allowed_mime_types, ',') as mimes
      from storage.buckets order by id""")
policies = lire(PROD, """
    select tablename as tab, policyname as nom, permissive,
           array_to_string(roles, ', ') as roles, cmd,
           coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
      from pg_policies where schemaname = 'storage'
     order by tablename, policyname""")

titre(f"RELEVE EN PRODUCTION : {len(buckets)} buckets, {len(policies)} policies")
for b in buckets:
    print(f"  bucket {b['id']:26} public={str(b['public']):6} "
          f"taille_max={b['file_size_limit']}")

# ---------------------------------------------------------------------
# ETAT ACTUEL DU TEST
# ---------------------------------------------------------------------
deja_b = lire(TEST, "select id from storage.buckets order by id")
deja_p = lire(TEST, """select tablename as tab, policyname as nom
                         from pg_policies where schemaname='storage'
                        order by 1, 2""")
print(f"\nsur le test aujourd'hui : {len(deja_b)} buckets, {len(deja_p)} policies")

# ---------------------------------------------------------------------
# INSTRUCTIONS
# ---------------------------------------------------------------------
if EFFACER:
    instructions = [f'drop policy if exists {q(p["nom"])} on storage.{q(p["tab"])}'
                    for p in deja_p]
    # Les objets d'abord : une ligne de storage.objects reference son bucket.
    instructions.append("delete from storage.objects")
    instructions.append("delete from storage.buckets")
else:
    instructions = []
    # On repart d'une ardoise propre cote policies : rejouer le script ne
    # doit pas echouer sur un nom deja pris, ni laisser une policy orpheline
    # que la production n'a plus.
    for p in deja_p:
        instructions.append(
            f'drop policy if exists {q(p["nom"])} on storage.{q(p["tab"])}')
    for b in buckets:
        mimes = ("string_to_array(" + litteral(b["mimes"]) + ", ',')"
                 if b["mimes"] else "null")
        taille = b["file_size_limit"] if b["file_size_limit"] is not None else "null"
        instructions.append(
            "insert into storage.buckets (id, name, public, file_size_limit, "
            f"allowed_mime_types) values ({litteral(b['id'])}, "
            f"{litteral(b['name'])}, {str(b['public']).lower()}, {taille}, {mimes}) "
            "on conflict (id) do update set name = excluded.name, "
            "public = excluded.public, file_size_limit = excluded.file_size_limit, "
            "allowed_mime_types = excluded.allowed_mime_types")
    for p in policies:
        morceau = (f'create policy {q(p["nom"])} on storage.{q(p["tab"])} '
                   f'as {p["permissive"].lower()} for {p["cmd"].lower()} '
                   f'to {p["roles"]}')
        if p["qual"]:
            morceau += f' using ({p["qual"]})'
        if p["with_check"]:
            morceau += f' with check ({p["with_check"]})'
        instructions.append(morceau)

titre("INSTRUCTIONS" + ("" if GO else " (SIMULATION -- rien ne sera execute)"))
for i, ins in enumerate(instructions, 1):
    print(f"  {i:3}. {' '.join(ins.split())[:140]}")

if not GO:
    titre("SIMULATION TERMINEE")
    print("  Rien n'a ete ecrit. Relancer avec --go pour executer.")
    raise SystemExit(0)

titre("EXECUTION")
ecrire_test(instructions, "effacement" if EFFACER else "clonage storage")

# ---------------------------------------------------------------------
# VERIFICATION : on RELIT les deux bases et on les compare
# ---------------------------------------------------------------------
titre("VERIFICATION (les deux bases relues et comparees)")
apres_b = lire(TEST, """select id, name, public, file_size_limit,
                               array_to_string(allowed_mime_types, ',') as mimes
                          from storage.buckets order by id""")
apres_p = lire(TEST, """
    select tablename as tab, policyname as nom, permissive,
           array_to_string(roles, ', ') as roles, cmd,
           coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
      from pg_policies where schemaname = 'storage'
     order by tablename, policyname""")

if EFFACER:
    print(f"  buckets restants  : {len(apres_b)}")
    print(f"  policies restantes: {len(apres_p)}")
    if apres_b or apres_p:
        stop("l'effacement n'a pas tout retire.")
    print("\n  EFFACEMENT COMPLET.")
    raise SystemExit(0)

ecarts = []
gauche = {b["id"]: b for b in buckets}
droite = {b["id"]: b for b in apres_b}
for i in sorted(set(gauche) | set(droite)):
    if i not in droite:
        ecarts.append(f"bucket absent du test : {i}")
    elif i not in gauche:
        ecarts.append(f"bucket en trop sur le test : {i}")
    elif gauche[i] != droite[i]:
        ecarts.append(f"bucket different : {i}\n      prod {gauche[i]}\n      test {droite[i]}")

gauche = {(p["tab"], p["nom"]): p for p in policies}
droite = {(p["tab"], p["nom"]): p for p in apres_p}
for c in sorted(set(gauche) | set(droite)):
    if c not in droite:
        ecarts.append(f"policy absente du test : {c[0]}.{c[1]}")
    elif c not in gauche:
        ecarts.append(f"policy en trop sur le test : {c[0]}.{c[1]}")
    elif gauche[c] != droite[c]:
        ecarts.append(f"policy differente : {c[0]}.{c[1]}")

print(f"  buckets  : {len(apres_b)} sur le test, {len(buckets)} en production")
print(f"  policies : {len(apres_p)} sur le test, {len(policies)} en production")
for e in ecarts:
    print("  ECART", e)
if ecarts:
    print(f"\n  {len(ecarts)} ecart(s) : le clonage n'est PAS conforme.")
    raise SystemExit(1)
print("\n  Aucun ecart : le storage du test est identique a la production.")
print("  (storage.objects reste vide : les suites posent leurs propres temoins)")
