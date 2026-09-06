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

export type Tab = {
  view: AgendaView;
  label: string;
  icon: typeof Calendar;
  roles: UserRole[];
};

// L'ordre du tableau est l'ordre d'affichage : le filtre par role le conserve.
// « Validation » vient donc en premier pour le coordinateur (l'ecran qu'il
// ouvre plusieurs fois par jour) sans changer l'ordre vu par un medecin, qui
// n'a pas cet onglet.
//
// Les libelles (8B-2) disent le GESTE et non le contenant : on ouvre des
// semaines d'un cote, on valide des demandes de l'autre. Les deux onglets
// affichent pourtant la meme grille -- c'est justement ce que « Calendrier »
// et « Demandes » ne permettaient pas de distinguer. Les identifiants `view`
// restent inchanges : eux seuls pilotent le rendu.
const TABS: Tab[] = [
  { view: 'requests', label: 'Validation', icon: ClipboardList, roles: ['coordinator'] },
  { view: 'calendar', label: 'Ouvertures', icon: Calendar, roles: ['coordinator', 'doctor'] },
  { view: 'schedule', label: 'Mes gardes', icon: CalendarCheck, roles: ['doctor'] },
  { view: 'daily-schedule', label: 'Planning du jour', icon: CalendarDays, roles: ['doctor'] },
  { view: 'activity', label: 'Journal', icon: History, roles: ['coordinator'] },
  { view: 'settings', label: 'Paramètres', icon: Settings, roles: ['coordinator'] },
];

// Ordre des onglets medecin pour un ASSOCIE (03/09/2026) : il ouvre le module
// pour voir qui exerce aujourd'hui, puis ses propres gardes ; l'ouverture de
// gardes vient en dernier. Un remplacant lit la meme barre dans l'autre sens —
// il vient d'abord chercher des gardes a demander — et garde donc l'ordre de
// TABS, inchange.
const ORDRE_ASSOCIE: AgendaView[] = ['daily-schedule', 'schedule', 'calendar'];

function rangAssocie(view: AgendaView): number {
  const rang = ORDRE_ASSOCIE.indexOf(view);
  // Onglet non nomme ci-dessus : renvoye en fin de barre plutot qu'a une place
  // arbitraire. Le tri de JS etant stable, ceux-la gardent entre eux l'ordre
  // de TABS.
  return rang === -1 ? ORDRE_ASSOCIE.length : rang;
}

// Onglets visibles, dans l'ordre d'affichage, pour un utilisateur donne.
// Le coordinateur n'est pas concerne : sa barre suit l'ordre de TABS (8B-2).
export function ongletsVisibles(role: UserRole, estAssocie: boolean): Tab[] {
  const tabs = TABS.filter((tab) => tab.roles.includes(role));
  if (role !== 'doctor' || !estAssocie) return tabs;
  return [...tabs].sort((a, b) => rangAssocie(a.view) - rangAssocie(b.view));
}

// L'onglet d'accueil EST le premier onglet de la barre, par construction : les
// deux ne peuvent donc pas diverger. C'est precisement ce que 8B-2 avait du
// corriger, l'accueil etant alors une constante independante de la barre.
//
// ⚠️ Le repli sur `calendar` compte : le `main` d'App.tsx ne rend RIEN quand
// l'onglet courant ne correspond pas au role — ce serait un ecran vide sous le
// header, sans la moindre erreur. `calendar` est le seul onglet commun aux deux
// roles.
export function vueParDefaut(role: UserRole | undefined, estAssocie: boolean): AgendaView {
  if (!role) return 'calendar';
  return ongletsVisibles(role, estAssocie)[0]?.view ?? 'calendar';
}

type AgendaHeaderProps = {
  currentUser: Profile;
  currentView: AgendaView;
  onViewChange: (view: AgendaView) => void;
  // Associe au sens du role applicatif Orga (cf. userAdapter). Ne change que
  // l'ORDRE des onglets, aucun droit : la barre n'ouvre rien que la RLS refuse.
  estAssocie: boolean;
  // Bascule d'affichage, rendue uniquement aux vrais coordinateurs (cf. App.tsx).
  // Absente pour tous les autres : un medecin ne doit pas voir ce controle.
  viewAs?: UserRole;
  onViewAsChange?: (role: UserRole) => void;
};

export default function AgendaHeader({
  currentUser,
  currentView,
  onViewChange,
  estAssocie,
  viewAs,
  onViewAsChange,
}: AgendaHeaderProps) {
  const navigate = useNavigate();
  const tabs = ongletsVisibles(currentUser.role, estAssocie);

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
