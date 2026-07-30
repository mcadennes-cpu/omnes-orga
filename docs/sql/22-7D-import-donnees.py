#!/usr/bin/env python3
"""7D : importe les donnees Planning -> schema agenda de la base Orga.

- remappe toutes les references de profils via mapping.csv
- Coordinateur Admin -> Charlotte Franzino (compte de travail partage)
- ecarte les 3 comptes de test et leurs traces
- desactive le trigger metier pendant l'import de requests, sinon il
  reecrirait le statut des gardes qu'on vient d'importer

Usage: import-7d.py [--dry-run]
"""
import base64, csv, json, subprocess, sys, urllib.request

PLANNING = "kldgvjxuojeeqhdrmaia"
ORGA = "ydihrgnixthrraprclox"
DRY = "--dry-run" in sys.argv

# table -> colonnes referencant un profil
REFS = {
    "shifts": ["assigned_doctor_id", "created_by"],
    "requests": ["doctor_id", "reviewed_by"],
    "rotation_assignment_rules": ["doctor_id", "created_by"],
    "rotation_settings": ["updated_by"],
    "week_templates": ["created_by"],
    "opening_week_templates": ["created_by"],
    "fixed_duty_series": ["created_by"],
    "fixed_duty_patterns": ["default_doctor_id"],
}

# ordre de dependance
ORDRE = ["sites", "shift_types", "rooms", "fixed_duty_series", "fixed_duty_patterns",
         "shifts", "requests", "rotation_settings", "rotation_assignment_rules",
         "week_templates", "week_template_items", "opening_week_templates",
         "opening_week_template_items"]


def token():
    raw = subprocess.check_output(
        ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]).decode().strip()
    return base64.b64decode(raw.removeprefix("go-keyring-base64:")).decode().strip()


TOK = token()


def sql(ref, query):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": query}).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {TOK}")
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


# ---------------------------------------------------------------- mapping
rows = list(csv.DictReader(open("mapping.csv")))
charlotte, = [r for r in sql(ORGA,
    "select id from public.profiles where upper(nom)='FRANZINO';")[0]]
CHARLOTTE = charlotte["id"]

mapping, ecartes = {}, set()
for r in rows:
    if r["full_name"] == "Coordinateur Admin":
        mapping[r["old_profile_id"]] = CHARLOTTE       # compte de travail de Charlotte
    elif r["statut"] == "ECARTE_TEST":
        ecartes.add(r["old_profile_id"])
    elif r["new_profile_id"]:
        mapping[r["old_profile_id"]] = r["new_profile_id"]

print(f"{len(mapping)} profils remappes, {len(ecartes)} comptes ecartes\n")

# ---------------------------------------------------------------- lecture
donnees, exclus = {}, {"shifts": 0, "requests": 0}
for t in ORDRE:
    d, err = sql(PLANNING, f"select * from {t} order by 1;")
    if err:
        sys.exit(f"lecture {t}: {err}")
    donnees[t] = d or []

# gardes assignees a un compte ecarte -> non importees
shifts_ecartes = {s["id"] for s in donnees["shifts"]
                  if s.get("assigned_doctor_id") in ecartes}
donnees["shifts"] = [s for s in donnees["shifts"] if s["id"] not in shifts_ecartes]
exclus["shifts"] = len(shifts_ecartes)

# demandes d'un compte ecarte, ou portant sur une garde ecartee
avant = len(donnees["requests"])
donnees["requests"] = [r for r in donnees["requests"]
                       if r.get("doctor_id") not in ecartes
                       and r["shift_id"] not in shifts_ecartes]
exclus["requests"] = avant - len(donnees["requests"])

# remappage
for t, cols in REFS.items():
    for row in donnees.get(t, []):
        for c in cols:
            if row.get(c):
                row[c] = mapping.get(row[c], None)

for t in ORDRE:
    print(f"  {t:<32} {len(donnees[t]):>5} lignes"
          + (f"   ({exclus[t]} ecartee(s))" if exclus.get(t) else ""))

if DRY:
    print("\n[dry-run] rien n'a ete ecrit")
    sys.exit(0)

# ---------------------------------------------------------------- import
print("\nImport...")
_, err = sql(ORGA, "alter table agenda.requests disable trigger trigger_update_shift_status;")
if err:
    sys.exit(f"desactivation du trigger: {err}")

try:
    for t in ORDRE:
        lignes = donnees[t]
        if not lignes:
            print(f"  {t:<32} vide")
            continue
        cols = list(lignes[0].keys())
        collist = ", ".join(f'"{c}"' for c in cols)
        total = 0
        for i in range(0, len(lignes), 300):
            lot = lignes[i:i + 300]
            vals = ",\n".join("(" + ", ".join(lit(r[c]) for c in cols) + ")" for r in lot)
            _, err = sql(ORGA, f"insert into agenda.{t} ({collist}) values\n{vals};")
            if err:
                sys.exit(f"\nERREUR sur {t} (lot {i}): {err}")
            total += len(lot)
        print(f"  {t:<32} {total:>5} inserees")
finally:
    _, err = sql(ORGA, "alter table agenda.requests enable trigger trigger_update_shift_status;")
    print("\ntrigger metier reactive" if not err else f"\nATTENTION trigger non reactive: {err}")
