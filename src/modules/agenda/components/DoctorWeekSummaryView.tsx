import { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, CheckSquare, Square, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
        alert(`✅ Demandes envoyées (${successCount} garde${successCount > 1 ? 's' : ''}).`);
        setSelectedShifts(new Set());
        setExpandedDay(null);
        onRequestsSubmitted();
      }

      if (failedCount > 0) {
        alert(`⚠️ ${failedCount} demande${failedCount > 1 ? 's ont' : ' a'} échoué. Veuillez réessayer.`);
      }
    } catch (error) {
      console.error('Error submitting requests:', error);
      alert('❌ Erreur lors de l\'envoi des demandes.');
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {dayData.map((day) => (
          <div key={day.dateString} className="space-y-2">
            <button
              onClick={() => toggleDay(day.dateString)}
              className={`w-full p-4 rounded-lg border-2 transition-all ${
                expandedDay === day.dateString
                  ? 'border-cyan-500 bg-cyan-50'
                  : day.count > 0
                  ? 'border-gray-200 bg-white hover:border-cyan-300 hover:bg-cyan-50'
                  : 'border-gray-200 bg-gray-50 cursor-default'
              }`}
              disabled={day.count === 0}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 text-left">
                  <div className="font-semibold text-gray-900 mb-1">
                    {formatDayHeader(day.date)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {day.count > 0 ? (
                      <>
                        <span className="font-medium text-cyan-600">{day.count}</span> garde{day.count > 1 ? 's' : ''} disponible{day.count > 1 ? 's' : ''}
                        {getFilterText()}
                      </>
                    ) : (
                      <span className="text-gray-400">Aucune garde disponible</span>
                    )}
                  </div>
                </div>
                {day.count > 0 && (
                  <div>
                    {expandedDay === day.dateString ? (
                      <ChevronUp className="w-5 h-5 text-cyan-600" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                )}
              </div>
            </button>

            {expandedDay === day.dateString && day.freeShifts.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                  <button
                    onClick={() => selectAllForDay(day.freeShifts)}
                    className="flex items-center gap-2 text-sm text-cyan-600 hover:text-cyan-700 font-medium"
                  >
                    <CheckSquare className="w-4 h-4" />
                    Tout cocher
                  </button>
                  <button
                    onClick={() => deselectAllForDay(day.freeShifts)}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-700 font-medium"
                  >
                    <Square className="w-4 h-4" />
                    Tout décocher
                  </button>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {day.freeShifts.map((shift) => {
                    const alreadyRequestedByCurrentUser = hasCurrentUserRequest(shift);
                    const alreadyRequestedByOthers = hasOtherPendingRequests(shift);
                    return (
                      <label
                        key={shift.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedShifts.has(shift.id)
                            ? 'border-cyan-500 bg-cyan-50'
                            : alreadyRequestedByCurrentUser
                            ? 'border-green-200 bg-green-50'
                            : 'border-gray-200 hover:border-cyan-300 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedShifts.has(shift.id)}
                          onChange={() => toggleShiftSelection(shift.id)}
                          className="mt-1 w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500"
                          disabled={alreadyRequestedByCurrentUser}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="font-semibold text-gray-900">
                              {shift.shift_type}
                            </div>
                            {alreadyRequestedByCurrentUser && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                ✓ Déjà demandée
                              </span>
                            )}
                            {!alreadyRequestedByCurrentUser && alreadyRequestedByOthers && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                                <Users className="w-3 h-3" />
                                Autres demandes
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            {shift.time_range}
                          </div>
                          <div className="text-sm text-gray-500">
                            {shift.location} - {shift.room}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {selectedShifts.size > 0 && (
                  <div className="pt-3 border-t border-gray-200">
                    <button
                      onClick={() => handleSubmitRequests(day.freeShifts)}
                      disabled={submitting}
                      className="w-full px-4 py-3 bg-cyan-600 text-white rounded-lg font-semibold hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">Aucune garde disponible cette semaine</p>
          {(filters.selectedSite !== 'all' || filters.selectedRoom !== 'all') && (
            <p className="text-sm text-gray-500 mt-2">
              Essayez de modifier les filtres
            </p>
          )}
        </div>
      )}
    </div>
  );
}
