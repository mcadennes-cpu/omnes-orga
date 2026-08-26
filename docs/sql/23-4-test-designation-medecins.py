"""Test de la designation des medecins (23-3).

    python3 docs/sql/23-4-test-designation-medecins.py

A lancer DEPUIS LA RACINE du depot. Voir 22-MOD2-outil-test.py.

CE QU'ON VERIFIE
Le defaut corrige : agenda.profiles.role est un role UNIQUE, donc etre
coordinateur excluait mecaniquement d'etre medecin. Les trois listes de
medecins du module (attribution, filtres du calendrier) interrogeaient ce
role -- elles ecartaient le coordinateur qui exerce et laissaient passer
le poste de bureau.

Le test se fait par le CHEMIN DU NAVIGATEUR : c'est la requete reelle du
module (.eq('is_agenda_doctor', true) sur agenda.profiles, en role
authenticated, policies actives) qui est rejouee -- pas une requete
equivalente en role postgres, qui ne prouverait rien de ce que voit
l'utilisateur.

⚠ CE SCRIPT N'ECRIT RIEN. Lecture seule.
"""
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "outil_test", "docs/sql/22-MOD2-outil-test.py")
t = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(t)

t.entete()

# --- 1. La colonne et la vue ------------------------------------------
print("--- 1. La colonne et la vue ---")
col = t.sql("""select count(*) n from information_schema.columns
                where table_schema='public' and table_name='profiles'
                  and column_name='is_agenda_doctor'""")[0]["n"]
t.verifier("public.profiles porte is_agenda_doctor", col == 1, str(col))

vue = t.sql("""select count(*) n from information_schema.columns
                where table_schema='agenda' and table_name='profiles'
                  and column_name='is_agenda_doctor'""")[0]["n"]
t.verifier("la vue agenda.profiles l'expose", vue == 1, str(vue))

opts = t.sql("""select coalesce(array_to_string(reloptions, ','), '') o
                  from pg_class where oid='agenda.profiles'::regclass""")[0]["o"]
t.verifier("la vue est restee en security_invoker",
           "security_invoker=true" in opts, opts)

# La colonne « role » ne doit pas avoir bouge : toutes les policies RLS et
# est_coordinateur() s'appuient dessus.
roles = t.sql("""select count(*) filter (where role='coordinator') c,
                        count(*) filter (where role='doctor') d
                   from agenda.profiles""")[0]
t.verifier("le role des permissions est inchange (2 coordinateurs)",
           roles["c"] == 2, str(roles))

# --- 2. La liste vue par le module ------------------------------------
# C'est la requete exacte de AssignDoctorModal / des filtres calendrier.
print("\n--- 2. La liste que le module recoit ---")
ok, liste = t.rest(
    "GET", "profiles?select=id,full_name,role&is_agenda_doctor=eq.true&order=full_name",
    t.COORDINATEUR)
t.verifier("la liste se charge", ok, str(liste)[:200])

noms = [p["full_name"] for p in (liste or [])]
t.verifier("36 medecins", len(noms) == 36, str(len(noms)))

# Le cas qui a motive la correction.
t.verifier("le coordinateur qui exerce y est (Matthieu CADENNES)",
           any("CADENNES" in n for n in noms), str(noms[:5]))
# Le cas symetrique, trouve en corrigeant.
t.verifier("le poste de bureau n'y est plus",
           not any("Poste Bureau" in n for n in noms), str(noms[:5]))
# Inchange, et c'est voulu : elle coordonne sans exercer.
t.verifier("la coordinatrice qui n'exerce pas n'y est pas (Charlotte)",
           not any("FRANZINO" in n for n in noms), str(noms[:5]))

# --- 3. Personne n'est oublie -----------------------------------------
# Le controle qui compte vraiment : quiconque tient une garde ou une regle
# de roulement DOIT etre dans la liste, sinon on ne peut plus lui en
# attribuer.
print("\n--- 3. Aucun medecin oublie ---")
oublies = t.sql("""select trim(coalesce(prenom,'')||' '||coalesce(nom,'')) nom
                     from public.profiles p
                    where not p.is_agenda_doctor
                      and (exists (select 1 from agenda.shifts s
                                    where s.assigned_doctor_id = p.id)
                        or exists (select 1 from agenda.rotation_plan_rules r
                                    where r.doctor_id = p.id))""")
t.verifier("personne qui tient des gardes n'est hors liste",
           len(oublies) == 0, str([o["nom"] for o in oublies]))

# L'inverse : personne dans la liste qui ne soit un compte de medecin.
intrus = t.sql("""select trim(coalesce(prenom,'')||' '||coalesce(nom,'')) nom, role
                    from public.profiles
                   where is_agenda_doctor and role = 'poste_bureau'""")
t.verifier("aucun compte de bureau dans la liste",
           len(intrus) == 0, str([i["nom"] for i in intrus]))

# --- 4. La designation ne donne aucun droit ---------------------------
# is_agenda_doctor decrit qui peut TENIR une garde. Les permissions
# restent portees par role / est_coordinateur() : la colonne ne doit
# ouvrir aucune porte.
print("\n--- 4. Aucun droit accorde au passage ---")
t.verifier("le medecin de test est bien designe medecin",
           t.sql(f"""select is_agenda_doctor d from public.profiles
                      where id = '{t.MEDECIN}'""")[0]["d"] is True, "")

ok, r = t.rest("POST", "rpc/journal_activite", t.MEDECIN,
               {"p_limite": 5, "p_avant_id": None})
t.verifier("il ne lit toujours pas le journal", ok and r == [], str(r)[:150])

ok, r = t.rest("GET", "activity_log?select=id&limit=1", t.MEDECIN)
t.verifier("ni la table directement", ok and r == [], str(r)[:150])

# --- 5. Ce que voit un medecin ----------------------------------------
# La vue est en security_invoker : la RLS de public.profiles s'applique.
# La liste des medecins doit rester lisible par un medecin (le filtre par
# medecin du calendrier lui sert aussi).
print("\n--- 5. Lecture par un medecin ---")
ok, liste_m = t.rest(
    "GET", "profiles?select=id,full_name&is_agenda_doctor=eq.true", t.MEDECIN)
t.verifier("un medecin lit aussi la liste", ok and len(liste_m or []) == 36,
           str(len(liste_m or [])))

t.bilan()
