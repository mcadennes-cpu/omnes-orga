import { useState, useEffect } from 'react';
import { Shift, supabase } from '../lib/supabase';
import { X, Calendar, MapPin, Clock, User, Trash2, Edit2, Repeat, Check, Users, UserPlus, UserX, AlertTriangle, FileText, Save, RotateCcw } from 'lucide-react';
import SeriesActionModal from './SeriesActionModal';
import EditSeriesModal from './EditSeriesModal';
import EditValidatedShiftModal from './EditValidatedShiftModal';
import { getRotationSettings, getRotationWeek } from '../lib/rotationUtils';
import { saveUndoAction, getCurrentUserId } from '../lib/undoUtils';
import { checkDoctorDailyConflict } from '../lib/shiftValidation';
import ConflictErrorModal from './ConflictErrorModal';

type PendingRequest = {
  id: string;
  doctor_id: string;
  requested_at: string;
  status: string;
  doctor: {
    id: string;
    full_name: string;
    email: string;
  };
};

type ShiftDetailModalProps = {
  shift: Shift;
  onClose: () => void;
  onSuccess: () => void;
  readOnlyMode?: boolean;
  hideValidation?: boolean;
  onAssignDoctor?: () => void;
  isCoordinator?: boolean;
  hideSeriesInfo?: boolean;
};

