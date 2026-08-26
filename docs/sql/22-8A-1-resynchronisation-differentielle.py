#!/usr/bin/env python3
"""Resynchronisation DIFFERENTIELLE du schema `agenda` depuis Bolt.

    python3 docs/sql/22-8A-1-resynchronisation-differentielle.py        # simulation
    python3 docs/sql/22-8A-1-resynchronisation-differentielle.py --go   # execute

A lancer DEPUIS LA RACINE du depot.

REMPLACE 22-7F-resynchronisation-agenda.py, QUI NE DOIT PLUS ETRE LANCE.

POURQUOI 7F N'EST PLUS UTILISABLE
7F purge puis recopie 13 tables. Son argument etait : « recopier tout est
plus sur que calculer un differentiel ». C'etait vrai le 31/07/2026,
quand la copie Orga n'etait qu'une copie. Ca ne l'est plus depuis le
lendemain : a partir de 6A, la copie a diverge VOLONTAIREMENT.

Mesure du 26/08/2026 :
    gardes communes aux deux bases      2681
    seulement dans Bolt (a rapatrier)      2
    seulement dans Orga (a preserver)    126
        . 45 de septembre a novembre 2026, ouvertes par ouvrir_semaines (MOD-1)
        . 81 de janvier 2027, en suppression douce

7F detruirait donc 126 gardes pour en rapatrier 2. L'argument s'est
inverse : c'est desormais la recopie qui est risquee.

7F planterait de toute facon : sa purge commence par
`delete from agenda.undo_buffer`, table supprimee en MOD2-E.

CE QUE FAIT CE SCRIPT
Il ne touche qu'a `shifts` et `requests` -- les deux seules tables dont
Bolt possede encore quelque chose que Orga n'a pas.

    ligne des deux cotes  -> mise a jour des champs que Bolt possede
    seulement dans Bolt   -> insertion
    seulement dans Orga   -> INTACTE, et signalee

IL NE SUPPRIME JAMAIS RIEN. Une ligne absente de Bolt peut etre du
travail fait dans Orga pendant la beta ; rien ne permet de la distinguer
d'une suppression faite dans Bolt. Le script les compte et les affiche,
la decision reste humaine.

CE QU'IL NE TOUCHE PAS, ET POURQUOI
    sites, rooms, shift_types   Orga fait autorite depuis 6A (renommages,
                                4 creneaux de Beaune crees). Verifie : les
                                15 creneaux, 2 sites et 12 salles de Bolt
                                existent tous cote Orga avec le MEME id --
                                l'import des gardes se resout donc sans
                                remappage.
    rotation_settings,          Remplacees par les plans de MOD-1. La
    rotation_assignment_rules   comparaison qu'exige 6C-4 se fait
                                directement contre Bolt (script 23-6).
    deleted_at                  Colonne propre a Orga (MOD2-B). Jamais
                                ecrasee, jamais effacee.

Usage identique a 7F : simulation par defaut, --go pour executer.
"""
import base64
import csv
import json
import pathlib
import subprocess
import sys
import urllib.request

PLANNING = "kldgvjxuojeeqhdrmaia"
ORGA = "ydihrgnixthrraprclox"
GO = "--go" in sys.argv
RACINE = pathlib.Path(__file__).resolve().parents[1]
MAPPING = RACINE / "mapping-comptes-agenda.csv"

# Colonnes referencant un profil, a remapper d'une base a l'autre.
REFS = {"shifts": ["assigned_doctor_id", "created_by"],
        "requests": ["doctor_id", "reviewed_by"]}

# Champs que Bolt possede. Sur une ligne presente des deux cotes, ce sont
# les seuls a etre recopies -- deleted_at et id n'en font pas partie.
CHAMPS = {
    "shifts": ["date", "location", "room", "shift_type", "status",
               "assigned_doctor_id", "site_id", "room_id", "shift_type_id",
               "series_id", "series_instance_date", "coordinator_note",
               "created_by", "created_at", "updated_at"],
    "requests": ["shift_id", "doctor_id", "status", "requested_at",
                 "reviewed_at", "reviewed_by", "rejection_note"],
}

