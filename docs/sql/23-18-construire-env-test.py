#!/usr/bin/env python3
"""Construire la STRUCTURE de l'environnement de test, a l'image de la production.

    python3 docs/sql/23-18-construire-env-test.py                     # simulation
    python3 docs/sql/23-18-construire-env-test.py --go                # construit
    python3 docs/sql/23-18-construire-env-test.py --recommencer --go  # efface d'abord, puis reconstruit
    python3 docs/sql/23-18-construire-env-test.py --comparer          # compare les deux structures

A lancer DEPUIS LA RACINE du depot. Chantier C d'apres J, sous-etape C-2.

POURQUOI
Depuis 8F-5, les 6 suites de test qui ecrivent sont bloquees : le schema
agenda est le planning reel du cabinet. Le chantier D (exiger `actif` dans
99 policies) ne peut pas se repeter en production. Il faut donc une base
jumelle, sur le 3e projet Supabase, reste inutilise depuis avril et restaure
le 18/09/2026.

CE QU'IL FAIT -- la structure seulement, jamais les donnees (C-3)
  1. le type enumere `user_role` ;
  2. le schema `agenda` et ses droits d'usage ;
  3. les 43 tables, colonnes, valeurs par defaut, colonnes d'identite ;
  4. les contraintes (cles primaires, unicite, controles, puis cles etrangeres) ;
  5. les index qui ne sont pas deja portes par une contrainte ;
  6. les 58 fonctions ;
  7. les vues, avec leurs options (`security_invoker`) ;
  8. les declencheurs, y compris celui pose sur `auth.users` ;
  9. la RLS activee table par table, puis les 170 policies ;
 10. les droits accordes a anon, authenticated et service_role.

CE QU'IL NE CLONE PAS : LE SCHEMA storage
Les tables de `storage` appartiennent a Supabase et existent deja sur tout
projet : les ajouter ici ferait tenter de les RECREER. Les buckets et les
policies storage se clonent donc a part, avec 23-23 -- a relancer apres
chaque --recommencer, sans quoi le test repart avec 0 policy storage contre
20 en production (le cas rencontre le 21/09/2026, qui a rendu D-8
irrepetable jusqu'a ce qu'on s'en apercoive).

RIEN N'EST REECRIT DE MEMOIRE : chaque definition est celle que Postgres
lui-meme rend (`pg_get_constraintdef`, `pg_get_functiondef`,
`pg_get_triggerdef`, `pg_get_viewdef`, `pg_indexes`, `pg_policies`). Les
colonnes sont rendues par `format_type`, comme le fait `pg_dump`.

DEUX BASES, DEUX SENS UNIQUES
  . PRODUCTION : lecture seule, chaque requete dans une transaction
    `read only` que la base confirme -- une ecriture y serait refusee ;
  . TEST : les ecritures, et rien qu'elles. La fonction d'ecriture n'accepte
    aucune autre reference de projet que celle du projet de test.

GARDE-FOUS
  . le projet de test doit etre VIDE, ou porter la table temoin
    `public._environnement_de_test` posee par ce script. Un projet inconnu
    qui contiendrait des tables arrete tout ;
  . `--recommencer` n'efface que le projet de test, apres le meme controle ;
  . a la fin, les deux structures sont relues et comparees objet par objet
    (`--comparer` rejoue cette comparaison seule).
"""
import base64
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

GO = "--go" in sys.argv
RECOMMENCER = "--recommencer" in sys.argv
COMPARER_SEUL = "--comparer" in sys.argv

PROD = "ydihrgnixthrraprclox"          # OMNES ORGA -- lecture seule ici
TEST = "yjttfdwjbyufpavwxcpy"          # environnement de test -- les ecritures
SCHEMAS = ("public", "agenda")
TEMOIN = "_environnement_de_test"
ROLES = ("anon", "authenticated", "service_role")
LOT = 40                                # instructions envoyees par transaction

if PROD == TEST:
    raise SystemExit("PROD et TEST ne peuvent pas designer le meme projet.")
if not Path("docs/sql").is_dir():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()

