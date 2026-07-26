import { useState, useEffect } from 'react';
import { Shift, supabase } from '../lib/supabase';
import { Trash2, UserPlus, UserX, Repeat, FileText } from 'lucide-react';
import SeriesActionModal from './SeriesActionModal';
import EditSeriesModal from './EditSeriesModal';
import EditValidatedShiftModal from './EditValidatedShiftModal';
import ConflictErrorModal from './ConflictErrorModal';
import BottomSheet from './ui/BottomSheet';
import ShiftInfoRows from './shiftDetail/ShiftInfoRows';
import CoordinatorNoteEditor from './shiftDetail/CoordinatorNoteEditor';
import PendingRequestsList from './shiftDetail/PendingRequestsList';
import CancelAssignmentModal from './shiftDetail/CancelAssignmentModal';
import ApplyToRotationWeekModal from './shiftDetail/ApplyToRotationWeekModal';
import DeletionBlockedModal from './shiftDetail/DeletionBlockedModal';
import { getRotationSettings, getRotationWeek, getRotationSlot } from '../lib/rotationUtils';
import { saveUndoAction, getCurrentUserId } from '../lib/undoUtils';
import { checkDoctorDailyConflict } from '../lib/shiftValidation';

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

// Quand on (pre)valide un nouveau medecin sur une garde deja assignee a un autre,
// on rend sa demande a l'ancien medecin : sa demande existante repasse en pending,
// ou on la recree si elle n'existe plus. Utilise par handleApprove et handleSetOnHold.
async function revertPreviousDoctorRequest(
  shiftId: string,
  previousDoctorId: string | null | undefined,
  newDoctorId: string
): Promise<void> {
  if (!previousDoctorId || previousDoctorId === newDoctorId) return;

  const { data: existingRequest } = await supabase
    .from('requests')
    .select('id, status')
    .eq('shift_id', shiftId)
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
        shift_id: shiftId,
        doctor_id: previousDoctorId,
        status: 'pending',
        requested_at: new Date().toISOString()
      });

    if (createError) throw createError;
  }
}

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
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [pendingActionRequest, setPendingActionRequest] = useState<{id: string, doctorId: string, action: 'approve' | 'setOnHold'} | null>(null);
  const [showConflictError, setShowConflictError] = useState(false);
  const [conflictErrorMessage, setConflictErrorMessage] = useState('');

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
      setPendingRequests(filtered);
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
      await revertPreviousDoctorRequest(shift.id, shift.assigned_doctor_id, doctorId);

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

      await revertPreviousDoctorRequest(shift.id, shift.assigned_doctor_id, doctorId);

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

      const { rotationWeek: currentRotationWeek, weekday: currentWeekday } = getRotationSlot(
        new Date(shift.date),
        settings,
        { componentName: 'ShiftDetailModal.handleApplyToRotationWeek', inputOrigin: `shift.date: "${shift.date}"` }
      );

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
          const { rotationWeek: shiftRotationWeek, weekday: shiftWeekday } = getRotationSlot(
            new Date(s.date),
            settings,
            { componentName: 'ShiftDetailModal.handleApplyToRotationWeek(filter)', inputOrigin: `s.date: "${s.date}"` }
          );
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
      <BottomSheet title="Détails de la garde" onClose={onClose} busy={loading}>
        <ShiftInfoRows
          shift={shift}
          rotationInfo={rotationInfo}
          isPartOfSeries={isPartOfSeries}
          hideSeriesInfo={hideSeriesInfo}
          readOnlyMode={readOnlyMode}
          loading={loading}
          onEditSeries={() => setShowEditSeriesModal(true)}
        />

        {isCoordinator && (
          <div className="mt-4">
            <CoordinatorNoteEditor
              shiftId={shift.id}
              initialNote={shift.coordinator_note || ''}
              onSaved={onSuccess}
            />
          </div>
        )}

        {!isCoordinator && shift.status === 'assigned' && shift.coordinator_note && (
          <div className="mt-4 flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted" />
            <div>
              <div className="text-field-label">Note</div>
              <p className="mt-0.5 text-body-m text-ink">{shift.coordinator_note}</p>
            </div>
          </div>
        )}

        <PendingRequestsList
          pendingRequests={pendingRequests}
          shiftStatus={shift.status}
          hideValidation={hideValidation}
          loading={loading}
          onApprove={handleApproveClick}
          onSetOnHold={handleSetOnHoldClick}
          onRemovePrevalidation={handleRemovePrevalidation}
        />

        {error && (
          <div className="mt-4 rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-input border border-border px-5 py-2.5 text-button text-marine disabled:opacity-50"
          >
            Fermer
          </button>
          {isCoordinator && (shift.status === 'free' || shift.status === 'pending') && onAssignDoctor && (
            <button
              onClick={onAssignDoctor}
              disabled={loading}
              className="flex items-center gap-2 rounded-input bg-marine px-5 py-2.5 text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              Assigner un médecin
            </button>
          )}
          {isCoordinator && shift.status === 'assigned' && shift.assigned_doctor_id && (
            <>
              {rotationInfo && (
                <button
                  onClick={() => setShowApplyToRotationWeekConfirm(true)}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-input bg-marine px-5 py-2.5 text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
                >
                  <Repeat className="h-4 w-4" />
                  Appliquer à la semaine de roulement
                </button>
              )}
              <button
                onClick={handleCancelAssignmentClick}
                disabled={loading}
                className="flex items-center gap-2 rounded-input border border-ocre/40 bg-ocre/10 px-5 py-2.5 text-button text-ocre-fonce transition-colors hover:bg-ocre/20 disabled:opacity-50"
              >
                <UserX className="h-4 w-4" />
                Annuler l'assignation
              </button>
            </>
          )}
          {!readOnlyMode && (
            <button
              onClick={handleDeleteClick}
              disabled={loading}
              className="flex items-center gap-2 rounded-input bg-brique px-5 py-2.5 text-button text-white shadow-button transition-colors hover:bg-brique/90 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {loading ? 'Suppression…' : 'Supprimer'}
            </button>
          )}
        </div>
      </BottomSheet>

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
        <CancelAssignmentModal
          hasRotationRule={hasRotationRule}
          isPartOfSeries={isPartOfSeries}
          loading={loading}
          onSingle={() => handleCancelAssignment('single')}
          onSeries={() => handleCancelAssignment('series')}
          onRotation={() => handleCancelAssignment('rotation')}
          onClose={() => setShowCancelAssignmentModal(false)}
        />
      )}

      {showApplyToRotationWeekConfirm && (
        <ApplyToRotationWeekModal
          doctorName={shift.assigned_doctor?.full_name || ''}
          loading={loading}
          onConfirm={handleApplyToRotationWeek}
          onCancel={() => setShowApplyToRotationWeekConfirm(false)}
        />
      )}

      {showDeletionBlockedModal && (
        <DeletionBlockedModal onClose={() => setShowDeletionBlockedModal(false)} />
      )}
    </>
  );
}