# Champs sur lesquels on decide qu'une ligne a CHANGE. On exclut les
# horodatages : les recopier suffit, mais les comparer ferait remonter des
# milliers de faux changements sur une difference de format, et chaque
# ecriture inutile produirait une entree de journal (MOD2-A).
COMPARES = {
    "shifts": ["date", "location", "room", "shift_type", "status",
               "assigned_doctor_id", "site_id", "room_id", "shift_type_id",
               "series_id", "series_instance_date", "coordinator_note"],
    "requests": ["shift_id", "doctor_id", "status", "reviewed_by",
                 "rejection_note"],
}

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
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or "null"), None
    except urllib.error.HTTPError as e:
        return None, e.read().decode()[:400]


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def stop(msg):
    sys.exit(f"\nARRET : {msg}")


print("=== RESYNCHRONISATION DIFFERENTIELLE agenda ===")
print("mode :", "EXECUTION REELLE" if GO else "simulation (ajouter --go pour executer)")

# ------------------------------------------------ 1. controles prealables
# Repris de 7F : un historique Planning incoherent ne doit pas etre importe.
ctrl, err = sql(PLANNING, """
select 'doublons medecin/jour' k, count(*) n from (
  select assigned_doctor_id, date from shifts
   where assigned_doctor_id is not null and status='assigned'
   group by 1,2 having count(*)>1) a
union all select 'doublons demande active', count(*) from (
  select shift_id, doctor_id from requests
   where status in ('pending','on_hold','approved') group by 1,2 having count(*)>1) b
union all select 'demandes orphelines', count(*) from requests r
  where not exists (select 1 from shifts s where s.id=r.shift_id);
""")
if err:
    stop(f"controles impossibles : {err}")
print()
for c in ctrl:
    print(f"  {c['n']:>5}  {c['k']}")
if any(c["n"] for c in ctrl):
    stop("l'historique Planning contient des incoherences (voir ci-dessus)")

# ------------------------------------------------ 2. mapping des profils
lignes_csv = list(csv.DictReader(open(MAPPING, encoding="utf-8")))
mapping = {r["old_profile_id"]: r["new_profile_id"]
           for r in lignes_csv if r["new_profile_id"]}
ecartes = {r["old_profile_id"] for r in lignes_csv if r["statut"] == "ECARTE_TEST"}

profils, err = sql(PLANNING, "select id, full_name from profiles;")
if err:
    stop(f"lecture des profils impossible : {err}")
inconnus = [p for p in profils if p["id"] not in mapping and p["id"] not in ecartes]
if inconnus:
    print("\n  Profils presents dans Planning mais absents du mapping :")
    for p in inconnus:
        print(f"    - {p['full_name']}")
    stop("creer ces comptes dans Omnes-Orga et completer "
         "docs/mapping-comptes-agenda.csv avant de resynchroniser")
print(f"\n  {len(mapping)} profils mappes, {len(ecartes)} ecartes, 0 inconnu")

# ------------------------------------------------ 3. lecture des deux cotes
bolt = {}
for t in ("shifts", "requests"):
    d, err = sql(PLANNING, f"select * from {t} order by id;")
    if err:
        stop(f"lecture de {t} dans Planning : {err}")
    bolt[t] = d or []

# Comptes de test : leurs gardes et demandes n'ont jamais ete importees.
shifts_ecartes = {s["id"] for s in bolt["shifts"]
                  if s.get("assigned_doctor_id") in ecartes}
bolt["shifts"] = [s for s in bolt["shifts"] if s["id"] not in shifts_ecartes]
bolt["requests"] = [r for r in bolt["requests"]
                    if r.get("doctor_id") not in ecartes
                    and r["shift_id"] not in shifts_ecartes]

