import { useState, useEffect } from 'react';
import { supabase, Shift, Profile, Request } from '../lib/supabase';
import { CalendarCheck, Calendar, MapPin, Clock, AlertCircle, X, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import CancelRequestModal from './CancelRequestModal';

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

  const getShiftColor = (shiftType: string) => {
    const pastelColors = [
      'bg-blue-100',
      'bg-pink-100',
      'bg-purple-100',
      'bg-yellow-100',
      'bg-orange-100',
      'bg-rose-100',
      'bg-cyan-100',
      'bg-lime-100',
      'bg-amber-100',
      'bg-violet-100',
      'bg-fuchsia-100',
      'bg-sky-100',
      'bg-emerald-100',
      'bg-indigo-100'
    ];

    let hash = 0;
    for (let i = 0; i < shiftType.length; i++) {
      hash = shiftType.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % pastelColors.length;
    return pastelColors[index];
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

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-900 font-medium mb-1">Impossible de retirer cette demande</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-1 hover:bg-red-100 rounded transition-colors"
          >
            <X className="w-4 h-4 text-red-600" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-pink-100 rounded-lg">
            <CalendarCheck className="w-6 h-6 text-pink-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-teal-900">Mes Gardes</h2>
            <p className="text-sm text-gray-600">Consultez vos gardes confirmées et en attente</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setViewMode('confirmed')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              viewMode === 'confirmed'
                ? 'bg-green-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Mes gardes confirmées
          </button>
          <button
            onClick={() => setViewMode('pending')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              viewMode === 'pending'
                ? 'bg-gray-700 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Mes gardes en attente
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Chargement...</div>
        ) : viewMode === 'confirmed' ? (
          confirmedDates.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <CalendarCheck className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 mb-2">Aucune garde confirmée</p>
              <p className="text-sm text-gray-500">Consultez le calendrier pour demander des gardes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {confirmedDates.map((date) => {
                const dayShifts = groupedConfirmedShifts[date];
                const isExpanded = expandedDays.has(date);
                const hasMultipleShifts = dayShifts.length > 1;

                return (
                  <div key={date} className="border border-gray-200 rounded-lg overflow-hidden">
                    {hasMultipleShifts ? (
                      <>
                        <button
                          onClick={() => toggleDayExpansion(date)}
                          className="w-full flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 transition-colors text-left"
                        >
                          <div>
                            <span className="font-semibold text-gray-900">{formatDate(date)}</span>
                            <span className="ml-2 text-sm text-gray-600">({dayShifts.length} gardes)</span>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-600" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-600" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="divide-y divide-gray-200">
                            {dayShifts.map((shift) => (
                              <div key={shift.id} className={`p-4 ${getShiftColor(shift.shift_type)}`}>
                                <div className="grid grid-cols-3 gap-4">
                                  <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-gray-700" />
                                    <span className="text-sm font-medium text-gray-900">{shift.location}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-gray-700" />
                                    <span className="text-sm font-medium text-gray-900">{shift.room}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-gray-700" />
                                    <span className="text-sm font-medium text-gray-900">{shift.shift_type}</span>
                                  </div>
                                </div>
                                {shift.coordinator_note && (
                                  <div className="flex items-start gap-2 mt-3 pt-3 border-t border-gray-300">
                                    <FileText className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                                    <p className="text-sm text-gray-700">{shift.coordinator_note}</p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className={`p-4 ${dayShifts.length > 0 ? getShiftColor(dayShifts[0].shift_type) : 'bg-white'}`}>
                        <div className="mb-3">
                          <span className="font-semibold text-gray-900">{formatDate(date)}</span>
                        </div>
                        {dayShifts.map((shift) => (
                          <div key={shift.id}>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-gray-700" />
                                <span className="text-sm font-medium text-gray-900">{shift.location}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-gray-700" />
                                <span className="text-sm font-medium text-gray-900">{shift.room}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-gray-700" />
                                <span className="text-sm font-medium text-gray-900">{shift.shift_type}</span>
                              </div>
                            </div>
                            {shift.coordinator_note && (
                              <div className="flex items-start gap-2 mt-3 pt-3 border-t border-gray-300">
                                <FileText className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-gray-700">{shift.coordinator_note}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          pendingDates.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <Calendar className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 mb-2">Aucune garde en attente</p>
              <p className="text-sm text-gray-500">Utilisez le calendrier pour demander des gardes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingDates.map((date) => {
                const dayShifts = groupedPendingShifts[date].filter(shift => {
                  const request = pendingRequests.find(req => req.shift_id === shift.id);
                  return request && request.status === 'pending';
                });
                if (dayShifts.length === 0) return null;
                const isExpanded = expandedDays.has(date);
                const hasMultipleShifts = dayShifts.length > 1;

                return (
                  <div key={date} className="border border-yellow-200 bg-yellow-50 rounded-lg overflow-hidden">
                    {hasMultipleShifts ? (
                      <>
                        <button
                          onClick={() => toggleDayExpansion(date)}
                          className="w-full flex items-center justify-between p-4 bg-yellow-100 hover:bg-yellow-200 transition-colors text-left"
                        >
                          <div>
                            <span className="font-semibold text-gray-900">{formatDate(date)}</span>
                            <span className="ml-2 text-sm text-gray-600">({dayShifts.length} gardes)</span>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-600" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-600" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="divide-y divide-gray-200">
                            {dayShifts.map((shift) => {
                              const request = pendingRequests.find(r => r.shift_id === shift.id);
                              if (!request) return null;
                              return (
                                <div key={shift.id} className="p-4 bg-white">
                                  <div className="grid grid-cols-3 gap-4 mb-3">
                                    <div className="flex items-center gap-2">
                                      <MapPin className="w-4 h-4 text-gray-600" />
                                      <span className="text-sm font-medium">{shift.location}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 text-gray-600" />
                                      <span className="text-sm font-medium">{shift.room}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-4 h-4 text-gray-600" />
                                      <span className="text-sm font-medium">{shift.shift_type}</span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleCancelRequest(request)}
                                    className="text-sm text-red-600 hover:text-red-700 font-medium hover:underline"
                                  >
                                    Retirer cette garde
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="p-4 bg-white">
                        <div className="mb-3">
                          <span className="font-semibold text-gray-900">{formatDate(date)}</span>
                        </div>
                        {dayShifts.map((shift) => {
                          const request = pendingRequests.find(r => r.shift_id === shift.id);
                          if (!request) return null;
                          return (
                            <div key={shift.id}>
                              <div className="grid grid-cols-3 gap-4 mb-3">
                                <div className="flex items-center gap-2">
                                  <MapPin className="w-4 h-4 text-gray-600" />
                                  <span className="text-sm font-medium">{shift.location}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4 text-gray-600" />
                                  <span className="text-sm font-medium">{shift.room}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-gray-600" />
                                  <span className="text-sm font-medium">{shift.shift_type}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => handleCancelRequest(request)}
                                className="text-sm text-red-600 hover:text-red-700 font-medium hover:underline"
                              >
                                Retirer cette garde
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
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
