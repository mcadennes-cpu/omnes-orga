// ---------------------------------------------------------------------------
// Suite de test des dates du module Agenda -- etape 8M-8.
//
//   npm run test:fuseaux
//
// POURQUOI
// Le 21/09/2026, un associe a Tahiti voyait « les horaires d'un samedi
// (8h-20h) proposes un vendredi ». Cause : une date de garde ('2026-12-19')
// etait tantot lue en UTC, tantot en heure locale, selon l'endroit du code.
// Les deux lectures coincident a l'est de Greenwich -- le defaut etait donc
// invisible depuis Dijon, et seul un voyageur pouvait le reveler.
//
// Une suite qui ne tournerait que dans le fuseau du developpeur ne verrait
// rien. Celle-ci rejoue donc chaque controle dans plusieurs fuseaux, choisis
// pour encadrer les cas extremes :
//   Europe/Paris        le cabinet, la reference
//   Pacific/Tahiti      UTC-10, le cas signale
//   America/Cayenne     UTC-3, Guyane
//   Indian/Reunion      UTC+4
//   Pacific/Kiritimati  UTC+14, le decalage positif le plus fort au monde
//
// Elle verifie AUSSI que le code n'a pas regresse (controles statiques) :
// aucune date de garde ne doit etre relue par toISOString() ni par
// new Date(<chaine>). La regle et ses fonctions sont dans
// src/modules/agenda/lib/dates.ts.
//
// CODES DE SORTIE : 0 tout au vert ; 1 au moins un controle en echec.
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import {
  jourLocal, depuisJour, aujourdhuiCabinet, libelleJour, libelleJourCourt
} from '../../src/modules/agenda/lib/dates.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..', '..');
const MODULE = join(RACINE, 'src', 'modules', 'agenda');
const MARQUEUR = '###COMPTE###';

const FUSEAUX = [
  'Europe/Paris', 'Pacific/Tahiti', 'America/Cayenne',
  'Indian/Reunion', 'Pacific/Kiritimati'
];

// Les deux vrais plans de roulement du cabinet, releves en base le 21/09/2026.
// Ce qui est teste ici est le CALCUL, pas la donnee : des chiffres reels
// rendent seulement les ecarts lisibles.
const PLANS = [
  { id: 'V1', start_date: '2025-12-29', cycle_length_weeks: 8,
    effective_from: '2025-12-29', effective_to: '2027-01-03' },
  { id: 'V2', start_date: '2027-01-04', cycle_length_weeks: 8,
    effective_from: '2027-01-04', effective_to: null as string | null }
];

let echecs = 0;
let controles = 0;

function verifie(nom: string, obtenu: unknown, attendu: unknown) {
  controles++;
  if (String(obtenu) !== String(attendu)) {
    echecs++;
    console.log(`  ECHEC  ${nom}`);
    console.log(`         obtenu  : ${obtenu}`);
    console.log(`         attendu : ${attendu}`);
  }
}

// ===========================================================================
// A. Controles statiques du code source -- independants du fuseau
// ===========================================================================
function fichiersDuModule(dossier: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersDuModule(chemin));
    else if (/\.tsx?$/.test(nom)) sortie.push(chemin);
  }
  return sortie;
}

function controlesStatiques() {
  console.log('A. Le code source (regles de lib/dates.ts)');

  // Les expressions interdites sur une date de garde. new Date(<chaine>) est
  // listee par ses formes reelles plutot que par une regex fourre-tout :
  // new Date(<uneDate>) est legitime et frequent dans le module.
  const INTERDITS: [RegExp, string][] = [
    [/toISOString\(\)\s*\.\s*(split|slice)/, 'toISOString() pour fabriquer un jour'],
    [/new Date\(\s*(shift|s|candidate|matchingShift|firstShift)\.date\s*\)/, 'new Date() sur une date de garde'],
    [/new Date\(\s*(selectedDate|dateStr|dateString|seriesEndDate|jour)\s*\)/, 'new Date() sur une chaine de date']
  ];

  const trouves: string[] = [];
  for (const chemin of fichiersDuModule(MODULE)) {
    readFileSync(chemin, 'utf8').split('\n').forEach((ligne, i) => {
      if (ligne.trimStart().startsWith('//')) return;   // les commentaires citent le defaut
      for (const [motif, quoi] of INTERDITS) {
        if (motif.test(ligne)) trouves.push(`${relative(RACINE, chemin)}:${i + 1} -- ${quoi}`);
      }
    });
  }
  trouves.forEach(t => console.log(`         ${t}`));
  verifie('aucune date de garde lue ou ecrite en UTC', trouves.length, 0);

  // Une seule definition du passage Date -> chaine dans tout le module : c'est
  // la duplication (trois copies de formatDateLocal) qui avait laisse le
  // defaut s'installer.
  let definitions = 0;
  for (const chemin of fichiersDuModule(MODULE)) {
    if (/export function jourLocal/.test(readFileSync(chemin, 'utf8'))) definitions++;
  }
  verifie('une seule definition de jourLocal', definitions, 1);
}

