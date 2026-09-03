#!/usr/bin/env python3
"""Transfert des mots de passe vers Orga, depuis Bolt.

    python3 docs/sql/22-8C-1-transfert-mots-de-passe.py        # simulation
    python3 docs/sql/22-8C-1-transfert-mots-de-passe.py --go   # execute

A lancer DEPUIS LA RACINE du depot.

LE PROBLEME
Les 26 remplacants ont un compte Bolt qu'ils utilisent depuis des mois
(connexions du 16/12/2025 au 18/08/2026). 7B-2 leur a cree un compte Orga
avec un mot de passe ALEATOIRE, jamais conserve : en l'etat, aucun d'eux
ne peut se connecter a la nouvelle appli. Le plan initial prevoyait 26
courriels de reinitialisation le soir de la bascule -- avec la certitude
que quelques-uns ne les traiteraient pas, et appelleraient.

CE QUE FAIT CE SCRIPT
Il recopie l'empreinte du mot de passe de Bolt vers Orga. Le remplacant
se connecte a la nouvelle appli avec le mot de passe qu'il connait deja,
sans rien faire.

POURQUOI C'EST POSSIBLE
Supabase ne stocke jamais un mot de passe, mais une empreinte bcrypt.
Cette empreinte est AUTOPORTANTE : la chaine « $2a$10$... » contient
l'algorithme, son cout, le sel et le condense. Aucune cle secrete propre
au projet n'entre dans le calcul. Recopier la chaine d'un projet a
l'autre suffit donc pour que le meme mot de passe continue d'ouvrir.
Verifie le 31/08/2026 : les 26 comptes Bolt sont en $2a$10$, format
standard de GoTrue, identique des deux cotes.

Consequence a garder en tete : le mot de passe transite sans jamais etre
connu, ni de ce script, ni de personne. Aucune empreinte n'est affichee.

CE QU'IL TRANSFERE, ET RIEN D'AUTRE
    encrypted_password   l'empreinte, telle quelle
    email_confirmed_at   la date de confirmation REELLE cote Bolt

email_confirmed_at est indispensable : Supabase refuse la connexion d'un
compte non confirme, et les comptes de 7B-2 ont ete crees avec
email_confirm=false. Sans cette colonne, le transfert du mot de passe ne
servirait a rien -- la connexion echouerait quand meme, avec un message
qui ne dit pas pourquoi.

On n'ecrit PAS confirmed_at : c'est une colonne generee par Postgres
(least(email_confirmed_at, phone_confirmed_at)), toute ecriture directe
est refusee.

CE QU'IL NE FAIT PAS
    profiles.actif   reste a false pour les 26. C'est la porte de l'appli,
                     distincte de celle de Supabase. Tant qu'elle est
                     fermee, ce script n'ouvre l'acces a personne -- c'est
                     ce qui permet de le jouer AVANT le soir de la bascule.
    les associes     ils ont deja leur compte Orga et s'en servent (voir
                     INCLUS_EN_PLUS pour la seule exception, et pourquoi).
    toute suppression ce script ne fait que des UPDATE, sur des lignes
                     nommees. Il ne cree ni ne supprime aucun compte.

SUR LA SECURITE, PUISQUE LA QUESTION SE POSE
On ecrase cote Orga un mot de passe aleatoire que PERSONNE ne possede :
l'operation ne peut retirer l'acces a quiconque. En revanche elle etend
la portee du mot de passe choisi pour Bolt -- outil de planning -- a
toute l'appli du cabinet. D'ou le controle 3 ci-dessous (aucun compte
Orga deja utilise) et la recommandation d'inviter au changement de mot
de passe dans l'annonce de bascule.
"""
import base64
import csv
import json
import pathlib
import subprocess
import sys
import urllib.request

PLANNING = "kldgvjxuojeeqhdrmaia"
ORGA = "ydihrgnixthrraprclox"
GO = "--go" in sys.argv
RACINE = pathlib.Path(__file__).resolve().parents[1]
MAPPING = RACINE / "mapping-comptes-agenda.csv"

