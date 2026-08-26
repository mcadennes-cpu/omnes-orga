#!/usr/bin/env python3
"""Compare le roulement vivant dans Bolt au plan V1 fige cote Orga.

    python3 docs/sql/23-6-comparer-roulement-bolt-plan-v1.py

A lancer DEPUIS LA RACINE du depot.

POURQUOI CE SCRIPT
Le plan « Roulement V1 » a ete fige le 01/08/2026 (sous-etape 6B-2).
Charlotte a continue de travailler dans Bolt depuis, et Bolt a toujours
son « appliquer a la semaine de roulement », qui ecrit dans
rotation_assignment_rules. Toute modification du roulement faite la-bas
depuis le 01/08 n'est donc PAS dans le plan.

C'est l'arbitrage qu'exige 6C-4 avant de supprimer l'ancienne table : ne
pas la jeter sans avoir regarde ce qu'elle contient de neuf.

LECTURE SEULE, SUR LES DEUX BASES. N'ecrit rien nulle part, ne
resynchronise rien. Peut etre lance a tout moment.

DEUX PIEGES, TRAITES ICI
  1. Les identifiants ne se correspondent pas d'une base a l'autre. Les
     medecins sont donc rapproches par docs/mapping-comptes-agenda.csv,
     qui fait autorite -- jamais par leur nom, qui varie de forme.
  2. Les creneaux ont ete RENOMMES cote Orga par 6A-1 (« Pre J2 Dijon »
     -> « J6 Dijon », espaces parasites en fin de nom). Comparer sur les
     noms bruts produirait un ecart sur chaque ligne. On normalise.

La cle de comparaison est (medecin, site, creneau, jour, semaine). Le
room_id de l'ancienne table est volontairement ignore : MOD-1 a retire la
salle de la cle du roulement -- une case est un site + un creneau + un
jour + une semaine de cycle.
"""
import base64
import csv
import json
import pathlib
import subprocess
import unicodedata
import urllib.request

PLANNING = "kldgvjxuojeeqhdrmaia"
ORGA = "ydihrgnixthrraprclox"
RACINE = pathlib.Path(__file__).resolve().parents[1]

if not (RACINE / "sql").is_dir():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

_raw = subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]).decode().strip()
_TOK = base64.b64decode(_raw.removeprefix("go-keyring-base64:")).decode().strip()


def sql(ref, requete):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": requete}).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {_TOK}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "curl/8.4.0")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or "null")


def normaliser_creneau(nom):
    """Ramene un nom de creneau Bolt a son equivalent Orga (renommages 6A-1)."""
    n = " ".join((nom or "").split())          # espaces parasites (releves en 7A)
    equivalences = {
        "Pré J2 Dijon": "J6 Dijon",            # meme horaire, meme usage
        "WE 2 Dijon": "WE2 Dijon",
    }
    return equivalences.get(n, n)


def cle(sans_accent=lambda s: unicodedata.normalize("NFKD", s or "")
        .encode("ascii", "ignore").decode()):
    return sans_accent


JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]

# --- Correspondance des comptes ---------------------------------------
mapping = {}
noms = {}
with open(RACINE / "mapping-comptes-agenda.csv", encoding="utf-8") as f:
    for ligne in csv.DictReader(f):
        if ligne["old_profile_id"] and ligne["new_profile_id"]:
            mapping[ligne["old_profile_id"]] = ligne["new_profile_id"]
            noms[ligne["new_profile_id"]] = ligne["full_name"]

# --- Le roulement vivant dans Bolt ------------------------------------
bolt = {}
non_mappes = set()
for r in sql(PLANNING, """
        select r.doctor_id, s.name as site, t.name as creneau,
               r.weekday, r.rotation_week, r.updated_at
          from rotation_assignment_rules r
          join sites s on s.id = r.site_id
          join shift_types t on t.id = r.shift_type_id"""):
    medecin = mapping.get(r["doctor_id"])
    if medecin is None:
        non_mappes.add(r["doctor_id"])
        continue
    bolt[(medecin, r["site"], normaliser_creneau(r["creneau"]),
          r["weekday"], r["rotation_week"])] = r["updated_at"]

