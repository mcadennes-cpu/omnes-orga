// ---------------------------------------------------------------------------
// Suite de test de la lecture par tranches -- etape 8O.
//
//   npm run test:pagination
//
// POURQUOI
// PostgREST ne renvoie jamais plus de 1 000 lignes par requete, et ne le
// signale pas : la requete reussit, et le code croit avoir tout recu. L'export
// CSV du planning et le planning imprimable lisaient ainsi les gardes en une
// seule requete. Mesure du 22/09/2026 : 2 691 gardes sur l'annee 2026, donc un
// export d'annee produisait un fichier de 1 000 lignes -- 37 % du planning --
// sans le moindre avertissement.
//
// CE QUI EST DELICAT ICI
// Une pagination mal faite remplace un oubli visible par un oubli silencieux :
//   . si la condition d'arret est fausse, on boucle ou on s'arrete trop tot ;
//   . si le tri n'est pas TOTAL, une ligne peut changer de tranche entre deux
//     appels, et donc apparaitre deux fois ou disparaitre. Un `order('date')`
//     seul ne suffit pas : toutes les gardes d'une meme journee sont a egalite.
// Cette suite verifie les deux : la logique de la boucle sur une source
// simulee (sans reseau), et, par lecture du code, que les deux appelants
// terminent bien leur tri par une colonne unique.
//
// CODES DE SORTIE : 0 tout au vert ; 1 au moins un controle en echec.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lireToutesLesLignes } from '../../src/modules/agenda/lib/pagination.ts';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TRANCHE = 1000;

let echecs = 0;
let controles = 0;

function verifier(libelle: string, obtenu: unknown, attendu: unknown): void {
  controles += 1;
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  const rendu = typeof obtenu === 'string' ? obtenu : JSON.stringify(obtenu);
  console.log(`  [${ok ? 'OK ' : 'ECHEC'}] ${libelle.padEnd(58)} ${rendu}`);
  if (!ok) console.log(`          attendu : ${JSON.stringify(attendu)}`);
}

function titre(texte: string): void {
  console.log('\n' + '='.repeat(74) + `\n${texte}\n` + '='.repeat(74));
}

/**
 * Une source de donnees simulee : `total` lignes numerotees, servies par
 * tranches comme le ferait PostgREST (jamais plus de 1 000 d'un coup).
 * Compte les appels, pour verifier qu'on ne demande ni trop ni trop peu.
 */
function source(total: number) {
  const appels: Array<[number, number]> = [];
  const lire = (debut: number, fin: number) => {
    appels.push([debut, fin]);
    const borne = Math.min(fin - debut + 1, TRANCHE);
    const lignes = [];
    for (let i = debut; i < Math.min(debut + borne, total); i++) lignes.push({ n: i });
    return Promise.resolve({ data: lignes, error: null });
  };
  return { lire, appels };
}

titre('1. LA BOUCLE REND TOUTES LES LIGNES, SANS DOUBLON NI PERTE');

// 1001 est le cas qui distingue une pagination juste d'une pagination absente ;
// 2691 est le volume reel de l'annee 2026 ; 2000 et 3000 testent la frontiere
// exacte, ou la derniere tranche est pleine et une tranche vide doit suivre.
for (const total of [0, 1, 999, 1000, 1001, 2000, 2691, 3000]) {
  const s = source(total);
  const { data, error, tranches } = await lireToutesLesLignes<{ n: number }>(s.lire);

  verifier(`${total} lignes disponibles -> lignes rendues`, data.length, total);
  verifier(`${total} lignes -> aucune erreur`, error, null);

  // Aucun doublon, aucun trou : les numeros doivent etre exactement 0..total-1.
  const numeros = data.map((l) => l.n);
  const distincts = new Set(numeros);
  verifier(`${total} lignes -> toutes distinctes`, distincts.size, total);
  const continu = numeros.every((n, i) => n === i);
  verifier(`${total} lignes -> dans l'ordre, sans trou`, continu, true);

  // Une tranche pleine oblige a en redemander une de plus, pour savoir s'il
  // reste quelque chose : 1000 lignes coutent donc 2 appels, pas 1.
  const attendues = total % TRANCHE === 0 && total > 0
    ? total / TRANCHE + 1
    : Math.floor(total / TRANCHE) + 1;
  verifier(`${total} lignes -> nombre de tranches lues`, tranches, attendues);
}

