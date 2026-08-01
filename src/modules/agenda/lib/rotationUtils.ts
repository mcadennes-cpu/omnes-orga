import { supabase } from './supabase';
import { isDebugEnabled, enableDebug, logRotationCalculation } from './rotationDebug';

type RotationSettings = {
  start_date: string;
  cycle_length_weeks: number;
};

// ---------------------------------------------------------------------------
// Plans de roulement versionnes (MOD-1, etape 6B)
//
// Un plan porte SON PROPRE ancrage de cycle (start_date) et sa periode
// d'application (effective_from / effective_to). Les deux sont distincts : le
// roulement V2 est ancre au lundi 30/11/2026 pour que le 04/01/2027 tombe en
// S6 — la numerotation que lisent les medecins reste ainsi continue — mais il
// n'entre en vigueur qu'au 04/01/2027.
//
// C'est ce qui corrige le defaut le plus grave de l'ancien systeme : la semaine
// n'etant plus un modulo depuis UNE date globale, changer la duree du cycle ne
// decale plus retroactivement les plannings deja publies.
//
// TRANSITION (etape 6C) : ces fonctions coexistent volontairement avec
// getRotationSettings / l'ancien getRotationWeek le temps de 6C-1. Les
// consommateurs basculent en 6C-2, l'ancien systeme disparait en 6C-4.
// ---------------------------------------------------------------------------

export type RotationPlan = {
  id: string;
  name: string;
  start_date: string;
  cycle_length_weeks: number;
  effective_from: string;
  effective_to: string | null;
};

let cachedSettings: RotationSettings | null = null;
let lastFetchTime = 0;
let cachedPlans: RotationPlan[] | null = null;
let lastPlansFetchTime = 0;
const CACHE_DURATION = 60000;

// Charge les plans en vigueur. Ils sont peu nombreux (un actif, plus le suivant
// une fois prepare) : tout charger d'un coup et resoudre par date en memoire
// evite une requete par date — MonthView en calcule une par jour affiche.
export async function getRotationPlans(): Promise<RotationPlan[]> {
  const now = Date.now();

  if (cachedPlans && now - lastPlansFetchTime < CACHE_DURATION) {
    return cachedPlans;
  }

  try {
    const { data, error } = await supabase
      .from('rotation_plans')
      .select('id, name, start_date, cycle_length_weeks, effective_from, effective_to')
      .eq('status', 'active')
      .order('effective_from', { ascending: true });

    if (error) {
      console.error('Error fetching rotation plans:', error);
      return cachedPlans ?? [];
    }

    cachedPlans = data ?? [];
    lastPlansFetchTime = now;
    return cachedPlans;
  } catch (err) {
    console.error('Error fetching rotation plans:', err);
    return cachedPlans ?? [];
  }
}

// Formate une date locale en 'YYYY-MM-DD'. toISOString() est a proscrire ici :
// il convertit en UTC et fait basculer d'un jour selon l'heure et le fuseau.
function toIsoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Quel plan s'applique a cette date ?
//
// La resolution se fait sur le LUNDI de la semaine visee, pas sur la date elle
// meme : un roulement s'applique par semaine entiere, et c'est deja le lundi
// que retient le calcul de la semaine de roulement. Une semaine releve donc
// toujours d'un seul plan, meme si une date d'entree en vigueur tombait en
// milieu de semaine.
//
// Renvoie null si aucun plan ne couvre la date — meme comportement que
// l'ancien getRotationSettings() sans ligne en base : l'appelant s'abstient.
export function getPlanForDate(date: Date, plans: RotationPlan[]): RotationPlan | null {
  const target = new Date(date);
  target.setHours(12, 0, 0, 0);
  const day = target.getDay();
  target.setDate(target.getDate() + (day === 0 ? -6 : 1 - day));

  const jour = toIsoDay(target);

  // Les chaines 'YYYY-MM-DD' se comparent dans l'ordre chronologique.
  // Plans tries par effective_from croissant : le dernier qui couvre la date
  // est le plus recent, donc celui qui prime.
  let trouve: RotationPlan | null = null;
  for (const plan of plans) {
    if (plan.effective_from <= jour && (plan.effective_to === null || jour <= plan.effective_to)) {
      trouve = plan;
    }
  }
  return trouve;
}

// Confort pour les appelants qui n'ont qu'une date a traiter.
export async function getPlanForDateAsync(date: Date): Promise<RotationPlan | null> {
  return getPlanForDate(date, await getRotationPlans());
}

export function clearRotationPlansCache() {
  cachedPlans = null;
  lastPlansFetchTime = 0;
}

if (isDebugEnabled()) {
  enableDebug();
  console.log('🔄 Rotation debug mode ENABLED');
  console.log('  • Access debug logs via: window.__rotationDebug.logs');
  console.log('  • Export logs via: window.__rotationDebug.export()');
  console.log('  • Show help via: window.__rotationDebug.help()');
}

