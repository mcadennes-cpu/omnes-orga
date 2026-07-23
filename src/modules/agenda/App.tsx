import { useState } from 'react';
import { hasValidConfig } from './lib/supabase';
import { useAgendaSession } from './hooks/useAgendaSession';
import PlanningLinkPage from './components/PlanningLinkPage';
import Navigation from './components/Navigation';
import EnhancedCalendarView from './components/EnhancedCalendarView';
import MyScheduleView from './components/MyScheduleView';
import DailyScheduleView from './components/DailyScheduleView';
import RequestsView from './components/RequestsView';
import SettingsView from './components/SettingsView';

function App() {
  const { session, profile, loading, signIn, signOut } = useAgendaSession();
  const [currentView, setCurrentView] = useState<'calendar' | 'schedule' | 'daily-schedule' | 'requests' | 'settings'>('calendar');

  // Variables d'environnement du projet Planning absentes : écran d'aide
  // (ne concerne que le développement local, jamais la production Vercel).
  if (!hasValidConfig) {
    return (
      <div className="min-h-screen bg-fond flex items-center justify-center p-4">
        <div className="bg-carte rounded-card shadow-card p-6 max-w-md w-full">
          <h1 className="text-h2 text-brique mb-3">Configuration manquante</h1>
          <p className="text-body-m text-ink mb-3">
            Les variables d’environnement du module Planning sont absentes du
            fichier <code className="bg-fond px-1.5 py-0.5 rounded-pill">.env</code> :
          </p>
          <ul className="text-body-m text-ink list-disc list-inside space-y-1 mb-3">
            <li><code className="bg-fond px-1.5 py-0.5 rounded-pill">VITE_AGENDA_SUPABASE_URL</code></li>
            <li><code className="bg-fond px-1.5 py-0.5 rounded-pill">VITE_AGENDA_SUPABASE_ANON_KEY</code></li>
          </ul>
          <p className="text-caption">
            Complétez le fichier puis redémarrez le serveur de développement
            (les variables ne sont lues qu’au démarrage).
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-fond flex items-center justify-center">
        <p className="text-muted">Chargement…</p>
      </div>
    );
  }

  // Pas de session Planning dans ce navigateur : liaison unique du compte.
  if (!session || !profile) {
    return <PlanningLinkPage onSignIn={signIn} />;
  }

  const handleSignOut = async () => {
    await signOut();
    setCurrentView('calendar');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navigation
        currentUser={profile}
        currentView={currentView}
        onViewChange={setCurrentView}
        onSignOut={handleSignOut}
      />

      <main className="w-full mx-auto px-4 md:px-8 py-8">
        {currentView === 'calendar' && <EnhancedCalendarView currentUser={profile} />}
        {currentView === 'schedule' && profile.role === 'doctor' && (
          <MyScheduleView currentUser={profile} />
        )}
        {currentView === 'daily-schedule' && profile.role === 'doctor' && (
          <DailyScheduleView />
        )}
        {currentView === 'requests' && profile.role === 'coordinator' && (
          <RequestsView currentUser={profile} />
        )}
        {currentView === 'settings' && profile.role === 'coordinator' && (
          <SettingsView />
        )}
      </main>

      <footer className="mt-12 py-6 text-center text-sm text-gray-600 border-t border-gray-200">
        <p>© 2025 OMNÈS MÉDECINS • une équipe • 7j/7 • sur rendez-vous</p>
      </footer>
    </div>
  );
}

export default App;