# Comptes HORS des 26 remplacants, a inclure NOMMEMENT dans le transfert.
#
# POURQUOI UNE LISTE NOMMEE PLUTOT QU'UN FILTRE ELARGI.
# Elargir le filtre a ASSOCIE_MAPPE embarquerait les 9 autres associes, qui
# se servent de leur compte Orga tous les jours (connexions relevees de juin
# a aout 2026). Leur ecraser leur mot de passe par celui de Bolt leur
# RETIRERAIT l'acces a l'appli qu'ils utilisent -- au profit d'un mot de
# passe qu'ils associent a l'autre outil. Une liste nommee rend cette erreur
# impossible a commettre par inadvertance.
#
# Dr Imane EL GARI, relevee le 31/08/2026 : associee, active sur Bolt
# (derniere connexion le 31/07/2026), JAMAIS connectee a Orga. Son compte
# Orga existe, est actif et confirme, et porte un mot de passe -- qu'elle
# n'a jamais utilise. Sans cette ligne, elle serait la seule personne du
# cabinet sans acces le soir de la bascule. Meme adresse des deux cotes, et
# son mot de passe Orga n'etant possede par personne, le controle 3
# (« aucun compte deja utilise ») s'applique a elle comme aux 26.
INCLUS_EN_PLUS = ["imane.elgari@hotmail.com"]

_raw = subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]).decode().strip()
_TOK = base64.b64decode(_raw.removeprefix("go-keyring-base64:")).decode().strip()


def sql(ref, requete):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": requete}).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {_TOK}")
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
    return "'" + str(v).replace("'", "''") + "'"


def stop(msg):
    sys.exit(f"\nARRET : {msg}")


print("=== TRANSFERT DES MOTS DE PASSE DES REMPLACANTS (Bolt -> Orga) ===")
print("mode :", "EXECUTION REELLE" if GO else "simulation (ajouter --go pour executer)")

# ------------------------------------------------ 1. les 26 comptes vises
# La liste vient du mapping de 7B-1, pas d'une requete « tous les comptes
# inactifs » : il y a aussi un compte fictif d'essai (dr.dupont@fictif.local)
# parmi les inactifs cote Orga, et il n'a rien a faire ici.
toutes = list(csv.DictReader(open(MAPPING, encoding="utf-8")))
lignes = [r for r in toutes if r["statut"] == "REMPLACANT_A_CREER"]
emails = sorted({r["email_planning"].strip().lower() for r in lignes})
if len(emails) != len(lignes):
    stop(f"{len(lignes)} lignes REMPLACANT_A_CREER mais {len(emails)} emails "
         "distincts -- doublon dans le mapping, a corriger avant d'ecrire")

# Les ajouts nommes sont verifies contre le mapping, jamais crus sur parole :
# une adresse mal recopiee ici viserait un compte qui n'existe pas -- ou, pire,
# un autre compte. On exige donc qu'elle soit connue du mapping ET que les deux
# projets la portent a l'identique, l'appariement se faisant par l'adresse.
en_plus = []
for e in (x.strip().lower() for x in INCLUS_EN_PLUS):
    ligne = next((r for r in toutes if r["email_planning"].strip().lower() == e), None)
    if ligne is None:
        stop(f"INCLUS_EN_PLUS : « {e} » est inconnu du mapping")
    if ligne["statut"] == "REMPLACANT_A_CREER":
        stop(f"INCLUS_EN_PLUS : « {e} » est deja dans les 26, a retirer de la liste")
    orga = ligne["email_orga"].strip().lower()
    if orga and orga != e:
        stop(f"INCLUS_EN_PLUS : « {e} » a une autre adresse cote Orga "
             f"(« {orga} ») -- l'appariement par adresse ne peut pas fonctionner")
    if e in emails:
        stop(f"INCLUS_EN_PLUS : « {e} » en double")
    en_plus.append((e, ligne["full_name"]))
    emails.append(e)

emails = sorted(emails)
liste = ", ".join(lit(e) for e in emails)
print(f"\n  {len(lignes)} remplacants vises (statut REMPLACANT_A_CREER du mapping)")
for e, qui in en_plus:
    print(f"  + {qui} ({e}) -- ajout nomme, voir INCLUS_EN_PLUS")
print(f"  = {len(emails)} comptes au total")

# ------------------------------------------------ 2. controles cote Bolt
# On refuse de partir si UN SEUL compte source est douteux : un transfert
# partiel serait pire que pas de transfert du tout -- il laisserait
# quelques remplacants bloques sans qu'on sache lesquels le soir J.
src, err = sql(PLANNING, f"""
    select lower(email) email, encrypted_password, email_confirmed_at,
           last_sign_in_at is not null as deja_connecte
      from auth.users
     where lower(email) in ({liste});""")
