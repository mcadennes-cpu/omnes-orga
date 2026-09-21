#!/usr/bin/env python3
"""Sortie de beta du module Planning : le ROLE decide, plus le drapeau.

    OMNES_CIBLE=test python3 docs/sql/23-25-agenda-sortie-de-beta.py       # simulation
    OMNES_CIBLE=test python3 docs/sql/23-25-agenda-sortie-de-beta.py --go  # remplace
    OMNES_CIBLE=test python3 docs/sql/23-25-agenda-sortie-de-beta.py --retour-arriere --go
    python3 docs/sql/23-25-agenda-sortie-de-beta.py --go                   # PRODUCTION

A lancer DEPUIS LA RACINE du depot. SIMULATION PAR DEFAUT : sans --go, le
script affiche mot pour mot ce qu'il executerait, et ne touche a rien.

CE QU'ON CORRIGE
Le module Planning est ouvert a tout le cabinet depuis le 17/09/2026, mais
l'acces passe toujours par `profiles.agenda_beta_access`, le drapeau de la
phase beta (juillet). Deux fonctions le lisent, et les 51 policies du schema
`agenda` passent toutes par l'une des deux :
    agenda.peut_acceder()      -> 11 policies
    agenda.est_coordinateur()  -> 41 policies
    ni l'une ni l'autre        ->  0 policy     (mesure du 21/09/2026)
Ce drapeau n'est donc PAS le « confort d'interface » annonce par 22-2A en
juillet : depuis 7C-3, c'est la vraie barriere de donnees du module.

POURQUOI C'EST UN DOUBLON, ET NON UNE REGLE
Depuis 23-14 (etape 8I, 17/09), le declencheur `designer_agenda_selon_role`
remplit lui-meme le drapeau A PARTIR DU ROLE, a la creation du compte et a
chaque changement de role :
    remplacant, associe, associe_gerant, super_admin -> drapeau = true
    poste_bureau, et tout autre role                 -> drapeau = false
La regle « le role decide » est donc deja ecrite -- mais en amont, dans une
colonne recopiee, au lieu d'etre lue au moment de decider. On supprime
l'intermediaire : les deux fonctions liront le role directement.

L'EQUIVALENCE EST MESUREE, PAS PARIEE (etat du 21/09/2026, 41 fiches)
    role            actif  bloque  drapeau  fiches
    super_admin      oui     non    true      2
    associe_gerant   oui     non    true      3
    associe          oui     non    true      5
    associe          non     oui    false     1
    remplacant       oui     non    true     23
    remplacant       non     oui    false     6
    poste_bureau     oui     non    FALSE     1
Le drapeau vaut exactement « role medecin ». Zero divergence. Le controle
DIVERGENCES ci-dessous le reverifie en base avant d'ecrire quoi que ce soit,
et s'arrete s'il trouve le moindre ecart : l'equivalence n'est pas supposee.

LE PIEGE : REMPLACER LA LIGNE, JAMAIS LA SUPPRIMER
Le commentaire laisse dans peut_acceder() dit « retirer la ligne ci-dessous
pour ouvrir a tous ». Au pied de la lettre, cela donnerait l'acces complet
aux donnees du planning au compte `poste_bureau` -- la borne partagee du
cabinet, active, aujourd'hui seule tenue a l'ecart par le drapeau. On remplace
donc la condition par une LISTE BLANCHE de roles, alignee sur les
`allowedRoles` de la tuile Planning (src/lib/modules.js) : un role ajoute plus
tard n'aura RIEN par defaut, il faudra l'inscrire ici explicitement. C'est
l'oubli qui ferme, pas celui qui ouvre.

CE QUE CA NE FAIT PAS
  . aucune ligne de donnees n'est lue, modifiee ni supprimee ;
  . les 51 policies du schema `agenda` ne sont pas touchees (verifie apres) ;
  . la colonne profiles.agenda_beta_access N'EST PAS supprimee : plus
    personne ne la lit pour decider, mais elle reste en base et le
    declencheur 23-14 continue de la remplir. Raison : six scripts de
    docs/sql la lisent (dont les suites de test et 23-12), et un DROP COLUMN
    serait irreversible. Sa suppression est un chantier a part.
  . le declencheur 23-14 n'est pas touche ;
  . rien du schema `public` ni de `storage` (chantier D, 23-21 / 23-24).

RETOUR ARRIERE
`--retour-arriere --go` restaure le corps des deux fonctions AU CARACTERE
PRES : les textes d'avant sont portes en dur ci-dessous, et leur empreinte
md5 a ete relevee en base le 21/09/2026 avant toute modification
(peut_acceder a06572b0..., est_coordinateur 0ff87d6a...). Le script refuse
d'ecrire si ce qu'il trouve en base ne correspond pas a ce qu'il croit
remplacer, et revalide l'empreinte apres coup.
"""
import base64
import hashlib
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

