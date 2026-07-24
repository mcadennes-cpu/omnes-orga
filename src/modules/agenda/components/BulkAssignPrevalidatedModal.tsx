import { useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { checkDoctorDailyConflict } from '../lib/shiftValidation';
import BottomSheet from './ui/BottomSheet';

type BulkAssignPrevalidatedModalProps = {
  onClose: () => void;
  onSuccess: () => void;
  periodType: 'week' | 'month';
  dateRange: { start: string; end: string };
  prevalidatedCount: number;
};

export default function BulkAssignPrevalidatedModal({
  onClose,
  onSuccess,
  periodType,
  dateRange,
  prevalidatedCount
}: BulkAssignPrevalidatedModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const periodLabels = {
    week: 'cette semaine',
    month: 'ce mois'
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const { data: onHoldRequests, error: fetchError } = await supabase
        .from('requests')
        .select(`
          id,
          shift_id,
          doctor_id,
          shifts!inner(date),
          doctor:profiles!doctor_id(full_name)
        `)
        .eq('status', 'on_hold')
        .gte('shifts.date', dateRange.start)
        .lte('shifts.date', dateRange.end);

      if (fetchError) throw fetchError;

      if (!onHoldRequests || onHoldRequests.length === 0) {
        setError('Aucune pré-validation trouvée pour cette période.');
        setIsProcessing(false);
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      const conflictWarnings: string[] = [];

      for (const request of onHoldRequests) {
        try {
          const shiftDate = (request.shifts as any).date;
          const doctorName = (request.doctor as any)?.full_name || 'Médecin';

          const validation = await checkDoctorDailyConflict(
            request.doctor_id,
            shiftDate,
            request.shift_id,
            doctorName
          );

          if (!validation.isValid) {
            conflictWarnings.push(`${doctorName} - conflit détecté pour le ${new Date(shiftDate).toLocaleDateString('fr-FR')}`);
            errorCount++;
            continue;
          }

          const { error: approveError } = await supabase
            .from('requests')
            .update({ status: 'approved' })
            .eq('id', request.id);

          if (approveError) {
            console.error('Error approving request:', approveError);
            errorCount++;
            continue;
          }

          const { error: shiftUpdateError } = await supabase
            .from('shifts')
            .update({
              status: 'assigned',
              assigned_doctor_id: request.doctor_id
            })
            .eq('id', request.shift_id);

          if (shiftUpdateError) {
            console.error('Error updating shift:', shiftUpdateError);
            errorCount++;
            continue;
          }

          const { error: rejectError } = await supabase
            .from('requests')
            .update({ status: 'rejected' })
            .eq('shift_id', request.shift_id)
            .neq('id', request.id)
            .in('status', ['pending', 'on_hold']);

          if (rejectError) {
            console.error('Error rejecting other requests:', rejectError);
          }

          successCount++;
        } catch (err) {
          console.error('Error processing request:', err);
          errorCount++;
        }
      }

      if (conflictWarnings.length > 0) {
        setWarnings(conflictWarnings);
      }

      if (successCount > 0) {
        onSuccess();
        if (conflictWarnings.length === 0) {
          onClose();
        }
      } else {
        setError('Aucune assignation n\'a pu être effectuée.');
      }
    } catch (err) {
      console.error('Error in bulk assignment:', err);
      setError('Une erreur est survenue lors de l\'assignation automatique.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <BottomSheet
      title="Confirmer l'assignation"
      onClose={onClose}
      busy={isProcessing}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
          >
            {warnings.length > 0 ? 'Fermer' : 'Annuler'}
          </button>
          {warnings.length === 0 && (
            <button
              onClick={handleConfirm}
              disabled={isProcessing || prevalidatedCount === 0}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Assignation en cours…</span>
                </>
              ) : (
                "Confirmer l'assignation"
              )}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-card border border-marine/20 bg-marine/5 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-marine" />
          <div className="flex-1">
            <p className="text-body-m text-ink">
              Voulez-vous vraiment assigner automatiquement toutes les pré-validations pour{' '}
              <strong>{periodLabels[periodType]}</strong> ?
            </p>
            {prevalidatedCount > 0 && (
              <p className="mt-2 text-body-m font-semibold text-marine">
                {prevalidatedCount} {prevalidatedCount === 1 ? 'pré-validation sera assignée' : 'pré-validations seront assignées'}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-card border border-brique/20 bg-brique/10 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-brique" />
            <p className="text-body-m text-brique">{error}</p>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="flex items-start gap-3 rounded-card border border-ocre/30 bg-ocre/10 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-ocre-fonce" />
            <div className="flex-1">
              <p className="mb-2 text-body-m font-semibold text-ocre-fonce">
                Certaines pré-validations n'ont pas pu être assignées :
              </p>
              <ul className="ml-4 list-disc space-y-1 text-body-m text-ink">
                {warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-card bg-fond p-4">
          <p className="text-body-m font-semibold text-ink">Actions automatiques :</p>
          <ul className="ml-1 space-y-1 text-body-m text-muted">
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-olive" />
              <span>Validation des demandes pré-approuvées</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-olive" />
              <span>Assignation des médecins aux gardes</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-olive" />
              <span>Rejet automatique des autres demandes concurrentes</span>
            </li>
          </ul>
        </div>
      </div>
    </BottomSheet>
  );
}