titre('2. LE GARDE-FOU : UNE SOURCE QUI NE SE TARIT JAMAIS');

// Si la base renvoyait toujours une tranche pleine (tri instable, ou defaut
// cote serveur), la boucle tournerait sans fin et remplirait la memoire du
// navigateur. Elle doit s'arreter d'elle-meme, en le disant.
const sansFin = (debut: number) =>
  Promise.resolve({
    data: Array.from({ length: TRANCHE }, (_, i) => ({ n: debut + i })),
    error: null,
  });
const resultatSansFin = await lireToutesLesLignes<{ n: number }>(sansFin);
verifier('source infinie -> la boucle s\'arrete', resultatSansFin.tranches, 500);
verifier('source infinie -> une erreur est rendue',
  resultatSansFin.error instanceof Error, true);
verifier('source infinie -> l\'erreur nomme la cause',
  String((resultatSansFin.error as Error).message).includes('tri non unique'), true);

titre('3. UNE ERREUR DE LA BASE REMONTE, ELLE N\'EST PAS AVALEE');

// Le defaut d'origine etait justement qu'un manque passait inapercu. Une
// erreur ne doit jamais etre transformee en resultat partiel silencieux.
const enErreur = () => Promise.resolve({ data: null, error: { message: 'boum' } });
const resultatErreur = await lireToutesLesLignes(enErreur);
verifier('erreur des la 1re tranche -> erreur rendue',
  (resultatErreur.error as { message: string }).message, 'boum');
verifier('erreur des la 1re tranche -> aucune ligne rendue',
  resultatErreur.data.length, 0);

// Une erreur au milieu ne doit pas rendre les lignes deja lues comme si elles
// etaient completes : c'est exactement le piege qu'on repare.
let tour = 0;
const erreurAuMilieu = (debut: number) => {
  tour += 1;
  if (tour === 3) return Promise.resolve({ data: null, error: { message: 'coupure' } });
  return Promise.resolve({
    data: Array.from({ length: TRANCHE }, (_, i) => ({ n: debut + i })),
    error: null,
  });
};
const resultatCoupure = await lireToutesLesLignes<{ n: number }>(erreurAuMilieu);
verifier('erreur a la 3e tranche -> erreur rendue',
  (resultatCoupure.error as { message: string }).message, 'coupure');
verifier('erreur a la 3e tranche -> aucune ligne partielle rendue',
  resultatCoupure.data.length, 0);

titre('4. NON-REGRESSION : LES APPELANTS LISENT BIEN PAR TRANCHES');

// Sans ces controles, rien n'empecherait quelqu'un de reecrire un jour une
// lecture de gardes en une seule requete -- et le defaut reviendrait, aussi
// silencieux qu'avant.
const APPELANTS = [
  'src/modules/agenda/lib/exportUtils.ts',
  'src/modules/agenda/lib/printPlanning.ts',
];

for (const chemin of APPELANTS) {
  const code = readFileSync(join(RACINE, chemin), 'utf8');
  const nom = chemin.split('/').pop();

  verifier(`${nom} : passe par lireToutesLesLignes`,
    code.includes('lireToutesLesLignes'), true);

  // Le tri doit se terminer par une colonne UNIQUE, sinon la pagination peut
  // dupliquer ou perdre des lignes entre deux tranches.
  verifier(`${nom} : termine son tri par id`,
    /\.order\(\s*'id'/.test(code), true);

  verifier(`${nom} : demande bien une tranche`,
    /\.range\(\s*debut\s*,\s*fin\s*\)/.test(code), true);

  // Une lecture de shifts qui ne passerait pas par le helper est suspecte.
  const lecturesBrutes = (code.match(/await\s+supabase\s*\n?\s*\.from\('shifts'\)/g) || []).length;
  verifier(`${nom} : plus aucune lecture directe de shifts`, lecturesBrutes, 0);
}

titre('RESULTAT');
console.log(`  ${controles} controles, ${echecs} en echec.`);
if (echecs > 0) {
  console.log('\n  LA LECTURE PAR TRANCHES N\'EST PAS SURE : ne pas deployer.');
  process.exit(1);
}
console.log('\n  Tout est au vert.');
