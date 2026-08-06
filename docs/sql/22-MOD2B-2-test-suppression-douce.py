"""Test de bout en bout de la suppression douce (MOD2-B).

    python3 docs/sql/22-MOD2B-2-test-suppression-douce.py

A lancer DEPUIS LA RACINE du depot. Voir 22-MOD2-outil-test.py pour le
harnais et pour la raison d'etre du chemin navigateur.

⚠ CE SCRIPT ECRIT DANS LA BASE : il cree des gardes de test au 25/11/2027
(tres au-dela du calendrier reel), les manipule, puis efface les gardes ET
les entrees de journal qu'il a produites.
"""
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "outil_test", "docs/sql/22-MOD2-outil-test.py")
t = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(t)

DATE_TEST = "2027-11-25"

t.entete()

ref = t.sql("""select site_id, room_id, shift_type_id, location, room, shift_type
                 from agenda.shifts where site_id is not null limit 1""")[0]
depart = t.sql("select coalesce(max(id),0) as m from agenda.activity_log")[0]["m"]
t.sql(f"delete from agenda.shifts where date = date '{DATE_TEST}'")

GARDE = {"date": DATE_TEST, "location": ref["location"], "room": ref["room"],
         "shift_type": ref["shift_type"], "site_id": ref["site_id"],
         "room_id": ref["room_id"], "shift_type_id": ref["shift_type_id"],
         "status": "free"}


def creer_garde():
    ok, r = t.rest("POST", "shifts", t.COORDINATEUR, GARDE,
                   prefer="return=representation")
    if not ok:
        raise SystemExit(f"Creation de la garde de test impossible : {r}")
    return r[0]["id"]


# --- 1. La suppression reelle n'est plus permise ---------------------
print("--- 1. La suppression reelle est fermee ---")
shift_id = creer_garde()
ok, r = t.rest("DELETE", f"shifts?id=eq.{shift_id}", t.COORDINATEUR)
reste = t.sql(f"select count(*) as n from agenda.shifts where id='{shift_id}'")[0]["n"]
t.verifier("le coordinateur ne peut plus supprimer une garde", reste == 1,
           f"la garde a disparu (reponse : {r})")

# --- 2. La suppression douce masque la garde -------------------------
# C'est le coeur de MOD2-B : aucune requete de LECTURE du module n'a ete
# modifiee, c'est la policy qui fait disparaitre la ligne.
print("\n--- 2. Suppression douce, par la porte ---")
ok, r = t.rest("POST", "rpc/supprimer_gardes", t.MEDECIN, {"p_shift_ids": [shift_id]})
t.verifier("un non-coordinateur ne peut pas supprimer", not ok, str(r))

ok, r = t.rest("POST", "rpc/supprimer_gardes", t.COORDINATEUR, {"p_shift_ids": [shift_id]})
t.verifier("le coordinateur supprime par supprimer_gardes()", ok, str(r))
t.verifier("la fonction annonce une garde supprimee",
           ok and r.get("supprimees") == 1, str(r))

# Le PATCH direct reste refuse : PostgreSQL interdit a un UPDATE de faire
# sortir une ligne de sa propre visibilite. C'est la raison d'etre de la
# porte, et il faut que cela reste vrai.
ok2, r2 = t.rest("POST", "shifts", t.COORDINATEUR,
                 dict(GARDE, date="2027-11-25"), prefer="return=representation")
if ok2:
    autre = r2[0]["id"]
    ok3, r3 = t.rest("PATCH", f"shifts?id=eq.{autre}", t.COORDINATEUR,
                     {"deleted_at": "2027-11-25T10:00:00Z"})
    t.verifier("un PATCH direct de deleted_at reste refuse", not ok3, str(r3))
    t.sql(f"delete from agenda.shifts where id = '{autre}'")

ok, vues = t.rest("GET", f"shifts?select=id&id=eq.{shift_id}", t.COORDINATEUR)
t.verifier("le coordinateur ne la voit plus", ok and vues == [], str(vues))
ok, vues = t.rest("GET", f"shifts?select=id&id=eq.{shift_id}", t.MEDECIN)
t.verifier("le medecin ne la voit plus", ok and vues == [], str(vues))
t.verifier("mais la ligne existe toujours en base",
           t.sql(f"select count(*) as n from agenda.shifts "
                 f"where id='{shift_id}'")[0]["n"] == 1)

