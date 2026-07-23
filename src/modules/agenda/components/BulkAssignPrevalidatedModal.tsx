import { useState } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { checkDoctorDailyConflict } from '../lib/shiftValidation';

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Confirmer l'assignation</h2>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-gray-700">
                Voulez-vous vraiment assigner automatiquement toutes les pré-validations pour <strong>{periodLabels[periodType]}</strong> ?
              </p>
              {prevalidatedCount > 0 && (
                <p className="text-sm text-blue-700 font-semibold mt-2">
                  {prevalidatedCount} {prevalidatedCount === 1 ? 'pré-validation sera assignée' : 'pré-validations seront assignées'}
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-yellow-900 font-semibold mb-2">
                  Certaines pré-validations n'ont pas pu être assignées :
                </p>
                <ul className="text-sm text-yellow-800 space-y-1 ml-4 list-disc">
                  {warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <p className="text-sm text-gray-700 font-semibold">Actions automatiques :</p>
            <ul className="text-sm text-gray-600 space-y-1 ml-4">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Validation des demandes pré-approuvées</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Assignation des médecins aux gardes</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Rejet automatique des autres demandes concurrentes</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {warnings.length > 0 ? 'Fermer' : 'Annuler'}
          </button>
          {warnings.length === 0 && (
            <button
              onClick={handleConfirm}
              disabled={isProcessing || prevalidatedCount === 0}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Assignation en cours...</span>
                </>
              ) : (
                'Confirmer l\'assignation'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