LISTE_SCHEMAS = ", ".join("'" + s + "'" for s in SCHEMAS)


def stop(msg):
    raise SystemExit(f"\nARRET : {msg}")


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
            return None, e.read().decode()[:400]
        except OSError as e:
            return None, str(e)


def lire(projet, requete):
    """SELECT dans une transaction en lecture seule, sur l'un ou l'autre projet."""
    corps = ("begin transaction read only;\n"
             "select current_setting('transaction_read_only') as ro, x.*\n"
             f"from ({requete}) x;\n"
             "commit;\n")
    lignes, err = _appel(projet, corps)
    if err:
        stop(f"lecture refusee sur {projet} : {err}")
    for ligne in lignes:
        if ligne.pop("ro") != "on":
            stop("la lecture ne s'est pas faite en transaction read only.")
    return lignes


def ecrire_test(instructions, titre):
    """Ecrit SUR LE PROJET DE TEST, et nulle part ailleurs."""
    if not instructions:
        print(f"  {titre:38} rien a faire")
        return 0
    faits = 0
    for debut in range(0, len(instructions), LOT):
        lot = instructions[debut:debut + LOT]
        _, err = _appel(TEST, "begin;\n" + ";\n".join(lot) + ";\ncommit;\n")
        if err is None:
            faits += len(lot)
            continue
        # Le lot entier est annule : on rejoue une par une pour nommer la fautive.
        for instruction in lot:
            _, err1 = _appel(TEST, instruction + ";")
            if err1:
                stop(f"{titre} -- instruction refusee :\n    {instruction[:300]}\n  {err1}")
            faits += 1
    print(f"  {titre:38} {faits}")
    return faits


def ecrire_test_avec_reprise(instructions, titre):
    """Comme ecrire_test, mais repasse tant que ca progresse.

    Postgres valide le corps d'une fonction SQL a sa creation : une fonction
    qui en appelle une autre echoue si l'autre n'existe pas encore. L'ordre
    du catalogue est alphabetique, pas celui des dependances -- d'ou ces
    passages successifs, qui s'arretent des qu'un tour n'a rien cree.
    """
    if not instructions:
        print(f"  {titre:38} rien a faire")
        return 0
    _, err = _appel(TEST, "begin;\n" + ";\n".join(instructions) + ";\ncommit;\n")
    if err is None:
        print(f"  {titre:38} {len(instructions)}")
        return len(instructions)
    restantes, faites, tours = list(instructions), 0, 0
    while restantes:
        tours += 1
        echecs, derniere_erreur = [], None
        for instruction in restantes:
            _, err = _appel(TEST, instruction + ";")
            if err:
                echecs.append(instruction)
                derniere_erreur = err
            else:
                faites += 1
        if len(echecs) == len(restantes):
            stop(f"{titre} -- instruction refusee :\n    {restantes[0][:300]}\n  {derniere_erreur}")
        restantes = echecs
    print(f"  {titre:38} {faites} (en {tours} passage(s))")
    return faites


def q(nom):
    return '"' + nom.replace('"', '""') + '"'


# ---------------------------------------------------------------------------
# Lecture de la structure de la production
# ---------------------------------------------------------------------------