# --- Le plan V1 fige cote Orga ----------------------------------------
plan = set()
for r in sql(ORGA, """
        select r.doctor_id, s.name as site, t.name as creneau,
               r.weekday, r.rotation_week
          from agenda.rotation_plan_rules r
          join agenda.rotation_plans p on p.id = r.plan_id
          join agenda.sites s on s.id = r.site_id
          join agenda.shift_types t on t.id = r.shift_type_id
         where p.name like 'Roulement V1%'"""):
    plan.add((r["doctor_id"], r["site"], r["creneau"],
              r["weekday"], r["rotation_week"]))

# --- Comparaison -------------------------------------------------------
#
# UNE EXCLUSION CONNUE, A NE PAS PRESENTER COMME UN ECART.
# 22-6B-2 a volontairement ecarte 14 regles en construisant le plan V1 :
# les « J3 Dijon » du samedi et du dimanche, creees les 11-15/12/2025.
# C'etait l'ancienne facon d'enregistrer la garde de week-end a Dijon,
# avant la creation du creneau « WE1 Dijon » en septembre 2026. Le plan
# les remplace par 7 samedis + 7 dimanches en WE1 Dijon -- les memes
# cases. Les compter comme des ecarts ferait croire a 14 arbitrages a
# rendre, alors qu'ils l'ont deja ete le 01/08/2026.
def exclusion_connue(c):
    _, site, creneau, jour, _ = c
    return site == "Dijon" and creneau == "J3 Dijon" and jour in (0, 6)


brut = set(bolt) - plan
connues = sorted(filter(exclusion_connue, brut), key=lambda c: (c[4], c[3], c[1], c[2]))
en_trop = sorted(set(brut) - set(connues), key=lambda c: (c[4], c[3], c[1], c[2]))
manquantes = sorted(plan - set(bolt), key=lambda c: (c[4], c[3], c[1], c[2]))


def dire(c):
    medecin, site, creneau, jour, semaine = c
    return (f"S{semaine} {JOURS[jour]:10} {site:8} {creneau:20} "
            f"{noms.get(medecin, medecin)}")


print("=" * 66)
print("  Roulement Bolt (vivant)  vs  plan V1 (fige le 01/08/2026)")
print("=" * 66)
print(f"  regles dans Bolt      : {len(bolt)}")
print(f"  regles dans le plan V1: {len(plan)}")
if non_mappes:
    print(f"  ⚠ {len(non_mappes)} regle(s) sur un profil absent du mapping, ignorees")

if connues:
    print(f"\n--- Ecartees volontairement par 6B-2 : {len(connues)} (attendu 14) ---")
    print("  « J3 Dijon » du week-end, remplacees par WE1 Dijon dans le plan.")
    print("  Arbitrage deja rendu le 01/08/2026 -- rien a decider ici.")

print(f"\n--- VRAIS ecarts, dans Bolt et pas dans le plan V1 : {len(en_trop)} ---")
if not en_trop:
    print("  aucun -- rien n'a ete ajoute au roulement depuis le 01/08/2026")
for c in en_trop:
    print(f"  + {dire(c)}   (modifiee le {str(bolt[c])[:10]})")

print(f"\n--- Dans le plan V1 et PAS dans Bolt : {len(manquantes)} ---")
if not manquantes:
    print("  aucune -- rien n'a ete retire du roulement depuis le 01/08")
for c in manquantes:
    print(f"  - {dire(c)}")

print()
if not en_trop and not manquantes:
    print("  IDENTIQUES. 6C-4 peut se faire sans arbitrage : l'ancienne table")
    print("  n'apporte rien que le plan V1 n'ait deja.")
else:
    print("  ECARTS A ARBITRER avant 6C-4 : reporter ces changements dans le")
    print("  plan, ou les considerer comme caducs (le V2 prend le relais au")
    print("  04/01/2027).")
print("=" * 66)
