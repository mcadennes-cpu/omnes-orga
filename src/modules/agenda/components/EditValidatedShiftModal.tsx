import { AlertTriangle } from 'lucide-react';

type EditValidatedShiftModalProps = {
  onConfirm: () => void;
  onCancel: () => void;
};

export default function EditValidatedShiftModal({ onConfirm, onCancel }: EditValidatedShiftModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-amber-100 rounded-full">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Garde déjà validée
            </h3>
            <p className="text-sm text-gray-600">
              Cette garde a déjà été validée. Êtes-vous sûr de vouloir la modifier ?
            </p>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold transition-colors"
          >
            Confirmer la modification
          </button>
        </div>
      </div>
    </div>
  );
}