// ===========================================================================
// B a H. Les controles qui dependent du fuseau
// ===========================================================================
const JOURS_COURTS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

// Reprises a l'identique de rotationUtils.ts, pour eprouver l'entree qu'on
// leur donne sans avoir a charger le client Supabase.
const isoJour = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function planPour(date: Date) {
  const t = new Date(date); t.setHours(12, 0, 0, 0);
  t.setDate(t.getDate() + (t.getDay() === 0 ? -6 : 1 - t.getDay()));
  const jour = isoJour(t);
  let trouve = null;
  for (const p of PLANS) {
    if (p.effective_from <= jour && (p.effective_to === null || jour <= p.effective_to)) trouve = p;
  }
  return trouve;
}

function semaineDeRoulement(date: Date, plan: typeof PLANS[0]) {
  const debut = new Date(plan.start_date + 'T12:00:00'); debut.setHours(12, 0, 0, 0);
  const cible = new Date(date); cible.setHours(12, 0, 0, 0);
  const dow = cible.getDay();
  const lundi = new Date(cible);
  lundi.setDate(cible.getDate() + (dow === 0 ? -6 : 1 - dow));
  lundi.setHours(12, 0, 0, 0);
  const sem = Math.floor(Math.round((lundi.getTime() - debut.getTime()) / 86400000) / 7);
  return ((sem % plan.cycle_length_weeks) + plan.cycle_length_weeks) % plan.cycle_length_weeks + 1;
}

