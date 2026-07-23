import { supabase } from './supabase';

type ExportOptions = {
  startDate: string;
  endDate: string;
  siteFilter: 'all' | 'Dijon' | 'Beaune';
  includeFreeShifts: boolean;
  includeAssignedShifts: boolean;
};

type MatrixExportOptions = {
  startDate: string;
  endDate: string;
};

type ExportResult = {
  success: boolean;
  error?: string;
};

const DAYS_OF_WEEK = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function getDayOfWeek(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00');
  return DAYS_OF_WEEK[date.getDay()];
}

function getStatusLabel(status: string, hasOnHoldRequests: boolean): string {
  if (status === 'assigned') return 'Assignée';
  if (status === 'unassigned') {
    if (hasOnHoldRequests) return 'Pré-validation';
    return 'Libre';
  }
  if (status === 'pending') return 'En attente de validation';
  return status;
}

function escapeCSVField(field: string | null | undefined): string {
  if (!field) return '';
  const stringField = String(field);
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

export async function exportPlanningToCSV(options: ExportOptions): Promise<ExportResult> {
  try {
    let query = supabase
      .from('shifts')
      .select(`
        id,
        date,
        location,
        room,
        shift_type,
        status,
        shift_type_data:shift_types!shift_type_id(time_range),
        assigned_doctor:profiles!assigned_doctor_id(full_name),
        requests(id, status, doctor_id)
      `)
      .gte('date', options.startDate)
      .lte('date', options.endDate)
      .order('date', { ascending: true })
      .order('location', { ascending: true })
      .order('room', { ascending: true });

    if (options.siteFilter !== 'all') {
      query = query.eq('location', options.siteFilter);
    }

    const { data: shifts, error } = await query;

    if (error) {
      console.error('Error fetching shifts for export:', error);
      return { success: false, error: 'Erreur lors de la récupération des données.' };
    }

    if (!shifts || shifts.length === 0) {
      return { success: false, error: 'Aucune garde trouvée sur cette période.' };
    }

    const filteredShifts = shifts.filter((shift) => {
      const isAssigned = shift.status === 'assigned';
      const isFree = shift.status === 'unassigned' || shift.status === 'pending';

      if (isAssigned && !options.includeAssignedShifts) return false;
      if (isFree && !options.includeFreeShifts) return false;

      return true;
    });

    if (filteredShifts.length === 0) {
      return { success: false, error: 'Aucune garde ne correspond aux critères sélectionnés.' };
    }

    const sortedShifts = filteredShifts.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.location !== b.location) return a.location.localeCompare(b.location);
      if (a.room !== b.room) return a.room.localeCompare(b.room);

      const timeRangeA = (a.shift_type_data as any)?.time_range || '';
      const timeRangeB = (b.shift_type_data as any)?.time_range || '';
      return timeRangeA.localeCompare(timeRangeB);
    });

    const csvHeaders = [
      'Date',
      'Jour',
      'Site',
      'Salle',
      'Horaire',
      'Statut',
      'Médecin assigné'
    ];

    const csvRows = sortedShifts.map((shift) => {
      const hasOnHoldRequests = Array.isArray(shift.requests) &&
        shift.requests.some((r: any) => r.status === 'on_hold');

      const assignedDoctor = shift.assigned_doctor
        ? (shift.assigned_doctor as any).full_name
        : '';

      const timeRange = (shift.shift_type_data as any)?.time_range || shift.shift_type || '';

      return [
        escapeCSVField(shift.date),
        escapeCSVField(getDayOfWeek(shift.date)),
        escapeCSVField(shift.location),
        escapeCSVField(shift.room),
        escapeCSVField(timeRange),
        escapeCSVField(getStatusLabel(shift.status, hasOnHoldRequests)),
        escapeCSVField(assignedDoctor)
      ];
    });

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `planning_${options.startDate}_${options.endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true };
  } catch (err) {
    console.error('Unexpected error during export:', err);
    return { success: false, error: 'Une erreur inattendue est survenue.' };
  }
}

export async function exportPlanningMatrixToCSV(options: MatrixExportOptions): Promise<ExportResult> {
  try {
    const { data: shifts, error: shiftsError } = await supabase
      .from('shifts')
      .select(`
        id,
        date,
        location,
        room,
        status,
        shift_type_data:shift_types!shift_type_id(name, time_range),
        assigned_doctor:profiles!assigned_doctor_id(full_name),
        requests(id, status, doctor_id)
      `)
      .gte('date', options.startDate)
      .lte('date', options.endDate)
      .order('date', { ascending: true });

    if (shiftsError) {
      console.error('Error fetching shifts:', shiftsError);
      return { success: false, error: 'Erreur lors de la récupération des données.' };
    }

    if (!shifts || shifts.length === 0) {
      return { success: false, error: 'Aucune garde trouvée sur cette période.' };
    }

    const roomTimeSlotSet = new Set<string>();
    const dateSet = new Set<string>();

    shifts.forEach((shift) => {
      const shiftTypeName = (shift.shift_type_data as any)?.name || '';
      const roomTimeSlotKey = `${shift.location} - ${shift.room} - ${shiftTypeName} ${shift.location}`.toUpperCase();
      roomTimeSlotSet.add(roomTimeSlotKey);
      dateSet.add(shift.date);
    });

    const sortedRoomTimeSlots = Array.from(roomTimeSlotSet).sort();
    const sortedDates = Array.from(dateSet).sort();

    const shiftsByRoomTimeSlotDate = new Map<string, any>();

    shifts.forEach((shift) => {
      const shiftTypeName = (shift.shift_type_data as any)?.name || '';
      const roomTimeSlotKey = `${shift.location} - ${shift.room} - ${shiftTypeName} ${shift.location}`.toUpperCase();
      const dateKey = shift.date;
      const key = `${roomTimeSlotKey}|${dateKey}`;

      shiftsByRoomTimeSlotDate.set(key, shift);
    });

    const headerRow: string[] = ['Salle / Horaire'];
    sortedDates.forEach(date => {
      const dayOfWeek = getDayOfWeek(date);
      const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit'
      });
      headerRow.push(`${dayOfWeek} ${formattedDate}`);
    });

    const dataRows: string[][] = [];

    sortedRoomTimeSlots.forEach((roomTimeSlot) => {
      const row: string[] = [roomTimeSlot];

      sortedDates.forEach((date) => {
        const key = `${roomTimeSlot}|${date}`;
        const shift = shiftsByRoomTimeSlotDate.get(key);

        if (!shift) {
          row.push('');
        } else {
          if (shift.status === 'assigned' && shift.assigned_doctor) {
            const doctorName = (shift.assigned_doctor as any).full_name || '';
            row.push(escapeCSVField(doctorName));
          } else {
            const pendingRequests = Array.isArray(shift.requests)
              ? shift.requests.filter((r: any) => r.status === 'pending' || r.status === 'on_hold')
              : [];

            if (pendingRequests.length > 0) {
              row.push(escapeCSVField(pendingRequests.length.toString()));
            } else {
              row.push('');
            }
          }
        }
      });

      dataRows.push(row);
    });

    const csvContent = [
      headerRow.map(h => escapeCSVField(h)).join(','),
      ...dataRows.map(row => row.join(','))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `planning_matrice_${options.startDate}_${options.endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true };
  } catch (err) {
    console.error('Unexpected error during matrix export:', err);
    return { success: false, error: 'Une erreur inattendue est survenue.' };
  }
}
