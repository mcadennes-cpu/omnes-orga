#!/usr/bin/env python3
"""Prouver les regles de vote des sondages de Discussion (etape 16 quater).

    OMNES_CIBLE=test python3 docs/sql/16quater-2-test-sondages.py
    OMNES_CIBLE=prod python3 docs/sql/16quater-2-test-sondages.py   # apres 16quater-1

A lancer DEPUIS LA RACINE du depot, apres 16quater-1.

CE QUE CETTE SUITE N'ECRIT PAS
Meme harnais que 25A-5 : tout le scenario tourne dans UNE transaction
ANNULEE. Le sondage, ses options et ses votes crees pour le test
disparaissent a la fin. Jouable en production.

COMMENT ON TESTE
On prend le role `authenticated` avec les claims de deux vrais comptes :
l'auteur d'une carte ouverte (il gere le sondage) et un autre membre actif
du tableau (il vote). On verifie :
  - choix unique : un 2e vote est refuse, changer d'avis (update) passe ;
  - conversion en choix multiple : plusieurs options cochees, pas deux fois
    la meme, retour au choix unique refuse ;
  - ajout d'une option a un sondage lance : l'auteur oui, un membre non ;
  - sondage cloture : ni vote ni ajout d'option.
"""
import base64
import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

PROJETS = {"prod": "ydihrgnixthrraprclox", "test": "yjttfdwjbyufpavwxcpy"}
CIBLE = os.environ.get("OMNES_CIBLE", "").strip().lower()
if CIBLE not in PROJETS:
    raise SystemExit("Preciser OMNES_CIBLE=test ou OMNES_CIBLE=prod.")
PROJET = PROJETS[CIBLE]
if not Path("docs/sql").is_dir():
    raise SystemExit("A lancer depuis la racine du depot omnes-orga.")

_TOK = base64.b64decode(subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
).decode().strip().removeprefix("go-keyring-base64:")).decode().strip()

ECHECS = []


def appel(requete):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJET}/database/query",
        data=json.dumps({"query": requete}).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {_TOK}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "omnes-orga-script/1.0")
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"\nARRET : requete refusee -- {e.read().decode()[:600]}")


def lire(requete):
    return appel(f"begin transaction read only;\nselect x.* from ({requete}) x;\ncommit;\n")


class Scenario:
    """Meme harnais que 25A-5 (une transaction annulee par scenario)."""

    def __init__(self, nom):
        self.nom = nom
        self.etapes = []
        self.sql = [
            "begin;",
            "create temp table _r (n serial, etape text, res text) on commit drop;",
            "create temp table _v (k text primary key, val text) on commit drop;",
            "grant all on _r, _v to authenticated, anon;",
            "grant usage on sequence _r_n_seq to authenticated, anon;",
        ]

    def etape(self, libelle, qui, corps, attendu):
        self.etapes.append((libelle, attendu))
        claims = json.dumps({"sub": qui, "role": "authenticated"})
        self.sql.append("set local role authenticated;")
        self.sql.append(f"set local request.jwt.claims = '{claims}';")
        lib = libelle.replace("'", "''")
        self.sql.append(
            "do $e$ declare v text; n integer; begin\n"
            f"{corps}\n"
            f"insert into _r (etape, res) values ('{lib}', coalesce(v, 'ok'));\n"
            "exception when others then\n"
            f"insert into _r (etape, res) values ('{lib}', 'ERREUR: ' || sqlerrm);\n"
            "end $e$;")
        self.sql.append("reset role;")

    def jouer(self):
        print("\n" + "=" * 78 + f"\n{self.nom}\n" + "=" * 78)
        self.sql.append("select etape, res from _r order by n;")
        self.sql.append("rollback;")
        lignes = appel("\n".join(self.sql))
        if len(lignes) != len(self.etapes):
            ECHECS.append(f"{self.nom} : {len(lignes)} resultats pour {len(self.etapes)} etapes")
        for (libelle, attendu), ligne in zip(self.etapes, lignes):
            obtenu = ligne["res"]
            if attendu == "UUID":
                ok = len(obtenu) == 36 and obtenu.count("-") == 4
            elif attendu.startswith("ERREUR"):
                extrait = attendu[7:] if attendu.startswith("ERREUR:") else ""
                ok = obtenu.startswith("ERREUR") and extrait.lower() in obtenu.lower()
            else:
                ok = obtenu == attendu
            if not ok:
                ECHECS.append(f"{self.nom} / {libelle} : obtenu « {obtenu} », attendu « {attendu} »")
            print(f"  [{'OK ' if ok else 'ECHEC'}] {libelle:58} {obtenu[:70]}")


