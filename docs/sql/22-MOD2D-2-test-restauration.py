"""Test de bout en bout de la restauration (MOD2-D).

    python3 docs/sql/22-MOD2D-2-test-restauration.py

A lancer DEPUIS LA RACINE du depot. Voir 22-MOD2-outil-test.py pour le
harnais et pour la raison d'etre du chemin navigateur.

CE QUI EST REELLEMENT TESTE ICI : le refus. Restaurer quand tout va bien
est la partie facile ; ce que MOD-2 devait corriger, c'est « aucune
verification de coherence avant d'annuler ». Les controles qui comptent
sont donc ceux ou la fonction doit REFUSER et ne rien ecrire.

⚠ CE SCRIPT ECRIT DANS LA BASE : gardes de test au 01/12/2027, effacees
ensuite avec les entrees de journal produites.
"""
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "outil_test", "docs/sql/22-MOD2-outil-test.py")
t = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(t)

DATE_TEST = "2027-12-01"

t.entete()

ref = t.sql("""select site_id, room_id, shift_type_id, location, room, shift_type
                 from agenda.shifts where site_id is not null limit 1""")[0]
depart = t.sql("select coalesce(max(id),0) as m from agenda.activity_log")[0]["m"]
t.sql(f"delete from agenda.shifts where date = date '{DATE_TEST}'")

GARDE = {"date": DATE_TEST, "location": ref["location"], "room": ref["room"],
         "shift_type": ref["shift_type"], "site_id": ref["site_id"],
         "room_id": ref["room_id"], "shift_type_id": ref["shift_type_id"],
         "status": "free"}


def dernier_txid():
    return t.sql("select txid from agenda.activity_log order by id desc limit 1")[0]["txid"]


def etat(shift_id):
    r = t.sql(f"""select status, assigned_doctor_id, (deleted_at is not null) as supprimee
                    from agenda.shifts where id = '{shift_id}'""")
    return r[0] if r else None


def restaurer(txid, uid=None, ecrire=False):
    return t.rest("POST", "rpc/restaurer_action", uid or t.COORDINATEUR,
                  {"p_txid": txid, "p_verifier_seulement": not ecrire})


# --- Materiel : une garde creee, attribuee, puis liberee ---------------
ok, r = t.rest("POST", "shifts", t.COORDINATEUR, GARDE, prefer="return=representation")
if not ok:
    raise SystemExit(f"Creation impossible : {r}")
shift_id = r[0]["id"]
txid_creation = dernier_txid()

t.rest("PATCH", f"shifts?id=eq.{shift_id}", t.COORDINATEUR,
       {"status": "assigned", "assigned_doctor_id": t.MEDECIN})
t.rest("PATCH", f"shifts?id=eq.{shift_id}", t.COORDINATEUR,
       {"status": "free", "assigned_doctor_id": None})
txid_liberation = dernier_txid()

# --- 1. Qui peut restaurer -------------------------------------------
print("--- 1. Droits ---")
ok, r = restaurer(txid_liberation, uid=t.MEDECIN)
t.verifier("un medecin ne peut pas restaurer", not ok, str(r))

# --- 2. Le mode verification n'ecrit rien -----------------------------
print("\n--- 2. Verification seule ---")
avant = etat(shift_id)
ok, r = restaurer(txid_liberation)
t.verifier("la verification repond", ok, str(r))
t.verifier("elle annonce que c'est possible", ok and r.get("ok") is True, str(r))
t.verifier("elle declare n'avoir rien ecrit", ok and r.get("ecrit") is False, str(r))
t.verifier("et la garde n'a effectivement pas bouge", etat(shift_id) == avant, str(etat(shift_id)))

# --- 3. La restauration rend le medecin -------------------------------
print("\n--- 3. Restauration ---")
ok, r = restaurer(txid_liberation, ecrire=True)
t.verifier("la restauration s'execute", ok and r.get("ecrit") is True, str(r))
apres = etat(shift_id)
t.verifier("le medecin est revenu", apres["assigned_doctor_id"] == t.MEDECIN, str(apres))
t.verifier("le statut aussi", apres["status"] == "assigned", str(apres))

