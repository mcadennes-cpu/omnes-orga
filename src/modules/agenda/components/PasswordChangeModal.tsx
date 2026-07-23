import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, AlertTriangle } from 'lucide-react';

type PasswordChangeModalProps = {
  onSuccess: () => void;
};

export default function PasswordChangeModal({ onSuccess }: PasswordChangeModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères';
    if (!/[A-Z]/.test(password)) return 'Le mot de passe doit contenir au moins une lettre majuscule';
    if (!/[a-z]/.test(password)) return 'Le mot de passe doit contenir au moins une lettre minuscule';
    if (!/\d/.test(password)) return 'Le mot de passe doit contenir au moins un chiffre';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          temp_password: false,
          must_change_password: false
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-yellow-100 rounded-full">
            <AlertTriangle className="w-6 h-6 text-yellow-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-teal-900">Changement de mot de passe requis</h2>
            <p className="text-sm text-gray-600">Votre mot de passe temporaire doit être changé</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Lock className="w-4 h-4" />
              Nouveau mot de passe
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Lock className="w-4 h-4" />
              Confirmer le mot de passe
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">
            <p className="font-medium mb-2">Exigences:</p>
            <ul className="space-y-1 text-xs">
              <li className={newPassword.length >= 8 ? 'text-green-600' : ''}>
                • Au moins 8 caractères
              </li>
              <li className={/[A-Z]/.test(newPassword) ? 'text-green-600' : ''}>
                • Une lettre majuscule
              </li>
              <li className={/[a-z]/.test(newPassword) ? 'text-green-600' : ''}>
                • Une lettre minuscule
              </li>
              <li className={/\d/.test(newPassword) ? 'text-green-600' : ''}>
                • Un chiffre
              </li>
            </ul>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Changement en cours...' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}
