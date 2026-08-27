import { useState, useEffect } from 'react';
import { supabase, supabaseOrga, Shift, Profile } from '../lib/supabase';
import { Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import CalendarFilters from './calendar/CalendarFilters';
import WeekView from './calendar/WeekView';
import MonthView from './calendar/MonthView';
import DoctorWeekSummaryView from './DoctorWeekSummaryView';
import CreateShiftModal from './CreateShiftModal';
import ShiftDetailModal from './ShiftDetailModal';
import SaveWeekTemplateModal from './SaveWeekTemplateModal';
import DeleteWeekTemplateModal from './DeleteWeekTemplateModal';
import OpenWeeksModal from './OpenWeeksModal';
import StatusBadge from './ui/StatusBadge';
import { AgendaStatusKey } from '../lib/statusStyles';
import { saveWeekAsTemplate } from '../lib/weekTemplateUtils';
import { useToast } from './ui/ActionToast';

type EnhancedCalendarViewProps = {
  currentUser: Profile;
};

export default function EnhancedCalendarView({ currentUser }: EnhancedCalendarViewProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [locationFilter, setLocationFilter] = useState<'all' | 'Dijon' | 'Beaune'>('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [shiftTypeFilter, setShiftTypeFilter] = useState('all');
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showDeleteTemplateModal, setShowDeleteTemplateModal] = useState(false);
  // Ouverture des semaines depuis le plan de roulement (6H) -- seul chemin
  // d'ouverture depuis 8B-1a.
  const [showOpenWeeksModal, setShowOpenWeeksModal] = useState(false);
  const [availableDoctors, setAvailableDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const { signaler, signalerAction } = useToast();

  const isMobile = currentUser.role === 'doctor';

  // Le bandeau vit au-dessus des vues : quand on y annule une action, il
  // previent par un evenement plutot que par un rappel a faire descendre dans
  // tout le module. Le temps reel ferait double emploi, mais il n'est pas
  // encore active en beta (etape 8) -- on ne depend donc pas de lui.
  useEffect(() => {
    const recharger = () => loadShifts();
    window.addEventListener('agenda:rafraichir', recharger);
    return () => window.removeEventListener('agenda:rafraichir', recharger);
  }, [selectedDate, viewMode, locationFilter, roomFilter, doctorFilter, shiftTypeFilter]);

  useEffect(() => {
    loadShifts();
    loadDoctors();

    const subscription = supabaseOrga
      .channel('shifts_and_requests_changes')
      .on('postgres_changes', { event: '*', schema: 'agenda', table: 'shifts' }, () => {
        loadShifts();
      })
      .on('postgres_changes', { event: '*', schema: 'agenda', table: 'requests' }, () => {
        loadShifts();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
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

  const formatDateLocal = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDateRange = () => {
    const date = new Date(selectedDate);

    if (viewMode === 'week') {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay() + 1);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      return {
        start: formatDateLocal(startOfWeek),
        end: formatDateLocal(endOfWeek)
      };
    } else {
      const year = date.getFullYear();
      const month = date.getMonth();
      const firstDayOfMonth = new Date(year, month, 1);

      const startDayOfWeek = firstDayOfMonth.getDay();
      const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
      const gridStart = new Date(year, month, 1 - adjustedStartDay);

      const gridEnd = new Date(gridStart);
      gridEnd.setDate(gridStart.getDate() + 41);

      return {
        start: formatDateLocal(gridStart),
        end: formatDateLocal(gridEnd)
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
        requests(id, status, doctor_id)
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
      const transformedShifts = data.map(shift => {
        const hasPendingRequest = shift.requests?.some((r: any) => r.status === 'pending');
        const doctorName = shift.assigned_doctor?.full_name || null;
        const timeRange = shift.shift_type_data?.time_range || shift.shift_type;

        return {
          ...shift,
          status: hasPendingRequest ? 'pending' : shift.status,
          doctor_name: doctorName,
          time_range: timeRange,
          hasPendingRequest
        } as any;
      });
      setShifts(transformedShifts);
    }
    setLoading(false);
  };

  const handleShiftClick = (shift: Shift) => {
    setSelectedShift(shift);
    if (currentUser.role === 'coordinator') {
      setShowDetailModal(true);
    }
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

  // Mappe l'ancienne logique de statut vers la cle statusStyles : comportement
  // inchange (les memes cas qu'avant), seul le rendu passe a la charte Omnes.
  const getStatusBadge = (status: string, shift?: Shift) => {
    const isPendingAssignment = status === 'pending' && shift?.assigned_doctor_id;
    let key: AgendaStatusKey;
    if (status === 'free') key = 'libre';
    else if (status === 'assigned') key = 'assigne';
    else if (isPendingAssignment) key = 'prevalide';
    else key = 'demandes';
    return <StatusBadge status={key} />;
  };

  const handleSaveAsTemplate = async (templateName: string) => {
    const date = new Date(selectedDate);
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay() + 1);

    await saveWeekAsTemplate(startOfWeek, templateName, currentUser.id);
    signaler('Semaine type enregistrée.', 'succes');
  };

  // Le bandeau et son « Annuler » etaient jusqu'ici le privilege de la
  // duplication de modele, retiree en 8B-1a. L'ouverture ecrit pourtant bien
  // davantage -- plusieurs centaines de gardes -- et le faisait en silence.
  // Annuler repose sur restaurer_action, qui pose `deleted_at` sur un INSERT
  // de gardes : c'est exactement ce qui avait defait la duplication du 06/08.
  const handleWeeksOpened = (gardesCreees: number) => {
    signalerAction(
      `${gardesCreees} garde${gardesCreees > 1 ? 's' : ''} ouverte${gardesCreees > 1 ? 's' : ''}.`
    );
    loadShifts();
  };

  const availableRooms = Array.from(new Set(shifts.map(s => s.room))).sort();

  return (
    <div className="w-full max-w-[2000px] mx-auto space-y-4 px-2">
      <div className="bg-carte rounded-card shadow-card border border-border p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-canard/10 rounded-pill">
              <CalendarIcon className="w-6 h-6 text-canard" />
            </div>
            <div>
              <h2 className="text-h2 text-ink">Calendrier des gardes</h2>
              <p className="text-caption">Merci de donner vos disponibilités</p>
            </div>
          </div>

          {currentUser.role === 'coordinator' && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 rounded-input bg-marine px-4 py-2.5 text-button text-white shadow-button transition-colors hover:bg-marine/90"
              >
                <Plus className="w-5 h-5" />
                Créer une garde
              </button>
            </div>
          )}
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
          isMobile={isMobile}
        />
      </div>

      <div className="bg-carte rounded-card shadow-card border border-border p-2 md:p-4">
        {loading ? (
          <div className="py-12 text-center text-muted">Chargement…</div>
        ) : (
          <>
            {viewMode === 'week' && (
              <>
                {currentUser.role === 'doctor' ? (
                  <>
                    <div className="flex items-center justify-between mb-4 px-2">
                      <button
                        onClick={() => handleWeekChange('prev')}
                        className="rounded-pill p-2 transition-colors hover:bg-fond"
                      >
                        <ChevronLeft className="w-5 h-5 text-marine" />
                      </button>
                      <h3 className="text-body-l font-semibold capitalize text-ink">
                        {(() => {
                          const date = new Date(selectedDate);
                          const startOfWeek = new Date(date);
                          startOfWeek.setDate(date.getDate() - date.getDay() + 1);
                          const endOfWeek = new Date(startOfWeek);
                          endOfWeek.setDate(startOfWeek.getDate() + 6);

                          const formatDate = (d: Date) => {
                            return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                          };

                          return `${formatDate(startOfWeek)} - ${formatDate(endOfWeek)}`;
                        })()}
                      </h3>
                      <button
                        onClick={() => handleWeekChange('next')}
                        className="rounded-pill p-2 transition-colors hover:bg-fond"
                      >
                        <ChevronRight className="w-5 h-5 text-marine" />
                      </button>
                    </div>
                    <DoctorWeekSummaryView
                      weekStart={(() => {
                        const date = new Date(selectedDate);
                        const startOfWeek = new Date(date);
                        startOfWeek.setDate(date.getDate() - date.getDay() + 1);
                        return startOfWeek;
                      })()}
                      shifts={shifts}
                      currentUserId={currentUser.id}
                      filters={{
                        selectedSite: locationFilter,
                        selectedRoom: roomFilter,
                      }}
                      onRequestsSubmitted={loadShifts}
                    />
                  </>
                ) : (
                  <WeekView
                    shifts={shifts}
                    currentWeek={new Date(selectedDate)}
                    onWeekChange={handleWeekChange}
                    onShiftClick={handleShiftClick}
                    getStatusBadge={getStatusBadge}
                    isMobile={isMobile}
                    isCoordinator={currentUser.role === 'coordinator'}
                    onSaveAsTemplate={() => setShowSaveTemplateModal(true)}
                    onDeleteTemplate={() => setShowDeleteTemplateModal(true)}
                    onOpenWeeks={() => setShowOpenWeeksModal(true)}
                  />
                )}
              </>
            )}
            {viewMode === 'month' && (
              <MonthView
                shifts={shifts}
                currentMonth={new Date(selectedDate)}
                onMonthChange={handleMonthChange}
                onDayClick={handleDayClick}
                getStatusBadge={getStatusBadge}
                isMobile={isMobile}
              />
            )}
          </>
        )}
      </div>

      {showCreateModal && (
        <CreateShiftModal
          coordinatorId={currentUser.id}
          onClose={() => setShowCreateModal(false)}
          onSuccess={loadShifts}
        />
      )}

      {showDetailModal && selectedShift && (
        <ShiftDetailModal
          shift={selectedShift}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedShift(null);
          }}
          onSuccess={loadShifts}
          hideValidation={true}
        />
      )}

      {showSaveTemplateModal && (
        <SaveWeekTemplateModal
          onClose={() => setShowSaveTemplateModal(false)}
          onSave={handleSaveAsTemplate}
        />
      )}

      {showDeleteTemplateModal && (
        <DeleteWeekTemplateModal
          onClose={() => setShowDeleteTemplateModal(false)}
          onSuccess={() => {
            setShowDeleteTemplateModal(false);
            loadShifts();
          }}
        />
      )}

      {showOpenWeeksModal && (
        <OpenWeeksModal
          onClose={() => setShowOpenWeeksModal(false)}
          onOpened={handleWeeksOpened}
        />
      )}
    </div>
  );
}