function controlesDuFuseau() {
  // --- B. lib/dates.ts -----------------------------------------------------
  console.log('B. lib/dates.ts');
  let allerRetour = 0;
  for (let i = 0; i < 366 * 2; i++) {
    const d = new Date(2026, 0, 1 + i, 12);
    if (jourLocal(depuisJour(jourLocal(d))) !== jourLocal(d)) allerRetour++;
  }
  verifie('aller-retour sur 2026-2027', allerRetour, 0);
  // Les changements d'heure francais de 2026, ou une Date a minuit bascule.
  for (const j of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25', '2026-10-26']) {
    verifie(`changement d'heure ${j}`, jourLocal(depuisJour(j)), j);
  }
  verifie("aujourd'hui = le jour du cabinet", aujourdhuiCabinet(),
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));

  // --- C. 8M-2 : la grille de l'onglet Ouvertures --------------------------
  console.log("C. 8M-2 -- la grille de l'onglet Ouvertures");
  // Gardes libres relevees en base pour la semaine du 14 au 20/12/2026.
  const LIBRES: Record<string, number> = { '2026-12-18': 4, '2026-12-19': 1 };
  const base = depuisJour('2026-12-16');
  const lundi = new Date(base);
  lundi.setDate(base.getDate() - base.getDay() + 1);
  const vus: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lundi); d.setDate(d.getDate() + i);
    const cle = jourLocal(d);
    // L'en-tete de la carte et la cle de recherche doivent designer le meme jour.
    verifie(`en-tete et cle concordent le ${cle}`,
      `${JOURS_COURTS[d.getDay()]} ${d.getDate()}`,
      `${JOURS_COURTS[depuisJour(cle).getDay()]} ${Number(cle.slice(8))}`);
    if (LIBRES[cle]) vus.push(`${cle}=${LIBRES[cle]}`);
  }
  verifie('la semaine du 14/12 affiche les vraies gardes',
    vus.join(' '), '2026-12-18=4 2026-12-19=1');

  // --- D. 8M-3 : les libelles ---------------------------------------------
  console.log('D. 8M-3 -- les libelles de date');
  verifie('libelle long du 19/12', libelleJour('2026-12-19'), 'samedi 19 décembre 2026');
  verifie('libelle long du 18/12', libelleJour('2026-12-18'), 'vendredi 18 décembre 2026');
  verifie('libelle court du 19/12', libelleJourCourt('2026-12-19'), '19/12/2026');
  verifie('libelle du 1er janvier', libelleJour('2026-01-01'), 'jeudi 1 janvier 2026');

  // --- E. 8M-4 : les plages de requete ------------------------------------
  console.log('E. 8M-4 -- les plages de requete');
  const plageSemaine = (jour: string) => {
    const d = depuisJour(jour);
    const s = new Date(d); s.setDate(d.getDate() - d.getDay() + 1);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return `${jourLocal(s)} -> ${jourLocal(e)}`;
  };
  verifie('plage de la semaine du 16/12', plageSemaine('2026-12-16'), '2026-12-14 -> 2026-12-20');
  // Les 13 mois ouverts : c'est la borne de FIN qui perdait le dernier jour,
  // soit 91 gardes jamais chargees dans la vue Mois de l'onglet Validation.
  const DERNIERS: Record<string, string> = {
    '2025-12': '31', '2026-01': '31', '2026-02': '28', '2026-03': '31',
    '2026-04': '30', '2026-05': '31', '2026-06': '30', '2026-07': '31',
    '2026-08': '31', '2026-09': '30', '2026-10': '31', '2026-11': '30',
    '2026-12': '31'
  };
  let moisFaux = 0;
  for (const [mois, dernier] of Object.entries(DERNIERS)) {
    const d = depuisJour(`${mois}-01`);
    const debut = jourLocal(new Date(d.getFullYear(), d.getMonth(), 1));
    const fin = jourLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    if (debut !== `${mois}-01` || fin !== `${mois}-${dernier}`) moisFaux++;
  }
  verifie('les 13 mois ouverts, bornes exactes', moisFaux, 0);
  // Une cellule du calendrier est construite en heure locale : la relire ne
  // doit pas reculer d'un jour.
  verifie('clic sur le 16/12 dans la vue Mois', jourLocal(new Date(2026, 11, 16)), '2026-12-16');
  verifie('clic sur le 01/12 dans la vue Mois', jourLocal(new Date(2026, 11, 1)), '2026-12-01');

  // --- F. 8M-5 : « aujourd'hui » a toute heure -----------------------------
  console.log("F. 8M-5 -- « aujourd'hui » a toute heure");
  const VraieDate = Date;
  let instant = 0;
  class DateFigee extends VraieDate {
    constructor(...a: any[]) { super(...(a.length ? a : [instant]) as []); }
    static now() { return instant; }
  }
  let heuresFausses = 0;
  try {
    (globalThis as any).Date = DateFigee;
    for (let h = 0; h < 24; h++) {
      instant = new VraieDate(2026, 11, 19, h, 30).getTime();
      const aDijon = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(new VraieDate(instant));
      if (aujourdhuiCabinet() !== aDijon) heuresFausses++;
    }
  } finally {
    (globalThis as any).Date = VraieDate;
  }
  verifie('les 24 heures du 19/12 donnent le jour du cabinet', heuresFausses, 0);

  // --- G. 8M-6 : le roulement ---------------------------------------------
  console.log('G. 8M-6 -- le roulement');
  let jourFaux = 0, semaineFausse = 0;
  for (let i = 0; i < 730; i++) {
    const jour = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().split('T')[0];
    const d = depuisJour(jour);
    // le jour de la semaine que porte reellement la date
    const vrai = new Date(jour + 'T12:00:00Z').getUTCDay();
    if (d.getDay() !== vrai) jourFaux++;
    const plan = planPour(d);
    // la semaine de roulement doit etre celle du LUNDI de cette semaine-la
    if (plan) {
      const lundiVrai = new Date(Date.parse(jour + 'T12:00:00Z'));
      lundiVrai.setUTCDate(lundiVrai.getUTCDate() + (vrai === 0 ? -6 : 1 - vrai));
      const attendue = semaineDeRoulement(
        depuisJour(lundiVrai.toISOString().split('T')[0]), plan);
      if (semaineDeRoulement(d, plan) !== attendue) semaineFausse++;
    }
  }
  verifie('jour de la semaine sur 730 dates', jourFaux, 0);
  verifie('semaine de roulement sur 730 dates', semaineFausse, 0);
  verifie('plan en vigueur le 03/01/2027 (dernier jour du V1)', planPour(depuisJour('2027-01-03'))?.id, 'V1');
  verifie('plan en vigueur le 04/01/2027 (premier jour du V2)', planPour(depuisJour('2027-01-04'))?.id, 'V2');

  // --- H. 8M-7 : les series ------------------------------------------------
  console.log('H. 8M-7 -- les series de gardes');
  const serie = (debut: string, fin: string, joursChoisis: number[]) => {
    const d = depuisJour(debut), f = depuisJour(fin), sortie: string[] = [];
    const c = new Date(d);
    while (c <= f) {
      if (joursChoisis.includes((c.getDay() + 6) % 7)) sortie.push(jourLocal(c));
      c.setDate(c.getDate() + 1);
    }
    return sortie;
  };
  const verite = (debut: string, fin: string, joursChoisis: number[]) => {
    const sortie: string[] = [];
    for (let t = Date.parse(debut + 'T12:00:00Z'); t <= Date.parse(fin + 'T12:00:00Z'); t += 86400000) {
      const d = new Date(t);
      if (joursChoisis.includes((d.getUTCDay() + 6) % 7)) sortie.push(d.toISOString().split('T')[0]);
    }
    return sortie;
  };
  const SERIES: [string, string, number[], string][] = [
    ['2026-12-01', '2027-01-31', [4], 'tous les vendredis, dec-janv'],
    ['2026-12-01', '2027-01-31', [5], 'tous les samedis, dec-janv'],
    ['2026-03-16', '2026-04-05', [0, 2, 4], 'lun/mer/ven a cheval sur le 29/03'],
    ['2026-10-19', '2026-11-08', [0], 'tous les lundis a cheval sur le 25/10']
  ];
  for (const [debut, fin, jours, nom] of SERIES) {
    verifie(nom, serie(debut, fin, jours).join(','), verite(debut, fin, jours).join(','));
  }
}

