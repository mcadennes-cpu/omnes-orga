import { Filter } from 'lucide-react';
import Segmented from '../ui/Segmented';

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

// Classe commune aux champs date / selects (charte Omnes, focus canard).
const fieldClass =
  'rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

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
  isMobile = false,
}: CalendarFiltersProps) {
  const shiftTypes = [
    { value: 'all', label: 'Tous' },
    { value: '08:00-14:00', label: '08h-14h' },
    { value: '08:00-18:30', label: '08h-18h30' },
    { value: '14:00-20:00', label: '14h-20h' },
    { value: '18:30-23:00', label: '18h30-23h' },
  ];

  return (
    <div className="space-y-4 rounded-card border border-border bg-carte p-4 shadow-card md:p-6">
      <div className="flex items-center gap-2">
        <Filter className="h-5 w-5 text-canard" />
        <h3 className="text-eyebrow">Filtres</h3>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-field-label">Vue</span>
          <Segmented
            ariaLabel="Vue"
            value={viewMode}
            onChange={onViewModeChange}
            options={[
              { value: 'week', label: 'Semaine' },
              { value: 'month', label: 'Mois' },
            ]}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-field-label">{viewMode === 'week' ? 'Semaine' : 'Mois'}</span>
          <input
            type={viewMode === 'month' ? 'month' : 'date'}
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-field-label">Site</span>
          <Segmented
            ariaLabel="Site"
            value={locationFilter}
            onChange={onLocationChange}
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'Dijon', label: 'Dijon' },
              { value: 'Beaune', label: 'Beaune' },
            ]}
          />
        </div>

        {!isMobile && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-field-label">Salle</span>
              <select value={roomFilter} onChange={(e) => onRoomChange(e.target.value)} className={fieldClass}>
                <option value="all">Toutes</option>
                {availableRooms.map((room) => (
                  <option key={room} value={room}>
                    {room}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-field-label">Médecin</span>
              <select value={doctorFilter} onChange={(e) => onDoctorFilter(e.target.value)} className={fieldClass}>
                <option value="all">Tous</option>
                {availableDoctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-field-label">Horaire</span>
              <select
                value={shiftTypeFilter}
                onChange={(e) => onShiftTypeFilter(e.target.value)}
                className={fieldClass}
              >
                {shiftTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {isMobile && (
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-field-label">Salle</span>
            <select value={roomFilter} onChange={(e) => onRoomChange(e.target.value)} className={fieldClass}>
              <option value="all">Toutes</option>
              {availableRooms.map((room) => (
                <option key={room} value={room}>
                  {room}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-field-label">Horaire</span>
            <select
              value={shiftTypeFilter}
              onChange={(e) => onShiftTypeFilter(e.target.value)}
              className={fieldClass}
            >
              {shiftTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
