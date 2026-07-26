// Couleur d'une garde selon son horaire (et le week-end), pour rendre le
// planning lisible d'un coup d'oeil. Echelle semantique volontairement etendue
// a 5 couleurs de marque (comme la palette d'avatars) — deroge au principe
// "une couleur d'accent par module", assume et documente.
//
// Mapping decide avec Matthieu (couleurs "jour / nuit", maj 26/07/2026) :
//   08:00-14:00 (matin court, J6)      -> ocre   (jaune)
//   08:00-16:00 (matin, J1)            -> olive  (vert de la marque)
//   08:00-18:30 (journee)              -> canard (bleu ciel)
//   14:00+ (apres-midi / soir, J2...)  -> marine (bleu fonce)
//   samedi / dimanche (week-end)       -> brique (rouge)
//   non reconnu                        -> neutre
//
// La couleur sert de bandeau plein "teinte soutenue" (fond + texte) en tete de
// la carte de garde, dans "Mes gardes" et "Planning du jour".
//
// IMPORTANT : les classes Tailwind sont ecrites en toutes lettres (jamais
// construites dynamiquement) sinon le purge Tailwind ne les inclut pas.

export type HoraireKey = 'matinCourt' | 'matin' | 'journee' | 'apresMidi' | 'weekend' | 'autre';

export interface HoraireStyle {
  key: HoraireKey;
  /** Bandeau plein (fond + couleur de texte) en tete de la carte de garde. */
  bandClass: string;
}

export const HORAIRE_STYLES: Record<HoraireKey, HoraireStyle> = {
  matinCourt: { key: 'matinCourt', bandClass: 'bg-ocre text-marine' },
  matin:      { key: 'matin',      bandClass: 'bg-olive text-white' },
  journee:    { key: 'journee',    bandClass: 'bg-canard text-white' },
  apresMidi:  { key: 'apresMidi',  bandClass: 'bg-marine text-white' },
  weekend:    { key: 'weekend',    bandClass: 'bg-brique text-white' },
  autre:      { key: 'autre',      bandClass: 'bg-fond text-ink' },
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