#: Les roles qui ouvrent le Planning. Copie conforme des `allowedRoles` de
#: l'entree `agenda` dans src/lib/modules.js. L'enum public.user_role compte
#: cinq valeurs : les quatre ci-dessous, plus `poste_bureau`, exclu.
ROLES_PLANNING = ("super_admin", "associe_gerant", "associe", "remplacant")
LISTE_SQL = ", ".join(f"'{r}'" for r in ROLES_PLANNING)

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


def ecrire(instructions, quoi):
    """Tout ou rien : les deux fonctions changent ensemble ou pas du tout.

    Une seule des deux remplacee serait le pire des cas : `peut_acceder()`
    ouvrirait a tous les roles medecins pendant que `est_coordinateur()`
    exigerait encore le drapeau, ou l'inverse. Le `commit` est sur sa propre
    ligne (piege connu de l'API Management).
    """
    corps = "begin;\n" + ";\n".join(instructions) + ";\n" + "commit;\n"
    _, err = _appel(corps)
    if err:
        stop(f"{quoi} refuse par la base, transaction annulee --\n  {err}")
    print(f"  {quoi} : {len(instructions)} instructions appliquees.")


def titre(texte):
    print("\n" + "=" * 74 + f"\n{texte}\n" + "=" * 74)


# ---------------------------------------------------------------------
# LES CORPS DE FONCTION, AVANT ET APRES
#
# Seul le CORPS change. La signature, `stable`, `security definer` et
# `set search_path to 'public'` restent identiques, et `create or replace`
# conserve les privileges (le grant a `authenticated` est revalide apres).
# ---------------------------------------------------------------------
AVANT = {
    "peut_acceder": """
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid())
       and actif
       -- PHASE BETA : retirer la ligne ci-dessous pour ouvrir a tous.
       and agenda_beta_access
  );
""",
    "est_coordinateur": """
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid())
       and actif
       and agenda_beta_access
       and is_agenda_coordinator
  );
""",
}

APRES = {
    "peut_acceder": f"""
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid())
       and actif
       -- Sortie de beta (23-25) : le role decide, plus le drapeau.
       -- Liste blanche alignee sur les allowedRoles de src/lib/modules.js :
       -- un role ajoute plus tard n'a rien par defaut. poste_bureau exclu.
       and role in ({LISTE_SQL})
  );
""",
    "est_coordinateur": f"""
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid())
       and actif
       and role in ({LISTE_SQL})
       and is_agenda_coordinator
  );
""",
}

COMMENTAIRES = {
    "peut_acceder":
        "Acces au module Planning : compte actif et role medecin "
        "(super_admin, associe_gerant, associe, remplacant). Le poste de "
        "bureau est exclu. Remplace le drapeau agenda_beta_access le "
        "21/09/2026 (23-25) ; la liste doit rester alignee sur les "
        "allowedRoles de src/lib/modules.js.",
    "est_coordinateur":
        "Coordinateur du Planning. Designation explicite : le role "
        "applicatif ne peut pas la deriver (Matthieu et Charlotte sont tous "
        "deux super_admin, une seule est coordinatrice). La liste blanche "
        "des roles est reprise de peut_acceder() par coherence.",
}

SIGNATURE = ("create or replace function agenda.{nom}()\n"
             "returns boolean\n"
             "language sql\n"
             "stable\n"
             "security definer\n"
             "set search_path to 'public'\n"
             "as $fn${corps}$fn$")


def empreinte(texte):
    return hashlib.md5(texte.encode()).hexdigest()


# ---------------------------------------------------------------------
# GARDE-FOUS
# ---------------------------------------------------------------------
print(f"cible : {'ENVIRONNEMENT DE TEST' if SUR_TEST else 'PRODUCTION'} "
      f"-- projet {PROJET}")