# --- 3. Une garde supprimee n'est plus modifiable --------------------
# USING porte sur la ligne d'AVANT : une ligne deja supprimee sort du
# perimetre de la policy. On ne ressuscite donc pas une garde par un
# PATCH -- ce sera le travail de restaurer_action() en MOD2-D.
print("\n--- 3. Une garde supprimee sort du perimetre ---")
t.rest("PATCH", f"shifts?id=eq.{shift_id}", t.COORDINATEUR, {"status": "assigned"})
statut = t.sql(f"select status from agenda.shifts where id='{shift_id}'")[0]["status"]
t.verifier("son statut ne peut plus etre change", statut == "free", statut)

t.rest("PATCH", f"shifts?id=eq.{shift_id}", t.COORDINATEUR, {"deleted_at": None})
encore = t.sql(f"select deleted_at from agenda.shifts "
               f"where id='{shift_id}'")[0]["deleted_at"]
t.verifier("elle ne peut pas etre restauree par un simple PATCH",
           encore is not None, "la garde a ete ressuscitee")

# --- 4. L'index partiel libere le creneau ----------------------------
# ⚠ LE POINT QUI REND MOD2-B POSSIBLE. Sans la conversion de la
# contrainte unique_shift en index partiel, la garde supprimee
# continuerait d'occuper son creneau et cette creation echouerait.
print("\n--- 4. Le creneau est reutilisable ---")
ok, r = t.rest("POST", "shifts", t.COORDINATEUR, GARDE, prefer="return=representation")
t.verifier("une garde peut etre recreee au meme jour / salle / creneau", ok, str(r))
remplacante = r[0]["id"] if ok else None
if remplacante:
    t.verifier("c'est bien une nouvelle ligne", remplacante != shift_id)
    t.verifier("et une seule est visible",
               len(t.rest("GET", f"shifts?select=id&date=eq.{DATE_TEST}",
                          t.COORDINATEUR)[1]) == 1)

# --- 5. Aucune demande ne peut naitre sur une garde supprimee --------
# La cle etrangere est verifiee avec les droits du proprietaire et ignore
# la RLS : sans la policy posee en MOD2-B, un medecin pourrait demander
# une garde qu'il ne voit plus, et le declencheur metier la ferait
# repasser en « pending ».
print("\n--- 5. Demande sur une garde supprimee ---")
ok, r = t.rest("POST", "requests", t.MEDECIN,
               {"shift_id": shift_id, "doctor_id": t.MEDECIN, "status": "pending"})
t.verifier("le medecin ne peut pas demander une garde supprimee", not ok, str(r))
t.verifier("la garde supprimee n'est pas revenue en attente",
           t.sql(f"select status from agenda.shifts "
                 f"where id='{shift_id}'")[0]["status"] == "free")
ok, r = t.rest("POST", "requests", t.MEDECIN,
               {"shift_id": remplacante, "doctor_id": t.MEDECIN, "status": "pending"})
t.verifier("mais il peut demander la garde vivante", ok, str(r))

# --- 6. Le journal a tout vu ----------------------------------------
print("\n--- 6. Trace dans le journal ---")
j = t.sql(f"""select operation, rows_after->0->>'deleted_at' as apres,
                     rows_before->0->>'deleted_at' as avant
                from agenda.activity_log
               where id > {depart} and table_name='shifts'
                 and target_ids @> array['{shift_id}']::uuid[]
               order by id""")
douces = [x for x in j if x["operation"] == "UPDATE" and x["avant"] is None
          and x["apres"] is not None]
t.verifier("la suppression douce est journalisee comme un UPDATE",
           len(douces) == 1, f"{len(douces)} sur {len(j)} entrees")
t.verifier("avec l'etat d'avant et d'apres",
           bool(douces) and douces[0]["avant"] is None and douces[0]["apres"],
           str(j))

# --- Menage ----------------------------------------------------------
t.sql(f"delete from agenda.shifts where date = date '{DATE_TEST}'")
t.sql(f"delete from agenda.activity_log where id > {depart}")

t.bilan()
