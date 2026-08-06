"""Test de bout en bout du journal d'activite du module Agenda (MOD2-A).

    python3 docs/sql/22-MOD2A-2-test-journal-activite.py

A lancer DEPUIS LA RACINE du depot. Voir 22-MOD2-outil-test.py pour le
harnais et pour la raison d'etre du chemin navigateur.

⚠ CE SCRIPT ECRIT DANS LA BASE : il cree une garde de test au 24/11/2027
(tres au-dela du calendrier reel), la manipule, puis efface la garde ET
les entrees de journal qu'il a produites.
"""
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "outil_test", "docs/sql/22-MOD2-outil-test.py")
t = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(t)

DATE_TEST = "2027-11-24"

t.entete()

ref = t.sql("""select site_id, room_id, shift_type_id, location, room, shift_type
                 from agenda.shifts where site_id is not null limit 1""")[0]
depart = t.sql("select coalesce(max(id),0) as m from agenda.activity_log")[0]["m"]
t.sql(f"delete from agenda.shifts where date = date '{DATE_TEST}'")

# --- 1. Cloison de lecture -------------------------------------------
print("--- 1. Qui lit le journal ---")
ok, r = t.rest("GET", "activity_log?select=id&limit=1", t.MEDECIN)
t.verifier("un medecin ne voit rien du journal", ok and r == [], f"{ok} {r}")
ok, r = t.rest("GET", "activity_log?select=id&limit=1", t.COORDINATEUR)
t.verifier("le coordinateur y accede", ok, str(r))

# --- 2. Le journal est infalsifiable ---------------------------------
# Un journal que l'application pourrait reecrire ne vaudrait rien comme
# trace. Aucun grant d'ecriture, aucune policy INSERT/UPDATE/DELETE.
print("\n--- 2. Ecriture directe dans le journal ---")
ok, r = t.rest("POST", "activity_log", t.COORDINATEUR,
               {"txid": 1, "table_name": "shifts", "operation": "INSERT", "row_count": 1})
t.verifier("le coordinateur ne peut pas y inserer", not ok, str(r))
ok, r = t.rest("PATCH", "activity_log?id=gt.0", t.COORDINATEUR, {"row_count": 0})
t.verifier("ni modifier une entree", not ok, str(r))
ok, r = t.rest("DELETE", "activity_log?id=gt.0", t.COORDINATEUR)
t.verifier("ni en supprimer", not ok, str(r))

# --- 3. Une action reelle laisse une trace, et une seule -------------
print("\n--- 3. Creation d'une garde par le coordinateur ---")
ok, r = t.rest("POST", "shifts", t.COORDINATEUR,
               {"date": DATE_TEST, "location": ref["location"], "room": ref["room"],
                "shift_type": ref["shift_type"], "site_id": ref["site_id"],
                "room_id": ref["room_id"], "shift_type_id": ref["shift_type_id"],
                "status": "free"},
               prefer="return=representation")
if not ok:
    raise SystemExit(f"  ECHEC creation de la garde de test : {r}")
shift_id = r[0]["id"]

j = t.sql(f"""select table_name, operation, actor_id, target_ids::text
                from agenda.activity_log where id > {depart} order by id""")
t.verifier("une entree, et une seule", len(j) == 1, f"{len(j)} entrees")
if j:
    t.verifier("table et operation justes",
               j[0]["table_name"] == "shifts" and j[0]["operation"] == "INSERT",
               f"{j[0]['table_name']}/{j[0]['operation']}")
    t.verifier("l'auteur est le coordinateur", j[0]["actor_id"] == t.COORDINATEUR,
               str(j[0]["actor_id"]))
    t.verifier("la garde creee est referencee", shift_id in j[0]["target_ids"],
               j[0]["target_ids"])

# --- 4. Une instruction sans effet ne cree rien ----------------------
print("\n--- 4. UPDATE ne touchant aucune ligne ---")
avant = t.sql("select count(*) as n from agenda.activity_log")[0]["n"]
t.rest("PATCH", "shifts?date=eq.1999-01-01", t.COORDINATEUR, {"coordinator_note": "neant"})
apres = t.sql("select count(*) as n from agenda.activity_log")[0]["n"]
t.verifier("aucune entree pour un WHERE qui ne trouve rien", avant == apres,
           f"{avant} -> {apres}")

# --- 5. Le regroupement par transaction ------------------------------
# Une demande de garde ecrit dans requests, ce qui reveille le declencheur
# metier update_shift_status qui ecrit a son tour dans shifts : deux
# instructions, une seule action utilisateur. Le txid les rattache.
print("\n--- 5. Regroupement par txid (demande de garde) ---")
borne = t.sql("select max(id) as m from agenda.activity_log")[0]["m"]
ok, r = t.rest("POST", "requests", t.MEDECIN,
               {"shift_id": shift_id, "doctor_id": t.MEDECIN, "status": "pending"},
               prefer="return=representation")
t.verifier("le medecin demande la garde", ok, str(r))
j = t.sql(f"""select table_name, operation, txid from agenda.activity_log
               where id > {borne} order by id""")
print(f"     entrees produites : {[(x['table_name'], x['operation']) for x in j]}")
t.verifier("deux instructions journalisees", len(j) == 2, str(len(j)))
t.verifier("regroupees sous un meme txid", len({x["txid"] for x in j}) == 1,
           str({x["txid"] for x in j}))
t.verifier("la garde est bien passee en attente",
           t.sql(f"select status from agenda.shifts "
                 f"where id='{shift_id}'")[0]["status"] == "pending")

# --- 6. La suppression REELLE reste tracee ---------------------------
# Depuis MOD2-B, le module ne supprime plus reellement (suppression douce,
# testee dans 22-MOD2B-2). Le DELETE reste possible en service_role pour
# les migrations et le menage : le declencheur doit continuer a le voir,
# et a conserver l'etat d'avant.
print("\n--- 6. Suppression reelle en administration ---")
borne = t.sql("select max(id) as m from agenda.activity_log")[0]["m"]
t.sql(f"delete from agenda.shifts where id = '{shift_id}'")
j = t.sql(f"""select table_name, operation,
                     rows_before->0->>'status' as statut_avant, actor_id
                from agenda.activity_log where id > {borne} order by id""")
print(f"     entrees produites : {[(x['table_name'], x['operation']) for x in j]}")
sup = [x for x in j if x["table_name"] == "shifts" and x["operation"] == "DELETE"]
t.verifier("la suppression de la garde est tracee", len(sup) == 1, str(len(sup)))
if sup:
    t.verifier("l'etat d'avant est conserve", sup[0]["statut_avant"] == "pending",
               str(sup[0]["statut_avant"]))
    # Ecriture faite par l'API d'administration : aucun utilisateur connecte.
    # Un acteur nul est une information (« ecrit hors application »), pas un defaut.
    t.verifier("acteur nul hors application", sup[0]["actor_id"] is None,
               str(sup[0]["actor_id"]))

# --- Menage ----------------------------------------------------------
t.sql(f"delete from agenda.shifts where date = date '{DATE_TEST}'")
t.sql(f"delete from agenda.activity_log where id > {depart}")

t.bilan()
