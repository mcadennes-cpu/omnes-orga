#!/usr/bin/env python3
"""Exiger un compte ACTIF pour toucher au schema public -- chantier D, D-3.

    OMNES_CIBLE=test python3 docs/sql/23-21-exiger-compte-actif.py          # simulation
    OMNES_CIBLE=test python3 docs/sql/23-21-exiger-compte-actif.py --go     # pose la couche
    OMNES_CIBLE=test python3 docs/sql/23-21-exiger-compte-actif.py --retour-arriere --go
    python3 docs/sql/23-21-exiger-compte-actif.py --go                      # PRODUCTION

A lancer DEPUIS LA RACINE du depot. SIMULATION PAR DEFAUT : sans --go, le
script affiche mot pour mot ce qu'il executerait, et ne touche a rien.

LE PROBLEME, mesure le 21/09/2026 par 23-20
Le schema `agenda` verifie `actif` : ses 51 policies passent toutes par
`peut_acceder()` ou `est_coordinateur()`, qui testent `and actif`. Desactiver
quelqu'un lui ferme donc le module.
Le schema `public`, lui, l'ignore totalement : sur ses 99 policies, **aucune**
ne teste `actif` en mot entier. Les 9 fonctions qui lisent `profiles` filtrent
sur `role` et jamais sur `actif`. Une fiche desactivee dont le compte auth
n'est pas bloque garde donc l'annuaire, le trombinoscope, les discussions,
les codes d'acces -- tout.
Aujourd'hui le trou est LATENT : les 7 fiches inactives ont toutes leur compte
bloque. Il s'ouvrirait le jour ou quelqu'un serait desactive sans etre bloque,
ce qui est exactement le geste naturel d'un coordinateur.

POURQUOI UNE COUCHE « RESTRICTIVE » PLUTOT QUE 99 REECRITURES
Les 99 policies existantes sont toutes PERMISSIVE : elles se combinent avec un
OU -- il suffit qu'une seule autorise. Une policy RESTRICTIVE se combine avec
un ET : elle doit etre satisfaite EN PLUS de tout le reste.
On pose donc un verrou par-dessus, sans toucher a une seule serrure existante.
  . corriger les 9 fonctions ne couvrirait que 30 policies sur 99 (mesure) ;
  . reecrire les 69 autres, c'est 69 occasions de casser l'appli en silence
    pour 40 personnes ;
  . ici : 0 policy modifiee, et le retour arriere est un DROP POLICY.
Verifie le 21/09 : `postgres` et `service_role` ont `rolbypassrls = true`.
Cette couche ne peut donc enfermer ni l'administration, ni ces scripts.

LE CAS PARTICULIER DE profiles -- ne pas s'enfermer dehors
Si on ferme aussi la lecture de sa PROPRE fiche, `useRole.js` ne recoit rien
et reste bloque en `loading` : la personne desactivee tombe sur un ecran
blanc, sans explication. La policy de lecture sur `profiles` laisse donc
toujours passer sa propre ligne (`id = auth.uid()`), ce qui n'expose rien --
on connait deja ses propres donnees -- et permet a l'appli d'afficher un
ecran « compte desactive » (sous-etape D-6).
L'INSERT sur `profiles` n'est volontairement pas restreint : la fiche est
creee par le declencheur `handle_new_user` (SECURITY DEFINER, donc hors RLS),
et un inactif qui tenterait d'inserer sa propre ligne se heurterait de toute
facon a la cle primaire.

CE QUE CA NE FAIT PAS
  . aucune ligne de donnees n'est lue, modifiee ni supprimee ;
  . les 99 policies existantes ne sont pas touchees ;
  . `agenda` n'est pas touche (deja correct) ;
  . `storage` n'est pas touche : ses 20 policies sont un chantier a part
    (D-8), et l'environnement de test ne les porte meme pas encore.
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

GO = "--go" in sys.argv
RETOUR = "--retour-arriere" in sys.argv

PROJET_PROD = "ydihrgnixthrraprclox"          # OMNES ORGA
PROJET_TEST = "yjttfdwjbyufpavwxcpy"          # environnement de test (23-18)
ARCHIVES = Path.home() / "Documents/claude-projets/archives/orga-sauvegardes"

CIBLE = os.environ.get("OMNES_CIBLE", "prod").strip().lower()
if CIBLE not in ("prod", "test"):
    raise SystemExit("OMNES_CIBLE vaut 'prod' (defaut) ou 'test'.")
SUR_TEST = CIBLE == "test"
PROJET = PROJET_TEST if SUR_TEST else PROJET_PROD

#: Nom unique des policies posees ici. Sert aussi a les retrouver pour le
#: retour arriere : on ne supprime QUE ce qui porte ces noms.
PREFIXE = "exiger_compte_actif"
NOMS = (PREFIXE, PREFIXE + "_lecture", PREFIXE + "_modif", PREFIXE + "_suppr")

if not Path("docs/sql").is_dir():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()


def stop(msg):
    raise SystemExit(f"\nARRET : {msg}\nRien n'a ete ecrit.")


def _appel(requete):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJET}/database/query",
        data=json.dumps({"query": requete}).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {_TOK}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "omnes-orga-script/1.0")
    for tentative in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read() or "null"), None
        except urllib.error.HTTPError as e:
            if e.code == 429 and tentative < 3:
                time.sleep(30)
                continue
            return None, e.read().decode()[:500]
        except OSError as e:
            return None, str(e)


def lire(requete):
    """SELECT en transaction read only, confirmee par la base."""
    lignes, err = _appel("begin transaction read only;\n"
                         "select current_setting('transaction_read_only') as ro, x.*\n"
                         f"from ({requete}) x;\ncommit;\n")
    if err:
        stop(f"lecture refusee -- {err}")
    for ligne in lignes:
        if ligne.pop("ro") != "on":
            stop("la lecture ne s'est pas faite en read only.")
    return lignes


def ecrire(instructions, titre):
    """Tout ou rien : une seule transaction pour l'ensemble de la couche.

    Une couche de securite posee a moitie serait le pire des cas -- certaines
    tables gardees, d'autres non, sans qu'on sache lesquelles. Le `commit`
    est sur sa propre ligne (piege connu de l'API Management).
    """
    corps = "begin;\n" + ";\n".join(instructions) + ";\n" + "commit;\n"
    _, err = _appel(corps)
    if err:
        stop(f"{titre} refuse par la base, transaction annulee --\n  {err}")
    print(f"  {titre} : {len(instructions)} instructions appliquees.")


def titre(texte):
    print("\n" + "=" * 74 + f"\n{texte}\n" + "=" * 74)


# ---------------------------------------------------------------------
# GARDE-FOUS
# ---------------------------------------------------------------------
print(f"cible : {'ENVIRONNEMENT DE TEST' if SUR_TEST else 'PRODUCTION'} "
      f"-- projet {PROJET}")
print(f"mode  : {'RETOUR ARRIERE' if RETOUR else 'POSE DE LA COUCHE'}"
      f" -- {'EXECUTION REELLE' if GO else 'SIMULATION'}")

temoin = lire("""select count(*) as n from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                  where c.relname = '_environnement_de_test' and n.nspname = 'public'""")[0]["n"]
if SUR_TEST and not temoin:
    stop(f"OMNES_CIBLE=test mais le projet {PROJET} n'a pas la table temoin "
         "`public._environnement_de_test` posee par 23-18.\n"
         "Ce n'est pas l'environnement de test : on n'y ecrit pas.")
if not SUR_TEST and temoin:
    stop(f"le projet {PROJET} porte la table temoin de l'environnement de "
         "test alors que la cible est la PRODUCTION. Incoherence.")

if GO and not SUR_TEST:
    # Regle du projet (8J) : pas d'ecriture en production sans sauvegarde
    # fraiche. On l'exige mecaniquement plutot que de s'en souvenir.
    recentes = sorted(d.name for d in ARCHIVES.glob("20*")
                      if d.is_dir() and not d.name.endswith("-en-cours"))
    if not recentes:
        stop(f"aucune sauvegarde dans {ARCHIVES}.\n"
             "Lancer d'abord : python3 docs/sql/23-16-sauvegarde-orga.py --go")
    derniere = recentes[-1]
    try:
        quand = datetime.strptime(derniere, "%Y-%m-%d-%Hh%M")
    except ValueError:
        stop(f"sauvegarde au nom inattendu : {derniere}")
    age = datetime.now() - quand
    print(f"derniere sauvegarde : {derniere} (il y a {age.days} j "
          f"{age.seconds // 3600} h)")
    if age > timedelta(hours=6):
        stop(f"la derniere sauvegarde date de {derniere}, soit plus de 6 h.\n"
             "Lancer d'abord : python3 docs/sql/23-16-sauvegarde-orga.py --go")

# ---------------------------------------------------------------------
# LES TABLES A COUVRIR -- lues dans le catalogue, jamais recopiees de memoire
# ---------------------------------------------------------------------
tables = [r["tab"] for r in lire("""
    select c.relname as tab
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       and c.relname <> '_environnement_de_test'
     order by c.relname
""")]
titre(f"TABLES DE public AVEC RLS : {len(tables)}")
print("  " + ", ".join(tables))

deja = lire(f"""
    select tablename as tab, policyname as nom from pg_policies
     where schemaname = 'public' and policyname like '{PREFIXE}%'
     order by tablename, policyname
""")
print(f"\npolicies '{PREFIXE}*' deja en place : {len(deja)}")

# ---------------------------------------------------------------------
# CE QU'ON VA EXECUTER
# ---------------------------------------------------------------------
FONCTION = """create or replace function public.est_actif()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  -- Meme forme que agenda.peut_acceder() : le sous-select sur auth.uid()
  -- permet a Postgres de ne l'evaluer qu'une fois par requete.
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid())
       and actif
  );
