import { useState, useEffect } from 'react';
import { supabase, Shift, Profile } from '../lib/supabase';
import { Calendar as CalendarIcon, Filter, Plus } from 'lucide-react';
import ShiftRow from './ShiftRow';
import ShiftRequestModal from './ShiftRequestModal';
import CreateShiftModal from './CreateShiftModal';

type CalendarViewProps = {
  currentUser: Profile;
};

export default function CalendarView({ currentUser }: CalendarViewProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [locationFilter, setLocationFilter] = useState<'all' | 'Dijon' | 'Beaune'>('all');
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadShifts();

    const subscription = supabase
      .channel('shifts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        loadShifts();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [selectedMonth, locationFilter]);

  const loadShifts = async () => {
    setLoading(true);
    const startDate = `${selectedMonth}-01`;
    const endDate = new Date(selectedMonth + '-01');
    endDate.setMonth(endDate.getMonth() + 1);
    const endDateStr = endDate.toISOString().slice(0, 10);

    let query = supabase
      .from('shifts')
      .select(`
        *,
        assigned_doctor:profiles!assigned_doctor_id(id, full_name, email),
        shift_type_data:shift_types!shift_type_id(id, name, time_range)
      `)
      .gte('date', startDate)
      .lt('date', endDateStr)
      .order('date', { ascending: true })
      .order('shift_type', { ascending: true });

    if (locationFilter !== 'all') {
      query = query.eq('location', locationFilter);
    }

    const { data, error } = await query;

    if (!error && data) {
      setShifts(data);
    }
    setLoading(false);
  };

  const handleShiftClick = (shift: Shift) => {
    if (currentUser.role === 'doctor' && shift.status === 'free') {
      setSelectedShift(shift);
      setShowRequestModal(true);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    }).format(date);
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      free: 'bg-green-100 text-green-800 border-green-200',
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      assigned: 'bg-gray-100 text-gray-800 border-gray-200'
    }[status] || 'bg-gray-100 text-gray-800';

    const labels = {
      free: 'LIBRE',
      pending: 'EN ATTENTE',
      assigned: 'ASSIGNÉ'
    }[status] || status.toUpperCase();

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles}`}>
        {labels}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-100 rounded-lg">
              <CalendarIcon className="w-6 h-6 text-cyan-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-teal-900">Calendrier des Gardes</h2>
              <p className="text-sm text-gray-600">Planification des consultations</p>
            </div>
          </div>

          {currentUser.role === 'coordinator' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-pink-500 hover:bg-pink-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Créer une garde
            </button>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <label className="text-sm font-medium text-gray-700">Mois:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Lieu:</label>
            <div className="flex gap-2">
              <button
                onClick={() => setLocationFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  locationFilter === 'all'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => setLocationFilter('Dijon')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  locationFilter === 'Dijon'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Dijon
              </button>
              <button
                onClick={() => setLocationFilter('Beaune')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  locationFilter === 'Beaune'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Beaune
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4 text-sm">
          <span className="font-medium text-gray-700">Légende:</span>
          {getStatusBadge('free')}
          {getStatusBadge('pending')}
          {getStatusBadge('assigned')}
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Chargement...</div>
        ) : shifts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Aucune garde trouvée pour cette période
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Lieu</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Salle</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Horaire</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Médecin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {shifts.map((shift) => (
                  <ShiftRow
                    key={shift.id}
                    shift={shift}
                    userRole={currentUser.role}
                    onClick={() => handleShiftClick(shift)}
                    formatDate={formatDate}
                    getStatusBadge={getStatusBadge}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showRequestModal && selectedShift && (
        <ShiftRequestModal
          shift={selectedShift}
          doctorId={currentUser.id}
          onClose={() => {
            setShowRequestModal(false);
            setSelectedShift(null);
          }}
          onSuccess={loadShifts}
        />
      )}

      {showCreateModal && (
        <CreateShiftModal
          coordinatorId={currentUser.id}
          onClose={() => setShowCreateModal(false)}
          onSuccess={loadShifts}
        />
      )}
    </div>
  );
}
