import { useState, useEffect } from 'react';
import { supabase, Shift, Profile, Request } from '../lib/supabase';
import { CalendarCheck, Calendar, MapPin, Clock, AlertCircle, X, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import CancelRequestModal from './CancelRequestModal';
import Segmented from './ui/Segmented';
import { getHoraireStyle } from '../lib/horaireStyles';

type PendingRequest = Request & {
  shift: Shift;
};

type MyScheduleViewProps = {
  currentUser: Profile;
};

type ViewMode = 'confirmed' | 'pending';

export default function MyScheduleView({ currentUser }: MyScheduleViewProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('confirmed');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadMyShifts();
    loadPendingRequests();

    const shiftsSubscription = supabase
      .channel('my_shifts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        loadMyShifts();
      })
      .subscribe();

    const requestsSubscription = supabase
      .channel('my_requests_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
        loadPendingRequests();
      })
      .subscribe();

    return () => {
      shiftsSubscription.unsubscribe();
      requestsSubscription.unsubscribe();
    };
  }, [currentUser.id]);

  const loadMyShifts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('assigned_doctor_id', currentUser.id)
      .eq('status', 'assigned')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (!error && data) {
      setShifts(data);
    }
    setLoading(false);
  };

  const loadPendingRequests = async () => {
    const { data, error } = await supabase
      .from('requests')
      .select(`
        *,
        shift:shifts(*)
      `)
      .eq('doctor_id', currentUser.id)
      .eq('status', 'pending')
      .gte('shift.date', new Date().toISOString().split('T')[0])
      .order('shift(date)', { ascending: true });

    if (!error && data) {
      setPendingRequests(data as PendingRequest[]);
    }
  };

  const handleCancelRequest = (request: PendingRequest) => {
    setSelectedRequest(request);
    setCancelModalOpen(true);
    setError(null);
  };

  const confirmCancelRequest = async () => {
    if (!selectedRequest) return;

    const { data: shiftData, error: shiftError } = await supabase
      .from('shifts')
      .select('status')
      .eq('id', selectedRequest.shift_id)
      .single();

    if (shiftError || !shiftData) {
      setError("Impossible de retirer cette garde car elle est en attente de validation. En cas d'indisponibilite de votre part, veuillez contacter directement le coordinateur.");
      setCancelModalOpen(false);
      return;
    }

    if (shiftData.status === 'assigned') {
      setError("Impossible de retirer cette garde car elle est deja assignee. En cas d'indisponibilite de votre part, veuillez contacter directement le coordinateur.");
      setCancelModalOpen(false);
      return;
    }

    const { error: cancelError } = await supabase
      .from('requests')
      .update({ status: 'cancelled' })
      .eq('id', selectedRequest.id)
      .eq('doctor_id', currentUser.id)
      .in('status', ['pending', 'on_hold']);

    if (!cancelError) {
      setCancelModalOpen(false);
      setSelectedRequest(null);
      loadPendingRequests();
    } else {
      setError("Impossible de retirer cette demande. Veuillez contacter le coordinateur.");
      setCancelModalOpen(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  };

  const toggleDayExpansion = (dateStr: string) => {
    const newExpanded = new Set(expandedDays);
    if (newExpanded.has(dateStr)) {
      newExpanded.delete(dateStr);
    } else {
      newExpanded.add(dateStr);
    }
    setExpandedDays(newExpanded);
  };

  const groupShiftsByDate = (shiftsToGroup: Shift[]) => {
    return shiftsToGroup.reduce((acc, shift) => {
      if (!acc[shift.date]) {
        acc[shift.date] = [];
      }
      acc[shift.date].push(shift);
      return acc;
    }, {} as Record<string, Shift[]>);
  };

  const groupedConfirmedShifts = groupShiftsByDate(shifts);
  const groupedPendingShifts = groupShiftsByDate(
    pendingRequests
      .filter(req => req.shift !== null)
      .map(req => req.shift)
  );
  const confirmedDates = Object.keys(groupedConfirmedShifts).sort();
  const pendingDates = Object.keys(groupedPendingShifts).sort();

  // Lignes lieu / salle / horaire d'une garde, communes aux deux vues.
  const shiftInfoGrid = (shift: Shift) => (
    <div className="grid grid-cols-3 gap-4">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted" />
        <span className="text-body-m font-medium text-ink">{shift.location}</span>
      </div>
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted" />
        <span className="text-body-m font-medium text-ink">{shift.room}</span>
      </div>
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted" />
        <span className="text-body-m font-medium text-ink">{shift.shift_type}</span>
      </div>
    </div>
  );

  const coordinatorNote = (note: string) => (
    <div className="mt-3 flex items-start gap-2 border-t border-border pt-3">
      <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-canard" />
      <p className="text-body-m text-ink">{note}</p>
    </div>
  );

  // Bouton destructif "Retirer cette garde" (vue en attente).
  const removeButton = (request: PendingRequest) => (
    <button
      onClick={() => handleCancelRequest(request)}
      className="text-body-m font-medium text-brique hover:text-brique/80 hover:underline"
    >
      Retirer cette garde
    </button>
  );

  const emptyState = (icon: JSX.Element, title: string, subtitle: string) => (
    <div className="py-12 text-center">
      <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-fond">
        {icon}
      </div>
      <p className="mb-2 text-muted">{title}</p>
      <p className="text-caption">{subtitle}</p>
    </div>
  );

  // Rend une journee (une ou plusieurs gardes), coloriee par horaire. Chaque
  // garde porte sa propre couleur (une meme journee peut melanger les creneaux).
  const renderDay = (
    date: string,
    dayShifts: Shift[],
    renderExtra?: (shift: Shift) => JSX.Element | null,
  ) => {
    const isExpanded = expandedDays.has(date);
    const hasMultipleShifts = dayShifts.length > 1;

    const shiftCard = (shift: Shift, withDate: boolean) => {
      const style = getHoraireStyle(shift.shift_type, shift.date);
      return (
        <div key={shift.id} className={`rounded-card p-4 ${style.cardClass}`}>
          {withDate && (
            <div className="mb-3 font-semibold capitalize text-ink">{formatDate(date)}</div>
          )}
          {shiftInfoGrid(shift)}
          {shift.coordinator_note && coordinatorNote(shift.coordinator_note)}
          {renderExtra && <div className="mt-3">{renderExtra(shift)}</div>}
        </div>
      );
    };

    if (!hasMultipleShifts) {
      return <div key={date}>{shiftCard(dayShifts[0], true)}</div>;
    }

    return (
      <div key={date} className="overflow-hidden rounded-card border border-border">
        <button
          onClick={() => toggleDayExpansion(date)}
          className="flex w-full items-center justify-between bg-fond p-4 text-left transition-colors hover:bg-border/40"
        >
          <div>
            <span className="font-semibold capitalize text-ink">{formatDate(date)}</span>
            <span className="ml-2 text-caption">({dayShifts.length} gardes)</span>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted" />
          )}
        </button>
        {isExpanded && (
          <div className="space-y-2 bg-carte p-2">
            {dayShifts.map((shift) => shiftCard(shift, false))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-3 rounded-card border-2 border-brique/20 bg-brique/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-brique" />
          <div className="flex-1">
            <p className="mb-1 font-medium text-brique">Impossible de retirer cette demande</p>
            <p className="text-body-m text-brique/80">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="rounded p-1 transition-colors hover:bg-brique/10"
          >
            <X className="h-4 w-4 text-brique" />
          </button>
        </div>
      )}

      <div className="rounded-card border border-border bg-carte p-6 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-pill bg-canard/10 p-2">
            <CalendarCheck className="h-6 w-6 text-canard" />
          </div>
          <div>
            <h2 className="text-h2 text-ink">Mes gardes</h2>
            <p className="text-caption">Consultez vos gardes confirmées et en attente</p>
          </div>
        </div>

        <div className="mb-6">
          <Segmented
            ariaLabel="Filtre des gardes"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'confirmed', label: 'Confirmées' },
              { value: 'pending', label: 'En attente' },
            ]}
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted">Chargement…</div>
        ) : viewMode === 'confirmed' ? (
          confirmedDates.length === 0 ? (
            emptyState(
              <CalendarCheck className="h-8 w-8 text-faint" />,
              'Aucune garde confirmée',
              'Consultez le calendrier pour demander des gardes',
            )
          ) : (
            <div className="space-y-3">
              {confirmedDates.map((date) => renderDay(date, groupedConfirmedShifts[date]))}
            </div>
          )
        ) : (
          pendingDates.length === 0 ? (
            emptyState(
              <Calendar className="h-8 w-8 text-faint" />,
              'Aucune garde en attente',
              'Utilisez le calendrier pour demander des gardes',
            )
          ) : (
            <div className="space-y-3">
              {pendingDates.map((date) => {
                const dayShifts = groupedPendingShifts[date].filter(shift => {
                  const request = pendingRequests.find(req => req.shift_id === shift.id);
                  return request && request.status === 'pending';
                });
                if (dayShifts.length === 0) return null;
                return renderDay(date, dayShifts, (shift) => {
                  const request = pendingRequests.find(r => r.shift_id === shift.id);
                  return request ? removeButton(request) : null;
                });
              })}
            </div>
          )
        )}
      </div>

      {selectedRequest && (
        <CancelRequestModal
          isOpen={cancelModalOpen}
          onClose={() => {
            setCancelModalOpen(false);
            setSelectedRequest(null);
          }}
          onConfirm={confirmCancelRequest}
          shiftDate={selectedRequest.shift.date}
          shiftType={selectedRequest.shift.shift_type}
        />
      )}
    </div>
  );
}
