import { useState, useEffect } from 'react';
import { supabase, Site, Room, ShiftType } from '../lib/supabase';
import { Calendar, MapPin, Clock, Home, Repeat } from 'lucide-react';
import { applyRotationRulesToShifts } from '../lib/rotationUtils';
import BottomSheet from './ui/BottomSheet';

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

const formaterJour = (iso: string) => {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
};

// ---------------------------------------------------------------------------
// Le creneau est-il deja pris ?
//
// La base porte un index unique sur (date, location, room, shift_type) : deux
// gardes ne peuvent pas coexister au meme endroit le meme jour. Sans ce
// controle prealable, la collision ne se manifestait que par le message brut de
// PostgreSQL — « duplicate key value violates unique constraint "unique_shift" »
// — qui n'apprend rien au coordinateur et laisse croire a une panne.
//
// On interroge sur les MEMES colonnes que l'index (les libelles, pas les
// identifiants), sur une plage de dates plutot qu'une liste : une serie de six
// mois produirait une URL a rallonge.
// ---------------------------------------------------------------------------
async function trouverConflits(
  dates: string[],
  location: string,
  room: string,
  shiftType: string
): Promise<string[]> {
  if (dates.length === 0) return [];

  const { data, error } = await supabase
    .from('shifts')
    .select('date')
    .eq('location', location)
    .eq('room', room)
    .eq('shift_type', shiftType)
    .gte('date', dates[0])
    .lte('date', dates[dates.length - 1]);

  if (error) throw error;

  const voulues = new Set(dates);
  return (data ?? [])
    .map((existante) => existante.date as string)
    .filter((jour) => voulues.has(jour))
    .sort();
}

// ---------------------------------------------------------------------------
// Le roulement placerait-il un medecin deja de garde ce jour-la ?
//
// Second index unique de la table : (assigned_doctor_id, date) pour les gardes
// attribuees. Les gardes creees ici recoivent leur medecin du roulement
// (applyRotationRulesToShifts) : la collision ne vient donc pas d'une saisie,
// mais du plan qui place quelqu'un deja occupe. Sans ce controle, la seule
// explication etait le message brut du moteur.
// ---------------------------------------------------------------------------
async function trouverConflitsMedecin(
  shifts: { date: string; status: string; assigned_doctor_id?: string | null }[]
): Promise<{ jour: string; medecinId: string }[]> {
  const affectees = shifts.filter((s) => s.status === 'assigned' && s.assigned_doctor_id);
  if (affectees.length === 0) return [];

  const jours = affectees.map((s) => s.date).sort();
  const medecins = [...new Set(affectees.map((s) => s.assigned_doctor_id as string))];

  const { data, error } = await supabase
    .from('shifts')
    .select('date, assigned_doctor_id')
    .eq('status', 'assigned')
    .in('assigned_doctor_id', medecins)
    .gte('date', jours[0])
    .lte('date', jours[jours.length - 1]);

  if (error) throw error;

  const occupees = new Set((data ?? []).map((s) => `${s.assigned_doctor_id}|${s.date}`));
  return affectees
    .filter((s) => occupees.has(`${s.assigned_doctor_id}|${s.date}`))
    .map((s) => ({ jour: s.date, medecinId: s.assigned_doctor_id as string }))
    .sort((a, b) => a.jour.localeCompare(b.jour));
}

async function chargerNoms(
  conflits: { medecinId: string }[]
): Promise<Record<string, string>> {
  const ids = [...new Set(conflits.map((c) => c.medecinId))];
  const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids);
  const noms: Record<string, string> = {};
  for (const p of data ?? []) noms[p.id] = p.full_name ?? '';
  return noms;
}

function messageConflitMedecin(
  conflits: { jour: string; medecinId: string }[],
  noms: Record<string, string>
): string {
  const apercu = conflits
    .slice(0, 3)
    .map((c) => `${formaterJour(c.jour)} (${noms[c.medecinId] ?? 'médecin inconnu'})`)
    .join(', ');
  const reste =
    conflits.length > 3 ? ` et ${conflits.length - 3} autre${conflits.length - 3 > 1 ? 's' : ''}` : '';
  return (
    `Le roulement placerait sur cette série un médecin déjà de garde ce jour-là, `
    + `sur ${conflits.length} date${conflits.length > 1 ? 's' : ''} : ${apercu}${reste}. `
    + `Un médecin ne peut pas tenir deux gardes le même jour — choisissez d'autres jours `
    + `de la semaine, ou une période qui évite ces dates.`
  );
}

