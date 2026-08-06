"""Test de bout en bout de la lecture du journal (MOD2-C).

    python3 docs/sql/22-MOD2C-2-test-lecture-journal.py

A lancer DEPUIS LA RACINE du depot. Voir 22-MOD2-outil-test.py pour le
harnais et pour la raison d'etre du chemin navigateur.

Ce qui est verifie ici tient en une phrase : la fonction de lecture est en
SECURITY INVOKER, donc la policy « le coordinateur lit le journal »
s'applique. C'est l'inverse des portes d'ecriture, qui doivent contourner
la RLS pour agir. Une fonction de lecture en security definer aurait ete
exactement le defaut trouve en 6G.

⚠ CE SCRIPT ECRIT DANS LA BASE : garde de test au 27/11/2027, effacee
ensuite avec les entrees de journal produites.
"""
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "outil_test", "docs/sql/22-MOD2-outil-test.py")
t = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(t)

DATE_TEST = "2027-11-27"

t.entete()

ref = t.sql("""select site_id, room_id, shift_type_id, location, room, shift_type
                 from agenda.shifts where site_id is not null limit 1""")[0]
depart = t.sql("select coalesce(max(id),0) as m from agenda.activity_log")[0]["m"]
t.sql(f"delete from agenda.shifts where date = date '{DATE_TEST}'")

# --- Materiel : une creation, puis une demande (deux ecritures, un txid) ---
ok, r = t.rest("POST", "shifts", t.COORDINATEUR,
               {"date": DATE_TEST, "location": ref["location"], "room": ref["room"],
                "shift_type": ref["shift_type"], "site_id": ref["site_id"],
                "room_id": ref["room_id"], "shift_type_id": ref["shift_type_id"],
                "status": "free"},
               prefer="return=representation")
if not ok:
    raise SystemExit(f"Creation de la garde de test impossible : {r}")
shift_id = r[0]["id"]
t.rest("POST", "requests", t.MEDECIN,
       {"shift_id": shift_id, "doctor_id": t.MEDECIN, "status": "pending"})

# --- 1. La cloison tient aussi a travers la fonction ------------------
print("--- 1. Qui peut lire le journal par la fonction ---")
ok, r = t.rest("POST", "rpc/journal_activite", t.MEDECIN, {"p_limite": 10})
t.verifier("la fonction repond au medecin sans erreur", ok, str(r))
t.verifier("mais ne lui donne aucune entree", ok and r == [], str(r))

ok, lot = t.rest("POST", "rpc/journal_activite", t.COORDINATEUR, {"p_limite": 20})
t.verifier("le coordinateur recoit des entrees", ok and len(lot) > 0, str(lot)[:120])

# --- 2. Ce que la projection renvoie ----------------------------------
print("\n--- 2. Forme des entrees ---")
nouvelles = [e for e in lot if e["id"] > depart] if ok else []
t.verifier("les ecritures de ce test remontent", len(nouvelles) >= 2, str(len(nouvelles)))

creation = next((e for e in nouvelles
                 if e["table_name"] == "shifts" and e["operation"] == "INSERT"), None)
t.verifier("la creation de garde est presente", creation is not None)
if creation:
    t.verifier("l'auteur est resolu en clair",
               creation["actor_nom"] == t.NOM_COORDINATEUR, str(creation["actor_nom"]))
    apres = creation.get("apres") or {}
    t.verifier("la projection est indexee par identifiant de garde",
               shift_id in apres, list(apres)[:2])
    champs = set((apres.get(shift_id) or {}).keys())
    t.verifier("elle porte les champs attendus",
               {"jour", "statut", "medecin", "site", "creneau", "supprimee"} <= champs,
               str(sorted(champs)))
    t.verifier("et pas la ligne complete (projection compacte)",
               "created_by" not in champs and "room_id" not in champs,
               str(sorted(champs)))

# --- 3. Le regroupement par transaction est exploitable ---------------
# La demande de garde produit deux ecritures partageant un txid : c'est ce
# qui permet a l'ecran de les presenter comme un seul geste.
print("\n--- 3. Regroupement par transaction ---")
par_tx = {}
for e in nouvelles:
    par_tx.setdefault(e["txid"], []).append(e)
groupes_multiples = [g for g in par_tx.values() if len(g) > 1]
t.verifier("une action a bien produit deux ecritures liees",
           len(groupes_multiples) == 1, str([len(g) for g in par_tx.values()]))
if groupes_multiples:
    tables = sorted(e["table_name"] for e in groupes_multiples[0])
    t.verifier("elles portent sur les gardes et sur les demandes",
               tables == ["requests", "shifts"], str(tables))

# --- 4. La pagination ne boucle pas -----------------------------------
print("\n--- 4. Pagination ---")
ok, page1 = t.rest("POST", "rpc/journal_activite", t.COORDINATEUR, {"p_limite": 2})
t.verifier("une premiere page de 2 entrees", ok and len(page1) == 2, str(len(page1) if ok else r))
if ok and len(page1) == 2:
    ok2, page2 = t.rest("POST", "rpc/journal_activite", t.COORDINATEUR,
                        {"p_limite": 2, "p_avant_id": page1[-1]["id"]})
    t.verifier("la page suivante ne repete pas la premiere",
               ok2 and not ({e["id"] for e in page2} & {e["id"] for e in page1}),
               str([e["id"] for e in page2] if ok2 else page2))
    t.verifier("et elle remonte bien vers le passe",
               ok2 and all(e["id"] < page1[-1]["id"] for e in page2))

# --- Menage ----------------------------------------------------------
t.sql(f"delete from agenda.shifts where date = date '{DATE_TEST}'")
t.sql(f"delete from agenda.activity_log where id > {depart}")

t.bilan()