def val(k):
    return f"(select val from _v where k = '{k}')"


def poser(k, expr):
    return f"insert into _v values ('{k}', ({expr})::text) on conflict (k) do update set val = excluded.val;"


# ---------------------------------------------------------------------------
print(f"cible : {CIBLE.upper()} -- projet {PROJET}")
if CIBLE == "test" and not lire(
        "select 1 from pg_class where relname = '_environnement_de_test'"):
    raise SystemExit("ARRET : OMNES_CIBLE=test mais la table temoin de 23-18 est absente.")
if not lire("select 1 from information_schema.columns "
            "where table_name = 'discussion_polls' and column_name = 'multiple'"):
    raise SystemExit("ARRET : 16quater-1 n'est pas execute sur cette base.")

# Une carte ouverte, sans sondage, dont l'auteur est actif et membre du
# tableau, + un autre membre actif du meme tableau.
cartes = lire("""
    select c.id::text as carte, c.created_by::text as auteur,
           (select m.user_id::text
              from public.discussion_board_members m
              join public.profiles pr on pr.id = m.user_id and pr.actif
             where m.board_id = c.board_id and m.user_id <> c.created_by
             order by m.user_id limit 1) as membre
      from public.discussion_cards c
      join public.discussion_boards b on b.id = c.board_id and not b.archived
      join public.profiles pa on pa.id = c.created_by and pa.actif
     where c.status = 'open' and not c.archived
       and not exists (select 1 from public.discussion_polls p where p.card_id = c.id)
       and exists (select 1 from public.discussion_board_members m
                    where m.board_id = c.board_id and m.user_id = c.created_by)
     order by c.created_at desc limit 1""")
if not cartes or not cartes[0]["membre"]:
    raise SystemExit("ARRET : aucune carte ouverte utilisable pour le test.")
CARTE, AUTEUR, MEMBRE = cartes[0]["carte"], cartes[0]["auteur"], cartes[0]["membre"]
print(f"  carte {CARTE}\n  auteur {AUTEUR}\n  membre {MEMBRE}")

P = f"{val('p')}::uuid"
O1, O2, O3, O4 = (f"{val(k)}::uuid" for k in ("o1", "o2", "o3", "o4"))


def mes_votes(s, libelle, attendu):
    s.etape(libelle, MEMBRE,
            f"select count(*) into n from discussion_poll_votes where poll_id = {P} "
            f"and user_id = '{MEMBRE}'; v := n::text;", attendu)


s = Scenario("Sondage a choix unique, puis converti en choix multiple")
s.etape("l'auteur cree un sondage (choix unique)", AUTEUR,
        "insert into discussion_polls (card_id, question, created_by) "
        f"values ('{CARTE}', 'Test 16quater-2', '{AUTEUR}') returning id into v; " + poser("p", "v"),
        "UUID")
for i, cle in enumerate(("o1", "o2", "o3"), start=1):
    s.etape(f"l'auteur ajoute l'option {i}", AUTEUR,
            "insert into discussion_poll_options (poll_id, label, position) "
            f"values ({P}, 'Date {i}', {i - 1}) returning id into v; " + poser(cle, "v"),
            "UUID")
s.etape("le membre vote pour l'option 1", MEMBRE,
        f"insert into discussion_poll_votes (poll_id, option_id, user_id) "
        f"values ({P}, {O1}, '{MEMBRE}');", "ok")
