import { useState, useEffect } from 'react';
import { supabase, Shift, Profile } from '../lib/supabase';
import { Calendar, MapPin, Clock, Users, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import Avatar from '../../../components/common/Avatar';
import { getHoraireStyle } from '../lib/horaireStyles';

type ShiftWithDoctor = Shift & {
  assigned_doctor: Profile | null;
};

type Site = {
  id: number;
  name: string;
};

// Champ date / select a la charte Omnes (focus canard).
const fieldClass =
  'rounded-input border border-border bg-carte px-4 py-2 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

// Le module lit la base Planning : les profils n'ont pas de photo (elles vivent
// cote Orga, cf. etape 7). On decoupe donc juste le nom complet pour alimenter
// <Avatar> : initiales + couleur deterministe. Quand les donnees seront
// unifiees, il suffira de passer photo_url pour afficher la vraie photo.
function toAvatarProfile(fullName: string) {
  const parts = (fullName || '').trim().split(/\s+/);
  return { prenom: parts[0] || '', nom: parts.slice(1).join(' ') };
}

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

  // Une pastille par garde (le cas normal etant une seule garde par medecin ;
  // en cas d'erreur de saisie, le medecin apparait sur deux pastilles). Tri par
  // nom de medecin pour regrouper visuellement d'eventuels doublons.
  const sortedShifts = filteredShifts
    .filter((s): s is ShiftWithDoctor & { assigned_doctor: Profile } => s.assigned_doctor !== null)
    .sort((a, b) => a.assigned_doctor.full_name.localeCompare(b.assigned_doctor.full_name, 'fr'));

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-carte p-6 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-pill bg-canard/10 p-2">
            <Users className="h-6 w-6 text-canard" />
          </div>
          <div>
            <h2 className="text-h2 text-ink">Planning du jour</h2>
            <p className="text-caption">Consultez les médecins assignés pour une journée</p>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between gap-4">
          <button
            onClick={() => changeDate(-1)}
            className="rounded-pill p-2 transition-colors hover:bg-fond"
          >
            <ChevronLeft className="h-5 w-5 text-marine" />
          </button>

          <div className="flex flex-1 items-center gap-3">
            <Calendar className="h-5 w-5 flex-shrink-0 text-canard" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={`flex-1 ${fieldClass}`}
            />
          </div>

          <button
            onClick={() => changeDate(1)}
            className="rounded-pill p-2 transition-colors hover:bg-fond"
          >
            <ChevronRight className="h-5 w-5 text-marine" />
          </button>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 flex-shrink-0 text-canard" />
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className={`flex-1 ${fieldClass}`}
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

        <div className="mb-6 text-center">
          <h3 className="text-h2 capitalize text-ink">{formatDate(selectedDate)}</h3>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted">Chargement…</div>
        ) : sortedShifts.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-fond">
              <Users className="h-8 w-8 text-faint" />
            </div>
            <p className="mb-2 text-muted">Aucun médecin assigné</p>
            <p className="text-caption">Il n'y a pas de gardes assignées pour cette date</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedShifts.map((shift) => {
              const doctorName = shift.assigned_doctor.full_name;
              const style = getHoraireStyle(shift.shift_type, shift.date);
              return (
                <div
                  key={shift.id}
                  className="overflow-hidden rounded-card border border-border bg-carte shadow-card"
                >
                  <div className="flex items-stretch">
                    {/* Avatar seul a gauche (pattern trombinoscope). */}
                    <div className="flex flex-shrink-0 items-center px-4">
                      <Avatar profile={toAvatarProfile(doctorName)} size={52} />
                    </div>
                    {/* Colonne droite : nom (bande couleur du creneau) + infos (blanc). */}
                    <div className="min-w-0 flex-1">
                      <div className={`px-4 py-2.5 ${style.bandClass}`}>
                        <h4 className="text-body-l font-semibold">{doctorName}</h4>
                      </div>
                      <div className="bg-carte px-4 py-3">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 flex-shrink-0 text-muted" />
                            <span className="text-body-m font-medium text-ink">{shift.location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 flex-shrink-0 text-muted" />
                            <span className="text-body-m text-ink">{shift.room}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 flex-shrink-0 text-muted" />
                            <span className="text-body-m text-ink">{shift.shift_type}</span>
                          </div>
                        </div>
                        {shift.coordinator_note && (
                          <div className="mt-2 flex items-start gap-2 border-t border-border pt-2">
                            <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-canard" />
                            <p className="text-body-m text-ink">{shift.coordinator_note}</p>
                          </div>
                        )}
                      </div>
                    </div>
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
