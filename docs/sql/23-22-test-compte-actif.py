#!/usr/bin/env python3
"""Prouver que la couche « compte actif » ferme les inactifs SANS rien casser.

    OMNES_CIBLE=test python3 docs/sql/23-22-test-compte-actif.py
    OMNES_CIBLE=test python3 docs/sql/23-22-test-compte-actif.py --enregistrer /chemin/sans-couche.json
    OMNES_CIBLE=test python3 docs/sql/23-22-test-compte-actif.py --comparer   /chemin/sans-couche.json

A lancer DEPUIS LA RACINE du depot. Chantier D, sous-etape D-4.

CE QUE CETTE SUITE N'ECRIT PAS
Chaque controle tourne dans une transaction ANNULEE (`rollback`) : meme les
sondes d'ecriture ne laissent aucune trace. Aucun `commit` n'est emis.

COMMENT ON TESTE
Pas de jeton JWT : on prend le role `authenticated` et on pose les claims
directement dans la transaction (`set local request.jwt.claims`), ce que lit
`auth.uid()`. C'est la meme chose que ce que voit PostgREST, mais evalue par
Postgres lui-meme -- et donc plus proche de la policy qu'un appel HTTP.

LE RISQUE QU'ON CHERCHE A ECARTER
Une policy trop stricte ne leve aucune erreur : elle rend simplement moins de
lignes. L'appli continue de s'afficher, avec des listes vides, et personne ne
s'en apercoit avant des jours. Le seul controle qui vaille est donc un
comparatif AVANT / APRES, table par table et compte par compte :
  1. mesurer SANS la couche       -> --enregistrer sans-couche.json
  2. poser la couche (23-21 --go)
  3. mesurer AVEC la couche       -> --comparer  sans-couche.json
Un compte ACTIF doit voir EXACTEMENT les memes nombres. Le moindre ecart est
une regression, et la suite le dit.

LES QUATRE CONTROLES
  A. un compte actif de chaque role voit le meme nombre de lignes qu'avant ;
  B. un compte inactif ne voit plus rien, sauf sa propre fiche (1 ligne) ;
  C. un compte inactif ne peut plus ecrire (insertion refusee, mise a jour
     sans effet), alors qu'un compte actif le peut ;
  D. le schema agenda est inchange -- il gardait deja `actif` ;
  E. les FICHIERS (storage) : un inactif n'y accede plus, et le bucket
     immobilier n'est plus lisible par un non-membre (chantier D-8).

LES FICHIERS TEMOINS DU CONTROLE E
Le storage de l'environnement de test est vide (23-23 clone les buckets et
les policies, jamais le contenu). La suite pose donc elle-meme un objet par
bucket, DANS LA TRANSACTION QU'ELLE ANNULE : les lignes existent le temps
du controle et disparaissent au rollback. En production, les vrais fichiers
sont comptes tels quels, sans qu'on en ajoute.
Un objet du bucket `discussion-attachments` n'est visible que s'il a sa
ligne dans `public.discussion_attachments` : le temoin n'en a pas, donc
personne ne le voit. C'est attendu, et non une regression.
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

PROJET_PROD = "ydihrgnixthrraprclox"
PROJET_TEST = "yjttfdwjbyufpavwxcpy"

CIBLE = os.environ.get("OMNES_CIBLE", "prod").strip().lower()
if CIBLE not in ("prod", "test"):
    raise SystemExit("OMNES_CIBLE vaut 'prod' (defaut) ou 'test'.")
SUR_TEST = CIBLE == "test"
PROJET = PROJET_TEST if SUR_TEST else PROJET_PROD


def option(nom):
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

ECHECS = []


def stop(msg):
    raise SystemExit(f"\nARRET : {msg}")


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
            return None, detail[:300]
        except OSError as e:
            return None, str(e)


def admin(requete):
    """Lecture en role postgres : pour PREPARER et CONSTATER, jamais prouver."""
    lignes, err = _appel("begin transaction read only;\n"
                         f"select x.* from ({requete}) x;\ncommit;\n")
    if err:
        stop(f"lecture refusee -- {err}")
    return lignes


def comme(uid, requete):
    """Execute `requete` EN TANT QUE uid, puis annule tout.

    `set local` ne vaut que pour la transaction : le role et les claims
    disparaissent au rollback, qui annule aussi toute ecriture tentee.
    """
    corps = (f"begin;\n"
             f"set local role authenticated;\n"
             f"set local request.jwt.claims = '{json.dumps({'sub': uid, 'role': 'authenticated'})}';\n"
             f"{requete};\n"
             f"rollback;\n")
    return _appel(corps)


def titre(texte):
    print("\n" + "=" * 74 + f"\n{texte}\n" + "=" * 74)


def controle(libelle, obtenu, attendu):
    ok = obtenu == attendu
    if not ok:
        ECHECS.append(f"{libelle} : obtenu {obtenu}, attendu {attendu}")
    print(f"  [{'OK ' if ok else 'ECHEC'}] {libelle:56} {obtenu}")
    return ok


# ---------------------------------------------------------------------
print(f"cible : {'ENVIRONNEMENT DE TEST' if SUR_TEST else 'PRODUCTION'} "
      f"-- projet {PROJET}")
temoin = admin("""select count(*) as n from pg_class c
                    join pg_namespace n on n.oid = c.relnamespace
                   where c.relname = '_environnement_de_test' and n.nspname='public'""")[0]["n"]
if SUR_TEST and not temoin:
    stop("OMNES_CIBLE=test mais la table temoin de 23-18 est absente.")

couche = admin("""select count(*) as n from pg_policies
                   where schemaname = 'public'
                     and policyname like 'exiger_compte_actif%'""")[0]["n"]
print(f"couche « compte actif » : {couche} policies "
      f"({'POSEE' if couche else 'ABSENTE'})")

TABLES = [r["tab"] for r in admin("""
    select c.relname as tab from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relkind='r' and c.relrowsecurity
       and c.relname <> '_environnement_de_test'
     order by c.relname""")]

# Un compte ACTIF par role, plus un compte INACTIF : sans ce dernier, tous
# les controles de cloison passeraient a vide en affichant OK.
comptes = admin("""
    select distinct on (role, actif)
           role::text as role, actif, id::text as id,
           coalesce(nullif(prenom||' '||nom, ' '), 'sans nom') as nom
      from public.profiles
     order by role, actif, id""")
actifs = [c for c in comptes if c["actif"]]
inactifs = [c for c in comptes if not c["actif"]]
if not inactifs:
    stop("aucune fiche inactive sur cette base : le controle B passerait a "
         "vide en affichant OK. Suite interrompue.")

titre("COMPTES UTILISES")
for c in actifs:
    print(f"  ACTIF    {c['role']:16} {c['nom'][:28]:28} {c['id']}")
for c in inactifs:
    print(f"  INACTIF  {c['role']:16} {c['nom'][:28]:28} {c['id']}")

# ---------------------------------------------------------------------
titre("A. CE QUE CHAQUE COMPTE VOIT, TABLE PAR TABLE")
#: Un seul aller-retour par compte : 27 sous-requetes en une.
releve = {}
for c in actifs + inactifs:
    union = "\nunion all\n".join(
        f"select '{t}' as tab, count(*)::int as n from public.{t}" for t in TABLES)
    lignes, err = comme(c["id"], f"select * from ({union}) z order by tab")
    if err:
        stop(f"releve impossible pour {c['nom']} -- {err}")
    releve[c["id"]] = {r["tab"]: r["n"] for r in lignes}
    total = sum(releve[c["id"]].values())
    marque = "ACTIF  " if c["actif"] else "INACTIF"
    print(f"  {marque} {c['role']:16} {total:6} lignes visibles au total")

etat = {"projet": PROJET, "mesure_le": datetime.now().isoformat(timespec="seconds"),
        "couche_posee": bool(couche), "releve": releve, "storage": {},
        "comptes": {c["id"]: {"role": c["role"], "actif": c["actif"],
                              "nom": c["nom"]} for c in comptes}}

# ---------------------------------------------------------------------
titre("B. UN COMPTE INACTIF NE VOIT PLUS RIEN, SAUF SA PROPRE FICHE")
if not couche:
    print("  (couche absente : on mesure l'etat AVANT, aucun verdict attendu)")
for c in inactifs:
    vu = releve[c["id"]]
    autres = {t: n for t, n in vu.items() if t != "profiles" and n}
    if couche:
        controle(f"inactif {c['role']} : tables autres que profiles", autres, {})
        controle(f"inactif {c['role']} : voit sa seule fiche", vu["profiles"], 1)
    else:
        print(f"  inactif {c['role']:14} voit {sum(vu.values())} lignes "
              f"dont {len(autres)} tables non vides -- c'est le trou a fermer")

# ---------------------------------------------------------------------
titre("C. UN COMPTE INACTIF NE PEUT PLUS ECRIRE")
SONDE = ("insert into public.annuaire (nom, auteur_id) "
         "values ('SONDE-RLS-23-22', (select auth.uid()))")

for c in inactifs:
    _, err = comme(c["id"], SONDE)
    refuse = bool(err) and "row-level security" in (err or "").lower()
    if couche:
        controle(f"inactif {c['role']} : insertion refusee", refuse, True)
    else:
        print(f"  inactif {c['role']:14} insertion "
              f"{'refusee' if refuse else 'ACCEPTEE -- c est le trou'}")
    lignes, err2 = comme(c["id"],
                         "update public.profiles set telephone = telephone "
                         "where id = (select auth.uid()) returning 1 as t")
    touchees = 0 if err2 else len(lignes or [])
    if couche:
        controle(f"inactif {c['role']} : mise a jour sans effet", touchees, 0)
    else:
        print(f"  inactif {c['role']:14} mise a jour de sa fiche : "
              f"{touchees} ligne(s)")

#: Le controle miroir : sans lui, une couche qui bloquerait TOUT LE MONDE
#: passerait les controles B et C en affichant OK.
for c in actifs:
    _, err = comme(c["id"], SONDE)
    controle(f"ACTIF {c['role']} : insertion toujours possible", err, None)

# ---------------------------------------------------------------------
titre("D. LE SCHEMA agenda EST INCHANGE")
ag = admin("""select count(*) as n from pg_policies where schemaname='agenda'""")[0]["n"]
ag_gardees = admin("""
    select count(*) as n from pg_policies
     where schemaname='agenda'
       and coalesce(case when cmd='INSERT' then with_check else qual end,'')
           ~ 'peut_acceder|est_coordinateur'""")[0]["n"]
controle("agenda : nombre de policies", ag, 51)
controle("agenda : policies passant par une garde", ag_gardees, 51)
controle("public : policies PERMISSIVE d'origine intactes",
         admin("""select count(*) as n from pg_policies
                   where schemaname='public' and permissive='PERMISSIVE'""")[0]["n"], 99)

# ---------------------------------------------------------------------
titre("E. LES FICHIERS (storage)")
BUCKETS = [r["id"] for r in admin("select id from storage.buckets order by id")]
couche_storage = admin("""
    select count(*) as n from pg_policies
     where schemaname='storage'
       and policyname in ('exiger_compte_actif',
                          'restreindre_immobilier_aux_membres')""")[0]["n"]
print(f"  buckets : {len(BUCKETS)} -- " + ", ".join(BUCKETS))
print(f"  couche D-8 : {couche_storage} policies "
      f"({'POSEE' if couche_storage else 'ABSENTE'})")

storage_releve = {}
if not BUCKETS:
    print("\n  aucun bucket sur cette base : controle E ignore.")
    print("  (sur le test : python3 docs/sql/23-23-cloner-storage-env-test.py --go)")
else:
    #: Un objet temoin par bucket, pose puis annule avec la transaction.
    #:
    #: L'ORDRE COMPTE : les temoins sont poses en role `postgres`, AVANT la
    #: bascule vers `authenticated`. Pose apres, l'insertion tomberait sous
    #: la RLS qu'on cherche justement a mesurer, et la suite s'arreterait sur
    #: « new row violates row-level security policy ». On ne passe donc pas
    #: par comme(), qui bascule le role des la premiere ligne.
    sondes = ", ".join(f"('{b}', 'SONDE-23-22/{b}.bin')" for b in BUCKETS)
    for c in actifs + inactifs:
        claims = json.dumps({"sub": c["id"], "role": "authenticated"})
        lignes, err = _appel(
            "begin;\n"
            f"insert into storage.objects (bucket_id, name) values {sondes};\n"
            "set local role authenticated;\n"
            f"set local request.jwt.claims = '{claims}';\n"
            "select bucket_id, count(*)::int as n from storage.objects "
            "group by 1 order by 1;\n"
            "rollback;\n")
        if err:
            stop(f"controle E impossible pour {c['nom']} -- {err}")
        vu = {r["bucket_id"]: r["n"] for r in (lignes or [])}
        storage_releve[c["id"]] = {b: vu.get(b, 0) for b in BUCKETS}
        lisibles = [b for b in BUCKETS if vu.get(b)]
        marque = "ACTIF  " if c["actif"] else "INACTIF"
        print(f"  {marque} {c['role']:16} "
              + (", ".join(lisibles) if lisibles else "aucun fichier"))

    if couche_storage:
        for c in inactifs:
            controle(f"inactif {c['role']} : aucun fichier",
                     [b for b in BUCKETS if storage_releve[c["id"]][b]], [])
        #: Le bucket immobilier n'est lisible que par is_immobilier_member()
        #: -- super_admin, associe_gerant, associe. Un remplacant ou le poste
        #: bureau ne doit plus y acceder.
        for c in actifs:
            attendu = c["role"] in ("super_admin", "associe_gerant", "associe")
            controle(f"ACTIF {c['role']:16} : immobilier lisible",
                     bool(storage_releve[c["id"]].get("immobilier-attachments")),
                     attendu)

# ---------------------------------------------------------------------
etat["storage"] = storage_releve

if ENREGISTRER:
    Path(ENREGISTRER).parent.mkdir(parents=True, exist_ok=True)
    Path(ENREGISTRER).write_text(json.dumps(etat, indent=1, ensure_ascii=False))
    titre("RELEVE ENREGISTRE")
    print(f"  {ENREGISTRER}  (couche {'posee' if couche else 'absente'})")

if COMPARER:
    titre("A-bis. AUCUNE REGRESSION POUR LES COMPTES ACTIFS")
    avant = json.loads(Path(COMPARER).read_text())
    #: L'avertissement ne vaut que pour la couche de `public` (23-21). Les
    #: fichiers ont leur propre couche (23-24) : comparer deux releves ou
    #: celle de public est posee dans les deux cas reste utile pour storage.
    if avant["couche_posee"] and couche:
        print("  NOTE : la couche de `public` est posee dans les deux releves "
              "-- la\n        comparaison des tables ne prouve donc rien ; "
              "celle des fichiers,\n        si (couche storage distincte).")
    print(f"  releve de reference du {avant['mesure_le']} "
          f"(couche {'posee' if avant['couche_posee'] else 'absente'})\n")
    for c in actifs:
        ref = avant["releve"].get(c["id"])
        if ref is None:
            print(f"  [    ] {c['role']:16} absent du releve de reference")
            continue
        ecarts = {t: (ref.get(t), releve[c["id"]].get(t))
                  for t in TABLES if ref.get(t) != releve[c["id"]].get(t)}
        controle(f"ACTIF {c['role']:16} voit autant qu'avant", ecarts, {})
        for t, (a, b) in ecarts.items():
            print(f"         {t:30} avant {a} -> apres {b}")
    for c in actifs:
        ref_s = (avant.get("storage") or {}).get(c["id"])
        if ref_s is None or not storage_releve:
            continue
        ecarts_s = {b: (ref_s.get(b), storage_releve[c["id"]].get(b))
                    for b in storage_releve[c["id"]]
                    if ref_s.get(b) != storage_releve[c["id"]].get(b)}
        #: Le bucket immobilier DOIT changer pour un non-membre : c'est la
        #: correction elle-meme, pas une regression. On l'ecarte du verdict
        #: et on l'affiche a part.
        attendu_immo = c["role"] in ("super_admin", "associe_gerant", "associe")
        volontaire = {b: v for b, v in ecarts_s.items()
                      if b == "immobilier-attachments" and not attendu_immo}
        regression = {b: v for b, v in ecarts_s.items() if b not in volontaire}
        controle(f"ACTIF {c['role']:16} fichiers inchanges", regression, {})
        for b, (a, x) in volontaire.items():
            print(f"         {b:30} {a} -> {x}  (fermeture voulue, non-membre)")

    for c in inactifs:
        ref = avant["releve"].get(c["id"])
        if ref is None:
            continue
        perdu = sum(ref.values()) - sum(releve[c["id"]].values())
        print(f"  [info] INACTIF {c['role']:14} perd {perdu} lignes "
              f"({sum(ref.values())} -> {sum(releve[c['id']].values())})")

# ---------------------------------------------------------------------
titre("RESULTAT")
if ECHECS:
    print(f"  {len(ECHECS)} CONTROLE(S) EN ECHEC :")
    for e in ECHECS:
        print(f"    - {e}")
    print("\n  Ne pas passer en production.")
    raise SystemExit(1)
print("  Tous les controles passent.")
print("\n(aucune ecriture : chaque transaction a ete annulee)")