if err:
    stop(f"lecture des comptes Bolt : {err}")

par_email = {}
for r in src:
    par_email.setdefault(r["email"], []).append(r)

absents = [e for e in emails if e not in par_email]
doublons = [e for e, v in par_email.items() if len(v) > 1]
sans_mdp = [e for e, v in par_email.items() if not v[0]["encrypted_password"]]
non_bcrypt = [e for e, v in par_email.items()
              if v[0]["encrypted_password"]
              and not v[0]["encrypted_password"].startswith("$2")]
non_confirmes = [e for e, v in par_email.items() if not v[0]["email_confirmed_at"]]

print("\n  --- cote Bolt (source) ---")
print(f"  {len(par_email):>5}  comptes retrouves sur {len(emails)}")
print(f"  {len(sans_mdp):>5}  sans mot de passe")
print(f"  {len(non_bcrypt):>5}  dans un format autre que bcrypt")
print(f"  {len(non_confirmes):>5}  dont l'email n'est pas confirme")
print(f"  {sum(1 for v in par_email.values() if v[0]['deja_connecte']):>5}  "
      "s'etant deja connectes au moins une fois")

for libelle, lot in (("absents de Bolt", absents),
                     ("en double dans Bolt", doublons),
                     ("sans mot de passe", sans_mdp),
                     ("dans un format non bcrypt", non_bcrypt)):
    if lot:
        print(f"\n  Comptes {libelle} :")
        for e in lot[:10]:
            print(f"    - {e}")
        stop(f"{len(lot)} compte(s) {libelle}. Rien n'a ete ecrit.")

# Non bloquant : un compte non confirme cote Bolt le restera cote Orga, et
# son proprietaire ne pourra pas se connecter. Autant le nommer maintenant.
if non_confirmes:
    print("\n  ⚠ Non confirmes cote Bolt, donc toujours bloques apres transfert :")
    for e in non_confirmes:
        print(f"    - {e}")

# ------------------------------------------------ 3. controles cote Orga
# Le controle qui compte : aucun de ces comptes ne doit avoir servi. Un
# last_sign_in_at renseigne signifierait que quelqu'un possede deja un mot
# de passe pour ce compte -- et l'ecraser le lui retirerait sans preavis.
cible, err = sql(ORGA, f"""
    select lower(u.email) email, u.id,
           u.last_sign_in_at is not null as deja_connecte,
           u.banned_until is not null    as banni,
           u.email_confirmed_at is not null as deja_confirme,
           p.actif,
           exists (select 1 from auth.identities i
                    where i.user_id = u.id and i.provider = 'email') as a_identite
      from auth.users u
      left join profiles p on p.id = u.id
     where lower(u.email) in ({liste});""")
if err:
    stop(f"lecture des comptes Orga : {err}")

cible_par_email = {r["email"]: r for r in cible}
manquants = [e for e in emails if e not in cible_par_email]
utilises = [r["email"] for r in cible if r["deja_connecte"]]
bannis = [r["email"] for r in cible if r["banni"]]
sans_identite = [r["email"] for r in cible if not r["a_identite"]]
sans_profil = [r["email"] for r in cible if r["actif"] is None]
deja_actifs = [r["email"] for r in cible if r["actif"]]

print("\n  --- cote Orga (cible) ---")
print(f"  {len(cible_par_email):>5}  comptes retrouves sur {len(emails)}")
print(f"  {len(utilises):>5}  s'etant deja connectes")
print(f"  {len(bannis):>5}  bannis")
print(f"  {len(sans_identite):>5}  sans ligne auth.identities (provider email)")
print(f"  {len(deja_actifs):>5}  dont le profil est deja actif")

for libelle, lot in (
        ("absents de Orga -- les creer d'abord, cf. 7B-2", manquants),
        ("deja utilises : ecraser leur mot de passe couperait l'acces", utilises),
        ("bannis", bannis),
        # Sans cette ligne, Supabase ne propose meme pas la connexion par mot
        # de passe : le compte existe, l'empreinte est bonne, et la connexion
        # echoue quand meme. C'est le piege silencieux de ce genre de bascule.
        ("sans ligne d'identite : la connexion par mot de passe echouerait",
         sans_identite),
        ("sans profil dans public.profiles", sans_profil)):
    if lot:
        print(f"\n  Comptes {libelle} :")
        for e in lot[:10]:
            print(f"    - {e}")
        stop(f"{len(lot)} compte(s) {libelle}. Rien n'a ete ecrit.")

