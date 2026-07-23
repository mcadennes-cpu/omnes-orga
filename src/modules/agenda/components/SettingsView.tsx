import { useState } from 'react';
import { Settings } from 'lucide-react';
import SitesManagement from './settings/SitesManagement';
import RoomsManagement from './settings/RoomsManagement';
import ShiftTypesManagement from './settings/ShiftTypesManagement';
import RotationManagement from './settings/RotationManagement';

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<'sites' | 'rooms' | 'shift_types' | 'rotation'>('sites');

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-teal-100 rounded-lg">
            <Settings className="w-6 h-6 text-teal-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-teal-900">Paramètres</h1>
            <p className="text-sm text-gray-600">Configuration des sites, salles et horaires</p>
          </div>
        </div>

        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('sites')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'sites'
                ? 'border-pink-500 text-pink-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Sites
          </button>
          <button
            onClick={() => setActiveTab('rooms')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'rooms'
                ? 'border-pink-500 text-pink-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Salles
          </button>
          <button
            onClick={() => setActiveTab('shift_types')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'shift_types'
                ? 'border-pink-500 text-pink-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Horaires
          </button>
          <button
            onClick={() => setActiveTab('rotation')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'rotation'
                ? 'border-pink-500 text-pink-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Roulement
          </button>
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
