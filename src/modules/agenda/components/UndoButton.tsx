import { useState, useEffect } from 'react';
import { Undo2 } from 'lucide-react';
import { getUndoAction, executeUndo } from '../lib/undoUtils';
import BottomSheet from './ui/BottomSheet';

type UndoButtonProps = {
  userId: string;
  onUndoComplete: () => void;
};

export default function UndoButton({ userId, onUndoComplete }: UndoButtonProps) {
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoDescription, setUndoDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // NB : le sondage toutes les 2 s et l'alert() sont conserves tels quels ;
  // la refonte de l'annulation (bandeau ephemere, temps reel) est MOD-2 / etape 6.
  useEffect(() => {
    checkUndoAvailability();
    const interval = setInterval(checkUndoAvailability, 2000);
    return () => clearInterval(interval);
  }, [userId]);

  const checkUndoAvailability = async () => {
    const undoAction = await getUndoAction(userId);
    setUndoAvailable(!!undoAction);
    setUndoDescription(undoAction?.description || '');
  };

  const handleUndo = async () => {
    setLoading(true);
    try {
      const success = await executeUndo(userId);
      if (success) {
        alert('Dernière action annulée.');
        setUndoAvailable(false);
        onUndoComplete();
      } else {
        alert('Erreur lors de l\'annulation de l\'action.');
      }
    } catch (error) {
      console.error('[UndoButton] Error:', error);
      alert('Erreur lors de l\'annulation de l\'action.');
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={!undoAvailable || loading}
        className="flex items-center gap-2 rounded-input border border-ocre/40 bg-ocre/10 px-4 py-2 text-button text-ocre-fonce transition-colors hover:bg-ocre/20 disabled:cursor-not-allowed disabled:opacity-50"
        title={undoAvailable ? `Annuler: ${undoDescription}` : 'Aucune action récente à annuler'}
      >
        <Undo2 className="h-4 w-4" />
        Annuler dernière action
      </button>

      {showConfirm && (
        <BottomSheet
          title="Confirmer l'annulation"
          onClose={() => setShowConfirm(false)}
          busy={loading}
          footer={
            <>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={loading}
                className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleUndo}
                disabled={loading}
                className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
              >
                {loading ? 'Annulation…' : 'Confirmer'}
              </button>
            </>
          }
        >
          <p className="mb-3 text-body-m text-ink">
            Êtes-vous sûr de vouloir annuler la dernière action ?
          </p>
          {undoDescription && (
            <p className="rounded-input bg-fond p-3 text-body-m text-muted">
              <span className="font-semibold text-ink">Action :</span> {undoDescription}
            </p>
          )}
        </BottomSheet>
      )}
    </>
  );
}
