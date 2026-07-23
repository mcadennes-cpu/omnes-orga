// Couleur d'une garde selon son horaire (et le week-end), pour rendre le
// planning lisible d'un coup d'oeil. Echelle semantique volontairement etendue
// a 5 couleurs de marque (comme la palette d'avatars) — deroge au principe
// "une couleur d'accent par module", assume et documente.
//
// Mapping decide avec Matthieu (23/07/2026) :
//   08:00-14:00 (matin court, J6)      -> olive  (vert)
//   08:00-16:00 (matin, J1)            -> ocre   (jaune)
//   08:00-18:30 (journee)              -> canard (bleu ciel)
//   14:00+ (apres-midi / soir, J2...)  -> marine (bleu fonce)
//   samedi / dimanche (week-end)       -> brique (rouge)
//   non reconnu                        -> neutre
//
// IMPORTANT : les classes Tailwind sont ecrites en toutes lettres (jamais
// construites dynamiquement) sinon le purge Tailwind ne les inclut pas.

export type HoraireKey = 'matinCourt' | 'matin' | 'journee' | 'apresMidi' | 'weekend' | 'autre';

export interface HoraireStyle {
  key: HoraireKey;
  /** Fond pastel + barre d'accent a gauche, pour la carte de garde. */
  cardClass: string;
  /** Couleur de texte assortie (libelle d'horaire). */
  accentText: string;
}

export const HORAIRE_STYLES: Record<HoraireKey, HoraireStyle> = {
  matinCourt: { key: 'matinCourt', cardClass: 'border-l-4 border-olive bg-olive/10', accentText: 'text-olive' },
  matin:      { key: 'matin',      cardClass: 'border-l-4 border-ocre bg-ocre/10',   accentText: 'text-ocre-fonce' },
  journee:    { key: 'journee',    cardClass: 'border-l-4 border-canard bg-canard/10', accentText: 'text-canard' },
  apresMidi:  { key: 'apresMidi',  cardClass: 'border-l-4 border-marine bg-marine/10', accentText: 'text-marine' },
  weekend:    { key: 'weekend',    cardClass: 'border-l-4 border-brique bg-brique/10', accentText: 'text-brique' },
  autre:      { key: 'autre',      cardClass: 'border-l-4 border-border bg-fond',    accentText: 'text-muted' },
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
  if (range.end <= 14 * 60) return 'matinCourt';
  if (range.end <= 16 * 60) return 'matin';
  return 'journee';
}

export function getHoraireStyle(shiftType: string, dateStr: string): HoraireStyle {
  return HORAIRE_STYLES[resolveHoraire(shiftType, dateStr)];
}
