#!/usr/bin/env python3
"""Mesurer l'etat des policies RLS -- temoin avant / apres du chantier D.

    python3 docs/sql/23-20-mesurer-policies.py                      # mesure la PRODUCTION
    OMNES_CIBLE=test python3 docs/sql/23-20-mesurer-policies.py     # mesure la base de test
    ... --enregistrer /chemin/avant.json                            # mesure ET garde une empreinte
    ... --comparer /chemin/avant.json                               # mesure ET liste les ecarts

A lancer DEPUIS LA RACINE du depot. Chantier D, sous-etape D-1.

CE SCRIPT N'ECRIT JAMAIS EN BASE.
Chaque requete part dans une transaction `read only` que la base confirme
elle-meme (`transaction_read_only = on`) : une ecriture y serait refusee par
Postgres, pas seulement par ma discipline. Le seul fichier qu'il ecrit est
l'empreinte JSON, et seulement si on la demande.

POURQUOI CE SCRIPT
Le chantier D pose une couche de policies `restrictive` sur les 27 tables de
`public`. Une policy trop stricte casse l'appli en silence pour 40 personnes :
il faut donc pouvoir dire, avant et apres, exactement ce qui a change -- et
prouver qu'un retour arriere rend l'etat d'avant a l'identique.

`--enregistrer` fige l'etat dans un JSON. `--comparer` relit ce JSON et nomme
les policies ajoutees, retirees ou modifiees. C'est la verification d'apres,
et c'est aussi la preuve du retour arriere (D-5).

CE QU'IL MESURE
  1. le nombre de policies par schema (public, agenda, storage) ;
  2. chaque policy : table, nom, commande, permissive/restrictive, roles,
     et sa REGLE EFFECTIVE -- `qual`, ou `with_check` pour un INSERT ;
  3. ce que cette regle cite : `actif` en mot entier, un role, `auth.uid()`,
     ou rien du tout (policy ouverte) ;
  4. les fonctions qui lisent `profiles` : testent-elles `actif` ?
  5. la RLS table par table ;
  6. l'exposition reelle : fiches inactives dont le compte n'est pas bloque.

PIEGE DE COMPTAGE, mesure du 21/09/2026
`qual` est TOUJOURS nul sur une policy INSERT -- sa regle vit dans
`with_check`. Compter les policies ouvertes sur `qual` seul en fabrique des
dizaines qui n'existent pas. On prend donc partout la regle effective.
Deuxieme piege : chercher la chaine « actif » attrape `sondage_actif`. On
cherche `actif` en MOT ENTIER (`\\mactif\\M`), sinon on croit a tort qu'une
policy de public teste le drapeau. Il n'y en a aucune.
"""
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

PROJET_PROD = "ydihrgnixthrraprclox"          # OMNES ORGA
PROJET_TEST = "yjttfdwjbyufpavwxcpy"          # environnement de test (23-18)

CIBLE = os.environ.get("OMNES_CIBLE", "prod").strip().lower()
if CIBLE not in ("prod", "test"):
    raise SystemExit("OMNES_CIBLE vaut 'prod' (defaut) ou 'test'.")
SUR_TEST = CIBLE == "test"
PROJET = PROJET_TEST if SUR_TEST else PROJET_PROD
SCHEMAS = ("public", "agenda", "storage")


def option(nom):
    """Valeur qui suit une option sur la ligne de commande, ou None."""
    if nom not in sys.argv:
        return None
    i = sys.argv.index(nom)
    if i + 1 >= len(sys.argv):
        raise SystemExit(f"{nom} attend un chemin de fichier.")
    return sys.argv[i + 1]


ENREGISTRER = option("--enregistrer")
COMPARER = option("--comparer")

if not Path("docs/sql").is_dir():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()


def lire(requete):
    """SELECT dans une transaction en lecture seule, confirmee par la base."""
    corps = ("begin transaction read only;\n"
             "select current_setting('transaction_read_only') as ro, x.*\n"
             f"from ({requete}) x;\n"
             "commit;\n")
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJET}/database/query",
        data=json.dumps({"query": corps}).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {_TOK}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "omnes-orga-script/1.0")
    for tentative in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                lignes = json.loads(r.read() or "null") or []
                break
        except urllib.error.HTTPError as e:
            if e.code == 429 and tentative < 3:
                time.sleep(30)
                continue
            raise SystemExit(f"\nARRET : lecture refusee -- {e.read().decode()[:400]}")
        except OSError as e:
            raise SystemExit(f"\nARRET : {e}")
    for ligne in lignes:
        if ligne.pop("ro") != "on":
            raise SystemExit("ARRET : la lecture ne s'est pas faite en read only.")
    return lignes


def titre(texte):
    print("\n" + "=" * 74 + f"\n{texte}\n" + "=" * 74)


