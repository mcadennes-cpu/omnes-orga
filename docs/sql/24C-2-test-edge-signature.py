#!/usr/bin/env python3
"""Essai de bout en bout de l'Edge Function `signature`, SUR LE TEST UNIQUEMENT.

    python3 docs/sql/24C-2-test-edge-signature.py
    python3 docs/sql/24C-2-test-edge-signature.py --garder /chemin/final.pdf

A lancer DEPUIS LA RACINE du depot. Etape 24C/24E.

CE QUE L'ESSAI FAIT, COMME LE FERAIT L'APPLI
  1. donne un mot de passe aleatoire (jamais affiche) a 3 comptes DE TEST :
     un super_admin (createur), un associe_gerant et un remplacant
     (signataires), puis s'y connecte -- de vrais jetons de connexion ;
  2. le super_admin cree un brouillon, ajoute les signataires, depose un PDF,
     puis l'envoie (Edge Function, action `envoyer`) ;
  3. chaque signataire ouvre le document, lit le texte de consentement,
     demande un code ; un code faux est refuse ; le bon code fait signer ;
  4. la derniere signature declenche le scellement : on telecharge le PDF
     final, on recalcule son empreinte, on compte ses pages, et on verifie
     que le journal est intact.

POURQUOI UN CODE POSE A LA MAIN
L'environnement de test n'a pas de cle Resend : le mail du code ne part
pas, et la fonction invalide alors le code (comportement voulu, verifie ici).
L'essai pose ensuite un code connu directement en base de TEST, avec la cle
HMAC de test rangee dans `.env.test` (SIGNATURE_CODE_SECRET_TEST). Tout le
reste passe par le vrai chemin.

ECRITURES : uniquement sur le projet de test (les demandes creees restent,
c'est voulu : elles servent ensuite a regarder les ecrans).
"""
import base64
import hashlib
import hmac
import json
import re
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

TEST = "yjttfdwjbyufpavwxcpy"
if not Path("docs/sql").is_dir():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

ENV = dict(l.split("=", 1) for l in Path(".env.test").read_text().splitlines()
           if "=" in l and not l.startswith("#"))
URL = ENV["VITE_SUPABASE_URL"].strip()
ANON = ENV["VITE_SUPABASE_ANON_KEY"].strip()
SECRET = ENV.get("SIGNATURE_CODE_SECRET_TEST", "").strip()
if TEST not in URL:
    raise SystemExit("ARRET : .env.test ne pointe pas sur le projet de test.")
if len(SECRET) < 32:
    raise SystemExit("ARRET : SIGNATURE_CODE_SECRET_TEST absent de .env.test.")
GARDER = sys.argv[sys.argv.index("--garder") + 1] if "--garder" in sys.argv else None

_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()
ECHECS = []


def http(methode, url, corps=None, entetes=None, brut=False):
    donnees = corps if isinstance(corps, (bytes, type(None))) else json.dumps(corps).encode()
    req = urllib.request.Request(url, data=donnees, method=methode)
    for k, v in (entetes or {}).items():
        req.add_header(k, v)
    req.add_header("User-Agent", "omnes-orga-24C-2/1.0")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            contenu = r.read()
            return r.status, (contenu if brut else (json.loads(contenu) if contenu else None))
    except urllib.error.HTTPError as e:
        contenu = e.read()
        try:
            return e.code, json.loads(contenu)
        except Exception:
            return e.code, contenu.decode()[:300]


def gestion(chemin, corps=None, methode="GET"):
    return http(methode, f"https://api.supabase.com/v1/projects/{TEST}{chemin}", corps,
                {"Authorization": f"Bearer {_TOK}", "Content-Type": "application/json"})[1]


def sql(requete):
    return gestion("/database/query", {"query": requete}, "POST")


def controle(libelle, obtenu, attendu):
    ok = obtenu == attendu
    if not ok:
        ECHECS.append(f"{libelle} : obtenu {obtenu!r}, attendu {attendu!r}")
    print(f"  [{'OK ' if ok else 'ECHEC'}] {libelle:62} {str(obtenu)[:60]}")
    return ok


def pdf_minimal(texte):
    """Un PDF d'une page, ecrit a la main (aucune dependance)."""
    flux = f"BT /F1 18 Tf 72 720 Td ({texte}) Tj ET".encode()
    objets = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(flux)).encode() + b" >>\nstream\n" + flux + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    sortie, positions = b"%PDF-1.4\n", []
    for i, o in enumerate(objets, 1):
        positions.append(len(sortie))
        sortie += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(sortie)
    sortie += f"xref\n0 {len(objets) + 1}\n0000000000 65535 f \n".encode()
    sortie += b"".join(f"{p:010d} 00000 n \n".encode() for p in positions)
    sortie += f"trailer\n<< /Size {len(objets) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return sortie


