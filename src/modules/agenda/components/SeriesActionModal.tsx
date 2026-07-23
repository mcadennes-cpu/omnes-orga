import { AlertTriangle } from 'lucide-react';

type SeriesActionModalProps = {
  actionType: 'modify' | 'delete';
  onClose: () => void;
  onSelectScope: (scope: 'single' | 'series') => void;
};

export default function SeriesActionModal({ actionType, onClose, onSelectScope }: SeriesActionModalProps) {
  const isDelete = actionType === 'delete';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className={`p-3 rounded-full ${isDelete ? 'bg-red-100' : 'bg-blue-100'}`}>
            <AlertTriangle className={`w-6 h-6 ${isDelete ? 'text-red-600' : 'text-blue-600'}`} />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {isDelete ? 'Supprimer la garde' : 'Modifier la garde'}
          </h2>
        </div>

        <p className="text-gray-600 mb-6">
          Cette garde fait partie d'une série récurrente. Souhaitez-vous {isDelete ? 'supprimer' : 'modifier'} :
        </p>

        <div className="space-y-3">
          <button
            onClick={() => onSelectScope('single')}
            className="w-full p-4 text-left border-2 border-gray-300 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-all group"
          >
            <div className="font-semibold text-gray-900 mb-1">Uniquement cette garde</div>
            <div className="text-sm text-gray-600">
              {isDelete
                ? 'La garde sera supprimée mais les autres gardes de la série resteront inchangées'
                : 'Seule cette garde sera modifiée, les autres resteront inchangées'}
            </div>
          </button>

          <button
            onClick={() => onSelectScope('series')}
            className={`w-full p-4 text-left border-2 rounded-lg transition-all group ${
              isDelete
                ? 'border-red-300 hover:border-red-500 hover:bg-red-50'
                : 'border-blue-300 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <div className="font-semibold text-gray-900 mb-1">Toute la série</div>
            <div className="text-sm text-gray-600">
              {isDelete
                ? 'Toutes les gardes de la série seront supprimées définitivement'
                : 'Toutes les gardes de la série seront modifiées'}
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
