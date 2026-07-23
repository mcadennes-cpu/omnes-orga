import { useState, useEffect } from 'react';
import { Shift } from '../../lib/supabase';
import { ChevronLeft, ChevronRight, Repeat, Save, Copy, Trash2 } from 'lucide-react';
import { getRotationSettings, getRotationWeek } from '../../lib/rotationUtils';

type WeekViewProps = {
  shifts: Shift[];
  currentWeek: Date;
  onWeekChange: (direction: 'prev' | 'next') => void;
  onShiftClick: (shift: Shift) => void;
  getStatusBadge: (status: string, shift?: Shift) => JSX.Element;
  isMobile?: boolean;
  isCoordinator?: boolean;
  onSaveAsTemplate?: () => void;
  onDeleteTemplate?: () => void;
  onDuplicateTemplate?: () => void;
};

export default function WeekView({
  shifts,
  currentWeek,
  onWeekChange,
  onShiftClick,
  getStatusBadge,
  isMobile = false,
  isCoordinator = false,
  onSaveAsTemplate,
  onDeleteTemplate,
  onDuplicateTemplate
}: WeekViewProps) {
  const [rotationInfo, setRotationInfo] = useState<{ week: number; total: number } | null>(null);

  const getWeekDays = (date: Date) => {
    const days = [];
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay() + 1);

    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const weekDays = getWeekDays(currentWeek);
  const mondayOfWeek = weekDays[0];
  const mondayDateStr = `${mondayOfWeek.getFullYear()}-${String(mondayOfWeek.getMonth() + 1).padStart(2, '0')}-${String(mondayOfWeek.getDate()).padStart(2, '0')}`;

  useEffect(() => {
    const loadRotationInfo = async () => {
      const settings = await getRotationSettings();
      if (settings) {
        const week = getRotationWeek(
          mondayOfWeek,
          settings,
          {
            componentName: 'WeekView',
            inputOrigin: `Monday of displayed week: ${mondayDateStr}`
          }
        );
        setRotationInfo({ week, total: settings.cycle_length_weeks });
      } else {
        setRotationInfo(null);
      }
    };
    loadRotationInfo();
  }, [mondayDateStr]);

  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getShiftsForDay = (date: Date) => {
    const dateStr = formatDateLocal(date);
    return shifts.filter(shift => shift.date === dateStr);
  };

  const formatDayHeader = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    }).format(date);
  };

  const getWeekRange = () => {
    const start = weekDays[0];
    const end = weekDays[6];
    return `${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(start)} - ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(end)}`;
  };

  const uniqueRooms = Array.from(new Set(shifts.map(s => s.room))).sort();

  const getShiftBackgroundClass = (shift: Shift) => {
    // Priority 1: Check if shift is already assigned or validated
    if (shift.status === 'assigned' || shift.status === 'validated') {
      return isCoordinator
        ? 'bg-green-100 border-green-300 hover:bg-green-200 cursor-pointer'
        : 'bg-green-100 border-green-300';
    }

    // Priority 2: Check for on_hold requests (blue - pre-validation)
    const onHoldCount = (shift as any).onHoldRequestsCount || 0;
    if (onHoldCount > 0) {
      return 'bg-blue-100 border-blue-300 hover:bg-blue-150 cursor-pointer';
    }

    // Priority 3: For unassigned shifts, show gradient based on pending requests count
    const pendingCount = shift.pendingRequestsCount || 0;
    if (pendingCount > 0) {
      if (pendingCount === 1) {
        return 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100';
      } else if (pendingCount === 2) {
        return 'bg-yellow-100 border-yellow-300 hover:bg-yellow-150';
      } else if (pendingCount === 3) {
        return 'bg-yellow-200 border-yellow-400 hover:bg-yellow-250';
      } else {
        return 'bg-yellow-300 border-yellow-500 hover:bg-yellow-350';
      }
    }

    // Priority 4: Default status-based colors for free shifts
    if (shift.status === 'free') {
      return 'bg-gray-100 border-gray-400 hover:bg-gray-200';
    } else if (shift.status === 'pending') {
      return 'bg-yellow-100 border-yellow-300 hover:bg-yellow-200';
    } else {
      return 'bg-gray-100 border-gray-300';
    }
  };

  if (isMobile) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between p-3">
            <button
              onClick={() => onWeekChange('prev')}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-semibold text-gray-900">{getWeekRange()}</span>
            <button
              onClick={() => onWeekChange('next')}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          {rotationInfo && (
            <div className="px-3 pb-3 pt-1">
              <div className="flex items-center justify-center gap-2 text-sm bg-blue-100 text-blue-800 py-1 px-3 rounded-lg">
                <Repeat className="w-4 h-4" />
                <span className="font-semibold">Semaine de roulement n°{rotationInfo.week} / {rotationInfo.total}</span>
              </div>
            </div>
          )}
        </div>

        {weekDays.map((day) => {
          const dayShifts = getShiftsForDay(day);
          return (
            <div key={day.toISOString()} className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">
                {formatDayHeader(day)}
              </h3>
              {dayShifts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">Aucune garde</p>
              ) : (
                <div className="space-y-2">
                  {dayShifts.map((shift) => (
                    <button
                      key={shift.id}
                      onClick={() => onShiftClick(shift)}
                      disabled={!isCoordinator && shift.status !== 'free'}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all cursor-pointer ${getShiftBackgroundClass(shift)}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {shift.shift_type_data?.name || shift.shift_type}
                        </span>
                        {getStatusBadge(shift.status, shift)}
                      </div>
                      <div className="text-xs text-gray-600">
                        {shift.location} - {shift.room}
                      </div>
                      {shift.assigned_doctor && (
                        <div className="text-xs text-gray-600 mt-1">
                          {shift.assigned_doctor.full_name}
                        </div>
                      )}
                      {isCoordinator && shift.coordinator_note && (
                        <div className="text-[10px] text-gray-500 mt-1 italic truncate" title={shift.coordinator_note}>
                          {shift.coordinator_note}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => onWeekChange('prev')}
            className="flex items-center gap-2 px-4 py-2 hover:bg-gray-200 rounded-lg transition-colors font-medium text-gray-700"
          >
            <ChevronLeft className="w-5 h-5" />
            Précédent
          </button>
          <h3 className="text-lg font-semibold text-gray-900">{getWeekRange()}</h3>
          <button
            onClick={() => onWeekChange('next')}
            className="flex items-center gap-2 px-4 py-2 hover:bg-gray-200 rounded-lg transition-colors font-medium text-gray-700"
          >
            Suivant
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        {rotationInfo && (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-center gap-2 bg-blue-100 text-blue-800 py-2 px-4 rounded-lg">
              <Repeat className="w-5 h-5" />
              <span className="font-semibold text-base">Semaine de roulement n°{rotationInfo.week} / {rotationInfo.total}</span>
            </div>
          </div>
        )}
        {isCoordinator && onSaveAsTemplate && onDeleteTemplate && onDuplicateTemplate && (
          <div className="px-4 pb-4 flex items-center gap-3 justify-center flex-wrap">
            <button
              onClick={onSaveAsTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors font-medium"
            >
              <Save className="w-4 h-4" />
              Sauvegarder comme modèle
            </button>
            <button
              onClick={onDeleteTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors font-medium"
            >
              <Trash2 className="w-4 h-4" />
              Supprimer un modèle
            </button>
            <button
              onClick={onDuplicateTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg transition-colors font-medium"
            >
              <Copy className="w-4 h-4" />
              Dupliquer un modèle
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto -mx-2">
        <table className="w-full border-collapse min-w-[1400px]">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-300">
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-300 sticky left-0 bg-gray-50 z-10 w-[140px]">
                Salle
              </th>
              {weekDays.map((day) => (
                <th
                  key={day.toISOString()}
                  className="px-3 py-3 text-center text-xs font-semibold text-gray-700 border-r border-gray-200 w-[200px]"
                >
                  <div>{formatDayHeader(day)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {uniqueRooms.map((room) => (
              <tr key={room} className="border-b border-gray-200">
                <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-300 sticky left-0 bg-white z-10 w-[140px]">
                  {room}
                </td>
                {weekDays.map((day) => {
                  const dayShifts = getShiftsForDay(day).filter(s => s.room === room);
                  return (
                    <td
                      key={`${room}-${day.toISOString()}`}
                      className="px-2 py-2 border-r border-gray-200 align-top w-[200px]"
                    >
                      <div className="space-y-1">
                        {dayShifts.map((shift) => (
                          <button
                            key={shift.id}
                            onClick={() => onShiftClick(shift)}
                            disabled={!isCoordinator && shift.status !== 'free'}
                            className={`w-full text-left p-2 rounded text-xs border transition-all cursor-pointer ${getShiftBackgroundClass(shift)}`}
                          >
                            <div className="font-semibold text-gray-900 mb-0.5">
                              {shift.shift_type_data?.name || shift.shift_type}
                            </div>
                            <div className="text-gray-600">
                              {shift.location}
                            </div>
                            {shift.assigned_doctor && (
                              <div className="text-gray-700 font-medium mt-0.5 truncate">
                                {shift.assigned_doctor.full_name}
                              </div>
                            )}
                            {isCoordinator && shift.coordinator_note && (
                              <div className="text-[9px] text-gray-500 mt-0.5 italic truncate leading-tight" title={shift.coordinator_note}>
                                {shift.coordinator_note}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
