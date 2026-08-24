"""Test de agenda.derniere_action (MOD2-E).

    python3 docs/sql/22-MOD2E-3-test-derniere-action.py

A lancer DEPUIS LA RACINE du depot. Voir 22-MOD2-outil-test.py.

C'est la brique sur laquelle repose le bandeau ephemere : sans elle, il ne
saurait pas quelle action proposer d'annuler. Le bandeau lui-meme est du
code d'interface, il se teste au navigateur ; ce qui se verifie ici, c'est
qu'il ne peut pas se tromper d'action ni voir celles des autres.

⚠ CE SCRIPT ECRIT DANS LA BASE : gardes de test au 02/12/2027, effacees
ensuite avec les entrees de journal produites.
"""
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "outil_test", "docs/sql/22-MOD2-outil-test.py")
t = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(t)

DATE_TEST = "2027-12-02"

t.entete()

ref = t.sql("""select site_id, room_id, shift_type_id, location, room, shift_type
                 from agenda.shifts where site_id is not null limit 1""")[0]
depart = t.sql("select coalesce(max(id),0) as m from agenda.activity_log")[0]["m"]
t.sql(f"delete from agenda.shifts where date = date '{DATE_TEST}'")

# --- 1. Rien de recent, rien a proposer -------------------------------
print("--- 1. Sans action recente ---")
ok, r = t.rest("POST", "rpc/derniere_action", t.COORDINATEUR, {"p_secondes": 1})
t.verifier("la fonction repond", ok, str(r))
t.verifier("et ne propose rien", ok and r is None, str(r))

# --- 2. Apres une action, elle la retrouve ----------------------------
print("\n--- 2. Juste apres une action ---")
ok, r = t.rest("POST", "shifts", t.COORDINATEUR,
               {"date": DATE_TEST, "location": ref["location"], "room": ref["room"],
                "shift_type": ref["shift_type"], "site_id": ref["site_id"],
                "room_id": ref["room_id"], "shift_type_id": ref["shift_type_id"],
                "status": "free"},
               prefer="return=representation")
if not ok:
    raise SystemExit(f"Creation impossible : {r}")
shift_id = r[0]["id"]

ok, action = t.rest("POST", "rpc/derniere_action", t.COORDINATEUR, {"p_secondes": 20})
t.verifier("elle retrouve l'ecriture", ok and action is not None, str(action))
if action:
    t.verifier("c'est bien la creation de garde",
               action.get("table_name") == "shifts" and action.get("operation") == "INSERT",
               str(action))
    attendu = t.sql(f"""select txid from agenda.activity_log
                         where id > {depart} order by id desc limit 1""")[0]["txid"]
    t.verifier("avec le bon identifiant de transaction",
               action.get("txid") == attendu, f"{action.get('txid')} vs {attendu}")

# --- 3. Chacun ne voit que ses propres actions ------------------------
# La fonction filtre sur auth.uid() ET la policy de lecture du journal
# s'applique (security invoker). Un medecin ne doit rien obtenir, meme si
# une action vient d'avoir lieu.
print("\n--- 3. Cloisonnement ---")
ok, r = t.rest("POST", "rpc/derniere_action", t.MEDECIN, {"p_secondes": 20})
t.verifier("un medecin n'obtient rien", ok and r is None, str(r))

# --- 4. La fenetre de temps est respectee -----------------------------
# C'est ce qui remplace l'absence de peremption de l'ancien bouton : passe
# le delai, il n'y a plus rien a proposer d'annuler.
print("\n--- 4. Peremption ---")
# 60 s en arriere : hors de la fenetre courte du bandeau (20 s), dans la
# fenetre large (120 s, plafond de la fonction).
t.sql(f"""update agenda.activity_log set occurred_at = now() - interval '60 seconds'
           where id > {depart}""")
ok, r = t.rest("POST", "rpc/derniere_action", t.COORDINATEUR, {"p_secondes": 20})
t.verifier("une action trop ancienne n'est plus proposee", ok and r is None, str(r))
ok, r = t.rest("POST", "rpc/derniere_action", t.COORDINATEUR, {"p_secondes": 120})
t.verifier("mais elle reste visible sur une fenetre plus large",
           ok and r is not None, str(r))
ok, r = t.rest("POST", "rpc/derniere_action", t.COORDINATEUR, {"p_secondes": 99999})
t.verifier("la fenetre demandee est plafonnee a 2 minutes",
           ok and r is not None, "le plafond laisserait passer une action trop vieille")

# --- 5. Une action deja annulee n'est pas reproposee ------------------
print("\n--- 5. Action deja annulee ---")
t.sql(f"""update agenda.activity_log
             set undone_at = now(), undone_by = '{t.COORDINATEUR}'
           where id > {depart}""")
ok, r = t.rest("POST", "rpc/derniere_action", t.COORDINATEUR, {"p_secondes": 120})
t.verifier("elle n'est plus proposee", ok and r is None, str(r))

# --- Menage ----------------------------------------------------------
t.sql(f"delete from agenda.shifts where date = date '{DATE_TEST}'")
t.sql(f"delete from agenda.activity_log where id > {depart}")

t.bilan()
