import { Shift } from './supabase';

// Source unique des 4 etats visuels d'une garde, mappes sur la palette Omnes.
// Remplace les getStatusBadge / getStatusColor dupliques dans chaque vue.
//
// Correspondance decidee avec Matthieu (etape 4) :
//   libre     -> canard (teal)   "a prendre"
//   demandes  -> ocre  (ambre)   "a trancher"  (texte ocre-fonce pour le contraste)
//   prevalide -> marine (navy)   "presque acte"
//   assigne   -> olive (vert)    "acte"
export type AgendaStatusKey = 'libre' | 'demandes' | 'prevalide' | 'assigne';

export interface AgendaStatusStyle {
  key: AgendaStatusKey;
  /** Libelle court (casse normale) ; les badges appliquent la casse eux-memes. */
  label: string;
  /** Pastille de badge : fond pastel + texte + bordure. */
  badgeClass: string;
  /** Fond pastel + texte, sans bordure (chips de comptage du calendrier). */
  softClass: string;
  /** Pastille pleine (points du calendrier mensuel). */
  dotClass: string;
}

export const STATUS_STYLES: Record<AgendaStatusKey, AgendaStatusStyle> = {
  libre: {
    key: 'libre',
    label: 'Libre',
    badgeClass: 'bg-canard/10 text-canard border-canard/20',
    softClass: 'bg-canard/10 text-canard',
    dotClass: 'bg-canard',
  },
  demandes: {
    key: 'demandes',
    label: 'Demandes en attente',
    badgeClass: 'bg-ocre/15 text-ocre-fonce border-ocre/30',
    softClass: 'bg-ocre/15 text-ocre-fonce',
    dotClass: 'bg-ocre',
  },
  prevalide: {
    key: 'prevalide',
    label: 'Pré-validé',
    badgeClass: 'bg-marine/10 text-marine border-marine/20',
    softClass: 'bg-marine/10 text-marine',
    dotClass: 'bg-marine',
  },
  assigne: {
    key: 'assigne',
    label: 'Assigné',
    badgeClass: 'bg-olive/12 text-olive border-olive/25',
    softClass: 'bg-olive/12 text-olive',
    dotClass: 'bg-olive',
  },
};

// Logique de reference (reprise fidelement de MonthView.getStatusColor) pour
// deriver la cle de statut a partir d'une garde. Les vues qui partagent cette
// logique peuvent l'utiliser directement ; celles qui derivent l'etat
// autrement (ex. EnhancedCalendarView pre-transforme `status`) mappent
// simplement leur ancienne couleur vers la cle correspondante.
export function resolveShiftStatus(shift: Shift): AgendaStatusKey {
  if (shift.status === 'free') return 'libre';

  const onHold = (shift as any).onHoldRequestsCount || 0;
  if (onHold > 0) return 'prevalide';

  const pending = shift.pendingRequestsCount || 0;
  if (pending > 0) return 'demandes';

  if (shift.status === 'pending' && shift.assigned_doctor_id) return 'prevalide';
  if (shift.status === 'pending') return 'demandes';

  return 'assigne';
}