if deja_actifs:
    print("\n  ⚠ Profils deja actifs -- le transfert leur ouvre l'appli"
          " IMMEDIATEMENT, sans attendre le soir de la bascule :")
    for e in deja_actifs:
        print(f"    - {e}")

# ------------------------------------------------ 4. le differentiel
# Idempotence : une empreinte deja identique n'est pas reecrite. Rejouer le
# script une seconde fois ne doit rien faire -- et le dire.
courant, err = sql(ORGA, f"""
    select lower(email) email, encrypted_password, email_confirmed_at
      from auth.users where lower(email) in ({liste});""")
if err:
    stop(f"lecture des empreintes Orga : {err}")
courant_par_email = {r["email"]: r for r in courant}

a_ecrire = []
for e in emails:
    source = par_email[e][0]
    actuel = courant_par_email[e]
    meme_mdp = actuel["encrypted_password"] == source["encrypted_password"]
    meme_conf = bool(actuel["email_confirmed_at"]) == bool(source["email_confirmed_at"])
    if not (meme_mdp and meme_conf):
        a_ecrire.append((e, source))

print(f"\n  a transferer : {len(a_ecrire)}")
print(f"  deja a jour  : {len(emails) - len(a_ecrire)}")

if not a_ecrire:
    print(f"\nRien a faire : les {len(emails)} empreintes sont deja en place.")
    sys.exit(0)

if not GO:
    print("\n[simulation] rien n'a ete ecrit. Ajouter --go pour executer.")
    sys.exit(0)

# ------------------------------------------------ 5. ecriture
# 26 lignes : une seule instruction suffit, pas de lot. Les empreintes ne
# contiennent que [./A-Za-z0-9$] -- lit() protege quand meme les quotes,
# par principe et non par necessite.
print("\nEcriture...")
vals = ",\n".join(
    "(" + ", ".join((lit(e), lit(s["encrypted_password"]),
                     lit(s["email_confirmed_at"]))) + ")"
    for e, s in a_ecrire)
_, err = sql(ORGA, f"""
    update auth.users cible
       set encrypted_password = v.mdp,
           email_confirmed_at = v.confirme::timestamptz,
           updated_at = now()
      from (values\n{vals}\n) as v(email, mdp, confirme)
     where lower(cible.email) = v.email;""")
if err:
    stop(f"transfert : {err}")
print(f"  {len(a_ecrire)} comptes mis a jour")

# ------------------------------------------------ 6. verification
# On ne fait pas confiance au nombre de lignes annonce : on relit les deux
# cotes et on compare. Aucune empreinte n'est affichee, seulement le compte
# de celles qui concordent.
apres, err = sql(ORGA, f"""
    select lower(email) email, encrypted_password,
           email_confirmed_at is not null as confirme
      from auth.users where lower(email) in ({liste});""")
if err:
    stop(f"verification : {err}")

concordent = sum(1 for r in apres
                 if r["encrypted_password"] == par_email[r["email"]][0]["encrypted_password"])
confirmes = sum(1 for r in apres if r["confirme"])
print(f"\n  empreintes identiques a Bolt : {concordent} / {len(emails)}")
print(f"  emails confirmes             : {confirmes} / {len(emails)}")
if concordent != len(emails) or confirmes != len(emails):
    stop("le compte final ne correspond pas -- verifier a la main avant la bascule")

print("\nTermine.")
print("\nCE QUI RESTE A FAIRE, ET QUE CE SCRIPT NE FAIT PAS :")
print("  1. Une VRAIE connexion de test sur un compte dont tu connais le mot")
print("     de passe. Compter des lignes ne prouve pas qu'on peut se")
print("     connecter -- c'est la seule preuve qui vaut.")
print("  2. profiles.actif reste a false : personne n'entre encore.")
print("  3. Inviter au changement de mot de passe dans l'annonce de bascule")
print("     (le mot de passe de Bolt ouvre desormais toute l'appli).")
