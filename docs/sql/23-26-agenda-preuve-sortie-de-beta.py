#!/usr/bin/env python3
"""Preuve de la sortie de beta du Planning : qui accede, et a quoi (23-25).

    OMNES_CIBLE=test python3 docs/sql/23-26-agenda-preuve-sortie-de-beta.py
    OMNES_CIBLE=test python3 docs/sql/23-26-agenda-preuve-sortie-de-beta.py --enregistrer avant
    OMNES_CIBLE=test python3 docs/sql/23-26-agenda-preuve-sortie-de-beta.py --comparer avant
    python3 docs/sql/23-26-agenda-preuve-sortie-de-beta.py --comparer prod-avant   # PRODUCTION

N'ECRIT JAMAIS EN BASE, ni sur le test ni en production. Chaque mesure tourne
dans une transaction ANNULEE (`rollback`) ; le script n'a pas de `--go` et
n'en aura pas. Le seul fichier qu'il ecrit est l'enregistrement JSON, hors
du depot, dans ~/Documents/claude-projets/archives/orga-mesures/.

A QUOI CA SERT
23-25 remplace `agenda_beta_access` par une liste blanche de roles dans
`agenda.peut_acceder()` et `agenda.est_coordinateur()`. L'equivalence est
mesuree, mais une equivalence sur le papier ne prouve pas que les 51 policies
du schema se comportent pareil. Ce script mesure le COMPORTEMENT REEL, avant
et apres, et compare.

Ordre d'emploi, sur l'environnement de test d'abord :
    23-26 --enregistrer avant        (etat de depart)
    23-25 --go                       (la bascule)
    23-26 --comparer avant           (rien n'a bouge ?)
    23-25 --retour-arriere --go      (on defait)
    23-26 --comparer avant           (on est bien revenu ?)

LES DEUX VOLETS

  A. EXHAUSTIF -- les 41 fiches, une par une.
     Pour chaque profil, le script emprunte son identite le temps d'une
     transaction annulee et demande aux deux fonctions ce qu'elles repondent.
     C'est la reponse de ces deux fonctions qui gouverne les 51 policies.
     L'emprunt se fait par `set_config('request.jwt.claims', ..., true)` :
     c'est ce que lit `auth.uid()`. Les deux fonctions etant SECURITY
     DEFINER, elles ne dependent que de cet identifiant, pas du role SQL
     courant -- inutile donc de basculer en `authenticated` pour ce volet.

  B. TEMOINS -- ce qu'on voit vraiment, sous la RLS.
     Un representant de chaque couple (role, actif), sous `set local role
     authenticated`, et le compte des lignes visibles sur les 16 tables du
     schema. C'est la mesure qui attrape une policy qui se serait mise a
     repondre autrement.

CE QUI EST UN ECHEC, ET CE QUI N'EN EST PAS
Les controles DURS ne dependent pas du mouvement des donnees et doivent
passer a chaque fois :
    . le compte poste_bureau voit 0 ligne sur les 16 tables ;
    . tout compte inactif voit 0 ligne ;
    . aucun role medecin actif ne tombe a 0 garde ;
    . le nombre de fiches qui accedent au Planning est inchange.
Les ECARTS de comptage, eux, sont affiches sans etre comptes comme des
echecs : en production, des gardes et des demandes sont creees en continu,
et deux mesures prises a quelques minutes d'intervalle different
legitimement. C'est au lecteur de trancher -- d'ou l'affichage detaille.
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

PROJET_PROD = "ydihrgnixthrraprclox"          # OMNES ORGA
PROJET_TEST = "yjttfdwjbyufpavwxcpy"          # environnement de test (23-18)
MESURES = Path.home() / "Documents/claude-projets/archives/orga-mesures"

CIBLE = os.environ.get("OMNES_CIBLE", "prod").strip().lower()
if CIBLE not in ("prod", "test"):
    raise SystemExit("OMNES_CIBLE vaut 'prod' (defaut) ou 'test'.")
SUR_TEST = CIBLE == "test"
PROJET = PROJET_TEST if SUR_TEST else PROJET_PROD

ROLES_PLANNING = ("super_admin", "associe_gerant", "associe", "remplacant")


def option(nom):
    """--nom <valeur> ; retourne la valeur ou None."""
    if nom in sys.argv:
        i = sys.argv.index(nom)
        if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith("--"):
            return sys.argv[i + 1]
        raise SystemExit(f"{nom} attend une etiquette, par exemple : {nom} avant")
    return None


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


def comme(uid, requete):
    """Execute `requete` EN TANT QUE uid, puis annule tout.

    `set local` ne vaut que pour la transaction : le role et les claims
    disparaissent au rollback, qui annule aussi toute ecriture tentee.
    """
    claims = json.dumps({"sub": uid, "role": "authenticated"})
    lignes, err = _appel(f"begin;\n"
                         f"set local role authenticated;\n"
                         f"set local request.jwt.claims = '{claims}';\n"
                         f"{requete};\n"
                         f"rollback;\n")
    if err:
        stop(f"mesure sous l'identite {uid} refusee -- {err}")
    return lignes


def titre(texte):
    print("\n" + "=" * 74 + f"\n{texte}\n" + "=" * 74)


def dur(libelle, obtenu, attendu):
    """Controle DUR : independant du mouvement des donnees."""
    ok = obtenu == attendu
    if not ok:
        ECHECS.append(f"{libelle} : obtenu {obtenu}, attendu {attendu}")
    print(f"  [{'OK ' if ok else 'ECHEC'}] {libelle:<55} {obtenu}")
    return ok


# ---------------------------------------------------------------------
print(f"cible : {'ENVIRONNEMENT DE TEST' if SUR_TEST else 'PRODUCTION'} "
      f"-- projet {PROJET}")

temoin_test = lire("""select count(*) as n from pg_class c
                        join pg_namespace n on n.oid = c.relnamespace
                       where c.relname = '_environnement_de_test'
                         and n.nspname = 'public'""")[0]["n"]
if SUR_TEST and not temoin_test:
    stop(f"OMNES_CIBLE=test mais le projet {PROJET} n'a pas la table temoin "
         "`public._environnement_de_test` posee par 23-18.")
if not SUR_TEST and temoin_test:
    stop(f"le projet {PROJET} porte la table temoin de l'environnement de "
         "test alors que la cible est la PRODUCTION. Incoherence.")

# ---------------------------------------------------------------------
# DANS QUEL ETAT SONT LES DEUX FONCTIONS ?
# ---------------------------------------------------------------------
fonctions = {r["proname"]: r for r in lire("""
    -- On cherche la CONDITION, pas la mention : un commentaire qui cite le
    -- nom de la colonne ne doit pas faire croire qu'elle est encore lue.
    select p.proname, md5(p.prosrc) as empreinte,
           p.prosrc like '%and agenda_beta_access%' as lit_le_drapeau,
           p.prosrc like '%and role in (%'          as lit_le_role
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'agenda'
       and p.proname in ('peut_acceder', 'est_coordinateur')
