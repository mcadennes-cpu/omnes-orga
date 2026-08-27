import { useState, useEffect } from 'react';
import { supabase, supabaseOrga, Shift, Profile } from '../lib/supabase';
import { ClipboardList, CheckCircle, Download } from 'lucide-react';
import CalendarFilters from './calendar/CalendarFilters';
import WeekView from './calendar/WeekView';
import MonthView from './calendar/MonthView';
import ShiftDetailModal from './ShiftDetailModal';
import AssignDoctorModal from './AssignDoctorModal';
import BulkAssignPrevalidatedModal from './BulkAssignPrevalidatedModal';
import ExportPlanningModal from './ExportPlanningModal';
import StatusBadge from './ui/StatusBadge';
import { AgendaStatusKey } from '../lib/statusStyles';

type RequestsCalendarViewProps = {
  currentUser: Profile;
};

export default function RequestsCalendarView({ currentUser }: RequestsCalendarViewProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [locationFilter, setLocationFilter] = useState<'all' | 'Dijon' | 'Beaune'>('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [shiftTypeFilter, setShiftTypeFilter] = useState('all');
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [availableDoctors, setAvailableDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [prevalidatedCount, setPrevalidatedCount] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    loadShifts();
    loadDoctors();

    const subscription = supabaseOrga
      .channel('requests_calendar_changes')
      .on('postgres_changes', { event: '*', schema: 'agenda', table: 'shifts' }, () => {
        loadShifts();
      })
      .on('postgres_changes', { event: '*', schema: 'agenda', table: 'requests' }, () => {
        loadShifts();
      })
      .subscribe();

    // Annulation depuis le bandeau ephemere (MOD2-E), qui vit au-dessus des
    // vues. Le temps reel ferait double emploi, mais il n'est pas encore
    // active en beta -- on ne depend donc pas de lui.
    const recharger = () => loadShifts();
    window.addEventListener('agenda:rafraichir', recharger);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('agenda:rafraichir', recharger);
    };
  }, [selectedDate, viewMode, locationFilter, roomFilter, doctorFilter, shiftTypeFilter]);

  // is_agenda_doctor : « qui peut tenir une garde », a ne pas confondre avec
  // le role, qui porte les permissions (voir 23-3).
  const loadDoctors = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_agenda_doctor', true)
      .order('full_name');

    if (data) {
      setAvailableDoctors(data.map(d => ({ id: d.id, name: d.full_name })));
    }
  };

  const getDateRange = () => {
    const date = new Date(selectedDate);

    if (viewMode === 'week') {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay() + 1);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      return {
        start: startOfWeek.toISOString().split('T')[0],
        end: endOfWeek.toISOString().split('T')[0]
      };
    } else {
      const year = date.getFullYear();
      const month = date.getMonth();
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0);

      return {
        start: startOfMonth.toISOString().split('T')[0],
        end: endOfMonth.toISOString().split('T')[0]
      };
    }
  };

  const loadShifts = async () => {
    setLoading(true);
    const { start, end } = getDateRange();

    let query = supabase
      .from('shifts')
      .select(`
        *,
        assigned_doctor:profiles!assigned_doctor_id(id, full_name, email),
        shift_type_data:shift_types!shift_type_id(id, name, time_range),
        requests(id, status, doctor_id, doctor:profiles!doctor_id(id, full_name, email))
      `)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .order('shift_type', { ascending: true });

    if (locationFilter !== 'all') {
      query = query.eq('location', locationFilter);
    }

    if (roomFilter !== 'all') {
      query = query.eq('room', roomFilter);
    }

    if (doctorFilter !== 'all') {
      query = query.eq('assigned_doctor_id', doctorFilter);
    }

    if (shiftTypeFilter !== 'all') {
      query = query.eq('shift_type', shiftTypeFilter);
    }

    const { data, error } = await query;

    if (!error && data) {
      // Count shifts with pending or on_hold requests
      const pendingRequestsCount = data.filter(shift =>
        shift.requests?.some((r: any) => r.status === 'pending' || r.status === 'on_hold')
      ).length;

      // Count prevalidated (on_hold) shifts for the bulk assignment button
      const prevalidatedShiftsCount = data.filter(shift =>
        shift.requests?.some((r: any) => r.status === 'on_hold')
      ).length;

      // Transform all shifts and count pending/on_hold requests
      const transformedShifts = data.map(shift => {
        const pendingRequestsCount = shift.requests?.filter((r: any) => r.status === 'pending').length || 0;
        const onHoldRequestsCount = shift.requests?.filter((r: any) => r.status === 'on_hold').length || 0;
        const hasPendingRequest = pendingRequestsCount > 0;
        const hasOnHoldRequest = onHoldRequestsCount > 0;
        return {
          ...shift,
          hasPendingRequest,
          pendingRequestsCount,
          hasOnHoldRequest,
          onHoldRequestsCount
        } as Shift;
      });

      setShifts(transformedShifts);
      setPendingCount(pendingRequestsCount);
      setPrevalidatedCount(prevalidatedShiftsCount);
    }
    setLoading(false);
  };

  const handleShiftClick = (shift: Shift) => {
    setSelectedShift(shift);
    setShowDetailModal(true);
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date.toISOString().split('T')[0]);
    setViewMode('week');
  };

  const handleWeekChange = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate);
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + (direction === 'next' ? 7 : -7));
    setSelectedDate(newDate.toISOString().split('T')[0]);
  };

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate);
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1));
    setSelectedDate(newDate.toISOString().split('T')[0]);
  };

  // Badge de statut cote coordinateur : memes cas et libelles qu'avant, en
  // charte Omnes. Le degrade d'ocre selon le nombre de demandes est conserve
  // (plus il y en a, plus c'est soutenu) et complete par le compteur « (n) ».
  // Classes ecrites en toutes lettres (contrainte du purge Tailwind).
  const getStatusBadge = (status: string, shift?: Shift) => {
    const pendingCount = (shift as any)?.pendingRequestsCount || 0;
    const onHoldCount = (shift as any)?.onHoldRequestsCount || 0;

    if (onHoldCount > 0) {
      return <StatusBadge status="prevalide" label={`Pré-validation (${onHoldCount})`} />;
    }

    if (pendingCount > 0) {
      const ramp =
        pendingCount === 1 ? 'bg-ocre/15 text-ocre-fonce border-ocre/25'
        : pendingCount === 2 ? 'bg-ocre/30 text-ocre-fonce border-ocre/40'
        : pendingCount === 3 ? 'bg-ocre/45 text-ocre-fonce border-ocre/55'
        : 'bg-ocre/65 text-ocre-fonce border-ocre/75';
      return (
        <span className={`inline-flex items-center rounded-pill border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${ramp}`}>
          En attente de validation ({pendingCount})
        </span>
      );
    }

    const map: Record<string, { key: AgendaStatusKey; label: string }> = {
      free: { key: 'libre', label: 'Disponible' },
      assigned: { key: 'assigne', label: 'Assignée' },
      validated: { key: 'assigne', label: 'Validée' },
    };
    const conf = map[status] || map.free;
    return <StatusBadge status={conf.key} label={conf.label} />;
  };

  const availableRooms = Array.from(new Set(shifts.map(s => s.room))).sort();

  const handleBulkAssignSuccess = () => {
    loadShifts();
  };

  const getBulkAssignButtonLabel = () => {
    switch (viewMode) {
      case 'week':
        return 'Assigner les pré-validations de cette semaine';
      case 'month':
        return 'Assigner les pré-validations de ce mois';
    }
  };

  return (
    <div className="w-full max-w-[2000px] mx-auto space-y-4 px-2">
      <div className="bg-carte rounded-card shadow-card border border-border p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-canard/10 rounded-pill">
              <ClipboardList className="w-6 h-6 text-canard" />
            </div>
            <div>
              <h2 className="text-h2 text-ink">Validation des demandes</h2>
              <p className="text-caption">
                {pendingCount > 0 ? `${pendingCount} ${pendingCount === 1 ? 'demande' : 'demandes'} en attente` : 'Aucune demande en attente'}
              </p>
            </div>
          </div>

        </div>

        <CalendarFilters
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          selectedDate={viewMode === 'month' ? selectedDate.slice(0, 7) : selectedDate}
          onDateChange={(date) => setSelectedDate(viewMode === 'month' ? `${date}-01` : date)}
          locationFilter={locationFilter}
          onLocationChange={setLocationFilter}
          roomFilter={roomFilter}
          onRoomChange={setRoomFilter}
          doctorFilter={doctorFilter}
          onDoctorFilter={setDoctorFilter}
          shiftTypeFilter={shiftTypeFilter}
          onShiftTypeFilter={setShiftTypeFilter}
          availableRooms={availableRooms}
          availableDoctors={availableDoctors}
          isMobile={false}
        />
      </div>

      <div className="bg-carte rounded-card shadow-card border border-border p-2 md:p-4">
        {loading ? (
          <div className="py-12 text-center text-muted">Chargement…</div>
        ) : shifts.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-fond">
              <ClipboardList className="h-8 w-8 text-faint" />
            </div>
            <p className="text-muted">Aucune garde pour cette période</p>
            <p className="mt-2 text-caption">Créez de nouvelles gardes depuis l'onglet « Ouvertures »</p>
          </div>
        ) : (
          <>
            {viewMode === 'week' && (
              <WeekView
                shifts={shifts}
                currentWeek={new Date(selectedDate)}
                onWeekChange={handleWeekChange}
                onShiftClick={handleShiftClick}
                getStatusBadge={(status, shift) => getStatusBadge(status, shift)}
                isMobile={false}
                isCoordinator={true}
              />
            )}
            {viewMode === 'month' && (
              <MonthView
                shifts={shifts}
                currentMonth={new Date(selectedDate)}
                onMonthChange={handleMonthChange}
                onDayClick={handleDayClick}
                getStatusBadge={(status, shift) => getStatusBadge(status, shift)}
                isMobile={false}
              />
            )}
          </>
        )}
      </div>

      {prevalidatedCount > 0 && (
        <>
          <div className="fixed bottom-4 right-4 left-4 md:hidden z-10">
            <button
              onClick={() => setShowBulkAssignModal(true)}
              className="flex w-full items-center justify-center gap-2 rounded-input bg-marine px-6 py-3 text-button text-white shadow-button transition-colors hover:bg-marine/90"
            >
              <CheckCircle className="w-5 h-5" />
              <span>{getBulkAssignButtonLabel()}</span>
              <span className="ml-1 rounded-pill bg-white/20 px-2 py-0.5 text-xs font-bold">
                {prevalidatedCount}
              </span>
            </button>
          </div>

          <div className="hidden md:flex justify-center">
            <button
              onClick={() => setShowBulkAssignModal(true)}
              className="flex items-center justify-center gap-2 rounded-input bg-marine px-8 py-3 text-button text-white shadow-button transition-colors hover:bg-marine/90"
            >
              <CheckCircle className="w-5 h-5" />
              <span>{getBulkAssignButtonLabel()}</span>
              <span className="ml-1 rounded-pill bg-white/20 px-2 py-0.5 text-xs font-bold">
                {prevalidatedCount}
              </span>
            </button>
          </div>
        </>
      )}

      {showDetailModal && selectedShift && (
        <ShiftDetailModal
          shift={selectedShift}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedShift(null);
          }}
          onSuccess={loadShifts}
          readOnlyMode={true}
          onAssignDoctor={() => {
            setShowDetailModal(false);
            setShowAssignModal(true);
          }}
          isCoordinator={true}
          hideSeriesInfo={true}
        />
      )}

      {showAssignModal && selectedShift && (
        <AssignDoctorModal
          shift={selectedShift}
          isCoordinator={true}
          onClose={() => {
            setShowAssignModal(false);
            setSelectedShift(null);
          }}
          onSuccess={() => {
            loadShifts();
            setShowAssignModal(false);
            setSelectedShift(null);
          }}
        />
      )}

      {showBulkAssignModal && (
        <BulkAssignPrevalidatedModal
          onClose={() => setShowBulkAssignModal(false)}
          onSuccess={handleBulkAssignSuccess}
          periodType={viewMode}
          dateRange={getDateRange()}
          prevalidatedCount={prevalidatedCount}
        />
      )}

      {showExportModal && (
        <ExportPlanningModal
          onClose={() => setShowExportModal(false)}
        />
      )}

      <div className="fixed bottom-6 right-6 z-20">
        <button
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-2 rounded-input bg-canard px-6 py-3 text-button text-white shadow-button transition-colors hover:bg-canard/90"
          title="Exporter le planning"
        >
          <Download className="w-5 h-5" />
          <span className="hidden md:inline">Exporter le planning</span>
        </button>
      </div>
    </div>
  );
}