$fn$"""


def instructions_pose():
    """La fonction, puis une policy restrictive par table."""
    inst = [FONCTION,
            "grant execute on function public.est_actif() to authenticated"]
    for tab in tables:
        if tab == "profiles":
            # Lecture : on laisse toujours passer sa propre fiche, sans quoi
            # l'appli reste bloquee en chargement (voir l'entete).
            inst.append(
                f'create policy "{PREFIXE}_lecture" on public.profiles '
                "as restrictive for select to authenticated "
                "using (public.est_actif() or id = (select auth.uid()))")
            inst.append(
                f'create policy "{PREFIXE}_modif" on public.profiles '
                "as restrictive for update to authenticated "
                "using (public.est_actif()) with check (public.est_actif())")
            inst.append(
                f'create policy "{PREFIXE}_suppr" on public.profiles '
                "as restrictive for delete to authenticated "
                "using (public.est_actif())")
        else:
            inst.append(
                f'create policy "{PREFIXE}" on public.{tab} '
                "as restrictive for all to authenticated "
                "using (public.est_actif()) with check (public.est_actif())")
    return inst


def instructions_retour():
    """On ne supprime QUE ce que ce script a pose, nomme par nomme."""
    inst = [f'drop policy if exists "{p["nom"]}" on public.{p["tab"]}'
            for p in deja]
    inst.append("drop function if exists public.est_actif()")
    return inst


instructions = instructions_retour() if RETOUR else instructions_pose()

titre("INSTRUCTIONS" + ("" if GO else " (SIMULATION -- rien ne sera execute)"))
for i, ins in enumerate(instructions, 1):
    apercu = " ".join(ins.split())
    print(f"  {i:3}. {apercu[:150]}" + ("..." if len(apercu) > 150 else ""))

if not RETOUR and deja:
    stop(f"{len(deja)} policies '{PREFIXE}*' sont deja en place sur {PROJET}.\n"
         "Pour les refaire : --retour-arriere --go, puis --go.")
if RETOUR and not deja:
    print("\n  rien a retirer : la couche n'est pas en place.")

# ---------------------------------------------------------------------
# EXECUTION
# ---------------------------------------------------------------------
if not GO:
    titre("SIMULATION TERMINEE")
    print("  Rien n'a ete ecrit. Relancer avec --go pour executer.")
    raise SystemExit(0)

if instructions:
    titre("EXECUTION")
    ecrire(instructions, "retour arriere" if RETOUR else "pose de la couche")

# ---------------------------------------------------------------------
# VERIFICATION D'APRES -- relue en base, pas deduite de ce qu'on a envoye
# ---------------------------------------------------------------------
titre("VERIFICATION (relue en base)")
apres = lire(f"""
    select tablename as tab, policyname as nom, cmd, permissive
      from pg_policies
     where schemaname = 'public' and policyname like '{PREFIXE}%'
     order by tablename, policyname
