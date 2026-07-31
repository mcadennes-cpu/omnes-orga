#!/usr/bin/env python3
"""Resynchronise le schema `agenda` de la base Omnes-Orga depuis la base
Planning (appli Bolt).

C'est le script de l'etape 7F. Il remplace celui de 7D : meme import, plus
une purge prealable et des garde-fous.

POURQUOI UNE RECOPIE COMPLETE ET NON UN DELTA
    Le volume est faible (~5 700 lignes, environ une minute). Recopier tout
    est plus sur que calculer un differentiel : aucune suppression ne peut
    etre oubliee, aucune logique de comparaison a maintenir, et le script
    est idempotent -- on peut le rejouer autant de fois qu'on veut.

DEUX USAGES
    1. Rafraichir la copie de travail quand on veut des donnees recentes.
    2. Le soir de la bascule (etape 8), une derniere fois, apres que
       Charlotte a cesse de travailler dans Bolt.

APRES LA BASCULE, NE PLUS JAMAIS L'EXECUTER : la base Orga devient la
reference et Planning n'est plus a jour. Le rejouer ecraserait le travail
fait dans la nouvelle application.

Usage:
    python3 22-7F-resynchronisation-agenda.py          # simulation (defaut)
    python3 22-7F-resynchronisation-agenda.py --go     # execute pour de vrai
"""
import base64, csv, json, pathlib, subprocess, sys, urllib.request

PLANNING = "kldgvjxuojeeqhdrmaia"
ORGA = "ydihrgnixthrraprclox"
GO = "--go" in sys.argv

MAPPING = pathlib.Path(__file__).resolve().parents[1] / "mapping-comptes-agenda.csv"

# colonnes referencant un profil, a remapper
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

# ordre de dependance (l'inverse sert a la purge)
ORDRE = ["sites", "shift_types", "rooms", "fixed_duty_series", "fixed_duty_patterns",
         "shifts", "requests", "rotation_settings", "rotation_assignment_rules",
         "week_templates", "week_template_items", "opening_week_templates",
         "opening_week_template_items"]


def sql(ref, query):
    raw = subprocess.check_output(
        ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]).decode().strip()
    tok = base64.b64decode(raw.removeprefix("go-keyring-base64:")).decode().strip()
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": query}).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {tok}")
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


print("=== RESYNCHRONISATION agenda ===")
print("mode :", "EXECUTION REELLE" if GO else "simulation (ajouter --go pour executer)")
print()

# ---------------------------------------------------- 1. controles prealables
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
for c in ctrl:
    print(f"  {c['n']:>5}  {c['k']}")
if any(c["n"] for c in ctrl):
    stop("l'historique Planning contient des incoherences (voir ci-dessus)")

# ---------------------------------------------------- 2. mapping des profils
rows = list(csv.DictReader(open(MAPPING)))
mapping = {r["old_profile_id"]: r["new_profile_id"] for r in rows if r["new_profile_id"]}
ecartes = {r["old_profile_id"] for r in rows if r["statut"] == "ECARTE_TEST"}

# GARDE-FOU : un profil cree dans Bolt depuis le dernier mapping n'a pas de
# compte cote Orga. Ses gardes seraient importees sans medecin -- silencieusement.
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

# ---------------------------------------------------- 3. lecture
donnees = {}
for t in ORDRE:
    d, err = sql(PLANNING, f"select * from {t} order by 1;")
    if err:
        stop(f"lecture de {t} : {err}")
    donnees[t] = d or []

shifts_ecartes = {s["id"] for s in donnees["shifts"]
                  if s.get("assigned_doctor_id") in ecartes}
donnees["shifts"] = [s for s in donnees["shifts"] if s["id"] not in shifts_ecartes]
donnees["requests"] = [r for r in donnees["requests"]
                       if r.get("doctor_id") not in ecartes
                       and r["shift_id"] not in shifts_ecartes]

for t, cols in REFS.items():
    for row in donnees.get(t, []):
        for c in cols:
            if row.get(c):
                row[c] = mapping.get(row[c])

# ---------------------------------------------------- 4. etat actuel cote Orga
actuel, err = sql(ORGA, " union all ".join(
    f"select '{t}' t, count(*) n from agenda.{t}" for t in ORDRE))
if err:
    stop(f"lecture de l'etat actuel : {err}")
avant = {r["t"]: r["n"] for r in actuel}

print(f"\n  {'table':<32} {'Orga':>7} {'->':^4} {'Planning':>9}")
for t in ORDRE:
    print(f"  {t:<32} {avant.get(t,0):>7} {'->':^4} {len(donnees[t]):>9}")
print(f"  {'TOTAL':<32} {sum(avant.values()):>7} {'->':^4} {sum(len(v) for v in donnees.values()):>9}")

if not GO:
    print("\n[simulation] rien n'a ete efface ni ecrit. Ajouter --go pour executer.")
    sys.exit(0)

# ---------------------------------------------------- 5. purge + import
print("\nPurge du schema agenda...")
_, err = sql(ORGA, "alter table agenda.requests disable trigger trigger_update_shift_status;")
if err:
    stop(f"desactivation du trigger : {err}")

try:
    # ordre inverse des dependances ; undo_buffer n'est jamais importee mais
    # doit etre videe (elle reference des profils).
    purge = " ".join(f"delete from agenda.{t};" for t in ["undo_buffer"] + ORDRE[::-1])
    _, err = sql(ORGA, purge)
    if err:
        stop(f"purge : {err}")

    print("Import...")
    for t in ORDRE:
        lignes = donnees[t]
        if not lignes:
            continue
        cols = list(lignes[0].keys())
        collist = ", ".join(f'"{c}"' for c in cols)
        for i in range(0, len(lignes), 300):
            lot = lignes[i:i + 300]
            vals = ",\n".join("(" + ", ".join(lit(r[c]) for c in cols) + ")" for r in lot)
            _, err = sql(ORGA, f"insert into agenda.{t} ({collist}) values\n{vals};")
            if err:
                stop(f"insertion dans {t} (lot {i}) : {err}")
        print(f"  {t:<32} {len(lignes):>5}")
finally:
    _, err = sql(ORGA, "alter table agenda.requests enable trigger trigger_update_shift_status;")
    print("\ntrigger metier reactive" if not err else f"\nATTENTION trigger non reactive : {err}")

# ---------------------------------------------------- 6. verification
apres, err = sql(ORGA, " union all ".join(
    f"select '{t}' t, count(*) n from agenda.{t}" for t in ORDRE))
ecarts = [t for t in ORDRE if {r["t"]: r["n"] for r in apres}.get(t, 0) != len(donnees[t])]

integrite, _ = sql(ORGA, """
select 'gardes assigned sans medecin' k, count(*) n from agenda.shifts
  where status='assigned' and assigned_doctor_id is null
union all select 'gardes free avec un medecin', count(*) from agenda.shifts
  where status='free' and assigned_doctor_id is not null
union all select 'demandes orphelines', count(*) from agenda.requests r
  where not exists (select 1 from agenda.shifts s where s.id=r.shift_id);
""")
print()
for c in integrite or []:
    print(f"  {c['n']:>5}  {c['k']}")

if ecarts or any(c["n"] for c in integrite or []):
    stop(f"verification en echec (tables en ecart : {ecarts or 'aucune'})")
print("\nResynchronisation terminee : comptages conformes, integrite verifiee.")
