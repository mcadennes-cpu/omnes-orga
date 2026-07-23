import { Profile } from '../lib/supabase';
import { Calendar, CalendarCheck, ClipboardList, LogOut, Menu, X, Users, Settings, CalendarDays } from 'lucide-react';
import { useState } from 'react';

type NavigationProps = {
  currentUser: Profile;
  currentView: 'calendar' | 'schedule' | 'daily-schedule' | 'requests' | 'users' | 'settings';
  onViewChange: (view: 'calendar' | 'schedule' | 'daily-schedule' | 'requests' | 'users' | 'settings') => void;
  onSignOut: () => void;
};

export default function Navigation({ currentUser, currentView, onViewChange, onSignOut }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const NavButton = ({ view, icon: Icon, label }: { view: 'calendar' | 'schedule' | 'daily-schedule' | 'requests' | 'users' | 'settings', icon: any, label: string }) => (
    <button
      onClick={() => {
        onViewChange(view);
        setMobileMenuOpen(false);
      }}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        currentView === view
          ? 'bg-pink-500 text-white'
          : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </button>
  );

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <img src="/logo-omnes-couleur.png" alt="OMNÈS" className="h-8 md:h-10 w-auto" />
            <div className="hidden md:block">
              <h1 className="brand-title text-2xl">OMNÈS PLANNING</h1>
              <p className="text-xs text-gray-600">une équipe • 7j/7 • sur rendez-vous</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <NavButton view="calendar" icon={Calendar} label="Calendrier" />
            {currentUser.role === 'doctor' && (
              <>
                <NavButton view="schedule" icon={CalendarCheck} label="Mes Gardes" />
                <NavButton view="daily-schedule" icon={CalendarDays} label="Planning du jour" />
              </>
            )}
            {currentUser.role === 'coordinator' && (
              <>
                <NavButton view="requests" icon={ClipboardList} label="Demandes" />
                <NavButton view="users" icon={Users} label="Utilisateurs" />
                <NavButton view="settings" icon={Settings} label="Paramètres" />
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-gray-900">{currentUser.full_name}</p>
              <p className="text-xs text-gray-500">
                {currentUser.role === 'coordinator' ? 'Coordinateur' : 'Médecin'}
              </p>
            </div>
            <button
              onClick={onSignOut}
              className="hidden md:flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Déconnexion</span>
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200">
            <div className="flex flex-col gap-2">
              <NavButton view="calendar" icon={Calendar} label="Calendrier" />
              {currentUser.role === 'doctor' && (
                <>
                  <NavButton view="schedule" icon={CalendarCheck} label="Mes Gardes" />
                  <NavButton view="daily-schedule" icon={CalendarDays} label="Planning du jour" />
                </>
              )}
              {currentUser.role === 'coordinator' && (
                <>
                  <NavButton view="requests" icon={ClipboardList} label="Demandes" />
                  <NavButton view="users" icon={Users} label="Utilisateurs" />
                  <NavButton view="settings" icon={Settings} label="Paramètres" />
                </>
              )}
              <button
                onClick={onSignOut}
                className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