// ===========================================================================
// Lancement
// ===========================================================================
if (process.env.OMNES_FUSEAU) {
  // Un seul fuseau : ce processus a ete lance par le pere.
  controlesDuFuseau();
  console.log(`${MARQUEUR}${controles}:${echecs}`);
  process.exit(echecs ? 1 : 0);
}

console.log('Test des dates du module Agenda -- etape 8M\n');
controlesStatiques();
let totalControles = controles;
let totalEchecs = echecs;
console.log(`   ${controles} controle(s), ${echecs} echec(s)\n`);

for (const fuseau of FUSEAUX) {
  console.log(`--- ${fuseau} ---`);
  let sortie = '';
  let interrompu = false;
  try {
    sortie = execFileSync(process.execPath, [fileURLToPath(import.meta.url)],
      { env: { ...process.env, TZ: fuseau, OMNES_FUSEAU: fuseau }, encoding: 'utf8' });
  } catch (e: any) {
    sortie = (e.stdout ?? '') + (e.stderr ?? '');
    interrompu = !sortie.includes(MARQUEUR);
  }
  const coupe = sortie.indexOf(MARQUEUR);
  process.stdout.write(coupe === -1 ? sortie : sortie.slice(0, coupe));
  if (interrompu || coupe === -1) {
    totalEchecs += 1;
    console.log('   INTERROMPU -- la suite ne s est pas terminee\n');
  } else {
    const [c, e] = sortie.slice(coupe + MARQUEUR.length).trim().split(':').map(Number);
    totalControles += c;
    totalEchecs += e;
    console.log(`   ${c} controle(s), ${e} echec(s)\n`);
  }
}

console.log('='.repeat(64));
console.log(totalEchecs === 0
  ? `TOUT AU VERT : ${totalControles} controles, ${FUSEAUX.length} fuseaux.`
  : `${totalEchecs} ECHEC(S) sur ${totalControles} controles.`);
process.exit(totalEchecs ? 1 : 0);
