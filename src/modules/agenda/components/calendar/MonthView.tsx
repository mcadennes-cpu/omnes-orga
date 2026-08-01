import { useState, useEffect } from 'react';
import { Shift } from '../../lib/supabase';
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import {
  getRotationPlans,
  getPlanForDate,
  getRotationWeek,
  getWeekDates,
  RotationPlan,
} from '../../lib/rotationUtils';
import { STATUS_STYLES, resolveShiftStatus } from '../../lib/statusStyles';

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
  // Les plans en vigueur sont charges une fois ; chaque cellule du mois resout
  // ensuite le sien par date. Un mois a cheval sur deux plans affiche donc la
  // bonne numerotation de part et d'autre, sans rien basculer a la main.
  const [rotationPlans, setRotationPlans] = useState<RotationPlan[]>([]);

  useEffect(() => {
    loadRotationPlans();
  }, []);

  const loadRotationPlans = async () => {
    setRotationPlans(await getRotationPlans());
  };

  const getRotationWeekForDate = (date: Date): { week: number; total: number } | null => {
    const plan = getPlanForDate(date, rotationPlans);
    if (!plan) return null;
    const week = getRotationWeek(
      date,
      plan,
      {
        componentName: 'MonthView',
        inputOrigin: `calendar cell date (Date object): ${date.toString()}`
      }
    );
    return { week, total: plan.cycle_length_weeks };
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

  // Pastille pleine (points du calendrier) : delegue a la source unique des
  // statuts. La logique de resolveShiftStatus reprend exactement l'ancien
  // getStatusColor (gris/bleu/jaune/vert), remappe sur la palette Omnes.
  const getStatusColor = (shift: Shift) => STATUS_STYLES[resolveShiftStatus(shift)].dotClass;

  if (isMobile) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-input bg-fond p-2">
          <button
            onClick={() => onMonthChange('prev')}
            className="rounded-pill p-2 transition-colors hover:bg-carte"
          >
            <ChevronLeft className="h-5 w-5 text-marine" />
          </button>
          <span className="text-body-l font-semibold capitalize text-ink">{getMonthName()}</span>
          <button
            onClick={() => onMonthChange('next')}
            className="rounded-pill p-2 transition-colors hover:bg-carte"
          >
            <ChevronRight className="h-5 w-5 text-marine" />
          </button>
        </div>

        <div className="overflow-hidden rounded-card border border-border bg-carte">
          <div className="grid grid-cols-7 border-b border-border bg-fond">
            {weekDays.map((day) => (
              <div key={day} className="p-2 text-center text-caption font-semibold">
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
                  className={`aspect-square border-b border-r border-border p-1 ${
                    !isCurrentMonth ? 'bg-fond text-faint' : 'bg-carte hover:bg-fond'
                  } ${hasShifts && isCurrentMonth ? 'cursor-pointer' : ''}`}
                >
                  <div className={`text-xs font-medium ${!isCurrentMonth ? 'text-faint' : 'text-ink'}`}>
                    {date.getDate()}
                  </div>
                  {hasShifts && isCurrentMonth && (
                    <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                      {dayShifts.slice(0, 3).map((shift, i) => (
                        <div
                          key={i}
                          className={`h-1 w-1 rounded-full ${getStatusColor(shift)}`}
                        />
                      ))}
                      {dayShifts.length > 3 && (
                        <div className="text-[8px] text-muted">+{dayShifts.length - 3}</div>
                      )}
                    </div>
                  )}
                  {freeCount > 0 && isCurrentMonth && (
                    <div className="mt-0.5 text-[9px] font-semibold text-muted">
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
      <div className="flex items-center justify-between rounded-input bg-fond p-4">
        <button
          onClick={() => onMonthChange('prev')}
          className="flex items-center gap-2 rounded-pill px-4 py-2 text-body-m font-medium text-marine transition-colors hover:bg-carte"
        >
          <ChevronLeft className="h-5 w-5" />
          Précédent
        </button>
        <h3 className="text-h2 capitalize text-ink">{getMonthName()}</h3>
        <button
          onClick={() => onMonthChange('next')}
          className="flex items-center gap-2 rounded-pill px-4 py-2 text-body-m font-medium text-marine transition-colors hover:bg-carte"
        >
          Suivant
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-carte">
        <div className="grid grid-cols-7 border-b border-border bg-fond">
          {weekDays.map((day) => (
            <div key={day} className="border-r border-border p-3 text-center text-caption font-semibold last:border-r-0">
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
                className={`min-h-[100px] border-b border-r border-border p-2 text-left ${
                  !isCurrentMonth
                    ? 'bg-fond text-faint'
                    : hasShifts
                    ? 'cursor-pointer bg-carte hover:bg-fond'
                    : 'bg-carte'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className={`text-sm font-semibold ${!isCurrentMonth ? 'text-faint' : 'text-ink'}`}>
                    {date.getDate()}
                  </div>
                  {rotationInfo && (
                    <div className="flex items-center gap-1 rounded-pill bg-marine/[0.08] px-1.5 py-0.5 text-[9px] font-semibold text-marine">
                      <Repeat className="h-2.5 w-2.5" />
                      <span>S{rotationInfo.week}</span>
                    </div>
                  )}
                </div>
                {hasShifts && isCurrentMonth && (
                  <div className="space-y-1">
                    {freeCount > 0 && (
                      <div className={`rounded-pill px-2 py-1 text-xs ${STATUS_STYLES.libre.softClass}`}>
                        {freeCount} libre{freeCount > 1 ? 's' : ''}
                      </div>
                    )}
                    {requestPendingCount > 0 && (
                      <div className={`rounded-pill px-2 py-1 text-xs ${STATUS_STYLES.demandes.softClass}`}>
                        {requestPendingCount} demande{requestPendingCount > 1 ? 's' : ''}
                      </div>
                    )}
                    {preValidatedCount > 0 && (
                      <div className={`rounded-pill px-2 py-1 text-xs ${STATUS_STYLES.prevalide.softClass}`}>
                        {preValidatedCount} pré-validé{preValidatedCount > 1 ? 's' : ''}
                      </div>
                    )}
                    {assignedCount > 0 && (
                      <div className={`rounded-pill px-2 py-1 text-xs ${STATUS_STYLES.assigne.softClass}`}>
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
