import { useState, useEffect } from 'react';
import { supabase, supabaseOrga, Shift, Profile, Request } from '../lib/supabase';
import { CalendarCheck, Calendar, MapPin, AlertCircle, X, FileText } from 'lucide-react';
import CancelRequestModal from './CancelRequestModal';
import Segmented from './ui/Segmented';
import { getHoraireStyle, isWeekend, nomCourtCreneau } from '../lib/horaireStyles';
import { aujourdhuiCabinet, libelleJour } from '../lib/dates';

// Nom du creneau (J3, WE1...) lu par jointure, pour le badge de la carte.
type ShiftAvecCreneau = Shift & {
  shift_type_data?: { name: string } | null;
};

type PendingRequest = Request & {
  shift: ShiftAvecCreneau;
};

type MyScheduleViewProps = {
  currentUser: Profile;
};

type ViewMode = 'confirmed' | 'pending';

export default function MyScheduleView({ currentUser }: MyScheduleViewProps) {
  const [shifts, setShifts] = useState<ShiftAvecCreneau[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('confirmed');

  useEffect(() => {
    loadMyShifts();
    loadPendingRequests();

    const shiftsSubscription = supabaseOrga
      .channel('my_shifts_changes')
      .on('postgres_changes', { event: '*', schema: 'agenda', table: 'shifts' }, () => {
        loadMyShifts();
      })
      .subscribe();

    const requestsSubscription = supabaseOrga
      .channel('my_requests_changes')
      .on('postgres_changes', { event: '*', schema: 'agenda', table: 'requests' }, () => {
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
      .select('*, shift_type_data:shift_types!shift_type_id(name)')
      .eq('assigned_doctor_id', currentUser.id)
      .eq('status', 'assigned')
            // Le jour du cabinet et non celui du navigateur : depuis Tahiti,
      // « aujourd'hui » en UTC avait un jour d'avance des 14h locales, et la
      // garde du jour disparaissait de « Mes gardes » (8M-5).
      .gte('date', aujourdhuiCabinet())
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
        shift:shifts(*, shift_type_data:shift_types!shift_type_id(name))
      `)
      .eq('doctor_id', currentUser.id)
      .eq('status', 'pending')
      .gte('shift.date', aujourdhuiCabinet())
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
      setError("Impossible de retirer cette garde car elle est en attente de validation. En cas d'indisponibilité de votre part, veuillez contacter directement le coordinateur.");
      setCancelModalOpen(false);
      return;
    }

    if (shiftData.status === 'assigned') {
      setError("Impossible de retirer cette garde car elle est déjà assignée. En cas d'indisponibilité de votre part, veuillez contacter directement le coordinateur.");
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

  // Demandes en attente reellement affichables (garde encore existante).
  const visiblePending = pendingRequests.filter(
    (req) => req.shift !== null && req.status === 'pending'
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
      <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-carte">
        {icon}
      </div>
      <p className="mb-2 text-muted">{title}</p>
      <p className="text-caption">{subtitle}</p>
    </div>
  );

  // Carte de garde alignee sur "Planning du jour" (24/09/2026) : la carte
  // entiere est teintee a la couleur du creneau (remplace le lisere en L).
  // A la place de l'avatar, inutile ici puisque c'est le medecin lui-meme, la
  // colonne blanche porte la date facon page de calendrier ; le nom du jour
  // passe en brique le week-end, comme l'en-tete de "Planning du jour".
  // Une carte par garde (le cas normal etant une garde par jour ; d'eventuels
  // doublons apparaissent en deux cartes).
  // libelleJour et non new Date(dateStr) : voir lib/dates.ts (8M).
  const shiftCard = (shift: ShiftAvecCreneau, extra?: JSX.Element | null) => {
    const style = getHoraireStyle(shift.shift_type, shift.date);
    const creneau = shift.shift_type_data ? nomCourtCreneau(shift.shift_type_data.name, [shift.location]) : '';
    return (
      <li key={shift.id} className={`flex items-stretch overflow-hidden rounded-card ${style.bgClass}`}>
        <div className="flex w-[88px] flex-shrink-0 flex-col items-center justify-center bg-carte py-3">
          <p className={`text-eyebrow ${isWeekend(shift.date) ? 'text-brique' : ''}`}>
            {libelleJour(shift.date, { weekday: 'short' }).replace('.', '')}
          </p>
          <p className="text-h1 tabular-nums text-ink">{libelleJour(shift.date, { day: 'numeric' })}</p>
          <p className="text-caption">{libelleJour(shift.date, { month: 'short' })}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`text-h2 tabular-nums ${style.textClass}`}>{shift.shift_type}</p>
            {creneau && (
              <span className={`flex-shrink-0 rounded-full bg-carte px-2.5 py-0.5 text-body-m font-semibold ${style.textClass}`}>
                {creneau}
              </span>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-body-m font-semibold text-ink">
            <MapPin size={15} strokeWidth={2} className="flex-shrink-0 text-muted" />
            {shift.location} · {shift.room}
          </p>
          {shift.coordinator_note && (
            <p className="mt-1 flex items-start gap-1.5 rounded-pill bg-carte px-3 py-2 text-caption text-ink">
              <FileText size={15} strokeWidth={2} className="mt-0.5 flex-shrink-0" />
              {shift.coordinator_note}
            </p>
          )}
          {extra && <div className="mt-1">{extra}</div>}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
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

      {/* Le bloc titre "Mes gardes" et le cadre blanc ont disparu (24/09/2026),
          comme dans "Planning du jour" : l'onglet actif du header le dit deja. */}
      <div>
        <div className="mb-4">
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
          shifts.length === 0 ? (
            emptyState(
              <CalendarCheck className="h-8 w-8 text-faint" />,
              'Aucune garde confirmée',
              'Consultez le calendrier pour demander des gardes',
            )
          ) : (
            <ul className="flex flex-col gap-2.5">
              {shifts.map((shift) => shiftCard(shift))}
            </ul>
          )
        ) : (
          visiblePending.length === 0 ? (
            emptyState(
              <Calendar className="h-8 w-8 text-faint" />,
              'Aucune garde en attente',
              'Utilisez le calendrier pour demander des gardes',
            )
          ) : (
            <ul className="flex flex-col gap-2.5">
              {visiblePending.map((request) => shiftCard(request.shift, removeButton(request)))}
            </ul>
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