export default function ShiftDetailModal({ shift, onClose, onSuccess, readOnlyMode = false, hideValidation = false, onAssignDoctor, isCoordinator = false, hideSeriesInfo = false }: ShiftDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [showEditSeriesModal, setShowEditSeriesModal] = useState(false);
  const [showValidatedConfirm, setShowValidatedConfirm] = useState(false);
  const [showCancelAssignmentModal, setShowCancelAssignmentModal] = useState(false);
  const [showApplyToRotationWeekConfirm, setShowApplyToRotationWeekConfirm] = useState(false);
  const [showDeletionBlockedModal, setShowDeletionBlockedModal] = useState(false);
  const [seriesAction, setSeriesAction] = useState<'modify' | 'delete' | null>(null);
  const [rotationInfo, setRotationInfo] = useState<{ week: number; total: number } | null>(null);
  const [hasRotationRule, setHasRotationRule] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [pendingActionRequest, setPendingActionRequest] = useState<{id: string, doctorId: string, action: 'approve' | 'setOnHold'} | null>(null);
  const [showConflictError, setShowConflictError] = useState(false);
  const [conflictErrorMessage, setConflictErrorMessage] = useState('');
  const [coordinatorNote, setCoordinatorNote] = useState(shift.coordinator_note || '');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const isPartOfSeries = !!shift.series_id;

  useEffect(() => {
    loadPendingRequests();
    loadRotationInfo();
    checkRotationRule();
  }, [shift.id]);

  const loadRotationInfo = async () => {
    const settings = await getRotationSettings();
    if (settings) {
      const week = getRotationWeek(
        new Date(shift.date),
        settings,
        { componentName: 'ShiftDetailModal.loadRotationInfo', inputOrigin: `shift.date: "${shift.date}"` }
      );
      setRotationInfo({ week, total: settings.cycle_length_weeks });
    } else {
      setRotationInfo(null);
    }
  };

  const checkRotationRule = async () => {
    if (!shift.assigned_doctor_id) {
      setHasRotationRule(false);
      return;
    }

    const settings = await getRotationSettings();
    if (!settings) {
      setHasRotationRule(false);
      return;
    }

    const shiftDate = new Date(shift.date);
    const rotationWeek = getRotationWeek(
      shiftDate,
      settings,
      { componentName: 'ShiftDetailModal.checkRotationRule', inputOrigin: `shift.date: "${shift.date}"` }
    );
    const weekday = shiftDate.getDay();

    const { data: rule } = await supabase
      .from('rotation_assignment_rules')
      .select('id')
      .eq('doctor_id', shift.assigned_doctor_id)
      .eq('site_id', shift.site_id)
      .eq('room_id', shift.room_id)
      .eq('shift_type_id', shift.shift_type_id)
      .eq('weekday', weekday)
      .eq('rotation_week', rotationWeek)
      .maybeSingle();

    setHasRotationRule(!!rule);
  };

  const loadPendingRequests = async () => {
    const { data, error } = await supabase
      .from('requests')
      .select(`
        id,
        doctor_id,
        requested_at,
        status,
        doctor:profiles!doctor_id(id, full_name, email)
      `)
      .eq('shift_id', shift.id)
      .in('status', ['pending', 'on_hold'])
      .order('requested_at', { ascending: true });

    if (!error && data) {
      const filtered = (shift.status === 'assigned' && shift.assigned_doctor_id)
        ? data.filter(req => req.doctor_id !== shift.assigned_doctor_id)
        : data;
      setPendingRequests(filtered as PendingRequest[]);
    }
  };

  const handleApproveClick = (requestId: string, doctorId: string) => {
    if (shift.status === 'assigned') {
      setPendingActionRequest({ id: requestId, doctorId, action: 'approve' });
      setShowValidatedConfirm(true);
    } else {
      handleApprove(requestId, doctorId);
    }
  };

  const handleApprove = async (requestId: string, doctorId: string) => {
    setLoading(true);
    setError('');

    try {
      const previousDoctorId = shift.assigned_doctor_id;

      if (previousDoctorId && previousDoctorId !== doctorId) {
        const { data: existingRequest } = await supabase
          .from('requests')
          .select('id, status')
          .eq('shift_id', shift.id)
          .eq('doctor_id', previousDoctorId)
          .maybeSingle();

        if (existingRequest) {
          const { error: revertError } = await supabase
            .from('requests')
            .update({
              status: 'pending',
              reviewed_at: null
            })
            .eq('id', existingRequest.id);

          if (revertError) throw revertError;
        } else {
          const { error: createError } = await supabase
            .from('requests')
            .insert({
              shift_id: shift.id,
              doctor_id: previousDoctorId,
              status: 'pending',
              requested_at: new Date().toISOString()
            });

          if (createError) throw createError;
        }
      }

      const { error: approveError } = await supabase
        .from('requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (approveError) throw approveError;

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetOnHoldClick = (requestId: string, doctorId: string) => {
    if (shift.status === 'assigned') {
      setPendingActionRequest({ id: requestId, doctorId, action: 'setOnHold' });
      setShowValidatedConfirm(true);
    } else {
      handleSetOnHold(requestId, doctorId);
    }
  };

  const handleSetOnHold = async (requestId: string, doctorId: string) => {
    setLoading(true);
    setError('');

    try {
      const request = pendingRequests.find(r => r.id === requestId);
      const doctorName = request?.doctor.full_name;

      const validation = await checkDoctorDailyConflict(
        doctorId,
        shift.date,
        shift.id,
        doctorName
      );

      if (!validation.isValid) {
        setConflictErrorMessage(validation.errorMessage || 'Ce médecin a déjà une garde ce jour-là.');
        setShowConflictError(true);
        setLoading(false);
        return;
      }

      const previousDoctorId = shift.assigned_doctor_id;

      if (previousDoctorId && previousDoctorId !== doctorId) {
        const { data: existingRequest } = await supabase
          .from('requests')
          .select('id, status')
          .eq('shift_id', shift.id)
          .eq('doctor_id', previousDoctorId)
          .maybeSingle();

        if (existingRequest) {
          const { error: revertError } = await supabase
            .from('requests')
            .update({
              status: 'pending',
              reviewed_at: null
            })
            .eq('id', existingRequest.id);

          if (revertError) throw revertError;
        } else {
          const { error: createError } = await supabase
            .from('requests')
            .insert({
              shift_id: shift.id,
              doctor_id: previousDoctorId,
              status: 'pending',
              requested_at: new Date().toISOString()
            });

          if (createError) throw createError;
        }
      }

      const { error: updateError } = await supabase
        .from('requests')
        .update({
          status: 'on_hold',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePrevalidation = async (requestId: string) => {
    setLoading(true);
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('requests')
        .update({
          status: 'pending',
          reviewed_at: null
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleValidatedConfirm = () => {
    setShowValidatedConfirm(false);
    if (pendingActionRequest) {
      if (pendingActionRequest.action === 'approve') {
        handleApprove(pendingActionRequest.id, pendingActionRequest.doctorId);
      } else {
        handleSetOnHold(pendingActionRequest.id, pendingActionRequest.doctorId);
      }
      setPendingActionRequest(null);
    }
  };

  const handleDelete = async (scope: 'single' | 'series') => {
    setLoading(true);
    setError('');

    try {
      if (scope === 'series' && shift.series_id) {
        const { data: shiftsInSeries, error: checkError } = await supabase
          .from('shifts')
          .select('id, status')
          .eq('series_id', shift.series_id)
          .in('status', ['assigned', 'pending']);

        if (checkError) throw checkError;

        if (shiftsInSeries && shiftsInSeries.length > 0) {
          setShowDeletionBlockedModal(true);
          setLoading(false);
          setShowSeriesModal(false);
          return;
        }

        const { error: deleteError } = await supabase
          .from('shifts')
          .delete()
          .eq('series_id', shift.series_id);

        if (deleteError) throw deleteError;

        const { error: seriesDeleteError } = await supabase
          .from('fixed_duty_series')
          .delete()
          .eq('id', shift.series_id);

        if (seriesDeleteError) throw seriesDeleteError;
      } else {
        if (shift.status === 'assigned' || shift.status === 'pending') {
          setShowDeletionBlockedModal(true);
          setLoading(false);
          return;
        }

        const { error: deleteError } = await supabase
          .from('shifts')
          .delete()
          .eq('id', shift.id);

        if (deleteError) throw deleteError;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setShowSeriesModal(false);
    }
  };

  const handleDeleteClick = () => {
    if (isPartOfSeries) {
      setSeriesAction('delete');
      setShowSeriesModal(true);
    } else {
      if (confirm('Êtes-vous sûr de vouloir supprimer cette garde ?')) {
        handleDelete('single');
      }
    }
  };

  const handleSeriesActionSelect = (scope: 'single' | 'series') => {
    if (seriesAction === 'delete') {
      handleDelete(scope);
    }
  };

  const handleCancelAssignmentClick = () => {
    if (isPartOfSeries || hasRotationRule) {
      setShowCancelAssignmentModal(true);
    } else {
      if (confirm('Êtes-vous sûr de vouloir annuler cette assignation ? La garde redeviendra libre.')) {
        handleCancelAssignment('single');
      }
    }
  };

  const handleCancelAssignment = async (scope: 'single' | 'series' | 'rotation') => {
    setShowCancelAssignmentModal(false);
    setLoading(true);
    setError('');

    try {
      const userId = await getCurrentUserId();

      if (scope === 'rotation') {
        const settings = await getRotationSettings();
        if (!settings) {
          throw new Error('Paramètres de roulement non configurés');
        }

        const shiftDate = new Date(shift.date);
        const rotationWeek = getRotationWeek(
          shiftDate,
          settings,
          { componentName: 'ShiftDetailModal.handleDelete(rotation)', inputOrigin: `shift.date: "${shift.date}"` }
        );
        const weekday = shiftDate.getDay();

        const { error: deleteRuleError } = await supabase
          .from('rotation_assignment_rules')
          .delete()
          .eq('doctor_id', shift.assigned_doctor_id)
          .eq('site_id', shift.site_id)
          .eq('room_id', shift.room_id)
          .eq('shift_type_id', shift.shift_type_id)
          .eq('weekday', weekday)
          .eq('rotation_week', rotationWeek);

        if (deleteRuleError) throw deleteRuleError;

        const { error: updateError } = await supabase
          .from('shifts')
          .update({
            status: 'free',
            assigned_doctor_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('site_id', shift.site_id)
          .eq('room_id', shift.room_id)
          .eq('shift_type_id', shift.shift_type_id)
          .gte('date', shift.date);

        if (updateError) throw updateError;

        alert('Règle de roulement supprimée. Toutes les futures gardes correspondantes ont été libérées.');
      } else if (scope === 'series' && shift.series_id) {
        const { error: updateError } = await supabase
          .from('shifts')
          .update({
            status: 'free',
            assigned_doctor_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('series_id', shift.series_id);

        if (updateError) throw updateError;
      } else {
        const { error: updateError } = await supabase
          .from('shifts')
          .update({
            status: 'free',
            assigned_doctor_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', shift.id);

        if (updateError) throw updateError;

        if (userId) {
          await saveUndoAction(
            userId,
            'Annulation d\'assignation',
            {
              type: 'unassign_shift',
              shift_id: shift.id,
              previous_assigned_doctor_id: shift.assigned_doctor_id,
              previous_status: shift.status
            }
          );
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyToRotationWeek = async () => {
    setShowApplyToRotationWeekConfirm(false);
    setLoading(true);
    setError('');

    try {
      const settings = await getRotationSettings();
      if (!settings) {
        setError('Paramètres de roulement non configurés');
        setLoading(false);
        return;
      }

      const currentDate = new Date(shift.date);
      const currentRotationWeek = getRotationWeek(
        currentDate,
        settings,
        { componentName: 'ShiftDetailModal.handleApplyToRotationWeek', inputOrigin: `shift.date: "${shift.date}"` }
      );
      const currentWeekday = currentDate.getDay();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non authentifié');

      const { error: ruleError } = await supabase
        .from('rotation_assignment_rules')
        .upsert({
          doctor_id: shift.assigned_doctor_id,
          site_id: shift.site_id,
          room_id: shift.room_id,
          shift_type_id: shift.shift_type_id,
          weekday: currentWeekday,
          rotation_week: currentRotationWeek,
          created_by: user.id,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'site_id,room_id,shift_type_id,weekday,rotation_week'
        });

      if (ruleError) throw ruleError;

      const { data: allShifts, error: fetchError } = await supabase
        .from('shifts')
        .select('id, date, status, assigned_doctor_id')
        .eq('site_id', shift.site_id)
        .eq('room_id', shift.room_id)
        .eq('shift_type_id', shift.shift_type_id)
        .neq('id', shift.id)
        .in('status', ['free', 'pending']);

      if (fetchError) throw fetchError;

      if (allShifts && allShifts.length > 0) {
        const matchingShifts = allShifts.filter(s => {
          const shiftDate = new Date(s.date);
          const shiftRotationWeek = getRotationWeek(
            shiftDate,
            settings,
            { componentName: 'ShiftDetailModal.handleApplyToRotationWeek(filter)', inputOrigin: `s.date: "${s.date}"` }
          );
          const shiftWeekday = shiftDate.getDay();
          return shiftRotationWeek === currentRotationWeek && shiftWeekday === currentWeekday;
        });

        if (matchingShifts.length > 0) {
          const shiftIds = matchingShifts.map(s => s.id);

          const { error: updateError } = await supabase
            .from('shifts')
            .update({
              status: 'assigned',
              assigned_doctor_id: shift.assigned_doctor_id,
              updated_at: new Date().toISOString()
            })
            .in('id', shiftIds);

          if (updateError) throw updateError;

          const { error: rejectError } = await supabase
            .from('requests')
            .update({
              status: 'rejected',
              reviewed_at: new Date().toISOString(),
              rejection_note: 'Assignation automatique via application à la semaine de roulement'
            })
            .in('shift_id', shiftIds)
            .eq('status', 'pending');

          if (rejectError) throw rejectError;
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('shifts')
        .update({
          coordinator_note: coordinatorNote.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', shift.id);

      if (updateError) throw updateError;

      setIsEditingNote(false);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingNote(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const getStatusInfo = (status: string) => {
    const styles = {
      free: { bg: 'bg-green-100', text: 'text-green-800', label: 'Libre' },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'En attente de validation' },
      assigned: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Assigné' }
    }[status] || { bg: 'bg-gray-100', text: 'text-gray-800', label: status };

    return styles;
  };

  const statusInfo = getStatusInfo(shift.status);

  if (showConflictError) {
    return (
      <ConflictErrorModal
        onClose={() => {
          setShowConflictError(false);
          setConflictErrorMessage('');
        }}
        errorMessage={conflictErrorMessage}
      />
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-teal-900">Détails de la garde</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-gray-600" />
            </button>
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-gray-500 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-gray-500">Date</div>
                <div className="text-gray-900 font-medium">{formatDate(shift.date)}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-gray-500 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-gray-500">Horaire</div>
                <div className="text-gray-900 font-medium">{shift.shift_type}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-500 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-gray-500">Lieu</div>
                <div className="text-gray-900 font-medium">{shift.location} - {shift.room}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-gray-500 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-gray-500">Médecin assigné</div>
                <div className="text-gray-900 font-medium">
                  {shift.assigned_doctor?.full_name || 'Non assigné'}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 flex items-center justify-center">
                <div className={`w-3 h-3 rounded-full ${statusInfo.bg}`}></div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Statut</div>
                <div className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${statusInfo.bg} ${statusInfo.text}`}>
                  {statusInfo.label}
                </div>
              </div>
            </div>

            {isCoordinator && (
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-gray-500 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-500 mb-1">Note coordinateur</div>
                  {isEditingNote ? (
                    <div className="space-y-2">
                      <textarea
                        value={coordinatorNote}
                        onChange={(e) => setCoordinatorNote(e.target.value)}
                        placeholder="Ajouter une note (ex: Remplacement Dr X)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none text-sm"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveNote}
                          disabled={savingNote}
                          className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Save className="w-4 h-4" />
                          {savingNote ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                        <button
                          onClick={() => {
                            setCoordinatorNote(shift.coordinator_note || '');
                            setIsEditingNote(false);
                          }}
                          disabled={savingNote}
                          className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      {coordinatorNote ? (
                        <p className="text-gray-900 text-sm">{coordinatorNote}</p>
                      ) : (
                        <p className="text-gray-400 text-sm italic">Aucune note</p>
                      )}
                      <button
                        onClick={() => setIsEditingNote(true)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                        title="Modifier la note"
                      >
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isCoordinator && shift.status === 'assigned' && shift.coordinator_note && (
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-gray-500 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-gray-500">Note</div>
                  <p className="text-gray-900 text-sm">{shift.coordinator_note}</p>
                </div>
              </div>
            )}

            {rotationInfo && (
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="flex items-center gap-2">
                  <Repeat className="w-5 h-5 text-blue-600" />
                  <div className="text-sm font-semibold text-blue-900">
                    Semaine de roulement n°{rotationInfo.week} / {rotationInfo.total}
                  </div>
                </div>
              </div>
            )}

            {isPartOfSeries && !hideSeriesInfo && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-start gap-3">
                  <Repeat className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-blue-900">Série récurrente</div>
                    <div className="text-sm text-blue-700">Cette garde fait partie d'une série</div>
                  </div>
                </div>
                {!readOnlyMode && (
                  <button
                    onClick={() => setShowEditSeriesModal(true)}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 mt-3"
                  >
                    <Edit2 className="w-4 h-4" />
                    Modifier la récurrence
                  </button>
                )}
              </div>
            )}
          </div>

          {pendingRequests.length > 0 && !hideValidation && (
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-yellow-600" />
                <h3 className="text-lg font-bold text-gray-900">
                  {shift.status === 'assigned' ? `Autres demandes (${pendingRequests.length})` : `Demandes (${pendingRequests.length})`}
                </h3>
              </div>
              {shift.status === 'assigned' && (
                <p className="text-sm text-gray-600 mb-4">
                  Vous pouvez remplacer le médecin actuellement assigné en validant ou pré-validant une autre demande.
                </p>
              )}

              <div className="space-y-3">
                {pendingRequests.map((request) => {
                  const isOnHold = request.status === 'on_hold';
                  const bgClass = isOnHold ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-200';
                  const statusLabel = isOnHold ? 'Pré-validation' : 'En attente de validation';
                  const statusBadgeClass = isOnHold ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300';

                  return (
                    <div
                      key={request.id}
                      className={`${bgClass} border rounded-lg p-4`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="font-semibold text-gray-900">
                              {request.doctor.full_name}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeClass}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">
                            {request.doctor.email}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Demandé le {new Date(request.requested_at).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveClick(request.id, request.doctor_id)}
                          disabled={loading}
                          className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                          Valider
                        </button>
                        {isOnHold ? (
                          <button
                            onClick={() => handleRemovePrevalidation(request.id)}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Retirer la pré-validation
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSetOnHoldClick(request.id, request.doctor_id)}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Clock className="w-4 h-4" />
                            Pré-validation
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {pendingRequests.length > 0 && hideValidation && (
            <div className="border-t border-gray-200 pt-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-yellow-900">
                      {pendingRequests.filter(r => r.status === 'pending').length} {pendingRequests.filter(r => r.status === 'pending').length === 1 ? 'demande en attente de validation' : 'demandes en attente de validation'}
                      {pendingRequests.filter(r => r.status === 'on_hold').length > 0 && (
                        <>, {pendingRequests.filter(r => r.status === 'on_hold').length} en pré-validation</>
                      )}
                    </div>
                    <div className="text-sm text-yellow-700 mt-1">
                      Pour valider ou refuser les demandes, utilisez l'onglet "Demandes"
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Fermer
            </button>
            {isCoordinator && shift.status === 'free' && onAssignDoctor && (
              <button
                onClick={onAssignDoctor}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                Assigner un médecin
              </button>
            )}
            {isCoordinator && shift.status === 'pending' && onAssignDoctor && (
              <button
                onClick={onAssignDoctor}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                Assigner un médecin
              </button>
            )}
            {isCoordinator && shift.status === 'assigned' && shift.assigned_doctor_id && (
              <>
                {rotationInfo && (
                  <button
                    onClick={() => setShowApplyToRotationWeekConfirm(true)}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Repeat className="w-4 h-4" />
                    Appliquer à la semaine de roulement
                  </button>
                )}
                <button
                  onClick={handleCancelAssignmentClick}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  <UserX className="w-4 h-4" />
                  Annuler l'assignation
                </button>
              </>
            )}
            {!readOnlyMode && (
              <button
                onClick={handleDeleteClick}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {loading ? 'Suppression...' : 'Supprimer'}
              </button>
            )}
          </div>
        </div>
      </div>

      {showSeriesModal && seriesAction && (
        <SeriesActionModal
          actionType={seriesAction}
          onClose={() => {
            setShowSeriesModal(false);
            setSeriesAction(null);
          }}
          onSelectScope={handleSeriesActionSelect}
        />
      )}

      {showEditSeriesModal && shift.series_id && (
        <EditSeriesModal
          seriesId={shift.series_id}
          onClose={() => setShowEditSeriesModal(false)}
          onSuccess={() => {
            setShowEditSeriesModal(false);
            onSuccess();
            onClose();
          }}
        />
      )}

      {showValidatedConfirm && (
        <EditValidatedShiftModal
          onConfirm={handleValidatedConfirm}
          onCancel={() => {
            setShowValidatedConfirm(false);
            setPendingActionRequest(null);
          }}
        />
      )}

      {showCancelAssignmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <UserX className="w-6 h-6 text-orange-600" />
              <h3 className="text-xl font-bold text-gray-900">Annuler l'assignation</h3>
            </div>
            <p className="text-gray-700 mb-6">
              {hasRotationRule
                ? "Cette assignation provient d'une règle de roulement. Que souhaitez-vous faire ?"
                : "Souhaitez-vous annuler l'assignation uniquement pour cette date, ou pour toute la série ?"}
            </p>
            <div className="space-y-3">
              <button
                onClick={() => handleCancelAssignment('single')}
                disabled={loading}
                className="w-full px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {hasRotationRule ? 'Annuler uniquement cette garde' : 'Annuler uniquement cette date'}
              </button>
              {hasRotationRule ? (
                <button
                  onClick={() => handleCancelAssignment('rotation')}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  Supprimer la règle de roulement (toutes les futures gardes)
                </button>
              ) : isPartOfSeries && (
                <button
                  onClick={() => handleCancelAssignment('series')}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  Annuler toute la série
                </button>
              )}
              <button
                onClick={() => setShowCancelAssignmentModal(false)}
                disabled={loading}
                className="w-full px-4 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Retour
              </button>
            </div>
          </div>
        </div>
      )}

      {showApplyToRotationWeekConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <Repeat className="w-6 h-6 text-blue-600" />
              <h3 className="text-xl font-bold text-gray-900">Appliquer au roulement</h3>
            </div>
            <p className="text-gray-700 mb-6">
              Vous allez assigner <strong>{shift.assigned_doctor?.full_name}</strong> à toutes les gardes de la même semaine de roulement, avec le même site, la même salle et le même horaire. Continuer ?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowApplyToRotationWeekConfirm(false)}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleApplyToRotationWeek}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeletionBlockedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h3 className="text-xl font-bold text-gray-900">Suppression impossible</h3>
            </div>
            <p className="text-gray-700 mb-6">
              Cette plage comprend des plages d'ouvertures validées ou en attente, vous devez les supprimer avant de supprimer cette plage d'ouverture.
            </p>
            <button
              onClick={() => setShowDeletionBlockedModal(false)}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

    </>
  );
}