export async function getRotationSettings(): Promise<RotationSettings | null> {
  const now = Date.now();

  if (cachedSettings && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedSettings;
  }

  try {
    const { data, error } = await supabase
      .from('rotation_settings')
      .select('start_date, cycle_length_weeks')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching rotation settings:', error);
      return null;
    }

    cachedSettings = data;
    lastFetchTime = now;
    return data;
  } catch (err) {
    console.error('Error fetching rotation settings:', err);
    return null;
  }
}

export function clearRotationCache() {
  cachedSettings = null;
  lastFetchTime = 0;
}

// Accepte indifféremment un RotationSettings (ancien systeme) ou un
// RotationPlan : les deux portent start_date et cycle_length_weeks, et
// l'arithmetique est la meme. C'est volontaire — reutiliser cette fonction
// telle quelle est ce qui garantit l'iso-comportement de la bascule 6C.
export function getRotationWeek(date: Date, settings: RotationSettings, debugContext?: { componentName?: string; inputOrigin?: string }): number {
  const startDate = new Date(settings.start_date + 'T12:00:00');
  startDate.setHours(12, 0, 0, 0);

  const targetDate = new Date(date);
  targetDate.setHours(12, 0, 0, 0);

  const dayOfWeek = targetDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mondayOfTargetWeek = new Date(targetDate);
  mondayOfTargetWeek.setDate(targetDate.getDate() + mondayOffset);
  mondayOfTargetWeek.setHours(12, 0, 0, 0);

  const diffTime = mondayOfTargetWeek.getTime() - startDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);

  const rotationWeek = ((diffWeeks % settings.cycle_length_weeks) + settings.cycle_length_weeks) % settings.cycle_length_weeks + 1;

  if (isDebugEnabled()) {
    logRotationCalculation(
      debugContext?.componentName || 'getRotationWeek',
      date,
      debugContext?.inputOrigin || 'unknown',
      settings.start_date,
      settings,
      {
        targetDate,
        mondayOfTargetWeek,
        diffTime,
        diffDays,
        diffWeeks,
        rotationWeek,
      }
    );
  }

  return rotationWeek;
}

// Calcul repete a l'identique partout ou l'on place une garde dans le roulement :
// la semaine de roulement (via getRotationWeek) et le jour de la semaine (0-6).
// Le weekday est lu sur la meme date que celle passee a getRotationWeek, pour
// rester strictement iso-comportement avec les appels inline d'origine.
export function getRotationSlot(
  date: Date,
  settings: RotationSettings,
  debugContext?: { componentName?: string; inputOrigin?: string }
): { rotationWeek: number; weekday: number } {
  return {
    rotationWeek: getRotationWeek(date, settings, debugContext),
    weekday: date.getDay(),
  };
}

export function getWeekDates(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);

  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

type ShiftData = {
  date: string;
  site_id: string;
  room_id: string;
  shift_type_id: string;
  status: string;
  assigned_doctor_id?: string | null;
};

export async function applyRotationRulesToShifts(shifts: ShiftData[]): Promise<ShiftData[]> {
  if (shifts.length === 0) return shifts;

  const plans = await getRotationPlans();
  if (plans.length === 0) return shifts;

  const { data: rules, error } = await supabase
    .from('rotation_plan_rules')
    .select('plan_id, doctor_id, site_id, shift_type_id, weekday, rotation_week');

  if (error || !rules || rules.length === 0) {
    return shifts;
  }

  return shifts.map(shift => {
    const shiftDate = new Date(shift.date + 'T12:00:00');

    // Chaque garde resout SON plan : une creation a cheval sur deux plans
    // (fin decembre / debut janvier) applique le bon roulement de part et
    // d'autre, sans traitement particulier.
    const plan = getPlanForDate(shiftDate, plans);
    if (!plan) return shift;

    const weekday = shiftDate.getDay();
    const rotationWeek = getRotationWeek(shiftDate, plan);

    // ⚠️ `find` ne retient qu'UN medecin par case. Depuis 6B, une case peut
    // en porter deux — c'est tout l'objet du « Doublon » du week-end. Une
    // garde n'ayant qu'un assigned_doctor_id, generer un doublon demandera
    // de creer DEUX gardes : sujet de 6H (prévisualisation / generation).
    // Conserve tel quel ici pour rester a iso-comportement.
    // Plus de comparaison de salle depuis 6B-3 : la salle est une propriete du
    // creneau (shift_types.default_room_id), pas du roulement -- le fichier n'en
    // parle pas. Une garde placee exceptionnellement dans une autre salle
    // retrouve donc bien son medecin, ce qui n'etait pas le cas avant.
    const matchingRule = rules.find(rule =>
      rule.plan_id === plan.id &&
      rule.site_id === shift.site_id &&
      rule.shift_type_id === shift.shift_type_id &&
      rule.weekday === weekday &&
      rule.rotation_week === rotationWeek
    );

    if (matchingRule) {
      return {
        ...shift,
        status: 'assigned',
        assigned_doctor_id: matchingRule.doctor_id
      };
    }

    return shift;
  });
}