def lire_structure(projet):
    """Signature complete d'une base, comparable objet par objet."""
    s = LISTE_SCHEMAS
    tables = lire(projet, f"""
        select n.nspname as sch, c.relname as tab, c.relrowsecurity as rls,
               (select string_agg(
                          quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
                          || case a.attidentity when 'a' then ' generated always as identity'
                                                when 'd' then ' generated by default as identity'
                                                else coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '') end
                          || case when a.attnotnull then ' not null' else '' end,
                          ', ' order by a.attnum)
                  from pg_attribute a
                  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                 where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as colonnes
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.relkind in ('r', 'p') and not c.relispartition
           and n.nspname in ({s}) and c.relname <> '{TEMOIN}'
         order by 1, 2""")
    enums = lire(projet, f"""
        select n.nspname as sch, t.typname as nom,
               (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
                  from pg_enum e where e.enumtypid = t.oid) as valeurs
          from pg_type t join pg_namespace n on n.oid = t.typnamespace
         where t.typtype = 'e' and n.nspname in ({s}) order by 1, 2""")
    sequences = lire(projet, f"""
        select n.nspname as sch, c.relname as nom
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.relkind = 'S' and n.nspname in ({s})
           and not exists (select 1 from pg_depend d
                            where d.objid = c.oid and d.deptype in ('a', 'i'))
         order by 1, 2""")
    contraintes = lire(projet, f"""
        select n.nspname as sch, c.relname as tab, co.conname as nom,
               co.contype::text as genre, pg_get_constraintdef(co.oid) as def
          from pg_constraint co
          join pg_class c on c.oid = co.conrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname in ({s}) and c.relname <> '{TEMOIN}'
         order by 1, 2, 3""")
    index = lire(projet, f"""
        select i.schemaname as sch, i.tablename as tab, i.indexname as nom, i.indexdef as def
          from pg_indexes i
          join pg_class c on c.relname = i.indexname
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = i.schemaname
         where i.schemaname in ({s}) and i.tablename <> '{TEMOIN}'
           and not exists (select 1 from pg_constraint k where k.conindid = c.oid)
         order by 1, 2, 3""")
    fonctions = lire(projet, f"""
        select n.nspname as sch, p.proname as nom,
               pg_get_function_identity_arguments(p.oid) as args,
               pg_get_functiondef(p.oid) as def
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ({s}) and p.prokind in ('f', 'p')
           and not exists (select 1 from pg_depend d
                            where d.objid = p.oid and d.deptype = 'e')
         order by 1, 2, 3""")
    vues = lire(projet, f"""
        select n.nspname as sch, c.relname as nom,
               array_to_string(c.reloptions, ', ') as options,
               pg_get_viewdef(c.oid) as def
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.relkind = 'v' and n.nspname in ({s}) order by 1, 2""")
    declencheurs = lire(projet, f"""
        select n.nspname as sch, c.relname as tab, t.tgname as nom,
               pg_get_triggerdef(t.oid) as def
          from pg_trigger t
          join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
         where not t.tgisinternal and (n.nspname in ({s})
               or (n.nspname = 'auth' and c.relname = 'users'))
         order by 1, 2, 3""")
    policies = lire(projet, f"""
        select schemaname as sch, tablename as tab, policyname as nom,
               permissive, array_to_string(roles, ', ') as roles, cmd,
               coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
          from pg_policies where schemaname in ({s}) order by 1, 2, 3""")
    droits = lire(projet, f"""
        select table_schema as sch, table_name as tab, grantee as role,
               string_agg(privilege_type, ', ' order by privilege_type) as droits
          from information_schema.role_table_grants
         where table_schema in ({s}) and table_name <> '{TEMOIN}'
           and grantee in ({", ".join("'" + r + "'" for r in ROLES)})
         group by 1, 2, 3 order by 1, 2, 3""")
    schemas = lire(projet, f"""
        select nspname as nom, coalesce(nspacl::text, '') as droits
          from pg_namespace where nspname in ({s}) order by 1""")
    return {"types": enums, "sequences": sequences, "tables": tables,
            "contraintes": contraintes, "index": index, "fonctions": fonctions,
            "vues": vues, "declencheurs": declencheurs, "policies": policies,
            "droits": droits, "schemas": schemas}


# ---------------------------------------------------------------------------
# Traduction de la structure en instructions
# ---------------------------------------------------------------------------

