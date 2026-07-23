import { useState, useEffect } from 'react';
import { supabase, Shift, Profile } from '../lib/supabase';
import { Calendar, MapPin, Clock, Users, ChevronLeft, ChevronRight, FileText } from 'lucide-react';

type ShiftWithDoctor = Shift & {
  assigned_doctor: Profile | null;
};

type Site = {
  id: number;
  name: string;
};

export default function DailyScheduleView() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [shifts, setShifts] = useState<ShiftWithDoctor[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSites();
  }, []);

  useEffect(() => {
    loadDailySchedule();

    const subscription = supabase
      .channel('daily_schedule_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        loadDailySchedule();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [selectedDate]);

  const loadSites = async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('id, name')
      .order('name', { ascending: true });

    if (!error && data) {
      setSites(data);
    }
  };

  const loadDailySchedule = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('shifts')
      .select(`
        *,
        assigned_doctor:profiles!assigned_doctor_id(*)
      `)
      .eq('date', selectedDate)
      .eq('status', 'assigned')
      .order('location', { ascending: true })
      .order('room', { ascending: true })
      .order('shift_type', { ascending: true });

    if (!error && data) {
      setShifts(data as ShiftWithDoctor[]);
    }
    setLoading(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  };

  const changeDate = (days: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const filteredShifts = selectedSite === 'all'
    ? shifts
    : shifts.filter(shift => shift.location === selectedSite);

  const groupedShifts = filteredShifts.reduce((acc, shift) => {
    if (!shift.assigned_doctor) return acc;

    const doctorName = shift.assigned_doctor.full_name;
    if (!acc[doctorName]) {
      acc[doctorName] = [];
    }
    acc[doctorName].push(shift);
    return acc;
  }, {} as Record<string, ShiftWithDoctor[]>);

  const doctorNames = Object.keys(groupedShifts).sort();

  const getDoctorColor = (doctorName: string) => {
    const pastelColors = [
      'bg-blue-100',
      'bg-pink-100',
      'bg-purple-100',
      'bg-yellow-100',
      'bg-orange-100',
      'bg-rose-100',
      'bg-cyan-100',
      'bg-lime-100',
      'bg-amber-100',
      'bg-violet-100',
      'bg-fuchsia-100',
      'bg-sky-100',
      'bg-emerald-100',
      'bg-indigo-100'
    ];

    let hash = 0;
    for (let i = 0; i < doctorName.length; i++) {
      hash = doctorName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % pastelColors.length;
    return pastelColors[index];
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-teal-100 rounded-lg">
            <Users className="w-6 h-6 text-teal-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-teal-900">Planning du jour</h2>
            <p className="text-sm text-gray-600">Consultez les médecins assignés pour une journée</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            onClick={() => changeDate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>

          <div className="flex-1 flex items-center gap-3">
            <Calendar className="w-5 h-5 text-teal-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <button
            onClick={() => changeDate(1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-teal-600" />
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="all">Tous les sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.name}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold text-gray-900">{formatDate(selectedDate)}</h3>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Chargement...</div>
        ) : doctorNames.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-600 mb-2">Aucun médecin assigné</p>
            <p className="text-sm text-gray-500">Il n'y a pas de gardes assignées pour cette date</p>
          </div>
        ) : (
          <div className="space-y-4">
            {doctorNames.map((doctorName) => {
              const doctorShifts = groupedShifts[doctorName];
              return (
                <div key={doctorName} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className={`${getDoctorColor(doctorName)} px-4 py-3 border-b border-gray-200`}>
                    <h4 className="font-semibold text-gray-900">{doctorName}</h4>
                  </div>
                  <div className="p-4 space-y-3">
                    {doctorShifts.map((shift) => (
                      <div
                        key={shift.id}
                        className="p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <MapPin className="w-4 h-4 text-teal-600 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900">{shift.location}</span>
                          </div>
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <Calendar className="w-4 h-4 text-teal-600 flex-shrink-0" />
                            <span className="text-sm text-gray-700">{shift.room}</span>
                          </div>
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <Clock className="w-4 h-4 text-teal-600 flex-shrink-0" />
                            <span className="text-sm text-gray-700">{shift.shift_type}</span>
                          </div>
                        </div>
                        {shift.coordinator_note && (
                          <div className="flex items-start gap-2 mt-2 pt-2 border-t border-gray-200">
                            <FileText className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-gray-700">{shift.coordinator_note}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
