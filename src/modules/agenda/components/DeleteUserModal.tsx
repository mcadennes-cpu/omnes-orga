import { useState } from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import { supabase, Profile } from '../lib/supabase';

type DeleteUserModalProps = {
  user: Profile;
  onClose: () => void;
  onSuccess: () => void;
};

export default function DeleteUserModal({ user, onClose, onSuccess }: DeleteUserModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setLoading(true);
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      alert('Le compte a été désactivé.');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error deactivating user:', err);
      setError(err.message || 'Une erreur est survenue lors de la désactivation du compte.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Supprimer le compte</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-900 font-medium mb-1">
                  Êtes-vous sûr de vouloir supprimer le compte « {user.email} » ?
                </p>
                <p className="text-red-700 text-sm">
                  Cette action désactivera le compte et empêchera toute future connexion.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Nom :</span>
                <span className="font-medium text-gray-900">{user.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Email :</span>
                <span className="font-medium text-gray-900">{user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Rôle :</span>
                <span className="font-medium text-gray-900">
                  {user.role === 'coordinator' ? 'Coordinateur' : 'Médecin'}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-end border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Trash2 className="w-5 h-5" />
            {loading ? 'Suppression...' : 'Supprimer le compte'}
          </button>
        </div>
      </div>
    </div>
  );
}