# ---------------------------------------------------------------------------
print(f"cible : ENVIRONNEMENT DE TEST -- {TEST}")
if not sql("select 1 from pg_class where relname = '_environnement_de_test'"):
    raise SystemExit("ARRET : table temoin absente, ce n'est pas la base de test.")

comptes = sql("""
    select distinct on (p.role) p.role::text as role, p.id::text as id, u.email
      from public.profiles p join auth.users u on u.id = p.id
     where p.actif and p.role in ('super_admin', 'associe_gerant', 'remplacant')
     order by p.role, p.id""")
par_role = {c["role"]: c for c in comptes}
jetons = {}
for role in ("super_admin", "associe_gerant", "remplacant"):
    c = par_role[role]
    mdp = secrets.token_urlsafe(24)
    # 23-19 recharge auth.users sans `aud` ni `instance_id` (colonnes absentes
    # de la sauvegarde) : Supabase Auth ne retrouve alors pas le compte. On
    # complete ces deux champs et on pose le mot de passe, en base de TEST.
    sql(f"""update auth.users
               set aud = 'authenticated',
                   instance_id = '00000000-0000-0000-0000-000000000000',
                   email_confirmed_at = coalesce(email_confirmed_at, now()),
                   encrypted_password = extensions.crypt('{mdp}', extensions.gen_salt('bf')),
                   -- NULL dans ces jetons => « Database error querying schema »
                   confirmation_token = coalesce(confirmation_token, ''),
                   recovery_token = coalesce(recovery_token, ''),
                   email_change = coalesce(email_change, ''),
                   email_change_token_new = coalesce(email_change_token_new, ''),
                   email_change_token_current = coalesce(email_change_token_current, ''),
                   phone_change = coalesce(phone_change, ''),
                   phone_change_token = coalesce(phone_change_token, ''),
                   reauthentication_token = coalesce(reauthentication_token, '')
             where id = '{c['id']}'""")
    statut, rep = http("POST", f"{URL}/auth/v1/token?grant_type=password",
                       {"email": c["email"], "password": mdp}, {"apikey": ANON, "Content-Type": "application/json"})
    jetons[role] = rep.get("access_token") if isinstance(rep, dict) else None
    controle(f"connexion {role}", bool(jetons[role]), True)
if not all(jetons.values()):
    raise SystemExit("ARRET : connexion impossible.")
SA, AG, RP = (par_role[r]["id"] for r in ("super_admin", "associe_gerant", "remplacant"))


def rest(role, methode, chemin, corps=None, entetes=None):
    e = {"apikey": ANON, "Authorization": f"Bearer {jetons[role]}", "Content-Type": "application/json"}
    e.update(entetes or {})
    return http(methode, f"{URL}/rest/v1/{chemin}", corps, e)


def fonction(role, corps):
    return http("POST", f"{URL}/functions/v1/signature", corps,
                {"apikey": ANON, "Authorization": f"Bearer {jetons[role]}", "Content-Type": "application/json"})


print("\n--- 1. Brouillon (super_admin) ---")
st, rep = rest("super_admin", "POST", "signature_demandes?select=id",
               {"type": "avenant", "titre": "Essai 24C-2 — avenant n°1", "createur_id": SA},
               {"Prefer": "return=representation"})
controle("creation du brouillon", st, 201)
D = rep[0]["id"]
st, _ = rest("super_admin", "POST", "signature_signataires",
             [{"demande_id": D, "profil_id": AG, "ordre": 1, "qualite": "Associé gérant"},
              {"demande_id": D, "profil_id": RP, "ordre": 2, "qualite": "Remplaçant"}])
controle("ajout des 2 signataires", st, 201)
source = pdf_minimal("Avenant de test 24C-2")
st, _ = http("POST", f"{URL}/storage/v1/object/signatures/{D}/source.pdf", source,
             {"apikey": ANON, "Authorization": f"Bearer {jetons['super_admin']}", "Content-Type": "application/pdf"})
controle("depot de source.pdf", st, 200)
st, _ = rest("super_admin", "PATCH", f"signature_demandes?id=eq.{D}",
             {"source_chemin": f"{D}/source.pdf", "source_nom": "avenant-test.pdf", "source_taille": len(source)})
