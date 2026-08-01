import { Shift } from '../lib/supabase';
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
import { useShiftDetail } from '../hooks/useShiftDetail';

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
  const {
    loading,
    error,
    rotationInfo,
    hasRotationRule,
    rotationCancelCount,
    pendingRequests,
    isPartOfSeries,
    showSeriesModal,
    seriesAction,
    showEditSeriesModal,
    showValidatedConfirm,
    showCancelAssignmentModal,
    showApplyToRotationWeekConfirm,
    showDeletionBlockedModal,
    showConflictError,
    conflictErrorMessage,
    setShowSeriesModal,
    setSeriesAction,
    setShowEditSeriesModal,
    setShowValidatedConfirm,
    setPendingActionRequest,
    setShowCancelAssignmentModal,
    setShowApplyToRotationWeekConfirm,
    setShowDeletionBlockedModal,
    setShowConflictError,
    setConflictErrorMessage,
    handleApproveClick,
    handleSetOnHoldClick,
    handleRemovePrevalidation,
    handleValidatedConfirm,
    handleDeleteClick,
    handleSeriesActionSelect,
    handleCancelAssignmentClick,
    handleCancelAssignment,
    handleApplyToRotationWeek,
  } = useShiftDetail(shift, onSuccess, onClose);

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
                  Appliquer aux gardes du roulement
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
          rotationCancelCount={rotationCancelCount}
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