def instructions(st):
    """Rend les listes d'instructions, dans l'ordre ou elles doivent passer."""
    types = [f"create type {q(e['sch'])}.{q(e['nom'])} as enum ({e['valeurs']})"
             for e in st["types"]]
    sequences = [f"create sequence {q(s['sch'])}.{q(s['nom'])}" for s in st["sequences"]]
    tables = [f"create table {q(t['sch'])}.{q(t['tab'])} ({t['colonnes']})"
              for t in st["tables"]]
    # Cles etrangeres en dernier : elles visent des tables creees au fur et a mesure.
    cles = [c for c in st["contraintes"] if c["genre"] != "f"]
    etrangeres = [c for c in st["contraintes"] if c["genre"] == "f"]
    alter = lambda c: (f"alter table {q(c['sch'])}.{q(c['tab'])} "
                       f"add constraint {q(c['nom'])} {c['def']}")
    index = [i["def"] for i in st["index"]]
    fonctions = [f["def"] for f in st["fonctions"]]
    vues = [f"create view {q(v['sch'])}.{q(v['nom'])}"
            + (f" with ({v['options']})" if v["options"] else "")
            + f" as {v['def'].rstrip().rstrip(';')}"
            for v in st["vues"]]
    declencheurs = [d["def"] for d in st["declencheurs"]]
    rls = [f"alter table {q(t['sch'])}.{q(t['tab'])} enable row level security"
           for t in st["tables"] if t["rls"]]
    policies = []
    for p in st["policies"]:
        morceau = (f"create policy {q(p['nom'])} on {q(p['sch'])}.{q(p['tab'])} "
                   f"as {p['permissive'].lower()} for {p['cmd'].lower()} "
                   f"to {p['roles']}")
        if p["qual"]:
            morceau += f" using ({p['qual']})"
        if p["with_check"]:
            morceau += f" with check ({p['with_check']})"
        policies.append(morceau)
    droits = [f"grant {d['droits']} on {q(d['sch'])}.{q(d['tab'])} to {d['role']}"
              for d in st["droits"]]
    return [("types enumeres", types), ("sequences", sequences),
            ("tables", tables), ("contraintes", [alter(c) for c in cles]),
            ("cles etrangeres", [alter(c) for c in etrangeres]),
            ("index", index), ("fonctions", fonctions), ("vues", vues),
            ("declencheurs", declencheurs), ("RLS activee", rls),
            ("policies", policies), ("droits", droits)]


# ---------------------------------------------------------------------------
# Comparaison des deux structures
# ---------------------------------------------------------------------------

def comparer(a, b):
    """Renvoie la liste des ecarts entre deux structures (prod, test)."""
    clefs = {
        "types": lambda r: (r["sch"], r["nom"]),
        "sequences": lambda r: (r["sch"], r["nom"]),
        "tables": lambda r: (r["sch"], r["tab"]),
        "contraintes": lambda r: (r["sch"], r["tab"], r["nom"]),
        "index": lambda r: (r["sch"], r["tab"], r["nom"]),
        "fonctions": lambda r: (r["sch"], r["nom"], r["args"]),
        "vues": lambda r: (r["sch"], r["nom"]),
        "declencheurs": lambda r: (r["sch"], r["tab"], r["nom"]),
        "policies": lambda r: (r["sch"], r["tab"], r["nom"]),
        "droits": lambda r: (r["sch"], r["tab"], r["role"]),
        "schemas": lambda r: (r["nom"],),
    }
    ecarts = []
    for famille, clef in clefs.items():
        gauche = {clef(r): r for r in a[famille]}
        droite = {clef(r): r for r in b[famille]}
        for c in sorted(set(gauche) - set(droite)):
            ecarts.append(f"{famille} : manque dans le test -- {'.'.join(c)}")
        for c in sorted(set(droite) - set(gauche)):
            ecarts.append(f"{famille} : en trop dans le test -- {'.'.join(c)}")
        for c in sorted(set(gauche) & set(droite)):
            # Les droits de schema portent le nom du proprietaire : non comparables.
            champs = [k for k in gauche[c] if famille != "schemas" or k != "droits"]
            for champ in champs:
                if gauche[c][champ] != droite[c][champ]:
                    ecarts.append(f"{famille}.{champ} : different -- {'.'.join(c)}")
                    break
    return ecarts


# ---------------------------------------------------------------------------

def etat_test():
    n = lire(TEST, f"""
        select (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where c.relkind in ('r','p') and n.nspname in ({LISTE_SCHEMAS})) as tables,
               (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where c.relname = '{TEMOIN}' and n.nspname = 'public') as temoin,
               (select count(*) from auth.users) as comptes""")[0]
    return n


