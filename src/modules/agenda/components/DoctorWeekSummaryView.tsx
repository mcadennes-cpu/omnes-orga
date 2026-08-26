import { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, CheckSquare, Square, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './ui/ActionToast';

interface Shift {
  id: string;
  date: string;
  time_range: string;
  location: string;
  room: string;
  shift_type: string;
  status: string;
  assigned_doctor_id: string | null;
  doctor_name: string | null;
  series_id: string | null;
  requests?: Array<{ id: string; status: string; doctor_id: string }>;
}

interface DoctorWeekSummaryViewProps {
  weekStart: Date;
  shifts: Shift[];
  currentUserId: string;
  filters: {
    selectedSite: string;
    selectedRoom: string;
  };
  onRequestsSubmitted: () => void;
}

interface DayData {
  date: Date;
  dateString: string;
  freeShifts: Shift[];
  count: number;
}

export default function DoctorWeekSummaryView({
  weekStart,
  shifts,
  currentUserId,
  filters,
  onRequestsSubmitted,
}: DoctorWeekSummaryViewProps) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const { signaler } = useToast();

  const getDayData = (): DayData[] => {
    const days: DayData[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const dateString = date.toISOString().split('T')[0];

      if (date < today) {
        continue;
      }

      const freeShifts = shifts.filter(
        shift => shift.date === dateString &&
        (shift.status === 'free' || (shift.status === 'pending' && !shift.assigned_doctor_id))
      );

      days.push({
        date,
        dateString,
        freeShifts,
        count: freeShifts.length,
      });
    }

    return days;
  };

  const dayData = getDayData();

  const formatDayHeader = (date: Date): string => {
    const days = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

    const dayName = days[date.getDay()];
    const dayNum = date.getDate();
    const monthName = months[date.getMonth()];

    return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}. ${dayNum} ${monthName}.`;
  };

  const toggleDay = (dateString: string) => {
    if (expandedDay === dateString) {
      setExpandedDay(null);
      setSelectedShifts(new Set());
    } else {
      setExpandedDay(dateString);
      setSelectedShifts(new Set());
    }
  };

  const toggleShiftSelection = (shiftId: string) => {
    const newSelected = new Set(selectedShifts);
    if (newSelected.has(shiftId)) {
      newSelected.delete(shiftId);
    } else {
      newSelected.add(shiftId);
    }
    setSelectedShifts(newSelected);
  };

  const selectAllForDay = (dayShifts: Shift[]) => {
    const newSelected = new Set(selectedShifts);
    dayShifts.forEach(shift => newSelected.add(shift.id));
    setSelectedShifts(newSelected);
  };

  const deselectAllForDay = (dayShifts: Shift[]) => {
    const newSelected = new Set(selectedShifts);
    dayShifts.forEach(shift => newSelected.delete(shift.id));
    setSelectedShifts(newSelected);
  };

  const handleSubmitRequests = async (dayShifts: Shift[]) => {
    if (selectedShifts.size === 0) return;

    setSubmitting(true);
    const shiftsToRequest = dayShifts.filter(shift => selectedShifts.has(shift.id));
    let successCount = 0;
    let failedCount = 0;

    try {
      for (const shift of shiftsToRequest) {
        const { error } = await supabase
          .from('requests')
          .insert({
            shift_id: shift.id,
            doctor_id: currentUserId,
            status: 'pending',
          });

        if (error) {
          if (error.code === '23505') {
            console.log('Duplicate request ignored for shift:', shift.id);
          } else {
            console.error('Error creating request for shift:', shift.id, error);
            failedCount++;
          }
        } else {
          successCount++;
        }
      }

      if (successCount > 0) {
        // signaler() et non signalerAction() : cette vue est cote medecin, et
        // derniere_action() est en security invoker -- la policy de lecture du
        // journal reserve le journal au coordinateur. Un medecin n'obtiendrait
        // rien, donc aucun bouton « Annuler » a proposer. Pour retirer une
        // demande, il passe par « Mes gardes ».
        signaler(
          `Demande envoyée pour ${successCount} garde${successCount > 1 ? 's' : ''}.`,
          'succes'
        );
        setSelectedShifts(new Set());
        setExpandedDay(null);
        onRequestsSubmitted();
      }

      if (failedCount > 0) {
        signaler(
          `${failedCount} demande${failedCount > 1 ? 's n\'ont' : " n'a"} pas pu être envoyée${failedCount > 1 ? 's' : ''}. Réessayez.`,
          'erreur'
        );
      }
    } catch (error) {
      console.error('Error submitting requests:', error);
      signaler("Erreur pendant l'envoi des demandes.", 'erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const getFilterText = () => {
    const parts: string[] = [];
    if (filters.selectedSite !== 'all') parts.push(filters.selectedSite);
    if (filters.selectedRoom !== 'all') parts.push(filters.selectedRoom);
    return parts.length > 0 ? ` (${parts.join(' - ')})` : '';
  };

  const hasOtherPendingRequests = (shift: Shift): boolean => {
    if (!shift.requests || shift.requests.length === 0) return false;
    return shift.requests.some(
      req => req.status === 'pending' && req.doctor_id !== currentUserId
    );
  };

  const hasCurrentUserRequest = (shift: Shift): boolean => {
    if (!shift.requests || shift.requests.length === 0) return false;
    return shift.requests.some(
      req => req.status === 'pending' && req.doctor_id === currentUserId
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {dayData.map((day) => (
          <div key={day.dateString} className="space-y-2">
            <button
              onClick={() => toggleDay(day.dateString)}
              className={`w-full rounded-card border-2 p-4 transition-all ${
                expandedDay === day.dateString
                  ? 'border-canard bg-canard/5'
                  : day.count > 0
                  ? 'border-border bg-carte hover:border-canard/50 hover:bg-canard/5'
                  : 'cursor-default border-border bg-fond'
              }`}
              disabled={day.count === 0}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 text-left">
                  <div className="mb-1 text-body-m font-semibold text-ink">
                    {formatDayHeader(day.date)}
                  </div>
                  <div className="text-caption">
                    {day.count > 0 ? (
                      <>
                        <span className="font-semibold text-canard">{day.count}</span> garde{day.count > 1 ? 's' : ''} disponible{day.count > 1 ? 's' : ''}
                        {getFilterText()}
                      </>
                    ) : (
                      <span className="text-faint">Aucune garde disponible</span>
                    )}
                  </div>
                </div>
                {day.count > 0 && (
                  <div>
                    {expandedDay === day.dateString ? (
                      <ChevronUp className="h-5 w-5 text-canard" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-faint" />
                    )}
                  </div>
                )}
              </div>
            </button>

            {expandedDay === day.dateString && day.freeShifts.length > 0 && (
              <div className="space-y-3 rounded-card border border-border bg-carte p-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <button
                    onClick={() => selectAllForDay(day.freeShifts)}
                    className="flex items-center gap-2 text-body-m font-medium text-canard hover:text-canard/80"
                  >
                    <CheckSquare className="h-4 w-4" />
                    Tout cocher
                  </button>
                  <button
                    onClick={() => deselectAllForDay(day.freeShifts)}
                    className="flex items-center gap-2 text-body-m font-medium text-muted hover:text-ink"
                  >
                    <Square className="h-4 w-4" />
                    Tout décocher
                  </button>
                </div>

                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {day.freeShifts.map((shift) => {
                    const alreadyRequestedByCurrentUser = hasCurrentUserRequest(shift);
                    const alreadyRequestedByOthers = hasOtherPendingRequests(shift);
                    return (
                      <label
                        key={shift.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-card border-2 p-3 transition-all ${
                          selectedShifts.has(shift.id)
                            ? 'border-canard bg-canard/5'
                            : alreadyRequestedByCurrentUser
                            ? 'border-olive/30 bg-olive/5'
                            : 'border-border hover:border-canard/50 hover:bg-fond'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedShifts.has(shift.id)}
                          onChange={() => toggleShiftSelection(shift.id)}
                          className="mt-1 h-4 w-4 accent-canard"
                          disabled={alreadyRequestedByCurrentUser}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <div className="font-semibold text-ink">
                              {shift.shift_type}
                            </div>
                            {alreadyRequestedByCurrentUser && (
                              <span className="inline-flex items-center gap-1 rounded-pill border border-olive/25 bg-olive/12 px-2 py-0.5 text-xs font-medium text-olive">
                                ✓ Déjà demandée
                              </span>
                            )}
                            {!alreadyRequestedByCurrentUser && alreadyRequestedByOthers && (
                              <span className="inline-flex items-center gap-1 rounded-pill border border-ocre/30 bg-ocre/15 px-2 py-0.5 text-xs font-medium text-ocre-fonce">
                                <Users className="h-3 w-3" />
                                Autres demandes
                              </span>
                            )}
                          </div>
                          <div className="text-caption">
                            {shift.time_range}
                          </div>
                          <div className="text-caption">
                            {shift.location} - {shift.room}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {selectedShifts.size > 0 && (
                  <div className="border-t border-border pt-3">
                    <button
                      onClick={() => handleSubmitRequests(day.freeShifts)}
                      disabled={submitting}
                      className="w-full rounded-input bg-marine px-4 py-3 text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? (
                        'Envoi en cours...'
                      ) : (
                        `👉 Je suis disponible pour une de ces ${selectedShifts.size} garde${selectedShifts.size > 1 ? 's' : ''}`
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {dayData.every(day => day.count === 0) && (
        <div className="rounded-card border border-border bg-carte py-12 text-center">
          <Calendar className="mx-auto mb-3 h-12 w-12 text-faint" />
          <p className="text-muted">Aucune garde disponible cette semaine</p>
          {(filters.selectedSite !== 'all' || filters.selectedRoom !== 'all') && (
            <p className="mt-2 text-caption">
              Essayez de modifier les filtres
            </p>
          )}
        </div>
      )}
    </div>
  );
}
