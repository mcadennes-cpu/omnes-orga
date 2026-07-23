import { useState, useEffect } from 'react';
import { supabase, Shift, Profile } from '../lib/supabase';
import { ClipboardList, CheckCircle, Download } from 'lucide-react';
import CalendarFilters from './calendar/CalendarFilters';
import WeekView from './calendar/WeekView';
import MonthView from './calendar/MonthView';
import ShiftDetailModal from './ShiftDetailModal';
import AssignDoctorModal from './AssignDoctorModal';
import UndoButton from './UndoButton';
import BulkAssignPrevalidatedModal from './BulkAssignPrevalidatedModal';
import ExportPlanningModal from './ExportPlanningModal';

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

    const subscription = supabase
      .channel('requests_calendar_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        loadShifts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
        loadShifts();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [selectedDate, viewMode, locationFilter, roomFilter, doctorFilter, shiftTypeFilter]);

  const loadDoctors = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'doctor')
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

  const getStatusBadge = (status: string, shift?: Shift) => {
    const pendingCount = (shift as any)?.pendingRequestsCount || 0;
    const onHoldCount = (shift as any)?.onHoldRequestsCount || 0;

    // Priority 1: Show on_hold requests (blue - pre-validation)
    if (onHoldCount > 0) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold border bg-blue-100 text-blue-800 border-blue-300">
          PRÉ-VALIDATION ({onHoldCount})
        </span>
      );
    }

    // Priority 2: Show pending requests (yellow gradient)
    if (pendingCount > 0) {
      // Gradient based on number of pending requests
      let bgColor, textColor, borderColor;

      if (pendingCount === 1) {
        // Pale yellow for 1 request
        bgColor = 'bg-yellow-50';
        textColor = 'text-yellow-700';
        borderColor = 'border-yellow-200';
      } else if (pendingCount === 2) {
        // Light yellow for 2 requests
        bgColor = 'bg-yellow-100';
        textColor = 'text-yellow-800';
        borderColor = 'border-yellow-300';
      } else if (pendingCount === 3) {
        // Medium yellow for 3 requests
        bgColor = 'bg-yellow-200';
        textColor = 'text-yellow-900';
        borderColor = 'border-yellow-400';
      } else {
        // Dark yellow for 4+ requests
        bgColor = 'bg-yellow-300';
        textColor = 'text-yellow-950';
        borderColor = 'border-yellow-500';
      }

      return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${bgColor} ${textColor} ${borderColor}`}>
          EN ATTENTE DE VALIDATION ({pendingCount})
        </span>
      );
    }

    const statusConfig = {
      free: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200', label: 'DISPONIBLE' },
      assigned: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300', label: 'ASSIGNÉE' },
      validated: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200', label: 'VALIDÉE' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.free;

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border}`}>
        {config.label}
      </span>
    );
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <ClipboardList className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-teal-900">Calendrier des Gardes</h2>
              <p className="text-sm text-gray-600">
                {pendingCount > 0 ? `${pendingCount} ${pendingCount === 1 ? 'demande' : 'demandes'} en attente` : 'Aucune demande en attente'}
              </p>
            </div>
          </div>

          <UndoButton userId={currentUser.id} onUndoComplete={loadShifts} />
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 md:p-4">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Chargement...</div>
        ) : shifts.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <ClipboardList className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-600">Aucune garde pour cette période</p>
            <p className="text-sm text-gray-500 mt-2">Créez de nouvelles gardes depuis l'onglet Planning</p>
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
              className="w-full px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 font-medium"
            >
              <CheckCircle className="w-5 h-5" />
              <span>{getBulkAssignButtonLabel()}</span>
              <span className="ml-1 px-2 py-0.5 bg-teal-500 rounded-full text-xs font-bold">
                {prevalidatedCount}
              </span>
            </button>
          </div>

          <div className="hidden md:flex justify-center">
            <button
              onClick={() => setShowBulkAssignModal(true)}
              className="px-8 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 font-medium"
            >
              <CheckCircle className="w-5 h-5" />
              <span>{getBulkAssignButtonLabel()}</span>
              <span className="ml-1 px-2 py-0.5 bg-teal-500 rounded-full text-xs font-bold">
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
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 font-medium"
          title="Exporter le planning"
        >
          <Download className="w-5 h-5" />
          <span className="hidden md:inline">Exporter le planning</span>
        </button>
      </div>
    </div>
  );
}
