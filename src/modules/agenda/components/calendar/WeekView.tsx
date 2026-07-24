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

  // Couleur de fond de la cellule = STATUT de la garde (le coordinateur trie
  // du regard). Aligne sur l'app d'origine : vert franc = assigne/valide,
  // blanc = libre. Pre-valide -> marine, demandes -> degrade d'ocre.
  const getShiftBackgroundClass = (shift: Shift) => {
    if (shift.status === 'assigned' || shift.status === 'validated') {
      return 'bg-green-100 border-green-300 hover:bg-green-200 cursor-pointer';
    }

    const onHoldCount = (shift as any).onHoldRequestsCount || 0;
    if (onHoldCount > 0) {
      return 'bg-marine/10 border-marine/30 hover:bg-marine/20 cursor-pointer';
    }

    const pendingCount = shift.pendingRequestsCount || 0;
    if (pendingCount > 0) {
      if (pendingCount === 1) return 'bg-ocre/15 border-ocre/25 hover:bg-ocre/25';
      if (pendingCount === 2) return 'bg-ocre/30 border-ocre/40 hover:bg-ocre/40';
      if (pendingCount === 3) return 'bg-ocre/45 border-ocre/55 hover:bg-ocre/55';
      return 'bg-ocre/65 border-ocre/75 hover:bg-ocre/75';
    }

    // Libre : pas de couleur (blanc), simple bordure.
    if (shift.status === 'free') {
      return 'bg-carte border-border hover:bg-fond';
    } else if (shift.status === 'pending') {
      return 'bg-ocre/15 border-ocre/25 hover:bg-ocre/25';
    } else {
      return 'bg-carte border-border';
    }
  };

  if (isMobile) {
    return (
      <div className="space-y-4">
        <div className="rounded-input bg-fond">
          <div className="flex items-center justify-between p-3">
            <button
              onClick={() => onWeekChange('prev')}
              className="rounded-pill p-2 transition-colors hover:bg-carte"
            >
              <ChevronLeft className="h-5 w-5 text-marine" />
            </button>
            <span className="text-body-l font-semibold capitalize text-ink">{getWeekRange()}</span>
            <button
              onClick={() => onWeekChange('next')}
              className="rounded-pill p-2 transition-colors hover:bg-carte"
            >
              <ChevronRight className="h-5 w-5 text-marine" />
            </button>
          </div>
          {rotationInfo && (
            <div className="px-3 pb-3 pt-1">
              <div className="flex items-center justify-center gap-2 rounded-input bg-marine/10 px-3 py-1 text-marine">
                <Repeat className="h-4 w-4" />
                <span className="text-body-m font-semibold">Semaine de roulement n°{rotationInfo.week} / {rotationInfo.total}</span>
              </div>
            </div>
          )}
        </div>

        {weekDays.map((day) => {
          const dayShifts = getShiftsForDay(day);
          return (
            <div key={day.toISOString()} className="rounded-card border border-border bg-carte p-4">
              <h3 className="mb-3 border-b border-border pb-2 font-semibold capitalize text-ink">
                {formatDayHeader(day)}
              </h3>
              {dayShifts.length === 0 ? (
                <p className="py-4 text-center text-caption">Aucune garde</p>
              ) : (
                <div className="space-y-2">
                  {dayShifts.map((shift) => (
                    <button
                      key={shift.id}
                      onClick={() => onShiftClick(shift)}
                      disabled={!isCoordinator && shift.status !== 'free'}
                      className={`w-full cursor-pointer rounded-card border-2 p-3 text-left transition-all ${getShiftBackgroundClass(shift)}`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-body-m font-medium text-ink">
                          {shift.shift_type_data?.name || shift.shift_type}
                        </span>
                        {getStatusBadge(shift.status, shift)}
                      </div>
                      <div className="text-caption">
                        {shift.location} - {shift.room}
                      </div>
                      {shift.assigned_doctor && (
                        <div className="mt-1 text-caption">
                          {shift.assigned_doctor.full_name}
                        </div>
                      )}
                      {isCoordinator && shift.coordinator_note && (
                        <div className="mt-1 truncate text-[10px] italic text-faint" title={shift.coordinator_note}>
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
      <div className="rounded-input bg-fond">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => onWeekChange('prev')}
            className="flex items-center gap-2 rounded-pill px-4 py-2 text-body-m font-medium text-marine transition-colors hover:bg-carte"
          >
            <ChevronLeft className="h-5 w-5" />
            Précédent
          </button>
          <h3 className="text-h2 capitalize text-ink">{getWeekRange()}</h3>
          <button
            onClick={() => onWeekChange('next')}
            className="flex items-center gap-2 rounded-pill px-4 py-2 text-body-m font-medium text-marine transition-colors hover:bg-carte"
          >
            Suivant
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        {rotationInfo && (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-center gap-2 rounded-input bg-marine/10 px-4 py-2 text-marine">
              <Repeat className="h-5 w-5" />
              <span className="text-body-l font-semibold">Semaine de roulement n°{rotationInfo.week} / {rotationInfo.total}</span>
            </div>
          </div>
        )}
        {isCoordinator && onSaveAsTemplate && onDeleteTemplate && onDuplicateTemplate && (
          <div className="flex flex-wrap items-center justify-center gap-3 px-4 pb-4">
            <button
              onClick={onSaveAsTemplate}
              className="flex items-center gap-2 rounded-input bg-canard px-4 py-2 text-button text-white transition-colors hover:bg-canard/90"
            >
              <Save className="h-4 w-4" />
              Sauvegarder comme modèle
            </button>
            <button
              onClick={onDuplicateTemplate}
              className="flex items-center gap-2 rounded-input bg-marine px-4 py-2 text-button text-white transition-colors hover:bg-marine/90"
            >
              <Copy className="h-4 w-4" />
              Dupliquer un modèle
            </button>
            <button
              onClick={onDeleteTemplate}
              className="flex items-center gap-2 rounded-input border border-brique/30 bg-brique/10 px-4 py-2 text-button text-brique transition-colors hover:bg-brique/20"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer un modèle
            </button>
          </div>
        )}
      </div>

      <div className="-mx-2 overflow-x-auto">
        <table className="w-full min-w-[1400px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-fond">
              <th className="sticky left-0 z-10 w-[140px] border-r border-border bg-fond px-3 py-3 text-left text-caption font-semibold">
                Salle
              </th>
              {weekDays.map((day) => (
                <th
                  key={day.toISOString()}
                  className="w-[200px] border-r border-border px-3 py-3 text-center text-caption font-semibold capitalize"
                >
                  <div>{formatDayHeader(day)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {uniqueRooms.map((room) => (
              <tr key={room} className="border-b border-border">
                <td className="sticky left-0 z-10 w-[140px] border-r border-border bg-carte px-3 py-2 font-medium text-ink">
                  {room}
                </td>
                {weekDays.map((day) => {
                  const dayShifts = getShiftsForDay(day).filter(s => s.room === room);
                  return (
                    <td
                      key={`${room}-${day.toISOString()}`}
                      className="w-[200px] border-r border-border px-2 py-2 align-top"
                    >
                      <div className="space-y-1">
                        {dayShifts.map((shift) => (
                          <button
                            key={shift.id}
                            onClick={() => onShiftClick(shift)}
                            disabled={!isCoordinator && shift.status !== 'free'}
                            className={`w-full cursor-pointer rounded-pill border p-2 text-left text-xs transition-all ${getShiftBackgroundClass(shift)}`}
                          >
                            <div className="mb-0.5 font-semibold text-ink">
                              {shift.shift_type_data?.name || shift.shift_type}
                            </div>
                            <div className="text-muted">
                              {shift.location}
                            </div>
                            {shift.assigned_doctor && (
                              <div className="mt-0.5 truncate font-medium text-ink">
                                {shift.assigned_doctor.full_name}
                              </div>
                            )}
                            {isCoordinator && shift.coordinator_note && (
                              <div className="mt-0.5 truncate text-[9px] italic leading-tight text-faint" title={shift.coordinator_note}>
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
