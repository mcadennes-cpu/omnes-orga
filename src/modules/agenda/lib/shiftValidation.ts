import { supabase } from './supabase';

export type ConflictingShift = {
  shiftId: string;
  date: string;
  timeRange: string;
  site: string;
  room: string;
  status: 'assigned' | 'prevalidated';
};

export type ValidationResult = {
  isValid: boolean;
  conflict?: ConflictingShift;
  errorMessage?: string;
};

export async function checkDoctorDailyConflict(
  doctorId: string,
  targetShiftDate: string,
  targetShiftId: string,
  doctorName?: string
): Promise<ValidationResult> {
  try {
    const { data: assignedShifts, error: assignedError } = await supabase
      .from('shifts')
      .select(`
        id,
        date,
        location,
        room,
        shift_type,
        status,
        shift_type_data:shift_types!shift_type_id(time_range),
        assigned_doctor_id
      `)
      .eq('date', targetShiftDate)
      .neq('id', targetShiftId)
      .eq('status', 'assigned')
      .eq('assigned_doctor_id', doctorId);

    if (assignedError) {
      console.error('Error checking for assigned conflicts:', assignedError);
      return {
        isValid: false,
        errorMessage: 'Erreur lors de la vérification des conflits.'
      };
    }

    if (assignedShifts && assignedShifts.length > 0) {
      const shift = assignedShifts[0];
      const timeRange = (shift.shift_type_data as any)?.time_range || shift.shift_type || 'horaire non spécifié';
      const site = shift.location || 'site non spécifié';
      const displayName = doctorName || 'Ce médecin';

      return {
        isValid: false,
        conflict: {
          shiftId: shift.id,
          date: shift.date,
          timeRange,
          site,
          room: shift.room,
          status: 'assigned'
        },
        errorMessage: `Impossible d'assigner cette garde.\n${displayName} a déjà une garde ce jour-là :\n\n${timeRange} – ${site}\n\nVeuillez d'abord annuler cette garde avant d'en réserver une autre pour ce jour.`
      };
    }

    const { data: prevalidatedRequests, error: prevalidatedError } = await supabase
      .from('requests')
      .select(`
        id,
        shift_id,
        status,
        shifts!inner(
          id,
          date,
          location,
          room,
          shift_type,
          shift_type_data:shift_types!shift_type_id(time_range)
        )
      `)
      .eq('doctor_id', doctorId)
      .eq('status', 'on_hold')
      .eq('shifts.date', targetShiftDate)
      .neq('shift_id', targetShiftId);

    if (prevalidatedError) {
      console.error('Error checking for prevalidated conflicts:', prevalidatedError);
      return {
        isValid: false,
        errorMessage: 'Erreur lors de la vérification des conflits.'
      };
    }

    if (prevalidatedRequests && prevalidatedRequests.length > 0) {
      const request = prevalidatedRequests[0];
      const shift = (request.shifts as any);
      const timeRange = shift.shift_type_data?.time_range || shift.shift_type || 'horaire non spécifié';
      const site = shift.location || 'site non spécifié';
      const displayName = doctorName || 'Ce médecin';

      return {
        isValid: false,
        conflict: {
          shiftId: shift.id,
          date: shift.date,
          timeRange,
          site,
          room: shift.room,
          status: 'prevalidated'
        },
        errorMessage: `Impossible d'assigner cette garde.\n${displayName} a déjà une garde ce jour-là :\n\n${timeRange} – ${site}\n\nVeuillez d'abord annuler cette garde avant d'en réserver une autre pour ce jour.`
      };
    }

    return { isValid: true };
  } catch (err) {
    console.error('Exception checking for conflicts:', err);
    return {
      isValid: false,
      errorMessage: 'Erreur inattendue lors de la vérification des conflits.'
    };
  }
}
