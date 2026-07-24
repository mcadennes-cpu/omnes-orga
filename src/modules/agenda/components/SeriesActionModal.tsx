import BottomSheet from './ui/BottomSheet';

type SeriesActionModalProps = {
  actionType: 'modify' | 'delete';
  onClose: () => void;
  onSelectScope: (scope: 'single' | 'series') => void;
};

export default function SeriesActionModal({ actionType, onClose, onSelectScope }: SeriesActionModalProps) {
  const isDelete = actionType === 'delete';

  return (
    <BottomSheet
      title={isDelete ? 'Supprimer la garde' : 'Modifier la garde'}
      onClose={onClose}
      footer={
        <button
          onClick={onClose}
          className="h-12 flex-1 rounded-input border border-border text-button text-marine"
        >
          Annuler
        </button>
      }
    >
      <p className="mb-4 text-body-m text-muted">
        Cette garde fait partie d'une série récurrente. Souhaitez-vous {isDelete ? 'supprimer' : 'modifier'} :
      </p>

      <div className="space-y-3">
        <button
          onClick={() => onSelectScope('single')}
          className="w-full rounded-card border-2 border-border p-4 text-left transition-all hover:border-canard/50 hover:bg-canard/5"
        >
          <div className="mb-1 font-semibold text-ink">Uniquement cette garde</div>
          <div className="text-caption">
            {isDelete
              ? 'La garde sera supprimée mais les autres gardes de la série resteront inchangées'
              : 'Seule cette garde sera modifiée, les autres resteront inchangées'}
          </div>
        </button>

        <button
          onClick={() => onSelectScope('series')}
          className={`w-full rounded-card border-2 p-4 text-left transition-all ${
            isDelete
              ? 'border-brique/30 hover:border-brique/60 hover:bg-brique/5'
              : 'border-marine/30 hover:border-marine/60 hover:bg-marine/5'
          }`}
        >
          <div className="mb-1 font-semibold text-ink">Toute la série</div>
          <div className="text-caption">
            {isDelete
              ? 'Toutes les gardes de la série seront supprimées définitivement'
              : 'Toutes les gardes de la série seront modifiées'}
          </div>
        </button>
      </div>
    </BottomSheet>
  );
}
