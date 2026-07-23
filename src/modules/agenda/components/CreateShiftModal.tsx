import { useState, useEffect } from 'react';
import { supabase, Site, Room, ShiftType } from '../lib/supabase';
import { X, Calendar, MapPin, Clock, Home, Repeat } from 'lucide-react';
import { applyRotationRulesToShifts } from '../lib/rotationUtils';

type CreateShiftModalProps = {
  coordinatorId: string;
  onClose: () => void;
  onSuccess: () => void;
};

const WEEKDAYS = [
  { value: 0, label: 'Lun', fullLabel: 'Lundi' },
  { value: 1, label: 'Mar', fullLabel: 'Mardi' },
  { value: 2, label: 'Mer', fullLabel: 'Mercredi' },
  { value: 3, label: 'Jeu', fullLabel: 'Jeudi' },
  { value: 4, label: 'Ven', fullLabel: 'Vendredi' },
  { value: 5, label: 'Sam', fullLabel: 'Samedi' },
  { value: 6, label: 'Dim', fullLabel: 'Dimanche' }
];

export default function CreateShiftModal({ coordinatorId, onClose, onSuccess }: CreateShiftModalProps) {
  const [date, setDate] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState('');

  // Series functionality
  const [isSeries, setIsSeries] = useState(false);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [seriesEndDate, setSeriesEndDate] = useState('');

  const [sites, setSites] = useState<Site[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedSiteId) {
      const siteRooms = rooms.filter(r => r.site_id === selectedSiteId && r.is_active);
      if (siteRooms.length > 0 && !siteRooms.find(r => r.id === selectedRoomId)) {
        setSelectedRoomId(siteRooms[0].id);
      }
    }
  }, [selectedSiteId, rooms]);

  const loadData = async () => {
    setDataLoading(true);

    const [sitesResult, roomsResult, shiftTypesResult] = await Promise.all([
      supabase.from('sites').select('*').eq('is_active', true).order('name'),
      supabase.from('rooms').select('*').eq('is_active', true).order('name'),
      supabase.from('shift_types').select('*').eq('is_active', true).order('sort_order')
    ]);

    if (sitesResult.data) {
      setSites(sitesResult.data);
      if (sitesResult.data.length > 0) {
        setSelectedSiteId(sitesResult.data[0].id);
      }
    }

    if (roomsResult.data) {
      setRooms(roomsResult.data);
    }

    if (shiftTypesResult.data) {
      setShiftTypes(shiftTypesResult.data);
      if (shiftTypesResult.data.length > 0) {
        setSelectedShiftTypeId(shiftTypesResult.data[0].id);
      }
    }

    setDataLoading(false);
  };

  const toggleWeekday = (weekday: number) => {
    setSelectedWeekdays(prev =>
      prev.includes(weekday)
        ? prev.filter(d => d !== weekday)
        : [...prev, weekday].sort()
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const selectedSite = sites.find(s => s.id === selectedSiteId);
      const selectedRoom = rooms.find(r => r.id === selectedRoomId);
      const selectedShiftType = shiftTypes.find(st => st.id === selectedShiftTypeId);

      if (!selectedSite || !selectedRoom || !selectedShiftType) {
        throw new Error('Veuillez sélectionner tous les champs requis');
      }

      if (isSeries) {
        if (selectedWeekdays.length === 0) {
          throw new Error('Veuillez sélectionner au moins un jour de la semaine');
        }
        if (!seriesEndDate) {
          throw new Error('Veuillez sélectionner une date de fin pour la série');
        }

        const startDate = new Date(date);
        const endDate = new Date(seriesEndDate);

        if (endDate <= startDate) {
          throw new Error('La date de fin doit être après la date de début');
        }

        const { data: seriesData, error: seriesError } = await supabase
          .from('fixed_duty_series')
          .insert({
            name: `Série ${selectedSite.name} - ${selectedRoom.name} - ${selectedShiftType.name}`,
            description: `Créée le ${new Date().toLocaleDateString('fr-FR')}`,
            start_date: date,
            end_date: seriesEndDate,
            is_active: true,
            created_by: coordinatorId
          })
          .select()
          .single();

        if (seriesError) throw seriesError;

        const shiftsToCreate = [];
        let currentDate = new Date(startDate);

        while (currentDate <= endDate) {
          const dayOfWeek = (currentDate.getDay() + 6) % 7;

          if (selectedWeekdays.includes(dayOfWeek)) {
            shiftsToCreate.push({
              date: currentDate.toISOString().split('T')[0],
              location: selectedSite.name,
              room: selectedRoom.name,
              shift_type: selectedShiftType.time_range,
              site_id: selectedSiteId,
              room_id: selectedRoomId,
              shift_type_id: selectedShiftTypeId,
              status: 'free',
              created_by: coordinatorId,
              series_id: seriesData.id,
              series_instance_date: currentDate.toISOString().split('T')[0]
            });
          }

          currentDate.setDate(currentDate.getDate() + 1);
        }

        if (shiftsToCreate.length === 0) {
          throw new Error('Aucune garde ne correspond aux jours sélectionnés dans la période');
        }

        const shiftsWithRules = await applyRotationRulesToShifts(shiftsToCreate);

        const { error: insertError } = await supabase
          .from('shifts')
          .insert(shiftsWithRules);

        if (insertError) throw insertError;

      } else {
        const singleShift = {
          date,
          location: selectedSite.name,
          room: selectedRoom.name,
          shift_type: selectedShiftType.time_range,
          site_id: selectedSiteId,
          room_id: selectedRoomId,
          shift_type_id: selectedShiftTypeId,
          status: 'free',
          created_by: coordinatorId
        };

        const [shiftWithRule] = await applyRotationRulesToShifts([singleShift]);

        const { error: insertError } = await supabase
          .from('shifts')
          .insert(shiftWithRule);

        if (insertError) throw insertError;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const availableRooms = rooms.filter(r => r.site_id === selectedSiteId && r.is_active);

  if (dataLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
          <div className="text-center py-8 text-gray-500">Chargement...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-teal-900">Créer une nouvelle garde</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4" />
              Date de début <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isSeries}
                onChange={(e) => {
                  setIsSeries(e.target.checked);
                  if (!e.target.checked) {
                    setSelectedWeekdays([]);
                    setSeriesEndDate('');
                  }
                }}
                className="w-5 h-5 text-pink-500 rounded focus:ring-2 focus:ring-pink-500"
              />
              <div className="flex items-center gap-2">
                <Repeat className="w-5 h-5 text-teal-600" />
                <span className="font-medium text-gray-700">Créer une série récurrente</span>
              </div>
            </label>
          </div>

          {isSeries && (
            <>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                  <Calendar className="w-4 h-4" />
                  Jours de la semaine <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-7 gap-2">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleWeekday(day.value)}
                      className={`py-3 px-2 rounded-lg font-medium text-sm transition-all ${
                        selectedWeekdays.includes(day.value)
                          ? 'bg-teal-500 text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={day.fullLabel}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                {selectedWeekdays.length > 0 && (
                  <p className="mt-2 text-sm text-gray-600">
                    {selectedWeekdays.length} jour{selectedWeekdays.length > 1 ? 's' : ''} sélectionné{selectedWeekdays.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4" />
                  Date de fin <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={seriesEndDate}
                  onChange={(e) => setSeriesEndDate(e.target.value)}
                  required={isSeries}
                  min={date || new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
              </div>
            </>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <MapPin className="w-4 h-4" />
              Site <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {sites.map((site) => (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => setSelectedSiteId(site.id)}
                  className={`py-3 px-4 rounded-lg font-medium transition-all ${
                    selectedSiteId === site.id
                      ? 'bg-cyan-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  style={{
                    borderColor: selectedSiteId === site.id ? site.color || undefined : undefined,
                    borderWidth: selectedSiteId === site.id ? '2px' : undefined
                  }}
                >
                  {site.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Home className="w-4 h-4" />
              Salle <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            >
              {availableRooms.length === 0 ? (
                <option value="">Aucune salle disponible</option>
              ) : (
                availableRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Clock className="w-4 h-4" />
              Horaire <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedShiftTypeId}
              onChange={(e) => setSelectedShiftTypeId(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            >
              {shiftTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} ({type.time_range})
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || availableRooms.length === 0}
              className="flex-1 px-6 py-3 bg-pink-500 hover:bg-pink-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Création...' : isSeries ? 'Créer la série' : 'Créer la garde'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