for t, cols in REFS.items():
    for row in bolt[t]:
        for c in cols:
            if row.get(c):
                row[c] = mapping.get(row[c])

orga = {}
for t in ("shifts", "requests"):
    sel = ", ".join(["id"] + CHAMPS[t] + (["deleted_at"] if t == "shifts" else []))
    d, err = sql(ORGA, f"select {sel} from agenda.{t};")
    if err:
        stop(f"lecture de {t} dans Orga : {err}")
    orga[t] = {r["id"]: r for r in (d or [])}

# ------------------------------------------------ 4. garde-fou des cles etrangeres
# Une garde de Bolt referencant un site, une salle, un creneau ou une serie
# que Orga ne connait pas ferait echouer l'insertion -- ou pire, passerait
# si la colonne est nullable. Verifie AVANT d'ecrire quoi que ce soit.
connus = {}
for table, colonne in (("sites", "site_id"), ("rooms", "room_id"),
                       ("shift_types", "shift_type_id"),
                       ("fixed_duty_series", "series_id")):
    d, err = sql(ORGA, f"select id from agenda.{table};")
    if err:
        stop(f"lecture de {table} : {err}")
    connus[colonne] = {r["id"] for r in (d or [])}

manquants = []
for s in bolt["shifts"]:
    if s["id"] in orga["shifts"]:
        continue                      # deja la : ses cles ont deja ete resolues
    for colonne, ids in connus.items():
        if s.get(colonne) and s[colonne] not in ids:
            manquants.append((colonne, s[colonne], s["date"]))
if manquants:
    print("\n  References creees dans Bolt et inconnues cote Orga :")
    for colonne, val, jour in manquants[:10]:
        print(f"    - {colonne} = {val}  (garde du {jour})")
    stop(f"{len(manquants)} reference(s) manquante(s). Les creer cote Orga "
         "avant de resynchroniser -- ce script ne cree ni site, ni salle, "
         "ni creneau, ni serie.")
print("  cles etrangeres : toutes resolues cote Orga")

# ------------------------------------------------ 5. le differentiel
plan = {}
for t in ("shifts", "requests"):
    a_inserer, a_modifier, conflits = [], [], []
    for ligne in bolt[t]:
        actuel = orga[t].get(ligne["id"])
        if actuel is None:
            a_inserer.append(ligne)
            continue
        # Une garde close cote Orga (suppression douce) n'est jamais
        # reveillee automatiquement -- ce serait defaire une decision.
        # Mais si Bolt la dit pourvue, c'est un CONFLIT REEL qu'il faut
        # nommer : la copie Orga peut avoir plusieurs semaines de retard,
        # et une garde close comme « non pourvue » peut avoir ete
        # attribuee dans Bolt entre-temps. Le cas s'est produit le
        # 26/08/2026 (garde du 11/08, Dijon) -- decompte muet a l'epoque,
        # d'ou cet affichage.
        if t == "shifts" and actuel.get("deleted_at"):
            if any(str(ligne.get(c)) != str(actuel.get(c)) for c in COMPARES[t]):
                conflits.append((ligne, actuel))
            continue
        if any(str(ligne.get(c)) != str(actuel.get(c)) for c in COMPARES[t]):
            a_modifier.append(ligne)
    seulement_orga = set(orga[t]) - {l["id"] for l in bolt[t]}
    plan[t] = (a_inserer, a_modifier, conflits, seulement_orga)

print(f"\n  {'table':<12} {'a inserer':>10} {'a modifier':>11} "
      f"{'conflits':>10} {'seulement Orga':>15}")
for t in ("shifts", "requests"):
    ins, mod, conf, solo = plan[t]
    print(f"  {t:<12} {len(ins):>10} {len(mod):>11} {len(conf):>10} {len(solo):>15}")