s.etape("choix unique : 2e vote refuse", MEMBRE,
        f"insert into discussion_poll_votes (poll_id, option_id, user_id) "
        f"values ({P}, {O2}, '{MEMBRE}');", "ERREUR:un seul choix")
s.etape("choix unique : changer d'avis (update) passe", MEMBRE,
        f"update discussion_poll_votes set option_id = {O2} "
        f"where poll_id = {P} and user_id = '{MEMBRE}'; get diagnostics n = row_count; "
        "v := n::text;", "1")
mes_votes(s, "le membre a toujours 1 vote", "1")
s.etape("le membre ne peut pas convertir le sondage", MEMBRE,
        f"update discussion_polls set multiple = true where id = {P}; "
        "get diagnostics n = row_count; v := n::text;", "0")
s.etape("l'auteur convertit en choix multiple", AUTEUR,
        f"update discussion_polls set multiple = true where id = {P}; "
        "get diagnostics n = row_count; v := n::text;", "1")
s.etape("choix multiple : le membre coche l'option 1", MEMBRE,
        f"insert into discussion_poll_votes (poll_id, option_id, user_id) "
        f"values ({P}, {O1}, '{MEMBRE}');", "ok")
s.etape("choix multiple : le membre coche l'option 3", MEMBRE,
        f"insert into discussion_poll_votes (poll_id, option_id, user_id) "
        f"values ({P}, {O3}, '{MEMBRE}');", "ok")
mes_votes(s, "le membre a 3 votes", "3")
s.etape("cocher deux fois la meme option est refuse", MEMBRE,
        f"insert into discussion_poll_votes (poll_id, option_id, user_id) "
        f"values ({P}, {O1}, '{MEMBRE}');", "ERREUR:duplicate key")
s.etape("retour au choix unique refuse (votes multiples)", AUTEUR,
        f"update discussion_polls set multiple = false where id = {P};",
        "ERREUR:plusieurs reponses")
s.etape("le membre decoche l'option 3", MEMBRE,
        f"delete from discussion_poll_votes where poll_id = {P} and option_id = {O3} "
        f"and user_id = '{MEMBRE}'; get diagnostics n = row_count; v := n::text;", "1")
mes_votes(s, "le membre a 2 votes", "2")
s.etape("l'auteur ajoute une date au sondage lance", AUTEUR,
        "insert into discussion_poll_options (poll_id, label, position) "
        f"values ({P}, 'Date 4', 3) returning id into v; " + poser("o4", "v"), "UUID")
s.etape("un simple membre ne peut pas ajouter de date", MEMBRE,
        "insert into discussion_poll_options (poll_id, label, position) "
        f"values ({P}, 'Intrus', 4);", "ERREUR:row-level security")
s.etape("le membre coche la nouvelle date", MEMBRE,
        f"insert into discussion_poll_votes (poll_id, option_id, user_id) "
        f"values ({P}, {O4}, '{MEMBRE}');", "ok")
s.etape("l'auteur cloture le sondage", AUTEUR,
        f"update discussion_polls set closed = true where id = {P}; "
        "get diagnostics n = row_count; v := n::text;", "1")
s.etape("sondage cloture : vote refuse", MEMBRE,
        f"insert into discussion_poll_votes (poll_id, option_id, user_id) "
        f"values ({P}, {O3}, '{MEMBRE}');", "ERREUR:row-level security")
s.etape("sondage cloture : ajout de date refuse", AUTEUR,
        "insert into discussion_poll_options (poll_id, label, position) "
        f"values ({P}, 'Date 5', 4);", "ERREUR:row-level security")
s.jouer()

# ---------------------------------------------------------------------------
reste = lire(f"select count(*) as n from public.discussion_polls where card_id = '{CARTE}'")
if reste[0]["n"] != 0:
    ECHECS.append("le sondage de test est reste en base (transaction non annulee ?)")

print("\n" + "=" * 78)
if ECHECS:
    print(f"{len(ECHECS)} ECHEC(S) :")
    for e in ECHECS:
        print("  - " + e)
    raise SystemExit(1)
print(f"TOUT EST CONFORME ({len(s.etapes)} controles) -- rien n'a ete ecrit.")
