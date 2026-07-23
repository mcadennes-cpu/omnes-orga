import { useState } from 'react';
import { CalendarClock, Link2 } from 'lucide-react';

// Écran de liaison du compte OMNÈS PLANNING (remplace la LoginPage d'origine).
//
// Affiché uniquement quand aucune session Planning n'existe dans ce navigateur
// (première ouverture du module, ou session expirée). Une fois le compte relié,
// la session est persistée et rafraîchie automatiquement : cet écran ne
// réapparaît plus. Il disparaîtra définitivement à l'étape 7 (fusion des
// deux projets Supabase).

type PlanningLinkPageProps = {
  onSignIn: (email: string, password: string) => Promise<string | null>;
  // Pré-rempli avec l'e-mail Orga (modifiable : certains associés ont une
  // adresse différente entre les deux applis).
  defaultEmail?: string;
};

export default function PlanningLinkPage({ onSignIn, defaultEmail }: PlanningLinkPageProps) {
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const signInError = await onSignIn(email, password);
    if (signInError) {
      setError(signInError);
      setLoading(false);
    }
    // En cas de succès, onAuthStateChange bascule App vers l'agenda :
    // pas besoin de gérer la sortie ici.
  };

  return (
    <div className="min-h-screen bg-fond flex items-center justify-center p-4">
      <div className="bg-carte rounded-card shadow-card p-6 md:p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center justify-center w-11 h-11 rounded-pill bg-canard/15">
            <CalendarClock size={22} strokeWidth={2} className="text-canard" />
          </span>
          <h1 className="text-h2 text-ink">Connexion au planning</h1>
        </div>

        <p className="text-body-m text-ink mb-2">
          Reliez une seule fois votre compte <strong>OMNÈS PLANNING</strong> pour
          afficher les gardes : utilisez les identifiants de l’application
          Planning actuelle.
        </p>
        <p className="text-caption mb-6">
          Cette étape disparaîtra lors de la fusion des deux applications.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="agenda-email" className="text-field-label block mb-1.5">
              Adresse e-mail
            </label>
            <input
              id="agenda-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-4 py-3 bg-carte border border-border rounded-input text-body-l text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard focus:border-transparent transition-all"
              placeholder="prenom.nom@omnesmedecins.fr"
            />
          </div>

          <div>
            <label htmlFor="agenda-password" className="text-field-label block mb-1.5">
              Mot de passe
            </label>
            <input
              id="agenda-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 bg-carte border border-border rounded-input text-body-l text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard focus:border-transparent transition-all"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-brique/10 text-brique rounded-input px-4 py-3 text-body-m">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-marine hover:bg-marine/90 text-white text-button rounded-input shadow-button py-3 px-6 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              'Connexion…'
            ) : (
              <>
                <Link2 size={20} strokeWidth={2} />
                Relier mon compte
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
