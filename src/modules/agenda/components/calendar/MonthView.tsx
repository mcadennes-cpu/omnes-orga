import { useState, useEffect } from 'react';
import { Shift } from '../../lib/supabase';
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { getRotationSettings, getRotationWeek, getWeekDates } from '../../lib/rotationUtils';

type MonthViewProps = {
  shifts: Shift[];
  currentMonth: Date;
  onMonthChange: (direction: 'prev' | 'next') => void;
  onDayClick: (date: Date) => void;
  getStatusBadge: (status: string) => JSX.Element;
  isMobile?: boolean;
};

export default function MonthView({
  shifts,
  currentMonth,
  onMonthChange,
  onDayClick,
  isMobile = false
}: MonthViewProps) {
  const [rotationSettings, setRotationSettings] = useState<{ start_date: string; cycle_length_weeks: number } | null>(null);

  useEffect(() => {
    loadRotationSettings();
  }, []);

  const loadRotationSettings = async () => {
    const settings = await getRotationSettings();
    if (settings) {
      setRotationSettings(settings);
    }
  };

  const getRotationWeekForDate = (date: Date): { week: number; total: number } | null => {
    if (!rotationSettings) return null;
    const week = getRotationWeek(
      date,
      rotationSettings,
      {
        componentName: 'MonthView',
        inputOrigin: `calendar cell date (Date object): ${date.toString()}`
      }
    );
    return { week, total: rotationSettings.cycle_length_weeks };
  };

  const getMonthDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days = [];
    const startDay = firstDay.getDay();
    const adjustedStartDay = startDay === 0 ? 6 : startDay - 1;

    for (let i = 0; i < adjustedStartDay; i++) {
      const prevDate = new Date(year, month, -adjustedStartDay + i + 1);
      days.push({ date: prevDate, isCurrentMonth: false });
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return days;
  };

  const monthDays = getMonthDays(currentMonth);

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

  const getMonthName = () => {
    return new Intl.DateTimeFormat('fr-FR', {
      month: 'long',
      year: 'numeric'
    }).format(currentMonth);
  };

  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const getStatusColor = (status: string, shift: Shift) => {
    if (status === 'free') return 'bg-gray-400';

    // Check for on_hold requests (blue - pre-validation)
    const onHoldCount = (shift as any).onHoldRequestsCount || 0;
    if (onHoldCount > 0) return 'bg-blue-500';

    // Check for pending requests (yellow)
    const pendingCount = shift.pendingRequestsCount || 0;
    if (pendingCount > 0) return 'bg-yellow-500';

    if (status === 'pending' && shift.assigned_doctor_id) return 'bg-blue-500';
    if (status === 'pending') return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (isMobile) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
          <button
            onClick={() => onMonthChange('prev')}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-gray-900 capitalize">{getMonthName()}</span>
          <button
            onClick={() => onMonthChange('next')}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
            {weekDays.map((day) => (
              <div key={day} className="p-2 text-center text-xs font-semibold text-gray-600">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {monthDays.map(({ date, isCurrentMonth }, idx) => {
              const dayShifts = getShiftsForDay(date);
              const hasShifts = dayShifts.length > 0;
              const freeCount = dayShifts.filter(s => s.status === 'free').length;

              return (
                <button
                  key={idx}
                  onClick={() => isCurrentMonth && onDayClick(date)}
                  disabled={!isCurrentMonth}
                  className={`aspect-square p-1 border-b border-r border-gray-200 ${
                    !isCurrentMonth ? 'bg-gray-50 text-gray-400' : 'bg-white hover:bg-gray-50'
                  } ${hasShifts && isCurrentMonth ? 'cursor-pointer' : ''}`}
                >
                  <div className={`text-xs font-medium ${!isCurrentMonth ? 'text-gray-400' : 'text-gray-900'}`}>
                    {date.getDate()}
                  </div>
                  {hasShifts && isCurrentMonth && (
                    <div className="flex flex-wrap gap-0.5 mt-1 justify-center">
                      {dayShifts.slice(0, 3).map((shift, i) => (
                        <div
                          key={i}
                          className={`w-1 h-1 rounded-full ${getStatusColor(shift.status, shift)}`}
                        />
                      ))}
                      {dayShifts.length > 3 && (
                        <div className="text-[8px] text-gray-600">+{dayShifts.length - 3}</div>
                      )}
                    </div>
                  )}
                  {freeCount > 0 && isCurrentMonth && (
                    <div className="text-[9px] text-gray-600 font-semibold mt-0.5">
                      {freeCount} libre{freeCount > 1 ? 's' : ''}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
        <button
          onClick={() => onMonthChange('prev')}
          className="flex items-center gap-2 px-4 py-2 hover:bg-gray-200 rounded-lg transition-colors font-medium text-gray-700"
        >
          <ChevronLeft className="w-5 h-5" />
          Précédent
        </button>
        <h3 className="text-lg font-semibold text-gray-900 capitalize">{getMonthName()}</h3>
        <button
          onClick={() => onMonthChange('next')}
          className="flex items-center gap-2 px-4 py-2 hover:bg-gray-200 rounded-lg transition-colors font-medium text-gray-700"
        >
          Suivant
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 border-b-2 border-gray-300">
          {weekDays.map((day) => (
            <div key={day} className="p-3 text-center text-sm font-semibold text-gray-700 border-r border-gray-200 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {monthDays.map(({ date, isCurrentMonth }, idx) => {
            const dayShifts = getShiftsForDay(date);
            const hasShifts = dayShifts.length > 0;
            const freeCount = dayShifts.filter(s => s.status === 'free').length;
            const requestPendingCount = dayShifts.filter(s => s.status === 'pending' && !s.assigned_doctor_id).length;
            const preValidatedCount = dayShifts.filter(s => s.status === 'pending' && s.assigned_doctor_id).length;
            const assignedCount = dayShifts.filter(s => s.status === 'assigned').length;
            const isMonday = date.getDay() === 1;
            const rotationInfo = isMonday && isCurrentMonth ? getRotationWeekForDate(date) : null;

            return (
              <button
                key={idx}
                onClick={() => isCurrentMonth && hasShifts && onDayClick(date)}
                disabled={!isCurrentMonth || !hasShifts}
                className={`min-h-[100px] p-2 border-b border-r border-gray-200 text-left ${
                  !isCurrentMonth
                    ? 'bg-gray-50 text-gray-400'
                    : hasShifts
                    ? 'bg-white hover:bg-gray-50 cursor-pointer'
                    : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`text-sm font-semibold ${!isCurrentMonth ? 'text-gray-400' : 'text-gray-900'}`}>
                    {date.getDate()}
                  </div>
                  {rotationInfo && (
                    <div className="flex items-center gap-1 bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[9px] font-semibold">
                      <Repeat className="w-2.5 h-2.5" />
                      <span>S{rotationInfo.week}</span>
                    </div>
                  )}
                </div>
                {hasShifts && isCurrentMonth && (
                  <div className="space-y-1">
                    {freeCount > 0 && (
                      <div className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                        {freeCount} libre{freeCount > 1 ? 's' : ''}
                      </div>
                    )}
                    {requestPendingCount > 0 && (
                      <div className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                        {requestPendingCount} demande{requestPendingCount > 1 ? 's' : ''}
                      </div>
                    )}
                    {preValidatedCount > 0 && (
                      <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {preValidatedCount} pré-validé{preValidatedCount > 1 ? 's' : ''}
                      </div>
                    )}
                    {assignedCount > 0 && (
                      <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        {assignedCount} assigné{assignedCount > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
