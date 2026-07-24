import BottomSheet from '../ui/BottomSheet';

type CancelAssignmentModalProps = {
  hasRotationRule: boolean;
  isPartOfSeries: boolean;
  loading: boolean;
  onSingle: () => void;
  onSeries: () => void;
  onRotation: () => void;
  onClose: () => void;
};

// Sous-modale « annuler l'assignation » : portee simple, serie, ou regle de
// roulement selon le contexte de la garde.
export default function CancelAssignmentModal({
  hasRotationRule,
  isPartOfSeries,
  loading,
  onSingle,
  onSeries,
  onRotation,
  onClose,
}: CancelAssignmentModalProps) {
  return (
    <BottomSheet title="Annuler l'assignation" onClose={onClose} busy={loading}>
      <p className="mb-4 text-body-m text-ink">
        {hasRotationRule
          ? "Cette assignation provient d'une règle de roulement. Que souhaitez-vous faire ?"
          : "Souhaitez-vous annuler l'assignation uniquement pour cette date, ou pour toute la série ?"}
      </p>
      <div className="space-y-3">
        <button
          onClick={onSingle}
          disabled={loading}
          className="w-full rounded-input border border-ocre/40 bg-ocre/10 px-4 py-3 text-button text-ocre-fonce transition-colors hover:bg-ocre/20 disabled:opacity-50"
        >
          {hasRotationRule ? 'Annuler uniquement cette garde' : 'Annuler uniquement cette date'}
        </button>
        {hasRotationRule ? (
          <button
            onClick={onRotation}
            disabled={loading}
            className="w-full rounded-input bg-brique px-4 py-3 text-button text-white shadow-button transition-colors hover:bg-brique/90 disabled:opacity-50"
          >
            Supprimer la règle de roulement (toutes les futures gardes)
          </button>
        ) : isPartOfSeries && (
          <button
            onClick={onSeries}
            disabled={loading}
            className="w-full rounded-input bg-brique px-4 py-3 text-button text-white shadow-button transition-colors hover:bg-brique/90 disabled:opacity-50"
          >
            Annuler toute la série
          </button>
        )}
        <button
          onClick={onClose}
          disabled={loading}
          className="w-full rounded-input border border-border px-4 py-3 text-button text-marine transition-colors hover:bg-fond disabled:opacity-50"
        >
          Retour
        </button>
      </div>
    </BottomSheet>
  );
}