""")
fonction = lire("""select count(*) as n from pg_proc p
                     join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'est_actif'""")[0]["n"]
total = lire("""select count(*) as n from pg_policies
                 where schemaname = 'public'""")[0]["n"]
permissives = lire("""select count(*) as n from pg_policies
                       where schemaname = 'public' and permissive = 'PERMISSIVE'""")[0]["n"]

print(f"  fonction public.est_actif()      : {'presente' if fonction else 'absente'}")
print(f"  policies '{PREFIXE}*'      : {len(apres)}")
print(f"  policies de public au total      : {total}")
print(f"  dont PERMISSIVE (les 99 d'avant) : {permissives}")

couvertes = {p["tab"] for p in apres}
manquantes = [t for t in tables if t not in couvertes]

if RETOUR:
    if apres or fonction:
        stop("le retour arriere n'a pas tout retire.")
    if permissives != 99:
        print(f"  ATTENTION : {permissives} policies permissives, 99 attendues.")
    print("\n  RETOUR ARRIERE COMPLET : la couche a disparu, les policies "
          "d'origine sont intactes.")
else:
    if manquantes:
        stop("tables restees sans couche : " + ", ".join(manquantes))
    if not fonction:
        stop("la fonction est_actif() n'a pas ete creee.")
    if permissives != 99:
        print(f"  ATTENTION : {permissives} policies permissives, 99 attendues.")
    print(f"\n  COUCHE POSEE : les {len(tables)} tables de public exigent "
          "desormais un compte actif.")
    print("  Retour arriere : --retour-arriere --go (quelques secondes).")

print("\n(termine)")
