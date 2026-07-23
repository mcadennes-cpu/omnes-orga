import { useState, useEffect } from 'react';
import { Undo2 } from 'lucide-react';
import { getUndoAction, executeUndo } from '../lib/undoUtils';

type UndoButtonProps = {
  userId: string;
  onUndoComplete: () => void;
};

export default function UndoButton({ userId, onUndoComplete }: UndoButtonProps) {
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoDescription, setUndoDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
        className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        title={undoAvailable ? `Annuler: ${undoDescription}` : 'Aucune action récente à annuler'}
      >
        <Undo2 className="w-4 h-4" />
        Annuler dernière action
      </button>

      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirmer l'annulation</h3>
            <p className="text-gray-700 mb-2">
              Êtes-vous sûr de vouloir annuler la dernière action ?
            </p>
            {undoDescription && (
              <p className="text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded">
                <span className="font-semibold">Action:</span> {undoDescription}
              </p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={loading}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleUndo}
                disabled={loading}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors font-semibold disabled:opacity-50"
              >
                {loading ? 'Annulation...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
