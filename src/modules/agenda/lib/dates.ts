// ---------------------------------------------------------------------------
// Les dates du planning sont des JOURS, pas des instants.
//
// Une garde porte une date nue -- '2026-12-19' -- sans heure ni fuseau. Le
// piege, qui a coute le decalage d'un jour constate depuis Tahiti le
// 21/09/2026 (etape 8M) :
//
//   new Date('2026-12-19')     -> le 19 a MINUIT UTC
//     .getDate()               -> 19 a Paris (UTC+1), mais 18 a Tahiti (UTC-10)
//     .toISOString()           -> '2026-12-19' partout
//
// Les deux lectures donnent le meme resultat a l'est de Greenwich et se
// separent d'un jour a l'ouest. Les melanger dans un meme ecran -- le libelle
// lu en local, la cle de recherche ecrite en UTC -- decale tout le planning.
//
// LA REGLE DU MODULE
//   . une date de garde ne se convertit JAMAIS : on la lit et on l'ecrit avec
//     les fonctions ci-dessous, qui restent dans le calendrier affiche ;
//   . la seule notion qui ait besoin d'un fuseau est « aujourd'hui », et c'est
//     celui du CABINET : la garde du dimanche matin a Dijon est celle du
//     dimanche, qu'on la regarde depuis Dijon ou depuis Papeete.
//
// toISOString() reste la bonne fonction pour un vrai instant (created_at,
// requested_at, updated_at...). Elle est a proscrire sur une date de garde.
// ---------------------------------------------------------------------------

const FUSEAU_CABINET = 'Europe/Paris';

/**
 * Une Date -> le jour qu'elle affiche, au format 'AAAA-MM-JJ'.
 * Aucune conversion : on recopie les chiffres du calendrier local.
 */
export function jourLocal(date: Date): string {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  const quantieme = String(date.getDate()).padStart(2, '0');
  return `${annee}-${mois}-${quantieme}`;
}

/**
 * 'AAAA-MM-JJ' -> une Date placee a MIDI, heure locale.
 *
 * Midi et non minuit : il reste douze heures de marge de chaque cote, si bien
 * qu'aucun changement d'heure d'ete ni aucun arrondi ne peut faire basculer la
 * date d'un jour. Garantie : jourLocal(depuisJour(j)) === j, dans tout fuseau.
 */
export function depuisJour(jour: string): Date {
  const [annee, mois, quantieme] = jour.split('-').map(Number);
  return new Date(annee, mois - 1, quantieme, 12, 0, 0, 0);
}

/**
 * Le jour qu'il est AU CABINET, au format 'AAAA-MM-JJ'.
 *
 * Passe par Intl plutot que par un decalage en dur : l'heure d'ete francaise
 * est ainsi geree par le navigateur, sans table a tenir a jour.
 */
export function aujourdhuiCabinet(): string {
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_CABINET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const lire = (type: string) => parties.find(p => p.type === type)?.value ?? '';
  return `${lire('year')}-${lire('month')}-${lire('day')}`;
}

/**
 * Libelle francais d'une date de garde, sans jamais changer de jour.
 * Par defaut : « samedi 19 décembre 2026 ».
 */
export function libelleJour(
  jour: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }
): string {
  return depuisJour(jour).toLocaleDateString('fr-FR', options);
}

/** Libelle court d'une date de garde : « 19/12/2026 ». */
export function libelleJourCourt(jour: string): string {
  return libelleJour(jour, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