# ---------------------------------------------------------------------
# Regle effective : qual, ou with_check pour un INSERT. Espaces normalises
# pour que deux definitions identiques se comparent a l'identique.
# ---------------------------------------------------------------------
REGLE = ("regexp_replace(coalesce(case when cmd = 'INSERT' then with_check "
         "else qual end, ''), '\\s+', ' ', 'g')")
LISTE_SCHEMAS = ", ".join("'" + s + "'" for s in SCHEMAS)


def releve():
    """L'etat complet, sous une forme comparable d'une fois sur l'autre."""
    policies = lire(f"""
        select schemaname as schema, tablename as tab, policyname as nom,
               cmd, permissive, roles::text as roles,
               btrim({REGLE}) as regle
          from pg_policies
         where schemaname in ({LISTE_SCHEMAS})
         order by schemaname, tablename, policyname, cmd
    """)
    fonctions = lire("""
        select n.nspname as schema, p.proname as nom,
               case p.prosecdef when true then 'DEFINER' else 'INVOKER' end as secu,
               (pg_get_functiondef(p.oid) ~ '\\mactif\\M') as teste_actif,
               md5(pg_get_functiondef(p.oid)) as empreinte
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'agenda')
           and p.prokind = 'f'
           and pg_get_functiondef(p.oid) ~ 'profiles'
         order by n.nspname, p.proname
    """)
    tables = lire("""
        select n.nspname as schema, c.relname as tab,
               c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname in ('public', 'agenda')
           and c.relkind = 'r'
         order by n.nspname, c.relname
    """)
    return {"projet": PROJET, "cible": CIBLE,
            "mesure_le": datetime.now().isoformat(timespec="seconds"),
            "policies": policies, "fonctions": fonctions, "tables": tables}


def cle(p):
    return f"{p['schema']}.{p['tab']}.{p['nom']} [{p['cmd']}]"


#: `actif` en MOT ENTIER : sans cette precaution, `sondage_actif` compte a tort.
MOT_ACTIF = re.compile(r"(?<![_0-9a-zA-Z])actif(?![_0-9a-zA-Z])")

etat = releve()

print(f"projet mesure : {PROJET}   (cible : {'TEST' if SUR_TEST else 'PRODUCTION'})")
temoin = lire("""select count(*) as n from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                  where c.relname = '_environnement_de_test' and n.nspname = 'public'""")
print(f"table temoin _environnement_de_test : {'presente' if temoin[0]['n'] else 'absente'}")
if SUR_TEST and not temoin[0]["n"]:
    raise SystemExit("\nARRET : OMNES_CIBLE=test mais le projet n'a pas la table "
                     "temoin de 23-18. Ce n'est pas l'environnement de test.")

# ---------------------------------------------------------------------
titre("1. POLICIES PAR SCHEMA")
par_schema = {}
for p in etat["policies"]:
    d = par_schema.setdefault(p["schema"], {"n": 0, "tables": set(), "restr": 0})
    d["n"] += 1
    d["tables"].add(p["tab"])
    if p["permissive"] == "RESTRICTIVE":
        d["restr"] += 1
for schema in SCHEMAS:
    d = par_schema.get(schema)
    if not d:
        print(f"  {schema:10} aucune policy")
        continue
    print(f"  {schema:10} {d['n']:4} policies sur {len(d['tables']):3} tables"
          f"   dont {d['restr']:3} restrictives")

# ---------------------------------------------------------------------
titre("2. PUBLIC : ce que cite chaque regle effective")
pub = [p for p in etat["policies"] if p["schema"] == "public"]
ouvertes = [p for p in pub if p["regle"] in ("true", "(true)")]
cite_actif = [p for p in pub if MOT_ACTIF.search(p["regle"])]
cite_uid = [p for p in pub if "auth.uid" in p["regle"]]
restrictives = [p for p in pub if p["permissive"] == "RESTRICTIVE"]
print(f"  total                        {len(pub)}")
print(f"  restrictives (couche D)      {len(restrictives)}")
print(f"  citent actif (mot entier)    {len(cite_actif)}")
print(f"  citent auth.uid()            {len(cite_uid)}")
print(f"  ouvertes (regle = true)      {len(ouvertes)}")

titre("3. PUBLIC : les policies OUVERTES a tout compte connecte")
if not ouvertes:
    print("  aucune")
for p in ouvertes:
    print(f"  {p['tab']:24} {p['cmd']:7} {p['nom'][:44]:44} roles={p['roles']}")

titre("4. FONCTIONS QUI LISENT profiles : testent-elles actif ?")
for f in etat["fonctions"]:
    drapeau = "OUI" if f["teste_actif"] else "non"
    print(f"  {f['schema']}.{f['nom']:<36} {f['secu']:8} actif={drapeau}")

