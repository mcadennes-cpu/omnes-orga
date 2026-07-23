import { useMemo, useState } from 'react';
import { hasValidConfig } from './lib/supabase';
import { buildAgendaUser, OrgaProfile } from './lib/userAdapter';
import { useAgendaSession } from './hooks/useAgendaSession';
import PlanningLinkPage from './components/PlanningLinkPage';
import AgendaHeader, { AgendaView } from './components/AgendaHeader';
import EnhancedCalendarView from './components/EnhancedCalendarView';
import MyScheduleView from './components/MyScheduleView';
import DailyScheduleView from './components/DailyScheduleView';
import RequestsView from './components/RequestsView';
import SettingsView from './components/SettingsView';

type AppProps = {
  orgaProfile?: OrgaProfile | null;
};

function App({ orgaProfile }: AppProps) {
  const { session, profile, loading, signIn, signOut } = useAgendaSession();
  const [currentView, setCurrentView] = useState<AgendaView>('calendar');

  // Utilisateur effectif du module (voir userAdapter.ts : pendant la beta,
  // c'est le profil Planning ; le useMemo evite de repeter la verification
  // de coherence a chaque rendu).
  const currentUser = useMemo(
    () => (profile ? buildAgendaUser(profile, orgaProfile) : null),
    [profile, orgaProfile]
  );

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
  // L'e-mail Orga sert de pre-remplissage (modifiable : certains associes
  // ont une adresse differente entre les deux applis).
  if (!session || !currentUser) {
    return <PlanningLinkPage onSignIn={signIn} defaultEmail={orgaProfile?.email ?? ''} />;
  }

  // Délie le compte Planning de ce navigateur : retour à l'écran de liaison.
  const handleUnlink = async () => {
    await signOut();
    setCurrentView('calendar');
  };

  return (
    <div className="min-h-screen bg-fond">
      <AgendaHeader
        currentUser={currentUser}
        currentView={currentView}
        onViewChange={setCurrentView}
        onUnlink={handleUnlink}
      />

      <main className="w-full mx-auto px-4 md:px-8 py-8">
        {currentView === 'calendar' && <EnhancedCalendarView currentUser={currentUser} />}
        {currentView === 'schedule' && currentUser.role === 'doctor' && (
          <MyScheduleView currentUser={currentUser} />
        )}
        {currentView === 'daily-schedule' && currentUser.role === 'doctor' && (
          <DailyScheduleView />
        )}
        {currentView === 'requests' && currentUser.role === 'coordinator' && (
          <RequestsView currentUser={currentUser} />
        )}
        {currentView === 'settings' && currentUser.role === 'coordinator' && (
          <SettingsView />
        )}
      </main>

      <footer className="mt-12 border-t border-border py-6 text-center">
        <p className="text-caption">© 2025 OMNÈS MÉDECINS • une équipe • 7j/7 • sur rendez-vous</p>
      </footer>
    </div>
  );
}

export default App;
