import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ClipboardList,
  History,
  Settings,
  Stethoscope,
} from 'lucide-react';
import HeaderWatermark from '../../../components/common/HeaderWatermark';
import Segmented from './ui/Segmented';
import { Profile, UserRole } from '../lib/supabase';

// Navigation interne du module (remplace la Navigation.tsx d'origine).
// Header sticky au pattern Omnès : bouton retour ChevronLeft, filigrane
// canard (couleur du module), onglets en pills défilant horizontalement
// sur mobile. Version fonctionnelle minimale — la refonte visuelle des
// vues elles-mêmes est l'objet de l'étape 4.

export type AgendaView =
  | 'calendar'
  | 'schedule'
  | 'daily-schedule'
  | 'requests'
  | 'activity'
  | 'settings';

type Tab = {
  view: AgendaView;
  label: string;
  icon: typeof Calendar;
  roles: UserRole[];
};

const TABS: Tab[] = [
  { view: 'calendar', label: 'Calendrier', icon: Calendar, roles: ['coordinator', 'doctor'] },
  { view: 'schedule', label: 'Mes gardes', icon: CalendarCheck, roles: ['doctor'] },
  { view: 'daily-schedule', label: 'Planning du jour', icon: CalendarDays, roles: ['doctor'] },
  { view: 'requests', label: 'Demandes', icon: ClipboardList, roles: ['coordinator'] },
  { view: 'activity', label: 'Journal', icon: History, roles: ['coordinator'] },
  { view: 'settings', label: 'Paramètres', icon: Settings, roles: ['coordinator'] },
];

type AgendaHeaderProps = {
  currentUser: Profile;
  currentView: AgendaView;
  onViewChange: (view: AgendaView) => void;
  // Bascule d'affichage, rendue uniquement aux vrais coordinateurs (cf. App.tsx).
  // Absente pour tous les autres : un medecin ne doit pas voir ce controle.
  viewAs?: UserRole;
  onViewAsChange?: (role: UserRole) => void;
};

export default function AgendaHeader({
  currentUser,
  currentView,
  onViewChange,
  viewAs,
  onViewAsChange,
}: AgendaHeaderProps) {
  const navigate = useNavigate();
  const tabs = TABS.filter((tab) => tab.roles.includes(currentUser.role));

  return (
    <header className="bg-carte sticky top-0 z-40 border-b border-border relative overflow-hidden">
      <div className="relative z-10 px-4 pt-3 pb-1 flex items-center gap-2">
        <button
          onClick={() => navigate('/')}
          aria-label="Retour à l'accueil"
          className="p-2 -ml-2 rounded-pill hover:bg-fond transition-colors"
        >
          <ChevronLeft size={22} strokeWidth={2} className="text-marine" />
        </button>
        <h1 className="text-h2 text-ink flex-1">Planning</h1>
        {viewAs && onViewAsChange && (
          <Segmented
            options={[
              { value: 'coordinator', label: 'Coordination', icon: <Settings size={15} strokeWidth={2} /> },
              { value: 'doctor', label: 'Médecin', icon: <Stethoscope size={15} strokeWidth={2} /> },
            ]}
            value={viewAs}
            onChange={onViewAsChange}
            ariaLabel="Afficher l'agenda en tant que"
            className="shrink-0"
          />
        )}
        <span className="text-caption hidden lg:block">{currentUser.full_name}</span>
      </div>

      <nav className="relative z-10 px-4 pb-3 pt-1 flex gap-2 overflow-x-auto hide-scrollbar">
        {tabs.map(({ view, label, icon: Icon }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-pill text-button whitespace-nowrap transition-colors ${
              currentView === view
                ? 'bg-canard text-white'
                : 'text-muted hover:bg-canard/10 hover:text-canard'
            }`}
          >
            <Icon size={17} strokeWidth={2} />
            {label}
          </button>
        ))}
      </nav>

      <HeaderWatermark color="canard" fill offsetRight={64} />
    </header>
  );
}