print(f"mode  : {'RETOUR ARRIERE' if RETOUR else 'SORTIE DE BETA'}"
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
# ETAT DE DEPART -- relu en base, jamais deduit
# ---------------------------------------------------------------------
attendu = APRES if RETOUR else AVANT
vise = AVANT if RETOUR else APRES

etat = {r["proname"]: r for r in lire("""
    select p.proname, p.prosrc,
           has_function_privilege('authenticated', p.oid, 'execute') as grant_auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'agenda'
       and p.proname in ('peut_acceder', 'est_coordinateur')
""")}

titre("ETAT DE DEPART DES DEUX FONCTIONS")
for nom in ("peut_acceder", "est_coordinateur"):
    if nom not in etat:
        stop(f"la fonction agenda.{nom}() est introuvable sur {PROJET}.")
    trouve = empreinte(etat[nom]["prosrc"])
    voulu = empreinte(attendu[nom])
    conforme = trouve == voulu
    deja_fait = trouve == empreinte(vise[nom])
    print(f"  agenda.{nom}() : md5 {trouve} -- "
          + ("conforme" if conforme else
             "deja a l'etat vise" if deja_fait else "INATTENDU"))
    if not conforme:
        if deja_fait:
            stop("les deux fonctions sont deja dans l'etat que ce script "
                 "veut poser.\n"
                 + ("Rien a faire : elles portent deja leur corps d'origine."
                    if RETOUR else
                    "La sortie de beta est deja faite. Pour la defaire :\n"
                    "  --retour-arriere --go"))
        stop(f"agenda.{nom}() ne contient pas le corps attendu (md5 {voulu}).\n"
             "Quelqu'un l'a modifiee depuis la mesure du 21/09/2026 : le\n"
             "retour arriere de ce script restaurerait une version perimee.\n"
             "Corps trouve en base :\n" + etat[nom]["prosrc"])
    if not etat[nom]["grant_auth"]:
        stop(f"agenda.{nom}() n'est pas executable par `authenticated` : "
             "etat inattendu, on ne touche a rien.")

# ---------------------------------------------------------------------
# DIVERGENCES -- l'equivalence drapeau / role, reverifiee en base
#
# Sur les comptes ACTIFS seuls : les deux fonctions testent `actif` avant
# tout, un compte inactif est refuse des deux cotes quoi qu'il arrive.
# ---------------------------------------------------------------------
divergences = lire(f"""
    select p.prenom, p.nom, p.role::text as role,
           p.agenda_beta_access as drapeau
      from public.profiles p
     where p.actif
       and p.agenda_beta_access
           is distinct from (p.role in ({LISTE_SQL}))
     order by p.role::text, p.nom
""")
titre(f"DIVERGENCES DRAPEAU / ROLE (comptes actifs) : {len(divergences)}")
if divergences:
    for d in divergences:
        print(f"  {d['prenom']} {d['nom']} -- role {d['role']}, "
              f"drapeau {d['drapeau']}")
    stop("le drapeau et le role ne disent PAS la meme chose pour les comptes\n"
         "ci-dessus. Remplacer l'un par l'autre changerait leur acces au\n"
         "Planning -- ce script ne fait que retirer un doublon, il ne prend\n"
         "pas cette decision. A trancher fiche par fiche d'abord.")
print("  aucune : le drapeau vaut exactement « role medecin ».")

repartition = lire(f"""
    select p.role::text as role, p.actif,
           count(*) as fiches,
           count(*) filter (where p.agenda_beta_access) as avec_drapeau,
           count(*) filter (where p.role in ({LISTE_SQL})) as role_planning
      from public.profiles p
     group by 1, 2
     order by 1, 2
""")
print("\n  role             actif  fiches  drapeau  role_planning")
for r in repartition:
    print(f"  {r['role']:<16} {str(r['actif']):<6} {r['fiches']:>6}"
          f" {r['avec_drapeau']:>8} {r['role_planning']:>14}")

# ---------------------------------------------------------------------
# CE QU'ON VA EXECUTER
# ---------------------------------------------------------------------
instructions = []
for nom in ("peut_acceder", "est_coordinateur"):
    instructions.append(SIGNATURE.format(nom=nom, corps=vise[nom]))
    commentaire = (COMMENTAIRES[nom] if not RETOUR else
                   "Acces au module Agenda : compte actif + acces beta."
                   if nom == "peut_acceder" else
                   "Coordinateur de l'agenda. Designation explicite : le role "
                   "applicatif ne peut pas la deriver (Matthieu et Charlotte "
                   "sont tous deux super_admin, une seule est coordinatrice).")
    instructions.append(
        f"comment on function agenda.{nom}() is "
        "'" + commentaire.replace("'", "''") + "'")

titre("INSTRUCTIONS" + ("" if GO else " (SIMULATION -- rien ne sera execute)"))
for i, ins in enumerate(instructions, 1):
    print(f"  --- {i}/{len(instructions)} " + "-" * 50)
    for ligne in ins.splitlines():
        print("      " + ligne)

if not GO:
    titre("SIMULATION TERMINEE")
    print("  Rien n'a ete ecrit. Relancer avec --go pour executer.")
    raise SystemExit(0)

# ---------------------------------------------------------------------
# EXECUTION
# ---------------------------------------------------------------------
titre("EXECUTION")
ecrire(instructions, "retour arriere" if RETOUR else "sortie de beta")

# ---------------------------------------------------------------------
# VERIFICATION D'APRES -- relue en base, pas deduite de ce qu'on a envoye
# ---------------------------------------------------------------------
titre("VERIFICATION (relue en base)")
final = {r["proname"]: r for r in lire("""
    select p.proname, p.prosrc,
           has_function_privilege('authenticated', p.oid, 'execute') as grant_auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'agenda'
       and p.proname in ('peut_acceder', 'est_coordinateur')
""")}
for nom in ("peut_acceder", "est_coordinateur"):
    trouve = empreinte(final[nom]["prosrc"])
    voulu = empreinte(vise[nom])
    if trouve != voulu:
        stop(f"agenda.{nom}() n'a pas le corps attendu apres ecriture "
             f"(md5 {trouve}, attendu {voulu}).")
    if not final[nom]["grant_auth"]:
        stop(f"agenda.{nom}() n'est plus executable par `authenticated`.")
    # On cherche la CONDITION, pas la mention : un commentaire qui cite le
    # nom de la colonne ne doit pas faire croire qu'elle est encore lue.
    corps = final[nom]["prosrc"]
    lit_drapeau = "and agenda_beta_access" in corps
    lit_role = "and role in (" in corps
    print(f"  agenda.{nom}() : md5 {trouve} conforme, "
          f"grant authenticated OK, decide selon "
          + ("le DRAPEAU" if lit_drapeau else
             "le ROLE" if lit_role else "?? ni l'un ni l'autre"))

# Les policies ne sont pas touchees par ce script : on le prouve plutot que
# de l'affirmer. 51 policies, 0 qui echappe aux deux fonctions (21/09/2026).
pol = lire("""
    select count(*) as total,
           count(*) filter (where (coalesce(qual,'')||coalesce(with_check,''))
                                  ilike '%peut_acceder%')     as via_acces,
           count(*) filter (where (coalesce(qual,'')||coalesce(with_check,''))
                                  ilike '%est_coordinateur%') as via_coord,
           count(*) filter (where (coalesce(qual,'')||coalesce(with_check,''))
                                  not ilike '%peut_acceder%'
                             and (coalesce(qual,'')||coalesce(with_check,''))
                                  not ilike '%est_coordinateur%') as orphelines
      from pg_policies where schemaname = 'agenda'
""")[0]
print(f"\n  policies du schema agenda        : {pol['total']} (51 attendues)")
print(f"  dont via peut_acceder()          : {pol['via_acces']}")
print(f"  dont via est_coordinateur()      : {pol['via_coord']}")
print(f"  n'appelant ni l'une ni l'autre   : {pol['orphelines']}")
if pol["orphelines"]:
    print("  ATTENTION : des policies agenda echappent aux deux fonctions,")
    print("  elles ne sont donc pas gouvernees par ce controle de role.")
if pol["total"] != 51:
    print(f"  ATTENTION : {pol['total']} policies, 51 attendues le 21/09/2026.")

if RETOUR:
    print("\n  RETOUR ARRIERE COMPLET : les deux fonctions ont retrouve leur "
          "corps\n  d'origine au caractere pres, drapeau agenda_beta_access "
          "compris.")
else:
    print(f"\n  SORTIE DE BETA FAITE : l'acces au Planning tient desormais au "
          f"role\n  ({', '.join(ROLES_PLANNING)}), plus au drapeau.")
    print("  Le compte poste_bureau reste exclu, par la liste blanche.")
    print("  Retour arriere : --retour-arriere --go (quelques secondes).")
    print("\n  RESTE A FAIRE cote code : src/pages/Agenda.jsx teste encore")
    print("  profile.agenda_beta_access, et src/lib/modules.js porte encore")
    print("  betaFlag. Tant qu'ils ne sont pas repris, un compte medecin dont")
    print("  le drapeau serait remis a false verrait la base le laisser")
    print("  entrer, mais pas l'interface.")

print("\n(termine)")
