import { useState } from 'react';
import { Settings } from 'lucide-react';
import SitesManagement from './settings/SitesManagement';
import RoomsManagement from './settings/RoomsManagement';
import ShiftTypesManagement from './settings/ShiftTypesManagement';
import RotationManagement from './settings/RotationManagement';

type SettingsTab = 'sites' | 'rooms' | 'shift_types' | 'rotation';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'sites', label: 'Sites' },
  { id: 'rooms', label: 'Salles' },
  { id: 'shift_types', label: 'Horaires' },
  { id: 'rotation', label: 'Roulement' },
];

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('sites');

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-carte p-6 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-pill bg-canard/10 p-2">
            <Settings className="h-6 w-6 text-canard" />
          </div>
          <div>
            <h1 className="text-h1 text-ink">Paramètres</h1>
            <p className="text-caption">Configuration des sites, salles et horaires</p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b border-border hide-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-6 py-3 text-button transition-colors ${
                activeTab === tab.id
                  ? 'border-canard text-canard'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        {activeTab === 'sites' && <SitesManagement />}
        {activeTab === 'rooms' && <RoomsManagement />}
        {activeTab === 'shift_types' && <ShiftTypesManagement />}
        {activeTab === 'rotation' && <RotationManagement />}
      </div>
    </div>
  );
}