def main():
    print("=== 23-18 CONSTRUIRE L'ENVIRONNEMENT DE TEST ===")
    print(f"  production (lecture seule) : {PROD}")
    print(f"  test (ecritures)           : {TEST}")

    st_prod = lire_structure(PROD)
    if COMPARER_SEUL:
        ecarts = comparer(st_prod, lire_structure(TEST))
        print("\n--- Comparaison des structures ---")
        for e in ecarts[:40]:
            print("  ECART", e)
        print(f"\n{len(ecarts)} ecart(s).")
        return 1 if ecarts else 0

    plan = instructions(st_prod)
    print("\n--- Ce qui serait cree, d'apres la production ---")
    for titre, liste in plan:
        print(f"  {titre:38} {len(liste)}")

    etat = etat_test()
    print(f"\n--- Etat du projet de test : {etat['tables']} table(s), "
          f"{etat['comptes']} compte(s), temoin={'oui' if etat['temoin'] else 'non'} ---")
    if etat["tables"] and not etat["temoin"]:
        stop("le projet de test contient des tables sans la table temoin : "
             "ce n'est peut-etre pas le bon projet.")
    if etat["tables"] and not RECOMMENCER:
        stop("le projet de test est deja construit. Ajouter --recommencer "
             "pour l'effacer et le reconstruire.")

    if not GO:
        print("\n[simulation] rien n'a ete ecrit. Ajouter --go pour construire.")
        return 0

    debut = time.time()
    if RECOMMENCER and etat["tables"]:
        print("\n--- Effacement du projet de TEST ---")
        # Les comptes aussi : sans cela, 23-19 ne pourrait pas repartir d'une
        # base vide (les fiches sont creees par le declencheur de Supabase).
        ecrire_test(["delete from auth.users",
                     "drop schema if exists agenda cascade",
                     "drop schema public cascade",
                     "create schema public",
                     "grant usage on schema public to anon, authenticated, service_role",
                     "grant all on schema public to postgres"], "schemas effaces puis recrees")

    print("\n--- Construction ---")
    # Le temoin est pose AVANT tout le reste : une construction interrompue
    # laisse un projet reconnaissable, que --recommencer pourra effacer.
    ecrire_test([f'create table if not exists public.{q(TEMOIN)} ('
                 f'construit_le timestamptz not null default now(), '
                 f'source text not null, etat text not null)',
                 f"insert into public.{q(TEMOIN)} (source, etat) "
                 f"values ('{PROD} -- 23-18', 'construction en cours')"],
                "table temoin")
    ecrire_test([f"create schema if not exists {q(s)}" for s in SCHEMAS if s != "public"],
                "schemas")
    for schema in SCHEMAS:
        if schema == "public":
            continue
        ecrire_test([f"grant usage on schema {q(schema)} to authenticated, service_role"],
                    f"droits d'usage sur {schema}")
    for titre, liste in plan:
        # Les fonctions, les vues et les declencheurs peuvent dependre les uns
        # des autres : on repasse tant que ca progresse.
        if titre in ("fonctions", "vues", "declencheurs"):
            ecrire_test_avec_reprise(liste, titre)
        else:
            ecrire_test(liste, titre)
    ecrire_test([f"update public.{q(TEMOIN)} set etat = 'termine', construit_le = now()"],
                "temoin : construction terminee")

    print(f"\n--- Verification : comparaison des deux structures "
          f"({round(time.time() - debut)} s) ---")
    ecarts = comparer(st_prod, lire_structure(TEST))
    for e in ecarts[:40]:
        print("  ECART", e)
    if ecarts:
        print(f"\n{len(ecarts)} ecart(s) : structure NON conforme.")
        return 1
    print("  Aucun ecart : la structure de test est identique a la production.")
    print("\n  A FAIRE ENSUITE -- ce script ne clone pas storage :")
    print("    python3 docs/sql/23-23-cloner-storage-env-test.py --go")
    print("    python3 docs/sql/23-19-charger-donnees-env-test.py --go")
    print(f"\nConstruit le {datetime.now().strftime('%d/%m/%Y a %Hh%M')}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
