import { useState, useEffect } from 'react';
import { Shift, supabase } from '../../lib/supabase';
import { Clock, MapPin, User, Repeat, CheckSquare, Square } from 'lucide-react';
import { getRotationSettings, getRotationWeek } from '../../lib/rotationUtils';

type DayViewProps = {
  shifts: Shift[];
  onShiftClick: (shift: Shift) => void;
  getStatusBadge: (status: string, shift?: Shift) => JSX.Element;
  isMobile?: boolean;
  isCoordinator?: boolean;
  currentDate?: string;
  currentUserId?: string;
  onRequestsSubmitted?: () => void;
};

export default function DayView({
  shifts,
  onShiftClick,
  getStatusBadge,
  isMobile = false,
  isCoordinator = false,
  currentDate,
  currentUserId,
  onRequestsSubmitted
}: DayViewProps) {
  const [rotationInfo, setRotationInfo] = useState<{ week: number; total: number } | null>(null);
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (currentDate) {
      loadRotationInfo();
    }
  }, [currentDate]);

  useEffect(() => {
    setSelectedShifts(new Set());
  }, [currentDate, shifts]);

  const loadRotationInfo = async () => {
    if (!currentDate) return;
    const settings = await getRotationSettings();
    if (settings) {
      const week = getRotationWeek(
        new Date(currentDate),
        settings,
        {
          componentName: 'DayView',
          inputOrigin: `currentDate prop (string): "${currentDate}"`
        }
      );
      setRotationInfo({ week, total: settings.cycle_length_weeks });
    } else {
      setRotationInfo(null);
    }
  };

  const freeShifts = shifts.filter(shift => shift.status === 'free');
  const isDoctorView = !isCoordinator && currentUserId;

  const getShiftBorderClass = (shift: Shift, isSelected: boolean = false) => {
    if (isSelected) {
      return 'border-cyan-500 bg-cyan-50';
    }

    // Priority 1: Check if shift is already assigned or validated
    if (shift.status === 'assigned' || shift.status === 'validated') {
      return 'border-green-300 bg-green-50';
    }

    // Priority 2: Check for on_hold requests (blue - pre-validation)
    const onHoldCount = (shift as any).onHoldRequestsCount || 0;
    if (onHoldCount > 0) {
      return 'border-blue-300 bg-blue-100';
    }

    // Priority 3: For unassigned shifts, show gradient based on pending requests count
    const pendingCount = shift.pendingRequestsCount || 0;
    if (pendingCount > 0) {
      if (pendingCount === 1) {
        return 'border-yellow-200 bg-yellow-50';
      } else if (pendingCount === 2) {
        return 'border-yellow-300 bg-yellow-100';
      } else if (pendingCount === 3) {
        return 'border-yellow-400 bg-yellow-200';
      } else {
        return 'border-yellow-500 bg-yellow-300';
      }
    }

    // Priority 4: Default status-based colors
    if (shift.status === 'free') {
      return 'border-gray-300';
    } else if (shift.status === 'pending') {
      return 'border-yellow-300 bg-yellow-50';
    } else {
      return 'border-gray-300';
    }
  };

  const getShiftRowClass = (shift: Shift, isSelected: boolean = false) => {
    if (isSelected) {
      return 'bg-cyan-50';
    }

    // Priority 1: Check if shift is already assigned or validated
    if (shift.status === 'assigned' || shift.status === 'validated') {
      return isCoordinator
        ? 'bg-green-50 hover:bg-green-100 cursor-pointer'
        : 'bg-green-50';
    }

    // Priority 2: Check for on_hold requests (blue - pre-validation)
    const onHoldCount = (shift as any).onHoldRequestsCount || 0;
    if (onHoldCount > 0) {
      return 'bg-blue-100 hover:bg-blue-150 cursor-pointer';
    }

    // Priority 3: For unassigned shifts, show gradient based on pending requests count
    const pendingCount = shift.pendingRequestsCount || 0;
    if (pendingCount > 0) {
      if (pendingCount === 1) {
        return 'bg-yellow-50 hover:bg-yellow-100 cursor-pointer';
      } else if (pendingCount === 2) {
        return 'bg-yellow-100 hover:bg-yellow-150 cursor-pointer';
      } else if (pendingCount === 3) {
        return 'bg-yellow-200 hover:bg-yellow-250 cursor-pointer';
      } else {
        return 'bg-yellow-300 hover:bg-yellow-350 cursor-pointer';
      }
    }

    // Priority 4: Default status-based colors
    if (shift.status === 'free') {
      return 'bg-gray-50 hover:bg-gray-100 cursor-pointer';
    } else if (shift.status === 'pending') {
      return 'bg-yellow-50 hover:bg-yellow-100 cursor-pointer';
    } else {
      return 'bg-gray-50';
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

  const selectAll = () => {
    const newSelected = new Set<string>();
    freeShifts.forEach(shift => newSelected.add(shift.id));
    setSelectedShifts(newSelected);
  };

  const deselectAll = () => {
    setSelectedShifts(new Set());
  };

  const handleSubmitRequests = async () => {
    if (selectedShifts.size === 0 || !currentUserId) return;

    setSubmitting(true);
    const shiftsToRequest = freeShifts.filter(shift => selectedShifts.has(shift.id));
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
        if (onRequestsSubmitted) {
          onRequestsSubmitted();
        }
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

  const groupedShifts = shifts.reduce((acc, shift) => {
    if (!acc[shift.shift_type]) {
      acc[shift.shift_type] = [];
    }
    acc[shift.shift_type].push(shift);
    return acc;
  }, {} as Record<string, Shift[]>);

  const timeSlots = Object.keys(groupedShifts).sort();

  if (isMobile) {
    return (
      <div className="space-y-3">
        {rotationInfo && (
          <div className="flex items-center justify-center gap-2 text-sm bg-blue-100 text-blue-800 py-2 px-3 rounded-lg">
            <Repeat className="w-4 h-4" />
            <span className="font-semibold">Semaine n°{rotationInfo.week} / {rotationInfo.total}</span>
          </div>
        )}

        {isDoctorView && freeShifts.length > 0 && (
          <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-lg border border-gray-200">
            <button
              onClick={selectAll}
              className="flex items-center gap-2 text-sm text-cyan-600 hover:text-cyan-700 font-medium"
            >
              <CheckSquare className="w-4 h-4" />
              Tout cocher
            </button>
            <button
              onClick={deselectAll}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-700 font-medium"
            >
              <Square className="w-4 h-4" />
              Tout décocher
            </button>
          </div>
        )}

        {shifts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Aucune garde pour ce jour
          </div>
        ) : (
          <>
            {shifts.map((shift) => {
              const isFree = shift.status === 'free';
              const isSelectable = isDoctorView && isFree;

              return (
                <div
                  key={shift.id}
                  className={`w-full bg-white rounded-lg border-2 p-4 transition-all ${getShiftBorderClass(shift, isSelectable && selectedShifts.has(shift.id))}`}
                >
                  {isSelectable ? (
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedShifts.has(shift.id)}
                        onChange={() => toggleShiftSelection(shift.id)}
                        className="mt-1 w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-500" />
                            <span className="font-semibold text-gray-900">
                              {shift.shift_type_data?.name || shift.shift_type}
                            </span>
                          </div>
                          {getStatusBadge(shift.status, shift)}
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin className="w-4 h-4" />
                            <span>{shift.location} - {shift.room}</span>
                          </div>
                        </div>
                      </div>
                    </label>
                  ) : (
                    <button
                      onClick={() => onShiftClick(shift)}
                      disabled={!isCoordinator && shift.status !== 'free'}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-500" />
                          <span className="font-semibold text-gray-900">
                            {shift.shift_type_data?.name || shift.shift_type}
                          </span>
                        </div>
                        {getStatusBadge(shift.status, shift)}
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <MapPin className="w-4 h-4" />
                          <span>{shift.location} - {shift.room}</span>
                        </div>

                        {shift.assigned_doctor && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <User className="w-4 h-4" />
                            <span>{shift.assigned_doctor.full_name}</span>
                          </div>
                        )}

                        {isCoordinator && shift.coordinator_note && (
                          <div className="text-xs text-gray-500 mt-1 italic line-clamp-2" title={shift.coordinator_note}>
                            {shift.coordinator_note}
                          </div>
                        )}
                      </div>
                    </button>
                  )}
                </div>
              );
            })}

            {isDoctorView && selectedShifts.size > 0 && (
              <div className="sticky bottom-0 bg-white p-4 rounded-lg border-2 border-cyan-500 shadow-lg">
                <button
                  onClick={handleSubmitRequests}
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
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rotationInfo && (
        <div className="flex items-center justify-center gap-2 bg-blue-100 text-blue-800 py-2 px-4 rounded-lg">
          <Repeat className="w-5 h-5" />
          <span className="font-semibold text-base">Semaine de roulement n°{rotationInfo.week} / {rotationInfo.total}</span>
        </div>
      )}

      {isDoctorView && freeShifts.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-white p-4 rounded-lg border border-gray-200">
          <button
            onClick={selectAll}
            className="flex items-center gap-2 text-sm text-cyan-600 hover:text-cyan-700 font-medium"
          >
            <CheckSquare className="w-4 h-4" />
            Tout cocher
          </button>
          <button
            onClick={deselectAll}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-700 font-medium"
          >
            <Square className="w-4 h-4" />
            Tout décocher
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        {shifts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Aucune garde pour ce jour
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              {isDoctorView && <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 w-12"></th>}
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Site</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Salle</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Statut</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Médecin</th>
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((timeSlot) => (
              groupedShifts[timeSlot].map((shift, idx) => {
                const isFree = shift.status === 'free';
                const isSelectable = isDoctorView && isFree;

                return (
                  <tr
                    key={shift.id}
                    onClick={() => !isSelectable && onShiftClick(shift)}
                    className={`border-b border-gray-200 transition-colors ${getShiftRowClass(shift, isSelectable && selectedShifts.has(shift.id))}`}
                  >
                    {isDoctorView && (
                      <td className="px-4 py-3">
                        {isSelectable ? (
                          <input
                            type="checkbox"
                            checked={selectedShifts.has(shift.id)}
                            onChange={() => toggleShiftSelection(shift.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500"
                          />
                        ) : (
                          <div className="w-4 h-4"></div>
                        )}
                      </td>
                    )}
                    {idx === 0 && (
                      <td
                        rowSpan={groupedShifts[timeSlot].length}
                        className="px-4 py-3 font-semibold text-gray-900 border-r-2 border-gray-200"
                      >
                        {groupedShifts[timeSlot][0].shift_type_data?.name || timeSlot}
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-700">{shift.location}</td>
                    <td className="px-4 py-3 text-gray-700 font-medium">{shift.room}</td>
                    <td className="px-4 py-3">{getStatusBadge(shift.status)}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {shift.assigned_doctor ? (
                        <div>
                          <div>{shift.assigned_doctor.full_name}</div>
                          {isCoordinator && shift.coordinator_note && (
                            <div className="text-xs text-gray-500 mt-0.5 italic truncate" title={shift.coordinator_note}>
                              {shift.coordinator_note}
                            </div>
                          )}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                );
              })
            ))}
          </tbody>
        </table>
      )}
      </div>

      {isDoctorView && selectedShifts.size > 0 && (
        <div className="sticky bottom-0 bg-white p-4 rounded-lg border-2 border-cyan-500 shadow-lg">
          <button
            onClick={handleSubmitRequests}
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
  );
}