# Les conflits sont detailles : ce sont les seules lignes que le script
# laisse volontairement fausses, il ne peut pas les passer sous silence.
conflits_shifts = plan["shifts"][2]
if conflits_shifts:
    print(f"\n  ⚠ {len(conflits_shifts)} garde(s) close(s) cote Orga que Bolt "
          "voit autrement :")
    for ligne, actuel in conflits_shifts:
        print(f"    {actuel['date']} {actuel['location']:8} {actuel['shift_type']}")
        print(f"       Orga : {actuel['status']:9} (close le {str(actuel['deleted_at'])[:10]})")
        print(f"       Bolt : {ligne['status']:9} medecin={ligne.get('assigned_doctor_id')}")
    print("    -> NON traitees par ce script. A trancher a la main : soit la")
    print("       cloture etait juste, soit il faut rouvrir la garde.")

for t in ("shifts", "requests"):
    solo = plan[t][3]
    if solo:
        print(f"\n  {len(solo)} {t} n'existent que cote Orga : INTACTES.")
        print("    (travail fait dans Orga, ou lignes supprimees dans Bolt --")
        print("     rien ne permet de les distinguer, ce script ne supprime pas)")

if not GO:
    print("\n[simulation] rien n'a ete ecrit. Ajouter --go pour executer.")
    sys.exit(0)

# ------------------------------------------------ 6. ecriture
# Le declencheur metier est neutralise : les ecritures dans requests le
# reveilleraient et il recalculerait le statut des gardes qu'on vient de
# poser. Meme precaution qu'en 7D et 7F.
print("\nEcriture...")
_, err = sql(ORGA, "alter table agenda.requests disable trigger trigger_update_shift_status;")
if err:
    stop(f"desactivation du trigger : {err}")

try:
    for t in ("shifts", "requests"):
        a_inserer, a_modifier, _, _ = plan[t]

        for depart in range(0, len(a_inserer), 200):
            lot = a_inserer[depart:depart + 200]
            cols = ["id"] + CHAMPS[t]
            collist = ", ".join(f'"{c}"' for c in cols)
            vals = ",\n".join("(" + ", ".join(lit(r.get(c)) for c in cols) + ")"
                              for r in lot)
            _, err = sql(ORGA, f"insert into agenda.{t} ({collist}) values\n{vals};")
            if err:
                stop(f"insertion dans {t} (lot {depart}) : {err}")

        for depart in range(0, len(a_modifier), 200):
            lot = a_modifier[depart:depart + 200]
            cols = ["id"] + CHAMPS[t]
            collist = ", ".join(f'"{c}"' for c in cols)
            vals = ",\n".join("(" + ", ".join(lit(r.get(c)) for c in cols) + ")"
                              for r in lot)
            maj = ", ".join(f'"{c}" = v."{c}"' for c in CHAMPS[t])
            # update ... from (values ...) : un seul aller-retour par lot.
            # Le cast explicite evite que Postgres devine « text » sur les
            # colonnes uuid et date.
            _, err = sql(ORGA, f"""
                update agenda.{t} cible
                   set {maj}
                  from (values\n{vals}\n) as v({collist})
                 where cible.id = v."id"::uuid;""")
            if err:
                stop(f"mise a jour de {t} (lot {depart}) : {err}")

        print(f"  {t:<12} {len(a_inserer):>4} inserees, {len(a_modifier):>4} modifiees")
finally:
    _, err = sql(ORGA, "alter table agenda.requests enable trigger trigger_update_shift_status;")
    print("\ntrigger metier reactive" if not err
          else f"\nATTENTION trigger non reactive : {err}")

# ------------------------------------------------ 7. verification
apres, err = sql(ORGA, """
    select 'shifts' t, count(*) n, count(*) filter (where deleted_at is not null) closes
      from agenda.shifts
    union all select 'requests', count(*), 0 from agenda.requests;""")
if err:
    stop(f"verification : {err}")
print()
for r in apres:
    print(f"  agenda.{r['t']:<10} {r['n']:>5} lignes"
          + (f", dont {r['closes']} closes" if r["closes"] else ""))
print("\nTermine.")
