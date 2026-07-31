import { useMemo, useState } from 'react';
import { buildAgendaUser, OrgaProfile } from './lib/userAdapter';
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
  const [currentView, setCurrentView] = useState<AgendaView>('calendar');

  // L'utilisateur du module est l'utilisateur connecté à Omnès-Orga
  // (cf. userAdapter.ts). Plus de session ni de profil séparés depuis
  // l'étape 7E.
  const currentUser = useMemo(
    () => (orgaProfile ? buildAgendaUser(orgaProfile) : null),
    [orgaProfile]
  );

  // La page /planning ne rend ce composant qu'une fois le profil chargé ;
  // ce garde-fou ne joue qu'en cas d'usage direct du module.
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-fond flex items-center justify-center">
        <p className="text-muted">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fond">
      <AgendaHeader
        currentUser={currentUser}
        currentView={currentView}
        onViewChange={setCurrentView}
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
