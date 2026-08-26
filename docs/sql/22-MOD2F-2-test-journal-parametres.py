"""Test du journal sur les tables de parametrage (MOD2-F-4).

    python3 docs/sql/22-MOD2F-2-test-journal-parametres.py

A lancer DEPUIS LA RACINE du depot. Voir 22-MOD2-outil-test.py.

CE QU'ON VERIFIE ICI
Le 24/08/2026, la suppression du creneau « J6 Beaune » n'a laisse aucune
trace : ni journal, ni undo, rien. Il a fallu reconstruire la ligne depuis
le script qui l'avait creee onze mois plus tot. Ce test verifie que ce
trou est bouche -- et qu'il l'est par le CHEMIN DU NAVIGATEUR, pas en role
postgres : une verification faite en administrateur ne prouve rien sur ce
que fait un utilisateur.

Il verifie aussi ce que le journal ne fait PAS : ces entrees ne sont pas
restaurables d'un clic, et un medecin n'en voit rien.

⚠ CE SCRIPT ECRIT DANS LA BASE : un site, une salle et un creneau de test
prefixes « ZZ-TEST », effaces ensuite avec leurs entrees de journal.
"""
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "outil_test", "docs/sql/22-MOD2-outil-test.py")
t = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(t)

t.entete()

depart = t.sql("select coalesce(max(id),0) as m from agenda.activity_log")[0]["m"]
t.sql("delete from agenda.shift_types where name like 'ZZ-TEST%'")
t.sql("delete from agenda.rooms       where name like 'ZZ-TEST%'")
t.sql("delete from agenda.sites       where name like 'ZZ-TEST%'")


def entrees(table):
    """Entrees de journal produites depuis le debut du test, pour une table."""
    return t.sql(f"""select id, operation, row_count, rows_before, rows_after, actor_id
                       from agenda.activity_log
                      where id > {depart} and table_name = '{table}'
                      order by id""")


# --- 1. Les declencheurs sont en place --------------------------------
print("--- 1. Les declencheurs ---")
nb = t.sql("""select count(*) n from pg_trigger tr
                join pg_class c on c.oid = tr.tgrelid
                join pg_namespace ns on ns.oid = c.relnamespace
               where ns.nspname = 'agenda' and tr.tgname like 'journaliser_%'""")[0]["n"]
t.verifier("21 declencheurs de journalisation (7 tables x 3)", nb == 21, f"trouve {nb}")

par_table = {r["tab"]: r["nb"] for r in t.sql("""
    select c.relname tab, count(*) nb from pg_trigger tr
      join pg_class c on c.oid = tr.tgrelid
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'agenda' and tr.tgname like 'journaliser_%'
     group by c.relname""")}
for table in ("sites", "rooms", "shift_types"):
    t.verifier(f"{table} : insert, update et delete",
               par_table.get(table) == 3, str(par_table.get(table)))

# --- 2. Creer un site laisse une trace --------------------------------
print("\n--- 2. Creation ---")
ok, r = t.rest("POST", "sites", t.COORDINATEUR,
               {"name": "ZZ-TEST Site", "color": "#123456", "is_active": True},
               prefer="return=representation")
if not ok:
    raise SystemExit(f"Creation de site impossible : {r}")
site_id = r[0]["id"]

e = entrees("sites")
t.verifier("une entree, et une seule", len(e) == 1, str(len(e)))
t.verifier("operation INSERT", bool(e) and e[0]["operation"] == "INSERT", str(e[:1]))
t.verifier("l'auteur est le coordinateur",
           bool(e) and str(e[0]["actor_id"]) == str(t.COORDINATEUR), str(e[:1]))

# --- 3. Renommer laisse l'etat d'avant ET d'apres ---------------------
print("\n--- 3. Modification ---")
ok, r = t.rest("PATCH", f"sites?id=eq.{site_id}", t.COORDINATEUR,
               {"name": "ZZ-TEST Site renomme"})
t.verifier("le renommage passe", ok, str(r))

e = [x for x in entrees("sites") if x["operation"] == "UPDATE"]
t.verifier("une entree UPDATE", len(e) == 1, str(len(e)))
if e:
    avant = (e[0]["rows_before"] or [{}])[0].get("name")
    apres = (e[0]["rows_after"] or [{}])[0].get("name")
    t.verifier("l'ancien nom est conserve", avant == "ZZ-TEST Site", str(avant))
    t.verifier("le nouveau aussi", apres == "ZZ-TEST Site renomme", str(apres))

# --- 4. Le cas J6 Beaune : supprimer un creneau -----------------------
# C'est l'incident qui a motive cette sous-etape. Ces tables n'ont PAS de
# suppression douce : le DELETE est reel, et seule l'entree de journal
# conserve de quoi reconstruire la ligne.
print("\n--- 4. Suppression d'un creneau (le cas J6 Beaune) ---")
ok, r = t.rest("POST", "shift_types", t.COORDINATEUR,
               {"name": "ZZ-TEST Creneau", "time_range": "08:00-14:00",
                "is_active": True, "sort_order": 99},
               prefer="return=representation")
