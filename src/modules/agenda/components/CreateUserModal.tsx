import { useState } from 'react';
import { supabase, UserRole } from '../lib/supabase';
import { X, User, Mail, Shield, Key, Copy } from 'lucide-react';

type CreateUserModalProps = {
  coordinatorId: string;
  onClose: () => void;
  onSuccess: () => void;
};

export default function CreateUserModal({ coordinatorId, onClose, onSuccess }: CreateUserModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('doctor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');

  const generatePassword = (): string => {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';

    password += 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)];
    password += 'abcdefghjkmnpqrstuvwxyz'[Math.floor(Math.random() * 23)];
    password += '23456789'[Math.floor(Math.random() * 8)];

    for (let i = 3; i < 10; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Mot de passe copié!');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const tempPassword = generatePassword();

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          fullName,
          role,
          tempPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Échec de création du compte');
      }

      setGeneratedPassword(tempPassword);
      setSuccess(true);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Key className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-teal-900 mb-2">Compte créé avec succès!</h2>
            <p className="text-gray-600">Envoyez ces informations au nouveau médecin</p>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Email</p>
              <p className="font-semibold text-gray-900">{email}</p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-gray-600">Mot de passe temporaire</p>
                <button
                  onClick={() => copyToClipboard(generatedPassword)}
                  className="text-pink-500 hover:text-pink-600 p-1"
                  title="Copier"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="font-mono font-bold text-lg text-gray-900">{generatedPassword}</p>
              <p className="text-xs text-yellow-700 mt-2">
                ⚠️ Le médecin devra changer ce mot de passe lors de sa première connexion
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              onSuccess();
              onClose();
            }}
            className="w-full mt-6 bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-teal-900">Créer un compte</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <User className="w-4 h-4" />
              Nom complet <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="Dr. Marie Dubois"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Mail className="w-4 h-4" />
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="m.dubois@omnesmedecins.fr"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Shield className="w-4 h-4" />
              Rôle <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('doctor')}
                className={`py-3 px-4 rounded-lg font-medium transition-all ${
                  role === 'doctor'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Médecin
              </button>
              <button
                type="button"
                onClick={() => setRole('coordinator')}
                className={`py-3 px-4 rounded-lg font-medium transition-all ${
                  role === 'coordinator'
                    ? 'bg-purple-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Coordinateur
              </button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <p className="flex items-start gap-2">
              <Key className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Un mot de passe temporaire sera généré automatiquement. L'utilisateur devra le
                changer lors de sa première connexion.
              </span>
            </p>
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
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-pink-500 hover:bg-pink-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Création...' : 'Créer le compte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