""")}
titre("ETAT DES DEUX FONCTIONS")
for nom in ("peut_acceder", "est_coordinateur"):
    if nom not in fonctions:
        stop(f"agenda.{nom}() est introuvable sur {PROJET}.")
    f = fonctions[nom]
    selon = ("le DRAPEAU" if f["lit_le_drapeau"] else
             "le ROLE" if f["lit_le_role"] else "??")
    print(f"  agenda.{nom}() : decide selon {selon}"
          f"   (md5 {f['empreinte']})")

# ---------------------------------------------------------------------
# LA LISTE DES TABLES -- lue dans le catalogue, jamais recopiee de memoire
# ---------------------------------------------------------------------
tables = [r["tab"] for r in lire("""
    select c.relname as tab
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'agenda' and c.relkind = 'r' and c.relrowsecurity
     order by c.relname
""")]

# ---------------------------------------------------------------------
# VOLET A -- LES 41 FICHES, UNE PAR UNE
#
# Une seule transaction : on emprunte chaque identite a tour de role et on
# demande aux deux fonctions leur reponse. Tout est annule au rollback.
# ---------------------------------------------------------------------
lignes, err = _appel("""
begin;
create temp table _preuve (
  role text, actif boolean, drapeau boolean,
  acces boolean, coord boolean) on commit drop;
