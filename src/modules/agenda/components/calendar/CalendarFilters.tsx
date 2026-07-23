import { Filter } from 'lucide-react';

type CalendarFiltersProps = {
  viewMode: 'week' | 'month';
  onViewModeChange: (mode: 'week' | 'month') => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  locationFilter: 'all' | 'Dijon' | 'Beaune';
  onLocationChange: (location: 'all' | 'Dijon' | 'Beaune') => void;
  roomFilter: string;
  onRoomChange: (room: string) => void;
  doctorFilter: string;
  onDoctorFilter: (doctor: string) => void;
  shiftTypeFilter: string;
  onShiftTypeFilter: (type: string) => void;
  availableRooms: string[];
  availableDoctors: Array<{ id: string; name: string }>;
  isMobile?: boolean;
};

export default function CalendarFilters({
  viewMode,
  onViewModeChange,
  selectedDate,
  onDateChange,
  locationFilter,
  onLocationChange,
  roomFilter,
  onRoomChange,
  doctorFilter,
  onDoctorFilter,
  shiftTypeFilter,
  onShiftTypeFilter,
  availableRooms,
  availableDoctors,
  isMobile = false
}: CalendarFiltersProps) {
  const shiftTypes = [
    { value: 'all', label: 'Tous' },
    { value: '08:00-14:00', label: '08h-14h' },
    { value: '08:00-18:30', label: '08h-18h30' },
    { value: '14:00-20:00', label: '14h-20h' },
    { value: '18:30-23:00', label: '18h30-23h' }
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-5 h-5 text-gray-500" />
        <h3 className="text-lg font-semibold text-gray-900">Filtres</h3>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Vue:</label>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => onViewModeChange('week')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewMode === 'week'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Semaine
            </button>
            <button
              onClick={() => onViewModeChange('month')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewMode === 'month'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Mois
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
            {viewMode === 'week' ? 'Semaine:' : 'Mois:'}
          </label>
          <input
            type={viewMode === 'month' ? 'month' : 'date'}
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Site:</label>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => onLocationChange('all')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                locationFilter === 'all'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Tous
            </button>
            <button
              onClick={() => onLocationChange('Dijon')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                locationFilter === 'Dijon'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Dijon
            </button>
            <button
              onClick={() => onLocationChange('Beaune')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                locationFilter === 'Beaune'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Beaune
            </button>
          </div>
        </div>

        {!isMobile && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Salle:</label>
              <select
                value={roomFilter}
                onChange={(e) => onRoomChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
              >
                <option value="all">Toutes</option>
                {availableRooms.map((room) => (
                  <option key={room} value={room}>{room}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Médecin:</label>
              <select
                value={doctorFilter}
                onChange={(e) => onDoctorFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
              >
                <option value="all">Tous</option>
                {availableDoctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>{doctor.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Horaire:</label>
              <select
                value={shiftTypeFilter}
                onChange={(e) => onShiftTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
              >
                {shiftTypes.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {isMobile && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Salle</label>
            <select
              value={roomFilter}
              onChange={(e) => onRoomChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
            >
              <option value="all">Toutes</option>
              {availableRooms.map((room) => (
                <option key={room} value={room}>{room}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Horaire</label>
            <select
              value={shiftTypeFilter}
              onChange={(e) => onShiftTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
            >
              {shiftTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