controle("renseignement du fichier", st, 204)
st, rep = fonction("associe_gerant", {"action": "envoyer", "demandeId": D})
controle("un non-createur ne peut pas envoyer", rep.get("ok"), False)
st, rep = fonction("super_admin", {"action": "envoyer", "demandeId": D})
controle("envoi par le createur", rep.get("ok"), True)
controle("empreinte calculee par le serveur", rep.get("empreinte"), hashlib.sha256(source).hexdigest())
st, _ = http("POST", f"{URL}/storage/v1/object/signatures/{D}/source.pdf", b"%PDF-1.4 falsifie",
             {"apikey": ANON, "Authorization": f"Bearer {jetons['super_admin']}",
              "Content-Type": "application/pdf", "x-upsert": "true"})
controle("apres envoi, le fichier ne peut plus etre remplace", st >= 400, True)

print("\n--- 2. Signatures ---")
for role, sig_id_requete, dernier in (("associe_gerant", AG, False), ("remplacant", RP, True)):
    st, rep = fonction(role, {"action": "demander_code", "demandeId": D})
    controle(f"{role} : code refuse avant ouverture du document", rep.get("ok"), False)
    st, _ = rest(role, "POST", "rpc/signature_marquer_consulte", {"p_demande_id": D})
    controle(f"{role} : ouverture du document", st, 204)
    st, rep = fonction(role, {"action": "consentement", "demandeId": D})
    controle(f"{role} : texte de consentement recu", bool(rep.get("texte")), True)
    version = rep.get("version")
    st, rep = fonction(role, {"action": "demander_code", "demandeId": D})
    controle(f"{role} : sans cle Resend, le code n'est pas envoye", rep.get("ok"), False)
    sig = sql(f"select id::text from signature_signataires where demande_id = '{D}' "
              f"and profil_id = '{sig_id_requete}'")[0]["id"]
    controle(f"{role} : ce code non envoye a ete invalide",
             sql(f"select count(*) as n from signature_codes where signataire_id = '{sig}' "
                 "and utilise_at is null and invalide_at is null")[0]["n"], 0)
    code = f"{secrets.randbelow(1_000_000):06d}"
    empreinte_code = hmac.new(SECRET.encode(), f"{sig}:{code}".encode(), hashlib.sha256).hexdigest()
    sql(f"insert into signature_codes (signataire_id, code_hmac, email_destinataire, expire_at) "
        f"values ('{sig}', '{empreinte_code}', 'essai@exemple.test', now() + interval '10 minutes')")
    faux = f"{(int(code) + 1) % 1_000_000:06d}"
    st, rep = fonction(role, {"action": "signer", "demandeId": D, "code": faux,
                              "consentement": True, "consentementVersion": version})
    controle(f"{role} : code faux refuse", rep.get("erreur", "")[:15], "Code incorrect.")
    st, rep = fonction(role, {"action": "signer", "demandeId": D, "code": code,
                              "consentement": False, "consentementVersion": version})
    controle(f"{role} : case de consentement obligatoire", rep.get("ok"), False)
    st, rep = fonction(role, {"action": "signer", "demandeId": D, "code": code,
                              "consentement": True, "consentementVersion": version})
    controle(f"{role} : signature", rep.get("signe"), True)
    controle(f"{role} : demande terminee ?", rep.get("termine"), dernier)

print("\n--- 3. Document scelle ---")
etat = sql(f"select statut, final_chemin, final_empreinte, source_empreinte, "
           f"signature_verifier_journal(id) as casses from signature_demandes where id = '{D}'")[0]
controle("statut", etat["statut"], "terminee")
controle("journal intact (maillons casses)", etat["casses"], 0)
st, final = http("GET", f"{URL}/storage/v1/object/authenticated/signatures/{D}/final.pdf", None,
                 {"apikey": ANON, "Authorization": f"Bearer {jetons['remplacant']}"}, brut=True)
controle("un signataire telecharge le PDF scelle", st, 200)
controle("empreinte du PDF scelle = celle enregistree", hashlib.sha256(final).hexdigest(), etat["final_empreinte"])
controle("le PDF scelle a une page de plus (certificat)",
         len(re.findall(rb"/Type\s*/Page(?![a-z])", final)), 2)
evts = [e["evenement"] for e in sql(f"select evenement from signature_journal where demande_id = '{D}' order by id")]
controle("journal : envoi ... scellement", (evts[0], evts[-1]), ("envoi", "scellement"))
controle("journal : 2 signatures", evts.count("signature"), 2)
if GARDER:
    Path(GARDER).write_bytes(final)
    print(f"\n  PDF scelle enregistre : {GARDER}")

print("\n" + "=" * 78)
print(f"demande d'essai : {D}")
if ECHECS:
    print(f"{len(ECHECS)} ECHEC(S) :")
    for e in ECHECS:
        print(f"  - {e}")
    sys.exit(1)
print("TOUS LES CONTROLES SONT AU VERT.")