titre("5. AGENDA : toutes les policies passent-elles par une garde ?")
ag = [p for p in etat["policies"] if p["schema"] == "agenda"]
gardees = [p for p in ag if "peut_acceder" in p["regle"] or "est_coordinateur" in p["regle"]]
print(f"  {len(gardees)} / {len(ag)} policies passent par peut_acceder() ou est_coordinateur()")
if len(gardees) != len(ag):
    for p in ag:
        if p not in gardees:
            print(f"    NON GARDEE : {cle(p)}")

titre("6. PUBLIC : tables sans RLS (il ne devrait y en avoir aucune)")
sans_rls = [t for t in etat["tables"] if t["schema"] == "public" and not t["rls"]]
print("  aucune" if not sans_rls else
      "\n".join(f"  {t['tab']}" for t in sans_rls))

titre("7. EXPOSITION REELLE : une fiche inactive peut-elle encore se connecter ?")
for r in lire("""
    select (select count(*) from public.profiles) as fiches,
           (select count(*) from public.profiles where actif is false) as fiches_inactives,
           (select count(*) from auth.users) as comptes,
           (select count(*) from auth.users
             where banned_until is not null and banned_until > now()) as comptes_bloques,
           (select count(*) from public.profiles p join auth.users u on u.id = p.id
             where p.actif is false
               and (u.banned_until is null or u.banned_until <= now())) as inactif_non_bloque
"""):
    for k, v in r.items():
        print(f"  {k:24} {v}")
    if r["inactif_non_bloque"]:
        print("\n  >>> ALERTE : au moins une fiche inactive a un compte encore ouvert.")
        print("  >>> Tant que la couche restrictive du chantier D n'est pas posee,")
        print("  >>> ce compte lit tout le schema public.")
    else:
        print("\n  exposition LATENTE : aucune fiche inactive n'a de compte ouvert.")

# ---------------------------------------------------------------------
if ENREGISTRER:
    Path(ENREGISTRER).parent.mkdir(parents=True, exist_ok=True)
    Path(ENREGISTRER).write_text(json.dumps(etat, indent=1, ensure_ascii=False))
    titre("EMPREINTE ENREGISTREE")
    print(f"  {ENREGISTRER}")
    print(f"  {len(etat['policies'])} policies, {len(etat['fonctions'])} fonctions, "
          f"{len(etat['tables'])} tables")

if COMPARER:
    titre(f"COMPARAISON AVEC {COMPARER}")
    avant = json.loads(Path(COMPARER).read_text())
    if avant["projet"] != PROJET:
        print(f"  ATTENTION : l'empreinte vient du projet {avant['projet']}, "
              f"on mesure {PROJET}.")
    print(f"  empreinte prise le {avant['mesure_le']} sur {avant['cible']}")

    a = {cle(p): p for p in avant["policies"]}
    b = {cle(p): p for p in etat["policies"]}
    ajoutees = sorted(set(b) - set(a))
    retirees = sorted(set(a) - set(b))
    modifiees = sorted(k for k in set(a) & set(b)
                       if (a[k]["regle"], a[k]["permissive"], a[k]["roles"])
                       != (b[k]["regle"], b[k]["permissive"], b[k]["roles"]))

    print(f"\n  policies ajoutees  : {len(ajoutees)}")
    for k in ajoutees:
        print(f"    + {k:58} {b[k]['permissive']}")
    print(f"\n  policies retirees  : {len(retirees)}")
    for k in retirees:
        print(f"    - {k:58} {a[k]['permissive']}")
    print(f"\n  policies modifiees : {len(modifiees)}")
    for k in modifiees:
        print(f"    ~ {k}")
        print(f"        avant : {a[k]['regle'][:150]}")
        print(f"        apres : {b[k]['regle'][:150]}")

    fa = {f"{f['schema']}.{f['nom']}": f for f in avant["fonctions"]}
    fb = {f"{f['schema']}.{f['nom']}": f for f in etat["fonctions"]}
    f_ajout = sorted(set(fb) - set(fa))
    f_retire = sorted(set(fa) - set(fb))
    f_modif = sorted(k for k in set(fa) & set(fb)
                     if fa[k]["empreinte"] != fb[k]["empreinte"])
    print(f"\n  fonctions ajoutees : {len(f_ajout)}" +
          ("".join(f"\n    + {k}" for k in f_ajout)))
    print(f"  fonctions retirees : {len(f_retire)}" +
          ("".join(f"\n    - {k}" for k in f_retire)))
    print(f"  fonctions modifiees: {len(f_modif)}" +
          ("".join(f"\n    ~ {k} (actif : {fa[k]['teste_actif']} -> "
                   f"{fb[k]['teste_actif']})" for k in f_modif)))

    identique = not (ajoutees or retirees or modifiees or f_ajout or f_retire or f_modif)
    print("\n  " + ("AUCUN ECART : l'etat est identique a l'empreinte."
                    if identique else "DES ECARTS ONT ETE TROUVES (voir ci-dessus)."))

print("\n(mesure terminee -- rien n'a ete ecrit en base)")
