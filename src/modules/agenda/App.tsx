import { useMemo, useState } from 'react';
import { buildAgendaUser, OrgaProfile } from './lib/userAdapter';
import { UserRole } from './lib/supabase';
import AgendaHeader, { AgendaView } from './components/AgendaHeader';
import { ToastProvider } from './components/ui/ActionToast';
import EnhancedCalendarView from './components/EnhancedCalendarView';
import MyScheduleView from './components/MyScheduleView';
import DailyScheduleView from './components/DailyScheduleView';
import RequestsView from './components/RequestsView';
import ActivityLogView from './components/ActivityLogView';
import SettingsView from './components/SettingsView';

type AppProps = {
  orgaProfile?: OrgaProfile | null;
};

// Mémorise la bascule d'affichage d'un rechargement à l'autre : sans cela,
// tester une vue médecin obligerait à rebasculer à chaque F5.
const VIEW_AS_KEY = 'agenda-view-as';

function readStoredViewAs(): UserRole | null {
  try {
    const stored = localStorage.getItem(VIEW_AS_KEY);
    return stored === 'doctor' || stored === 'coordinator' ? stored : null;
  } catch {
    return null; // navigation privée, stockage refusé : on retombe sur le rôle réel
  }
}

// L'onglet d'accueil dépend du rôle (8B-2) : le coordinateur arrive sur la
// validation, l'écran qu'il ouvre plusieurs fois par jour ; le médecin sur les
// ouvertures.
//
// ⚠️ Ce ne peut PAS être une constante : « Validation » n'existe pas pour un
// médecin, et le `main` ne rend rien quand l'onglet courant ne correspond pas
// au rôle — ce serait un écran vide sous le header, sans la moindre erreur.
// Le repli est `calendar`, seul onglet commun aux deux rôles.
function vueParDefaut(role: UserRole | undefined): AgendaView {
  return role === 'coordinator' ? 'requests' : 'calendar';
}

function App({ orgaProfile }: AppProps) {
  // L'utilisateur du module est l'utilisateur connecté à Omnès-Orga
  // (cf. userAdapter.ts). Plus de session ni de profil séparés depuis
  // l'étape 7E.
  const realUser = useMemo(
    () => (orgaProfile ? buildAgendaUser(orgaProfile) : null),
    [orgaProfile]
  );

  // ---------------------------------------------------------------------
  // Bascule d'affichage coordination / médecin
  //
  // Les onglets « Mes gardes » et « Planning du jour » sont réservés au rôle
  // doctor : un coordinateur qui exerce aussi (Matthieu) perdrait sinon
  // l'accès à ses propres gardes. Ce sélecteur lui rend les deux.
  //
  // ⚠️ Portée : il change ce que l'INTERFACE propose, pas ce que la base
  // autorise. En vue médecin, l'utilisateur reste coordinateur pour la RLS
  // (`agenda.est_coordinateur()`), donc ses droits d'écriture sont intacts.
  // Ce n'est pas un bac à sable, et ce n'est pas un contrôle de sécurité :
  // c'est un confort d'affichage, doublé d'un outil de test des vues médecin.
  // ---------------------------------------------------------------------
  const isRealCoordinator = realUser?.role === 'coordinator';
  const [viewAs, setViewAs] = useState<UserRole>(() => readStoredViewAs() ?? 'coordinator');

  const currentUser = useMemo(() => {
    if (!realUser) return null;
    if (!isRealCoordinator) return realUser;
    return { ...realUser, role: viewAs };
  }, [realUser, isRealCoordinator, viewAs]);

  // Déclaré APRÈS `currentUser` : l'onglet d'accueil se calcule depuis le rôle
  // effectif. L'initialiseur ne joue qu'au premier rendu, et la page /planning
  // ne monte ce composant qu'une fois le profil chargé.
  const [currentView, setCurrentView] = useState<AgendaView>(() =>
    vueParDefaut(currentUser?.role)
  );

  const handleViewAsChange = (role: UserRole) => {
    setViewAs(role);
    try {
      localStorage.setItem(VIEW_AS_KEY, role);
    } catch {
      // stockage indisponible : la bascule reste valable pour cette session
    }
    // Les onglets diffèrent d'un rôle à l'autre : rester sur le même risquerait
    // une vue que le nouveau rôle n'a pas, donc un `main` vide. On repart de
    // son onglet d'accueil — « Validation » en coordination, « Ouvertures » en
    // médecin. Retomber systématiquement sur `calendar`, comme avant 8B-2,
    // ferait atterrir le coordinateur sur le second onglet à chaque retour.
    setCurrentView(vueParDefaut(role));
  };

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
    <ToastProvider>
    <div className="min-h-screen bg-fond">
      <AgendaHeader
        currentUser={currentUser}
        currentView={currentView}
        onViewChange={setCurrentView}
        viewAs={isRealCoordinator ? viewAs : undefined}
        onViewAsChange={isRealCoordinator ? handleViewAsChange : undefined}
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
        {currentView === 'activity' && currentUser.role === 'coordinator' && (
          <ActivityLogView />
        )}
        {currentView === 'settings' && currentUser.role === 'coordinator' && (
          <SettingsView />
        )}
      </main>

      <footer className="mt-12 border-t border-border py-6 text-center">
        <p className="text-caption">© 2025 OMNÈS MÉDECINS • une équipe • 7j/7 • sur rendez-vous</p>
      </footer>
    </div>
    </ToastProvider>
  );
}

export default App;
