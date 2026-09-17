#!/usr/bin/env python3
"""Sauvegarde de la base Omnes-Orga, EN LECTURE SEULE. Etape A-1 (apres J).

    python3 docs/sql/23-16-sauvegarde-orga.py          # simulation, n'ecrit rien
    python3 docs/sql/23-16-sauvegarde-orga.py --go     # exporte

Se lance depuis n'importe quel dossier (utile a l'automatisation, A-3).

POURQUOI
Depuis l'ouverture du 17/09/2026, le schema agenda est le planning reel du
cabinet. Or le projet Supabase est sur l'offre gratuite : AUCUNE sauvegarde
(mesure du 17/09 : backups = [], pitr_enabled = false). « Annuler » repare
une action faite dans l'appli, pas une suppression en masse ni un script
qui se trompe.

CE QU'IL EXPORTE, en JSON, HORS du depot Git (donnees personnelles)
  . chaque table des schemas public et agenda, lue dans le catalogue : une
    table ajoutee plus tard est sauvegardee sans toucher a ce script ;
  . auth.users par une LISTE BLANCHE de colonnes : jamais d'empreinte de mot
    de passe ni de jeton, meme si Supabase ajoute un jour une colonne ;
  . la liste des fichiers du stockage (nom, taille) -- PAS leur contenu ;
  . la structure : colonnes, contraintes, index, policies, fonctions,
    declencheurs, vues, droits, publication temps reel, extensions.

GARANTIES
  . lecture seule : chaque requete tourne dans une transaction « read
    only », et la base confirme ce mode sur chaque ligne renvoyee ;
  . export fige : une empreinte (nombre de lignes + md5 du contenu de
    chaque table, en UNE requete) est prise avant et apres l'export. Si
    quelqu'un a ecrit entre les deux, l'export recommence (3 essais) ;
  . chaque fichier est RELU sur le disque et son nombre de lignes confronte
    a l'empreinte ; son sha256 est note dans MANIFESTE.json ;
  . l'export s'ecrit dans « <date>.en-cours », renomme « <date> » seulement
    quand tout est au vert : un dossier sans suffixe est une sauvegarde
    complete ;
  . dossier et fichiers lisibles par le seul compte macOS de Matthieu.

SIMULATION (par defaut) : memes requetes que l'export, mais chacune ne
renvoie que son nombre de lignes -- aucune donnee ne quitte la base.

CE QU'IL NE FAIT PAS
  . il ne sauvegarde pas le contenu des fichiers joints (stockage) ;
  . il ne restaure rien : une restauration demanderait un script a ecrire
    et a repeter d'abord sur un environnement de test ;
  . il ne supprime aucune ancienne sauvegarde (rotation : A-3).

CODES DE SORTIE : 0 sauvegarde complete (ou simulation au vert) ;
1 arret, aucune sauvegarde complete ecrite ; 2 base en mouvement pendant
les 3 essais -- dossier « <date>.non-fige », a ne pas prendre pour reference.
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
from datetime import datetime
from pathlib import Path

GO = "--go" in sys.argv
ORGA = "ydihrgnixthrraprclox"
SCHEMAS = ("public", "agenda")
ARCHIVES = Path.home() / "Documents/claude-projets/archives/orga-sauvegardes"
ESSAIS = 3

# Colonnes de auth.users conservees. Tout le reste (encrypted_password,
# confirmation_token, recovery_token...) est ecarte par construction.
COLONNES_AUTH = ("id", "email", "phone", "role", "created_at", "updated_at",
                 "email_confirmed_at", "last_sign_in_at", "banned_until",
                 "deleted_at", "is_anonymous", "raw_app_meta_data",
                 "raw_user_meta_data")


def stop(msg):
    raise SystemExit(f"\nARRET : {msg}\nAucune sauvegarde complete n'a ete ecrite.")


try:
    _TOK = base64.b64decode(subprocess.check_output(
        ["security", "find-generic-password", "-s", "Supabase CLI", "-w"],
        stderr=subprocess.DEVNULL
    ).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()
except subprocess.CalledProcessError:
    stop("jeton introuvable dans le trousseau (service « Supabase CLI »).")


def lit(v):
    return "'" + str(v).replace("'", "''") + "'"


def ident(nom):
    return '"' + nom.replace('"', '""') + '"'


LISTE_SCHEMAS = ", ".join(lit(s) for s in SCHEMAS)


def sql(requete):
    """Execute un SELECT dans une transaction en lecture seule.

    L'API Management ne renvoie que le resultat du dernier select : le mode
    de la transaction est donc ajoute en colonne « ro » a chaque ligne, puis
    verifie et retire. Le commit est sur sa propre ligne (piege de 8H).
    """
    corps = ("begin transaction read only;\n"
             "select current_setting('transaction_read_only') as ro, x.*\n"
             f"from ({requete}) x;\n"
             "commit;\n")
    for tentative in range(4):
        req = urllib.request.Request(
            f"https://api.supabase.com/v1/projects/{ORGA}/database/query",
            data=json.dumps({"query": corps}).encode(), method="POST")
        req.add_header("Authorization", f"Bearer {_TOK}")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "omnes-orga-script/1.0")
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                lignes = json.loads(r.read() or "[]")
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 and tentative < 3:
                time.sleep(30)  # limite de debit de l'API Management
                continue
            stop(f"requete refusee (HTTP {e.code}) : {e.read().decode()[:300]}")
        except OSError as e:
            stop(f"base injoignable : {e}")
    for ligne in lignes:
        if ligne.pop("ro") != "on":
            stop("la transaction n'etait pas en lecture seule.")
    return lignes


def json_val(v):
    # L'API renvoie les colonnes json deja decodees ; au cas ou, une chaine.
    return json.loads(v) if isinstance(v, str) else v


# --- ce qu'on sauvegarde ---------------------------------------------------

def lister_sources():
    tables = sql(f"""
        select n.nspname as schema, c.relname as nom,
               coalesce((select json_agg(a.attname order by k.ord)
                           from pg_index i
                           cross join unnest(i.indkey::int2[]) with ordinality k(attnum, ord)
                           join pg_attribute a
                             on a.attrelid = i.indrelid and a.attnum = k.attnum
                          where i.indrelid = c.oid and i.indisprimary),
                        '[]'::json) as cle
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where c.relkind in ('r', 'p') and not c.relispartition
           and n.nspname in ({LISTE_SCHEMAS})
         order by 1, 2""")
    if not tables:
        stop("aucune table trouvee dans le catalogue.")

    sources = []
    for t in tables:
        cle = json_val(t["cle"])
        # Ordre stable (cle primaire, sinon texte de la ligne) : deux
        # sauvegardes successives se comparent ligne a ligne.
        ordre = ", ".join(f"t.{ident(c)}" for c in cle) or "t::text"
        sources.append({"cle": f"{t['schema']}.{t['nom']}",
                        "depuis": f"{ident(t['schema'])}.{ident(t['nom'])}",
                        "ordre": ordre})

    existantes = {l["column_name"] for l in sql(
        "select column_name from information_schema.columns "
        "where table_schema = 'auth' and table_name = 'users'")}
    colonnes = [c for c in COLONNES_AUTH if c in existantes]
    if "id" not in colonnes or "email" not in colonnes:
        stop("auth.users n'a plus les colonnes attendues.")
    sources.append({"cle": "auth.users-sans-mot-de-passe",
                    "depuis": "(select " + ", ".join(ident(c) for c in colonnes)
                              + " from auth.users)",
                    "ordre": 't."id"'})
    sources.append({"cle": "storage.buckets",
                    "depuis": "storage.buckets", "ordre": 't."id"'})
    sources.append({"cle": "storage.objects-liste",
                    "depuis": "(select id, bucket_id, name, created_at, updated_at,"
                              " metadata from storage.objects)",
                    "ordre": 't."bucket_id", t."name", t."id"'})
    return sources


def empreinte(sources):
    """{cle: [nombre de lignes, md5 du contenu]} de toutes les sources, en
    UNE requete, donc sur un meme etat de la base."""
    morceaux = [
        f"select {lit(s['cle'])} as cle, count(*) as n, "
        f"md5(coalesce(string_agg(t::text, E'\\n' order by t::text), '')) as h "
        f"from {s['depuis']} t"
        for s in sources]
    lignes = sql("\nunion all\n".join(morceaux))
    return {l["cle"]: [l["n"], l["h"]] for l in lignes}


def exporter(source, a_blanc):
    agregat = f"coalesce(json_agg(t order by {source['ordre']}), '[]'::json)"
    if a_blanc:
        agregat = f"json_array_length({agregat})"
    ligne = sql(f"select {agregat} as lignes from {source['depuis']} t")[0]
    return ligne["lignes"] if a_blanc else json_val(ligne["lignes"])


def lire_structure():
    s = LISTE_SCHEMAS
    ligne = sql(f"""select
      (select json_agg(json_build_object(
                'schema', table_schema, 'table', table_name,
                'colonne', column_name, 'position', ordinal_position,
                'type', data_type, 'udt', udt_name,
                'nullable', is_nullable, 'defaut', column_default)
              order by table_schema, table_name, ordinal_position)
         from information_schema.columns
        where table_schema in ({s})) as colonnes,
      (select json_agg(json_build_object(
                'schema', n.nspname, 'table', c.relname, 'nom', co.conname,
                'definition', pg_get_constraintdef(co.oid))
              order by n.nspname, c.relname, co.conname)
         from pg_constraint co
         join pg_class c on c.oid = co.conrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ({s})) as contraintes,
      (select json_agg(json_build_object(
                'schema', schemaname, 'table', tablename,
                'nom', indexname, 'definition', indexdef)
              order by schemaname, tablename, indexname)
         from pg_indexes where schemaname in ({s})) as index,
      (select json_agg(json_build_object(
                'schema', schemaname, 'table', tablename, 'nom', policyname,
                'permissive', permissive, 'roles', roles, 'commande', cmd,
                'using', qual, 'with_check', with_check)
              order by schemaname, tablename, policyname)
         from pg_policies
        where schemaname in ({s}, 'storage')) as policies,
      (select json_agg(json_build_object(
                'schema', n.nspname, 'nom', p.proname,
                'arguments', pg_get_function_identity_arguments(p.oid),
                'definition', pg_get_functiondef(p.oid))
              order by n.nspname, p.proname,
                       pg_get_function_identity_arguments(p.oid))
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ({s}) and p.prokind in ('f', 'p')
          and not exists (select 1 from pg_depend d
                           where d.objid = p.oid and d.deptype = 'e')) as fonctions,
      (select json_agg(json_build_object(
                'schema', n.nspname, 'table', c.relname, 'nom', tg.tgname,
                'actif', tg.tgenabled, 'definition', pg_get_triggerdef(tg.oid))
              order by n.nspname, c.relname, tg.tgname)
         from pg_trigger tg
         join pg_class c on c.oid = tg.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where not tg.tgisinternal
          and n.nspname in ({s}, 'auth')) as declencheurs,
      (select json_agg(json_build_object(
                'schema', n.nspname, 'nom', c.relname,
                'options', c.reloptions, 'definition', pg_get_viewdef(c.oid))
              order by n.nspname, c.relname)
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('v', 'm') and n.nspname in ({s})) as vues,
      (select json_agg(json_build_object(
                'role', grantee, 'schema', table_schema,
                'table', table_name, 'droit', privilege_type)
              order by grantee, table_schema, table_name, privilege_type)
         from information_schema.role_table_grants
        where table_schema in ({s})
          and grantee in ('anon', 'authenticated', 'service_role')) as droits,
      (select json_agg(json_build_object(
                'publication', pubname, 'schema', schemaname, 'table', tablename)
              order by pubname, schemaname, tablename)
         from pg_publication_tables) as publications,
      (select json_agg(json_build_object(
                'nom', extname, 'version', extversion)
              order by extname)
         from pg_extension) as extensions""")[0]
    return {k: (json_val(v) or []) for k, v in ligne.items()}


# --- ecriture ----------------------------------------------------------------

def ecrire(chemin, donnees):
    chemin.write_text(json.dumps(donnees, ensure_ascii=False, indent=1),
                      encoding="utf-8")


def sha256(chemin):
    return hashlib.sha256(chemin.read_bytes()).hexdigest()


def main():
    debut = time.time()
    maintenant = datetime.now()
    nom = maintenant.strftime("%Y-%m-%d-%Hh%M")
    print("Sauvegarde Omnes-Orga -- " + ("EXPORT" if GO else
          "SIMULATION (aucune donnee ne quitte la base, rien n'est ecrit)"))
    print(f"  base : OMNES ORGA ({ORGA}), transactions en lecture seule")
    print(f"  destination : {ARCHIVES / nom}/")

    sources = lister_sources()
    avant = empreinte(sources)

    if not GO:
        print(f"\n  {len(sources)} sources, export a blanc de chacune :")
        ecarts = 0
        for src in sources:
            n_base = avant[src["cle"]][0]
            n_blanc = exporter(src, a_blanc=True)
            ok = n_blanc == n_base
            ecarts += not ok
            print(f"    {'OK ' if ok else 'ECART'}  {src['cle']:<42} {n_base:>6} lignes"
                  + ("" if ok else f"  (export a blanc : {n_blanc})"))
        structure = lire_structure()
        print("\n  structure : " + ", ".join(f"{len(v)} {k}" for k, v in structure.items()))
        total = sum(v[0] for v in avant.values())
        print(f"\n  total : {total} lignes. " + ("SIMULATION AU VERT." if not ecarts
              else f"{ecarts} ECART(S) : a comprendre avant --go."))
        print("  Rien n'a ete ecrit. Relancer avec --go pour exporter.")
        return 0 if not ecarts else 1

    # Fichiers et dossiers crees a partir d'ici : lisibles par Matthieu seul.
    os.umask(0o077)
    ARCHIVES.mkdir(parents=True, exist_ok=True)
    final = ARCHIVES / nom
    if final.exists():
        stop(f"une sauvegarde porte deja ce nom : {final}")
    en_cours = ARCHIVES / (nom + ".en-cours")
    en_cours.mkdir(exist_ok=True)

    fige = False
    for essai in range(1, ESSAIS + 1):
        for src in sources:
            ecrire(en_cours / f"{src['cle']}.json", exporter(src, a_blanc=False))
        ecrire(en_cours / "structure.json", lire_structure())
        apres = empreinte(sources)
        if apres == avant:
            fige = True
            break
        bouge = sorted(k for k in apres if apres[k] != avant.get(k))
        print(f"  essai {essai} : la base a bouge pendant l'export ({', '.join(bouge)})"
              + (" -- on recommence" if essai < ESSAIS else ""))
        avant = apres

    # Relecture de chaque fichier sur le disque, confrontee a l'empreinte.
    tables = {}
    for src in sources:
        chemin = en_cours / f"{src['cle']}.json"
        relu = json.loads(chemin.read_text(encoding="utf-8"))
        n_base = apres[src["cle"]][0]
        tables[src["cle"]] = {"compte": n_base, "exporte": len(relu),
                              "identique": len(relu) == n_base,
                              "octets": chemin.stat().st_size,
                              "sha256": sha256(chemin)}
    ecarts = sorted(k for k, v in tables.items() if not v["identique"])
    if fige and ecarts:
        stop(f"fichiers differents de la base : {', '.join(ecarts)}. "
             f"Dossier laisse en l'etat pour examen : {en_cours}")

    ecrire(en_cours / "MANIFESTE.json", {
        "source": f"projet Supabase {ORGA} (OMNES ORGA)",
        "script": "docs/sql/23-16-sauvegarde-orga.py",
        "exporte_le": maintenant.isoformat(timespec="seconds"),
        "duree_secondes": round(time.time() - debut),
        "fige": fige,
        "essais": essai,
        "remarque": "Export en lecture seule. auth.users sans empreinte de mot "
                    "de passe ni jeton. Contenu des fichiers du stockage NON "
                    "sauvegarde (liste seulement).",
        "tables": tables,
    })

    if not fige:
        garde = ARCHIVES / (nom + ".non-fige")
        en_cours.rename(garde)
        print(f"\nNON FIGE : la base a bouge pendant les {ESSAIS} essais.\n"
              f"  Dossier garde pour examen, a ne pas prendre pour reference : {garde}")
        return 2

    en_cours.rename(final)
    octets = sum(p.stat().st_size for p in final.iterdir())
    print(f"\n  {len(tables)} fichiers relus, nombres de lignes identiques a la base, "
          f"essai {essai}/{ESSAIS}, {round(time.time() - debut)} s, "
          f"{octets / 1e6:.1f} Mo")
    print(f"SAUVEGARDE COMPLETE : {final}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
