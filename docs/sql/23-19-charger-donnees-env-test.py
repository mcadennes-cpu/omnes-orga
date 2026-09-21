#!/usr/bin/env python3
"""Charger les donnees dans l'environnement de test, depuis une SAUVEGARDE.

    python3 docs/sql/23-19-charger-donnees-env-test.py                  # simulation
    python3 docs/sql/23-19-charger-donnees-env-test.py --go             # charge
    python3 docs/sql/23-19-charger-donnees-env-test.py --go --dossier <chemin>

A lancer DEPUIS LA RACINE du depot. Chantier C d'apres J, sous-etape C-3.
Suppose la structure deja construite par 23-18.

POURQUOI DEPUIS LA SAUVEGARDE, ET NON DEPUIS LA PRODUCTION
Deux raisons. La production n'est pas touchee du tout -- pas meme lue. Et
surtout, cela REPETE une restauration : si ce script remplit une base vide a
partir d'un dossier de `23-16`, alors ce dossier sait reconstituer l'appli.
C'est la premiere preuve que nos sauvegardes servent a quelque chose.

LES COORDONNEES SONT REMPLACEES (decision de Matthieu, 18/09/2026)
Les tests n'ont pas besoin des vraies coordonnees, et une copie sur un second
projet en multiplierait les endroits. Sont donc remplaces : les adresses
email (par `compte-00N@exemple.test`, la meme pour un compte et sa fiche),
les telephones, les notes internes, l'adresse et les codes d'acces des lieux,
et le texte des messages de discussion. Sont conserves : les noms, les roles,
et tout le planning -- c'est ce que les tests regardent.

L'ORDRE, ET LES DECLENCHEURS
  1. les comptes (`auth.users`) d'abord : les fiches en dependent. Le
     declencheur `on_auth_user_created` appartient a Supabase et NE PEUT PAS
     etre desactive : il cree donc une fiche par compte au passage. Ces
     fiches sont ensuite ecrasees par les vraies, et celles qui n'existent
     pas en production (les 8 comptes sans fiche) sont supprimees ;
  2. NOS declencheurs sont desactives pendant tout le chargement -- sinon le
     journal d'activite se remplirait de fausses lignes et la designation
     automatique (23-14) recalculerait les drapeaux ;
  3. les tables sont chargees dans l'ordre de leurs cles etrangeres, calcule
     depuis le catalogue de la base de test ;
  4. les declencheurs sont remis en service, et le script verifie qu'ils le
     sont bien ;
  5. les sequences sont recalees sur la plus grande valeur chargee.

GARDE-FOUS
  . la base de test doit porter la table temoin de 23-18, sinon arret ;
  . les ecritures ne visent que le projet de test, jamais un autre ;
  . a la fin, le nombre de lignes de chaque table est confronte a la
    sauvegarde, et les declencheurs desactives sont comptes (doit etre 0).
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
TEST = "yjttfdwjbyufpavwxcpy"
PROD = "ydihrgnixthrraprclox"
TEMOIN = "_environnement_de_test"
ARCHIVES = Path.home() / "Documents/claude-projets/archives/orga-sauvegardes"
LIGNES_PAR_INSERT = 200
INSERTS_PAR_TRANSACTION = 10

# Colonnes remplacees par des valeurs fictives : table -> {colonne: valeur}.
# `None` efface, une chaine remplace. Les emails sont traites a part.
REMPLACEMENTS = {
    "public.profiles": {"telephone": None, "notes_internes": None},
    "public.annuaire": {"telephone": None, "email": None, "note": None},
    "public.lieux": {"telephone": None, "adresse": "adresse fictive", "note": None},
    "public.codes_acces": {"identifiant": "identifiant-test", "code": "CODE-TEST",
                           "note": None},
    "public.discussion_messages": {"body": "message de test"},
    "public.immobilier_messages": {"contenu": "message de test"},
}
# Tables de la sauvegarde qui ne sont pas chargees : le stockage n'existe pas
# dans la base de test (aucun fichier n'y est copie).
IGNOREES = {"storage.buckets", "storage.objects-liste"}

if PROD == TEST:
    raise SystemExit("PROD et TEST ne peuvent pas designer le meme projet.")
if not Path("docs/sql").is_dir():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()


def stop(msg):
    raise SystemExit(f"\nARRET : {msg}")


def _appel(requete):
    """Toutes les requetes de ce script vont au PROJET DE TEST."""
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{TEST}/database/query",
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
            return None, e.read().decode()[:400]
        except OSError as e:
            return None, str(e)


def sql(requete):
    lignes, err = _appel(requete)
    if err:
        stop(f"requete refusee sur la base de test : {err}\n  {requete[:200]}")
    return lignes


def q(nom):
    return '"' + nom.replace('"', '""') + '"'


def texte(valeur):
    return "'" + str(valeur).replace("\\", "\\\\").replace("'", "''") + "'"


def element_tableau(valeur):
    if valeur is None:
        return "NULL"
    return '"' + str(valeur).replace("\\", "\\\\").replace('"', '\\"') + '"'


def litteral(valeur, udt):
    """Valeur JSON -> litteral SQL, en tenant compte du type de la colonne."""
    if valeur is None:
        return "null"
    if udt.startswith("_"):                       # tableau (uuid[], text[]...)
        elements = valeur if isinstance(valeur, list) else [valeur]
        return texte("{" + ", ".join(element_tableau(e) for e in elements) + "}")
    if udt in ("json", "jsonb"):
        return texte(json.dumps(valeur, ensure_ascii=False))
    if isinstance(valeur, bool):
        return "true" if valeur else "false"
    if isinstance(valeur, (int, float)):
        return repr(valeur)
    return texte(valeur)


# ---------------------------------------------------------------------------

def dernier_dossier():
    if "--dossier" in sys.argv:
        return Path(sys.argv[sys.argv.index("--dossier") + 1])
    dossiers = sorted(d for d in ARCHIVES.glob("*")
                      if d.is_dir() and (d / "MANIFESTE.json").is_file()
                      and not d.name.endswith((".en-cours", ".non-fige")))
    if not dossiers:
        stop(f"aucune sauvegarde complete dans {ARCHIVES}")
    return dossiers[-1]


def ordre_des_tables(tables):
    """Ordre de chargement : une table apres celles dont elle depend."""
    liens = sql(f"""
        select n.nspname || '.' || c.relname as depuis,
               fn.nspname || '.' || f.relname as vers
          from pg_constraint co
          join pg_class c on c.oid = co.conrelid
          join pg_namespace n on n.oid = c.relnamespace
          join pg_class f on f.oid = co.confrelid
          join pg_namespace fn on fn.oid = f.relnamespace
         where co.contype = 'f' and n.nspname in ('public', 'agenda');""")
    besoins = {t: set() for t in tables}
    for l in liens:
        if l["depuis"] in besoins and l["vers"] in tables and l["depuis"] != l["vers"]:
            besoins[l["depuis"]].add(l["vers"])
    ordonnees, restantes = [], dict(besoins)
    while restantes:
        libres = sorted(t for t, b in restantes.items()
                        if not (b - set(ordonnees)))
        if not libres:      # cycle : on prend au hasard, les cles etrangeres trancheront
            libres = [sorted(restantes)[0]]
        for t in libres:
            ordonnees.append(t)
            restantes.pop(t)
    return ordonnees


def colonnes_par_table():
    lignes = sql("""
        select table_schema || '.' || table_name as t, column_name as c, udt_name as udt
          from information_schema.columns
         where table_schema in ('public', 'agenda') order by 1, ordinal_position;""")
    par_table = {}
    for l in lignes:
        par_table.setdefault(l["t"], {})[l["c"]] = l["udt"]
    return par_table


def charger(nom_table, lignes, colonnes, sur_conflit=None, identite=()):
    if not lignes:
        return 0
    noms = [c for c in lignes[0] if c in colonnes]
    # Une colonne d'identite « generated always » refuse une valeur explicite :
    # il faut la reclamer, sans quoi les identifiants du journal changeraient.
    forcer = " overriding system value" if any(c in identite for c in noms) else ""
    entete = (f"insert into {q(nom_table.split('.')[0])}.{q(nom_table.split('.')[1])} "
              f"({', '.join(q(c) for c in noms)}){forcer} values ")
    fin = f" {sur_conflit}" if sur_conflit else ""
    instructions = []
    for debut in range(0, len(lignes), LIGNES_PAR_INSERT):
        paquet = lignes[debut:debut + LIGNES_PAR_INSERT]
        valeurs = ", ".join(
            "(" + ", ".join(litteral(ligne.get(c), colonnes[c]) for c in noms) + ")"
            for ligne in paquet)
        instructions.append(entete + valeurs + fin)
    for debut in range(0, len(instructions), INSERTS_PAR_TRANSACTION):
        lot = instructions[debut:debut + INSERTS_PAR_TRANSACTION]
        sql("begin;\n" + ";\n".join(lot) + ";\ncommit;\n")
    return len(lignes)


def main():
    dossier = dernier_dossier()
    manifeste = json.loads((dossier / "MANIFESTE.json").read_text())
    print("=== 23-19 CHARGER LES DONNEES DANS L'ENVIRONNEMENT DE TEST ===")
    print(f"  sauvegarde : {dossier.name} ({manifeste['exporte_le']}, "
          f"fige={manifeste['fige']})")
    print(f"  cible      : projet de test {TEST} (la production n'est pas touchee)")
    if not manifeste["fige"]:
        stop("cette sauvegarde n'est pas figee : en prendre une autre.")

    etat = sql(f"""
        select (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where c.relname = '{TEMOIN}' and n.nspname = 'public') as temoin,
               (select count(*) from auth.users) as comptes,
               (select count(*) from public.profiles) as fiches;""")[0]
    if not etat["temoin"]:
        stop("la base de test n'a pas la table temoin de 23-18 : construire la structure d'abord.")

    colonnes = colonnes_par_table()
    identite = {l["t"] + "." + l["c"] for l in sql("""
        select table_schema || '.' || table_name as t, column_name as c
          from information_schema.columns
         where table_schema in ('public', 'agenda') and identity_generation = 'ALWAYS';""")}
    donnees = {}
    for cle in manifeste["tables"]:
        if cle in IGNOREES:
            continue
        donnees[cle] = json.loads((dossier / f"{cle}.json").read_text())

    comptes = donnees.pop("auth.users-sans-mot-de-passe")
    # Une adresse fictive par compte, stable : la fiche portera la meme.
    faux_email = {c["id"]: f"compte-{n + 1:03d}@exemple.test"
                  for n, c in enumerate(sorted(comptes, key=lambda c: c["id"]))}
    tables = ordre_des_tables(set(donnees) & set(colonnes))
    inconnues = set(donnees) - set(colonnes)
    if inconnues:
        stop(f"tables absentes de la base de test : {sorted(inconnues)}")

    print(f"\n--- A charger : {len(comptes)} comptes et {len(tables)} tables "
          f"({sum(len(v) for v in donnees.values())} lignes) ---")
    print(f"  etat actuel de la base de test : {etat['comptes']} compte(s), "
          f"{etat['fiches']} fiche(s)")
    print("  coordonnees remplacees dans : "
          + ", ".join(sorted(REMPLACEMENTS)) + ", auth.users")
    if not GO:
        print(f"\n  ordre de chargement : {', '.join(tables)}")
        print("\n[simulation] rien n'a ete ecrit. Ajouter --go pour charger.")
        return 0
    if etat["comptes"] or etat["fiches"]:
        stop("la base de test contient deja des comptes ou des fiches : "
             "relancer 23-18 --recommencer --go pour repartir d'une base propre.")

    debut = time.time()

    # --- 1. nos declencheurs, mis en sommeil
    print("\n--- 1. Declencheurs desactives pendant le chargement ---")
    sql("begin;\n" + ";\n".join(
        f"alter table {q(t.split('.')[0])}.{q(t.split('.')[1])} disable trigger user"
        for t in sorted(set(donnees) & set(colonnes))) + ";\ncommit;\n")
    print(f"  {len(set(donnees) & set(colonnes))} tables")

    # --- 2. les comptes (le declencheur de Supabase creera des fiches)
    for c in comptes:
        c["email"] = faux_email[c["id"]]
        c["phone"] = None
        for cle in ("raw_user_meta_data", "raw_app_meta_data"):
            valeur = c.get(cle)
            if isinstance(valeur, dict):
                c[cle] = {k: (faux_email[c["id"]] if "email" in k.lower()
                              and isinstance(v, str) and "@" in v else v)
                          for k, v in valeur.items()}
    colonnes_auth = {l["c"]: l["udt"] for l in sql("""
        select column_name as c, udt_name as udt from information_schema.columns
         where table_schema = 'auth' and table_name = 'users';""")}
    n = charger("auth.users", comptes, colonnes_auth)
    apres_comptes = sql("select count(*) n from public.profiles;")[0]["n"]
    print(f"\n--- 2. Comptes : {n} charges, "
          f"{apres_comptes} fiche(s) creees au passage par Supabase ---")

    # --- 3. les fiches, puis les autres tables
    print("\n--- 3. Tables ---")
    total = 0
    for nom in tables:
        lignes = donnees[nom]
        for colonne, valeur in REMPLACEMENTS.get(nom, {}).items():
            for ligne in lignes:
                if colonne in ligne:
                    ligne[colonne] = valeur
        if nom == "public.profiles":
            for ligne in lignes:
                ligne["email"] = faux_email.get(ligne["id"], ligne.get("email"))
            majs = ", ".join(f"{q(c)} = excluded.{q(c)}"
                             for c in lignes[0] if c != "id")
            n = charger(nom, lignes, colonnes[nom],
                        sur_conflit=f"on conflict (id) do update set {majs}",
                        identite={c.split(".")[-1] for c in identite if c.startswith(nom + ".")})
            surplus = sql(f"""delete from public.profiles
                               where id not in ({', '.join(texte(l['id']) for l in lignes)})
                           returning id;""")
            print(f"  {nom:38} {n:>5} lignes  "
                  f"({len(surplus)} fiche(s) en trop supprimee(s))")
            total += n
            continue
        n = charger(nom, lignes, colonnes[nom],
                    identite={c.split(".")[-1] for c in identite if c.startswith(nom + ".")})
        total += n
        print(f"  {nom:38} {n:>5} lignes")

    # --- 4. declencheurs remis en service
    sql("begin;\n" + ";\n".join(
        f"alter table {q(t.split('.')[0])}.{q(t.split('.')[1])} enable trigger user"
        for t in sorted(set(donnees) & set(colonnes))) + ";\ncommit;\n")
    endormis = sql("""
        select count(*) n from pg_trigger t
          join pg_class c on c.oid = t.tgrelid
          join pg_namespace ns on ns.oid = c.relnamespace
         where not t.tgisinternal and t.tgenabled = 'D'
           and ns.nspname in ('public', 'agenda');""")[0]["n"]
    print(f"\n--- 4. Declencheurs remis en service : {endormis} encore endormi(s) ---")

    # --- 5. sequences recalees
    sequences = sql("""
        select ns.nspname || '.' || c.relname as tab, a.attname as col
          from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace ns on ns.oid = c.relnamespace
         where a.attidentity <> '' and ns.nspname in ('public', 'agenda');""")
    for s in sequences:
        sql(f"""select setval(pg_get_serial_sequence('{s['tab']}', '{s['col']}'),
                              coalesce((select max({q(s['col'])}) from {s['tab']}), 1));""")
    print(f"--- 5. Sequences recalees : {len(sequences)} ---")

    # --- 6. verification ligne a ligne
    print("\n--- 6. Verification : chaque table confrontee a la sauvegarde ---")
    morceaux = [f"select {texte(t)} as tab, count(*) as n from {t}" for t in tables]
    reels = {l["tab"]: l["n"] for l in sql("\nunion all\n".join(morceaux) + ";")}
    ecarts = [f"{t} : {reels.get(t)} en base contre {len(donnees[t])} dans la sauvegarde"
              for t in tables if reels.get(t) != len(donnees[t])]
    comptes_reels = sql("select count(*) n from auth.users;")[0]["n"]
    if comptes_reels != len(comptes):
        ecarts.append(f"auth.users : {comptes_reels} contre {len(comptes)}")
    if endormis:
        ecarts.append(f"{endormis} declencheur(s) encore desactive(s)")
    for e in ecarts:
        print("  ECART", e)
    if ecarts:
        print(f"\n{len(ecarts)} ecart(s).")
        return 1
    print(f"  Aucun ecart : {total} lignes et {comptes_reels} comptes, "
          f"identiques a la sauvegarde.")
    print(f"\nCharge en {round(time.time() - debut)} s.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
