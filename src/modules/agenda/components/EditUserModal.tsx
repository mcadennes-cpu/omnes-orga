import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { supabase, Profile } from '../lib/supabase';

type EditUserModalProps = {
  user: Profile;
  onClose: () => void;
  onSuccess: () => void;
};

export default function EditUserModal({ user, onClose, onSuccess }: EditUserModalProps) {
  const [email, setEmail] = useState(user.email);
  const [fullName, setFullName] = useState(user.full_name);
  const [role, setRole] = useState<'doctor' | 'coordinator'>(user.role as 'doctor' | 'coordinator');
  const [isActive, setIsActive] = useState(user.is_active !== false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('L\'email est requis.');
      return;
    }

    if (!validateEmail(email)) {
      setError('L\'email n\'est pas valide.');
      return;
    }

    if (!fullName.trim()) {
      setError('Le nom complet est requis.');
      return;
    }

    if (email !== user.email) {
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .neq('id', user.id)
        .maybeSingle();

      if (existingUser) {
        setError('Cet email est déjà utilisé par un autre compte.');
        return;
      }
    }

    setLoading(true);

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          email: email.trim(),
          full_name: fullName.trim(),
          role,
          is_active: isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      onSuccess();
      onClose();

      setTimeout(() => {
        alert('Le compte a été mis à jour.');
      }, 100);
    } catch (err: any) {
      console.error('Error updating user:', err);
      setError(err.message || 'Une erreur est survenue lors de la mise à jour du compte.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Modifier le compte</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nom complet
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="Ex: Dr. Jean Dupont"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="exemple@email.com"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Rôle
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'doctor' | 'coordinator')}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              required
              disabled={loading}
            >
              <option value="doctor">Médecin</option>
              <option value="coordinator">Coordinateur</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Statut
            </label>
            <select
              value={isActive ? 'active' : 'inactive'}
              onChange={(e) => setIsActive(e.target.value === 'active')}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              required
              disabled={loading}
            >
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
