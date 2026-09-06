// Couleur d'une garde selon son horaire (et le week-end), pour rendre le
// planning lisible d'un coup d'oeil. Echelle semantique volontairement etendue
// a 5 couleurs de marque (comme la palette d'avatars) — deroge au principe
// "une couleur d'accent par module", assume et documente.
//
// Mapping decide avec Matthieu (couleurs "jour / nuit", maj 03/09/2026) :
//   08:00-14:00 (matin court, J6)      -> ocre   (jaune)
//   08:00-16:00 (matin, J1)            -> olive  (vert de la marque)
//   08:00-18:30 (journee)              -> canard (bleu ciel)
//   14:00+ (apres-midi / soir, J2...)  -> marine (bleu fonce)
//   fin a 22:00 ou plus tard (nuit)    -> marine (bleu fonce)
//   samedi / dimanche (week-end)       -> brique (rouge)
//   non reconnu                        -> neutre
//
// La couleur est portee par un lisere en L — bordure basse + bordure droite,
// 3 px — sur la carte de garde, dans "Mes gardes" et "Planning du jour"
// (03/09/2026). Auparavant c'etait un bandeau plein ; le champ `bandClass` qui
// le servait a ete retire avec lui, faute d'usage.
//
// Pourquoi une BORDURE et non un rectangle pose : seule une bordure epouse
// l'arrondi des coins a epaisseur constante. Deux rectangles se croisent
// forcement en angle droit dans le coin bas-droit, ce qui se voit.
//
// IMPORTANT : les classes Tailwind sont ecrites en toutes lettres (jamais
// construites dynamiquement) sinon le purge Tailwind ne les inclut pas.

export type HoraireKey = 'matinCourt' | 'matin' | 'journee' | 'apresMidi' | 'weekend' | 'autre';

export interface HoraireStyle {
  key: HoraireKey;
  /** Couleur de bordure, pour le lisere en L de la carte de garde. */
  borderClass: string;
}

export const HORAIRE_STYLES: Record<HoraireKey, HoraireStyle> = {
  matinCourt: { key: 'matinCourt', borderClass: 'border-ocre' },
  matin:      { key: 'matin',      borderClass: 'border-olive' },
  journee:    { key: 'journee',    borderClass: 'border-canard' },
  apresMidi:  { key: 'apresMidi',  borderClass: 'border-marine' },
  weekend:    { key: 'weekend',    borderClass: 'border-brique' },
  autre:      { key: 'autre',      borderClass: 'border-border' },
};

// Jour de la semaine sans decalage de fuseau (dateStr = 'YYYY-MM-DD').
function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}

// Extrait (debut, fin) en minutes depuis un horaire "HH:MM-HH:MM" ou "8h-14h".
function parseRange(shiftType: string): { start: number; end: number } | null {
  const m = shiftType.match(/(\d{1,2})[:h](\d{2})?\s*[-–]\s*(\d{1,2})[:h](\d{2})?/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2] || 0);
  const end = Number(m[3]) * 60 + Number(m[4] || 0);
  return { start, end };
}

// Cle d'horaire d'une garde. Le week-end prime sur l'horaire.
export function resolveHoraire(shiftType: string, dateStr: string): HoraireKey {
  if (isWeekend(dateStr)) return 'weekend';

  const range = parseRange(shiftType);
  if (!range) return 'autre';

  if (range.start >= 14 * 60) return 'apresMidi';
  // Garde de nuit : finir a 22:00 ou plus tard suffit, meme en commencant le
  // matin. Cas reel : J2 Beaune, dont les gardes portent "10:00-22:00" — sans
  // cette regle elle tombait en "journee" (canard) faute de demarrer apres
  // 14:00. Le seuil est bien 22:00 et non 20:00, sinon J5 Dijon (12:00-20:00)
  // et les week-ends (08:00-20:00) basculeraient aussi.
  if (range.end >= 22 * 60) return 'apresMidi';
  if (range.end <= 14 * 60) return 'matinCourt';
  if (range.end <= 16 * 60) return 'matin';
  return 'journee';
}

export function getHoraireStyle(shiftType: string, dateStr: string): HoraireStyle {
  return HORAIRE_STYLES[resolveHoraire(shiftType, dateStr)];
}