# --- 4. Pas deux fois ------------------------------------------------
# Sans cela, recliquer defait un etat deja retabli -- le defaut n°1 de
# MOD-2 (« une deuxieme action rend la premiere irreversible ») a l'envers.
print("\n--- 4. Double annulation ---")
ok, r = restaurer(txid_liberation, ecrire=True)
t.verifier("une action deja annulee est refusee", not ok, str(r))
t.verifier("le message le dit clairement", not ok and "deja" in str(r).lower(), str(r))

# --- 5. LE GARDE-FOU : quelqu'un est passe depuis ---------------------
# On libere a nouveau, puis on simule l'arrivee d'un autre medecin sur la
# garde. La restauration doit REFUSER et ne rien ecrire.
print("\n--- 5. Garde-fou de coherence ---")
t.rest("PATCH", f"shifts?id=eq.{shift_id}", t.COORDINATEUR,
       {"status": "free", "assigned_doctor_id": None})
txid_liberation2 = dernier_txid()

autre = t.sql("""select id from public.profiles
                  where actif and coalesce(is_agenda_coordinator,false)=false
                  order by nom limit 1 offset 1""")[0]["id"]
t.sql(f"""update agenda.shifts set status='assigned', assigned_doctor_id='{autre}'
           where id='{shift_id}'""")

avant = etat(shift_id)
ok, r = restaurer(txid_liberation2, ecrire=True)
t.verifier("la restauration est refusee", ok and r.get("ok") is False, str(r))
t.verifier("elle n'a rien ecrit", ok and r.get("ecrit") is False, str(r))
t.verifier("la garde est intacte", etat(shift_id) == avant, str(etat(shift_id)))
conflits = (r or {}).get("conflits") or []
t.verifier("le conflit est decrit", len(conflits) > 0, str(r))
if conflits:
    c = conflits[0]
    t.verifier("il nomme le champ en cause", c.get("champ") in
               ("status", "assigned_doctor_id"), str(c))
    t.verifier("avec l'attendu et l'actuel", "attendu" in c and "actuel" in c, str(c))

# --- 6. Defaire une creation -----------------------------------------
print("\n--- 6. Annuler une creation ---")
t.sql(f"""update agenda.shifts set status='free', assigned_doctor_id=null
           where id='{shift_id}'""")
ok, r = restaurer(txid_creation, ecrire=True)
t.verifier("la creation se defait", ok and r.get("ok") is True, str(r))
final = etat(shift_id)
t.verifier("la garde est passee en suppression douce",
           final and final["supprimee"] is True, str(final))
ok, vue = t.rest("GET", f"shifts?select=id&id=eq.{shift_id}", t.COORDINATEUR)
t.verifier("elle a disparu du planning", ok and vue == [], str(vue))

# --- 7. Ce que l'ecran peut proposer ----------------------------------
print("\n--- 7. Eligibilite pour l'ecran ---")
ok, r = t.rest("POST", "rpc/actions_restaurables", t.COORDINATEUR,
               {"p_txids": [txid_creation, txid_liberation, txid_liberation2]})
t.verifier("la fonction repond", ok, str(r))
if ok:
    par_tx = {x["txid"]: x for x in r}
    t.verifier("les actions deja annulees sont exclues",
               par_tx.get(txid_creation, {}).get("restaurable") is False
               and par_tx.get(txid_liberation, {}).get("restaurable") is False,
               str(r))
    t.verifier("avec le motif", par_tx.get(txid_creation, {}).get("motif") == "deja annulee",
               str(par_tx.get(txid_creation)))

# --- Menage ----------------------------------------------------------
t.sql(f"delete from agenda.shifts where date = date '{DATE_TEST}'")
t.sql(f"delete from agenda.activity_log where id > {depart}")

t.bilan()