if not ok:
    raise SystemExit(f"Creation de creneau impossible : {r}")
creneau_id = r[0]["id"]

ok, r = t.rest("DELETE", f"shift_types?id=eq.{creneau_id}", t.COORDINATEUR)
t.verifier("la suppression passe", ok, str(r))
reste = t.sql(f"select count(*) n from agenda.shift_types where id = '{creneau_id}'")[0]["n"]
t.verifier("la ligne a bien disparu de la table", reste == 0, str(reste))

e = [x for x in entrees("shift_types") if x["operation"] == "DELETE"]
t.verifier("le journal a garde une entree DELETE", len(e) == 1, str(len(e)))
if e:
    avant = (e[0]["rows_before"] or [{}])[0]
    t.verifier("avec le nom du creneau supprime",
               avant.get("name") == "ZZ-TEST Creneau", str(avant.get("name")))
    t.verifier("son horaire", avant.get("time_range") == "08:00-14:00",
               str(avant.get("time_range")))
    t.verifier("et son rang d'affichage", avant.get("sort_order") == 99,
               str(avant.get("sort_order")))
    t.verifier("l'etat d'apres est vide (la ligne n'existe plus)",
               e[0]["rows_after"] is None, str(e[0]["rows_after"]))

# --- 5. La projection compacte sait lire ces tables -------------------
# Sans cela, l'ecran afficherait « a modifie 1 ligne » : une trace muette.
print("\n--- 5. Ce que l'ecran recoit ---")
ok, lignes = t.rest("POST", "rpc/journal_activite", t.COORDINATEUR,
                    {"p_limite": 50, "p_avant_id": None})
t.verifier("le journal se lit", ok, str(lignes)[:200])
if ok:
    nouvelles = [l for l in lignes if l["id"] > depart]
    tables_vues = {l["table_name"] for l in nouvelles}
    t.verifier("les entrees de parametrage remontent a l'ecran",
               {"sites", "shift_types"} <= tables_vues, str(tables_vues))

    # La suppression, pas la creation : c'est son etat d'AVANT qui porte de
    # quoi reconstruire la ligne. (Le lot contient les deux, dans un ordre
    # qui n'est pas celui du test -- d'ou la selection explicite.)
    st = next((l for l in nouvelles
               if l["table_name"] == "shift_types" and l["operation"] == "DELETE"), None)
    t.verifier("la suppression du creneau est parmi elles", st is not None, str(tables_vues))
    if st:
        extrait = next(iter((st.get("avant") or {}).values()), {})
        t.verifier("avec le nom projete en francais",
                   extrait.get("nom") == "ZZ-TEST Creneau", str(extrait))
        t.verifier("et l'horaire", extrait.get("horaire") == "08:00-14:00", str(extrait))

# --- 6. Ce que ce journal ne permet PAS -------------------------------
# La trace n'ouvre pas la restauration : restaurer_action ne sait traiter
# que gardes et demandes, et le bouton de l'ecran s'appuie sur
# actions_restaurables -- qui doit repondre false, avec un motif.
print("\n--- 6. Non restaurable, et ca doit rester ainsi ---")
txids = [r["txid"] for r in t.sql(f"""select distinct txid from agenda.activity_log
                                       where id > {depart}
                                         and table_name in ('sites','rooms','shift_types')""")]
ok, r = t.rest("POST", "rpc/actions_restaurables", t.COORDINATEUR, {"p_txids": txids})
t.verifier("actions_restaurables repond", ok, str(r)[:200])
if ok:
    t.verifier("aucune de ces actions n'est proposee a la restauration",
               all(x["restaurable"] is False for x in r), str(r))
    t.verifier("et chacune dit pourquoi",
               all((x.get("motif") or "") != "" for x in r), str(r))

if txids:
    ok, r = t.rest("POST", "rpc/restaurer_action", t.COORDINATEUR,
                   {"p_txid": txids[0], "p_verifier_seulement": True})
    t.verifier("restaurer_action refuse explicitement", not ok, str(r)[:200])

# --- 7. Cloisonnement : un medecin ne voit rien -----------------------
print("\n--- 7. Cloisonnement ---")
ok, r = t.rest("POST", "rpc/journal_activite", t.MEDECIN,
               {"p_limite": 50, "p_avant_id": None})
t.verifier("un medecin obtient une liste vide, pas une erreur",
           ok and (r == [] or all(x["id"] <= depart for x in r)), str(r)[:200])

ok, r = t.rest("DELETE", f"sites?id=eq.{site_id}", t.MEDECIN)
reste = t.sql(f"select count(*) n from agenda.sites where id = '{site_id}'")[0]["n"]
t.verifier("et il ne peut pas supprimer un site", reste == 1, str(reste))

# --- Menage ----------------------------------------------------------
t.sql("delete from agenda.shift_types where name like 'ZZ-TEST%'")
t.sql("delete from agenda.rooms       where name like 'ZZ-TEST%'")
t.sql("delete from agenda.sites       where name like 'ZZ-TEST%'")
t.sql(f"delete from agenda.activity_log where id > {depart}")

t.bilan()