do $$
declare p record;
begin
  for p in select id, role::text as r, actif, agenda_beta_access as d
             from public.profiles loop
    perform set_config('request.jwt.claims',
              json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
    insert into _preuve values (p.r, p.actif, p.d,
                                agenda.peut_acceder(), agenda.est_coordinateur());
  end loop;
end $$;
select role, actif, drapeau, acces, coord, count(*) as fiches
  from _preuve group by 1,2,3,4,5 order by role, actif, drapeau;
rollback;
""")
if err:
    stop(f"volet A refuse -- {err}")

titre(f"VOLET A -- CE QUE LES DEUX FONCTIONS REPONDENT ({sum(l['fiches'] for l in lignes)} fiches)")
print(f"  {'role':<16} {'actif':<6} {'drapeau':<8} {'acces':<6} {'coord':<6} fiches")
for l in lignes:
    print(f"  {l['role']:<16} {str(l['actif']):<6} {str(l['drapeau']):<8} "
          f"{str(l['acces']):<6} {str(l['coord']):<6} {l['fiches']:>6}")

# ---------------------------------------------------------------------
# VOLET B -- LES TEMOINS, SOUS LA RLS REELLE
# ---------------------------------------------------------------------
choisis = lire("""
    select distinct on (p.role, p.actif)
           p.id, p.role::text as role, p.actif, p.prenom, p.nom,
           p.is_agenda_coordinator as coord
      from public.profiles p
     order by p.role, p.actif, p.nom
""")
compte_sql = ", ".join(f"(select count(*) from agenda.{t}) as {t}" for t in tables)

titre(f"VOLET B -- LIGNES VISIBLES SOUS LA RLS ({len(choisis)} temoins, "
      f"{len(tables)} tables)")
temoins = []
for t in choisis:
    vus = comme(t["id"], f"select {compte_sql}")[0]
    total = sum(vus.values())
    temoins.append({"role": t["role"], "actif": t["actif"],
                    "qui": f"{t['prenom']} {t['nom']}", "coord": t["coord"],
                    "total": total, "lignes": vus})
    etiquette = f"{t['role']}{'' if t['actif'] else ' (inactif)'}" \
                f"{' [coord]' if t['coord'] else ''}"
    detail = ", ".join(f"{k} {v}" for k, v in vus.items() if v)
    print(f"  {etiquette:<34} {total:>6} lignes")
    print(f"      {detail if detail else 'rien du tout'}")

# ---------------------------------------------------------------------
# VOLET C -- LA CONTRE-EPREUVE : QUI BLOQUE, LE DRAPEAU OU LE ROLE ?
#
# Les volets A et B montrent que rien ne change. Ce serait tout aussi vrai
# si le script n'avait rien fait : le poste de bureau est aujourd'hui arrete
# DEUX FOIS, par son drapeau a false ET par son role exclu. Pour savoir
# lequel des deux l'arrete, il faut les faire diverger.
#
# On force donc le drapeau, le temps d'une transaction ANNULEE, et on
# regarde qui l'emporte. Les deux reponses attendues sont OPPOSEES avant et
# apres 23-25 : c'est ce renversement qui prouve la bascule.
#
# L'UPDATE est fait en tant que `postgres`, AVANT de basculer en
# `authenticated` -- sinon la ligne temoin tomberait sous la RLS qu'on
# mesure. Le rollback annule l'UPDATE comme le reste.
# ---------------------------------------------------------------------
def contre_epreuve(uid, drapeau):
    """Force agenda_beta_access a `drapeau` pour `uid`, puis mesure. Annule."""
    claims = json.dumps({"sub": uid, "role": "authenticated"})
    lignes, err = _appel(
        f"begin;\n"
        f"update public.profiles set agenda_beta_access = {str(drapeau).lower()}\n"
        f" where id = '{uid}';\n"
        f"set local role authenticated;\n"
        f"set local request.jwt.claims = '{claims}';\n"
        f"select agenda.peut_acceder() as acces,\n"
        f"       (select count(*) from agenda.shifts) as gardes;\n"
        f"rollback;\n")
    if err:
        stop(f"contre-epreuve refusee -- {err}")
    return lignes[0]


selon_le_role = fonctions["peut_acceder"]["lit_le_role"]
titre("VOLET C -- CONTRE-EPREUVE (transactions annulees)")
print("  Les fonctions decident actuellement selon "
      + ("LE ROLE." if selon_le_role else "LE DRAPEAU."))

par_role = {t["role"]: t for t in choisis}
bureau = par_role.get("poste_bureau")
remplacant = next((t for t in choisis
                   if t["role"] == "remplacant" and t["actif"]), None)
if bureau is None or remplacant is None:
    stop("il manque un temoin poste_bureau ou remplacant actif.")

c1 = contre_epreuve(bureau["id"], True)
c2 = contre_epreuve(remplacant["id"], False)
print(f"\n  C1. poste de bureau A QUI ON DONNE le drapeau")
print(f"      acces = {c1['acces']}, gardes visibles = {c1['gardes']}")
print(f"  C2. remplacant actif A QUI ON RETIRE le drapeau")
print(f"      acces = {c2['acces']}, gardes visibles = {c2['gardes']}")

volet_c = {"bureau_avec_drapeau": c1, "remplacant_sans_drapeau": c2,
           "selon_le_role": selon_le_role}

# ---------------------------------------------------------------------
# LES CONTROLES DURS
# ---------------------------------------------------------------------
titre("CONTROLES DURS")

if selon_le_role:
    dur("C1 le drapeau n'ouvre PLUS le Planning au poste de bureau",
        bool(c1["acces"]), False)
    dur("C1 et il ne voit aucune garde", c1["gardes"], 0)
    dur("C2 retirer le drapeau ne ferme PLUS le Planning au remplacant",
        bool(c2["acces"]), True)
    dur("C2 et il voit toujours les gardes", c2["gardes"] > 0, True)
else:
    dur("C1 le drapeau ouvre encore le Planning au poste de bureau",
        bool(c1["acces"]), True)
    dur("C2 retirer le drapeau ferme encore le Planning au remplacant",
        bool(c2["acces"]), False)
    dur("C2 et il ne voit plus aucune garde", c2["gardes"], 0)

acces_oui = sum(l["fiches"] for l in lignes if l["acces"])
coord_oui = sum(l["fiches"] for l in lignes if l["coord"])

for l in lignes:
    attendu = bool(l["actif"]) and l["role"] in ROLES_PLANNING
    dur(f"role {l['role']}, actif={l['actif']} -> acces", bool(l["acces"]), attendu)

for t in temoins:
    if t["role"] == "poste_bureau":
        dur("le poste de bureau ne voit aucune ligne", t["total"], 0)
    elif not t["actif"]:
        dur(f"{t['role']} inactif ne voit aucune ligne", t["total"], 0)
    else:
        ok = t["lignes"].get("shifts", 0) > 0
        if not ok:
            ECHECS.append(f"{t['role']} actif ne voit plus aucune garde")
        print(f"  [{'OK ' if ok else 'ECHEC'}] "
              f"{t['role']+' actif voit des gardes':<55} "
              f"{t['lignes'].get('shifts', 0)}")

print(f"\n  fiches qui accedent au Planning : {acces_oui}")
print(f"  fiches coordinatrices           : {coord_oui}")

# ---------------------------------------------------------------------
# ENREGISTRER / COMPARER
# ---------------------------------------------------------------------
mesure = {
    "quand": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    "cible": CIBLE,
    "projet": PROJET,
    "fonctions": {n: {"empreinte": f["empreinte"],
                      "lit_le_drapeau": f["lit_le_drapeau"],
                      "lit_le_role": f["lit_le_role"]}
                  for n, f in fonctions.items()},
    "acces_oui": acces_oui,
    "coord_oui": coord_oui,
    "volet_a": lignes,
    "temoins": temoins,
    "volet_c": volet_c,
}

if ENREGISTRER:
    MESURES.mkdir(parents=True, exist_ok=True)
    chemin = MESURES / f"23-26-{CIBLE}-{ENREGISTRER}.json"
    chemin.write_text(json.dumps(mesure, indent=1, ensure_ascii=False))
    titre("ENREGISTRE")
    print(f"  {chemin}")
    print(f"  Comparer plus tard : --comparer {ENREGISTRER}")

if COMPARER:
    chemin = MESURES / f"23-26-{CIBLE}-{COMPARER}.json"
    if not chemin.exists():
        stop(f"aucun enregistrement '{COMPARER}' pour la cible {CIBLE} :\n"
             f"  {chemin}\nEn prendre un d'abord : --enregistrer {COMPARER}")
    avant = json.loads(chemin.read_text())
    titre(f"COMPARAISON AVEC « {COMPARER} » ({avant['quand']})")

    for n in ("peut_acceder", "est_coordinateur"):
        a, b = avant["fonctions"][n], mesure["fonctions"][n]
        if a["empreinte"] == b["empreinte"]:
            print(f"  agenda.{n}() : inchangee")
        else:
            print(f"  agenda.{n}() : REMPLACEE -- decidait selon "
                  f"{'le drapeau' if a['lit_le_drapeau'] else 'le role'}, "
                  f"decide selon "
                  f"{'le drapeau' if b['lit_le_drapeau'] else 'le role'}")

    dur("nombre de fiches qui accedent au Planning",
        mesure["acces_oui"], avant["acces_oui"])
    dur("nombre de fiches coordinatrices",
        mesure["coord_oui"], avant["coord_oui"])

    # Volet A : la reponse des fonctions, groupe par groupe.
    def cle_a(l):
        return (l["role"], l["actif"])
    avant_a = {}
    for l in avant["volet_a"]:
        avant_a.setdefault(cle_a(l), {"acces": 0, "fiches": 0})
        avant_a[cle_a(l)]["fiches"] += l["fiches"]
        if l["acces"]:
            avant_a[cle_a(l)]["acces"] += l["fiches"]
    apres_a = {}
    for l in lignes:
        apres_a.setdefault(cle_a(l), {"acces": 0, "fiches": 0})
        apres_a[cle_a(l)]["fiches"] += l["fiches"]
        if l["acces"]:
            apres_a[cle_a(l)]["acces"] += l["fiches"]
    print()
    for cle in sorted(set(avant_a) | set(apres_a)):
        a = avant_a.get(cle, {"acces": 0, "fiches": 0})
        b = apres_a.get(cle, {"acces": 0, "fiches": 0})
        dur(f"acces : {cle[0]}, actif={cle[1]}", b["acces"], a["acces"])

    # Volet B : les comptages. Ecarts signales, pas comptes comme echecs --
    # en production les donnees bougent d'une minute a l'autre.
    avant_t = {(t["role"], t["actif"]): t for t in avant["temoins"]}
    ecarts = []
    print()
    for t in temoins:
        a = avant_t.get((t["role"], t["actif"]))
        if a is None:
            print(f"  temoin nouveau : {t['role']} actif={t['actif']}")
            continue
        if a["qui"] != t["qui"]:
            print(f"  ATTENTION : le temoin {t['role']} a change "
                  f"({a['qui']} -> {t['qui']}), comptages non comparables.")
            continue
        for tab in tables:
            va, vb = a["lignes"].get(tab, 0), t["lignes"].get(tab, 0)
            if va != vb:
                ecarts.append((t["role"], t["actif"], tab, va, vb))
        etat = "identique" if a["total"] == t["total"] else \
               f"{a['total']} -> {t['total']}"
        print(f"  {t['role']:<16} actif={str(t['actif']):<6} {etat}")

    if ecarts:
        print(f"\n  {len(ecarts)} ecart(s) de comptage :")
        for role, actif, tab, va, vb in ecarts:
            sens = "PERD" if vb < va else "gagne"
            print(f"    {role} (actif={actif}) {tab} : {va} -> {vb}  [{sens}]")
        print("\n  Un ecart n'est pas forcement une regression : en production")
        print("  des gardes et des demandes sont creees en continu. Ce qui")
        print("  doit alerter, c'est un passage a zero, ou un role qui gagne")
        print("  l'acces a une table qu'il ne voyait pas.")
    else:
        print("\n  aucun ecart de comptage : les temoins voient exactement "
              "les memes lignes.")

# ---------------------------------------------------------------------
titre("RESULTAT")
if ECHECS:
    print(f"  {len(ECHECS)} CONTROLE(S) DUR(S) EN ECHEC :")
    for e in ECHECS:
        print(f"    . {e}")
    raise SystemExit(1)
print("  Tous les controles durs passent.")
print("\n(termine -- aucune ecriture en base)")