function messageConflit(jours: string[], site: string, salle: string, creneau: string): string {
  const apercu = jours.slice(0, 3).map(formaterJour).join(', ');
  const reste = jours.length > 3 ? ` et ${jours.length - 3} autre${jours.length - 3 > 1 ? 's' : ''}` : '';
  const debut =
    jours.length === 1
      ? `Une garde existe déjà à ${site} / ${salle} / ${creneau} le ${apercu}.`
      : `${jours.length} gardes existent déjà à ${site} / ${salle} / ${creneau} : ${apercu}${reste}.`;
  return `${debut} Choisissez une autre salle, un autre créneau, ou une période qui ne recouvre pas l'existant.`;
}

// Champ date / select a la charte Omnes (focus canard).
const fieldClass =
  'w-full rounded-input border border-border bg-carte px-4 py-3 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

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

        // Les dates d'abord, la série ensuite : jusqu'ici la ligne
        // fixed_duty_series était insérée AVANT les gardes, et rien ne la
        // nettoyait si l'insertion échouait. Dix séries vides traînaient ainsi
        // en base, dont cinq datant de juillet.
        const joursVises: string[] = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
          const dayOfWeek = (currentDate.getDay() + 6) % 7;
          if (selectedWeekdays.includes(dayOfWeek)) {
            joursVises.push(currentDate.toISOString().split('T')[0]);
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }

        if (joursVises.length === 0) {
          throw new Error('Aucune garde ne correspond aux jours sélectionnés dans la période');
        }

        const conflits = await trouverConflits(
          joursVises, selectedSite.name, selectedRoom.name, selectedShiftType.time_range
        );
        if (conflits.length > 0) {
          throw new Error(
            messageConflit(conflits, selectedSite.name, selectedRoom.name, selectedShiftType.name)
          );
        }

        // Le roulement est appliqué AVANT la création de la série : c'est lui
        // qui pose les médecins, donc lui qui peut créer un conflit médecin/jour.
        const candidates = joursVises.map((jour) => ({
          date: jour,
          location: selectedSite.name,
          room: selectedRoom.name,
          shift_type: selectedShiftType.time_range,
          site_id: selectedSiteId,
          room_id: selectedRoomId,
          shift_type_id: selectedShiftTypeId,
          status: 'free',
          created_by: coordinatorId
        }));
        const avecRoulement = await applyRotationRulesToShifts(candidates);

        const conflitsMedecin = await trouverConflitsMedecin(avecRoulement);
        if (conflitsMedecin.length > 0) {
          throw new Error(messageConflitMedecin(conflitsMedecin, await chargerNoms(conflitsMedecin)));
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

        const shiftsWithRules = avecRoulement.map((garde) => ({
          ...garde,
          series_id: seriesData.id,
          series_instance_date: garde.date
        }));

        const { error: insertError } = await supabase
          .from('shifts')
          .insert(shiftsWithRules);

        if (insertError) {
          // Filet de sécurité : le contrôle préalable a laissé passer quelque
          // chose (création concurrente, autre contrainte). On ne laisse pas
          // la série vide derrière nous. La suppression réelle étant fermée
          // depuis MOD2-B, on passe par la porte.
          await supabase.rpc('supprimer_serie', { p_series_id: seriesData.id });
          throw insertError;
        }

      } else {
        const conflits = await trouverConflits(
          [date], selectedSite.name, selectedRoom.name, selectedShiftType.time_range
        );
        if (conflits.length > 0) {
          throw new Error(
            messageConflit(conflits, selectedSite.name, selectedRoom.name, selectedShiftType.name)
          );
        }

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

        const conflitsMedecin = await trouverConflitsMedecin([shiftWithRule]);
        if (conflitsMedecin.length > 0) {
          throw new Error(messageConflitMedecin(conflitsMedecin, await chargerNoms(conflitsMedecin)));
        }

        const { error: insertError } = await supabase
          .from('shifts')
          .insert(shiftWithRule);

        if (insertError) throw insertError;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      // Dernier filet : si une collision passe malgré le contrôle préalable
      // (création concurrente), ne pas renvoyer le message brut du moteur.
      const brut = err?.message ?? '';
      let message = brut;
      if (brut.includes('unique_doctor_per_day')) {
        message =
          'Le roulement placerait un médecin qui a déjà une garde ce jour-là. '
          + 'Rafraîchissez le calendrier : il a pu être modifié entre-temps.';
      } else if (brut.includes('unique_shift')) {
        message =
          'Une garde existe déjà à cet endroit, ce jour-là, sur ce créneau. '
          + 'Rafraîchissez le calendrier : il a pu être modifié entre-temps.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const availableRooms = rooms.filter(r => r.site_id === selectedSiteId && r.is_active);

  if (dataLoading) {
    return (
      <BottomSheet title="Créer une nouvelle garde" onClose={onClose}>
        <div className="py-8 text-center text-muted">Chargement…</div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      title="Créer une nouvelle garde"
      onClose={onClose}
      busy={loading}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            form="create-shift-form"
            disabled={loading || availableRooms.length === 0}
            className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
          >
            {loading ? 'Création…' : isSeries ? 'Créer la série' : 'Créer la garde'}
          </button>
        </>
      }
    >
      <form id="create-shift-form" onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 flex items-center gap-2 text-field-label">
            <Calendar className="h-4 w-4 text-muted" />
            Date de début <span className="text-brique">*</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            min={new Date().toISOString().split('T')[0]}
            className={fieldClass}
          />
        </div>

        <div className="rounded-card border border-border bg-fond p-4">
          <label className="flex cursor-pointer items-center gap-3">
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
              className="h-5 w-5 accent-canard"
            />
            <div className="flex items-center gap-2">
              <Repeat className="h-5 w-5 text-canard" />
              <span className="font-medium text-ink">Créer une série récurrente</span>
            </div>
          </label>
        </div>

        {isSeries && (
          <>
            <div>
              <label className="mb-3 flex items-center gap-2 text-field-label">
                <Calendar className="h-4 w-4 text-muted" />
                Jours de la semaine <span className="text-brique">*</span>
              </label>
              <div className="grid grid-cols-7 gap-2">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleWeekday(day.value)}
                    className={`rounded-pill px-2 py-3 text-sm font-medium transition-all ${
                      selectedWeekdays.includes(day.value)
                        ? 'bg-canard text-white shadow-card'
                        : 'bg-carte text-muted hover:bg-border/40'
                    }`}
                    title={day.fullLabel}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              {selectedWeekdays.length > 0 && (
                <p className="mt-2 text-caption">
                  {selectedWeekdays.length} jour{selectedWeekdays.length > 1 ? 's' : ''} sélectionné{selectedWeekdays.length > 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-field-label">
                <Calendar className="h-4 w-4 text-muted" />
                Date de fin <span className="text-brique">*</span>
              </label>
              <input
                type="date"
                value={seriesEndDate}
                onChange={(e) => setSeriesEndDate(e.target.value)}
                required={isSeries}
                min={date || new Date().toISOString().split('T')[0]}
                className={fieldClass}
              />
            </div>
          </>
        )}

        <div>
          <label className="mb-2 flex items-center gap-2 text-field-label">
            <MapPin className="h-4 w-4 text-muted" />
            Site <span className="text-brique">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {sites.map((site) => (
              <button
                key={site.id}
                type="button"
                onClick={() => setSelectedSiteId(site.id)}
                className={`rounded-input px-4 py-3 font-medium transition-all ${
                  selectedSiteId === site.id
                    ? 'bg-canard text-white shadow-card'
                    : 'bg-fond text-ink hover:bg-border/40'
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
          <label className="mb-2 flex items-center gap-2 text-field-label">
            <Home className="h-4 w-4 text-muted" />
            Salle <span className="text-brique">*</span>
          </label>
          <select
            value={selectedRoomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            required
            className={fieldClass}
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
          <label className="mb-2 flex items-center gap-2 text-field-label">
            <Clock className="h-4 w-4 text-muted" />
            Horaire <span className="text-brique">*</span>
          </label>
          <select
            value={selectedShiftTypeId}
            onChange={(e) => setSelectedShiftTypeId(e.target.value)}
            required
            className={fieldClass}
          >
            {shiftTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} ({type.time_range})
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
            {error}
          </div>
        )}
      </form>
    </BottomSheet>
  );
}
