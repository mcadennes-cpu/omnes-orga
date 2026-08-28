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

// `exportPlanningMatrixToCSV` vivait ici jusqu'au 28/08/2026 (8B-3). Elle
// produisait un CSV en tableau que le tableur affichait sans mise en forme, et
// portait deux defauts propres a ce format : les libelles de lignes repetaient
// le site (« J1 BEAUNE BEAUNE »), et une garde non pourvue affichait le NOMBRE
// de demandes en attente dans la colonne des noms. Remplacee par
// `printPlanning.ts`, qui rend la grille de la vue Semaine, en noir et blanc.
