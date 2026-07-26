import { supabase } from './supabase';
import { isDebugEnabled, enableDebug, logRotationCalculation } from './rotationDebug';

type RotationSettings = {
  start_date: string;
  cycle_length_weeks: number;
};

let cachedSettings: RotationSettings | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 60000;

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

  const settings = await getRotationSettings();
  if (!settings) return shifts;

  const { data: rules, error } = await supabase
    .from('rotation_assignment_rules')
    .select('doctor_id, site_id, room_id, shift_type_id, weekday, rotation_week');

  if (error || !rules || rules.length === 0) {
    return shifts;
  }

  return shifts.map(shift => {
    const shiftDate = new Date(shift.date + 'T12:00:00');
    const weekday = shiftDate.getDay();
    const rotationWeek = getRotationWeek(shiftDate, settings);

    const matchingRule = rules.find(rule =>
      rule.site_id === shift.site_id &&
      rule.room_id === shift.room_id &&
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
