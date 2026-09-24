import { useState, useEffect } from 'react';
import { supabase, supabaseOrga, Shift, Profile } from '../lib/supabase';
import { CalendarDays, MapPin, Users, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import Avatar from '../../../components/common/Avatar';
import { getHoraireStyle, isWeekend } from '../lib/horaireStyles';
import { aujourdhuiCabinet, depuisJour, jourLocal, libelleJour } from '../lib/dates';

type ShiftWithDoctor = Shift & {
  assigned_doctor: Profile | null;
  shift_type_data: { name: string } | null;
};

type Site = {
  id: number;
  name: string;
};

// Nom court du creneau pour le badge de la carte (24/09/2026). Les noms en base
// portent le site et parfois l'horaire, saisis de facon irreguliere :
// "J3 Dijon", "WE1 beaune 08h-20h", "pre - J2 Dijon". Le site etant deja ecrit
// sur la carte, on le retire ici, a l'affichage seulement : la base n'est pas
// touchee. Resultat : "J3", "WE1", "pre-J2", "J5 bis".
function nomCourtCreneau(nom: string, sites: Site[]): string {
  let court = nom;
  for (const site of sites) {
    court = court.replace(new RegExp(`\\b${site.name}\\b`, 'gi'), '');
  }
  return court
    .replace(/\d{1,2}h\d{0,2}\s*[-–]\s*\d{1,2}h\d{0,2}/gi, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function libelleNombre(n: number): string {
  if (n === 0) return 'Aucun médecin';
  return n === 1 ? '1 médecin' : `${n} médecins`;
}

// Bouton icone carre de 44 px (zone tactile minimale), blanc sur fond de page.
const boutonIcone =
  'relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-pill bg-carte text-marine shadow-card';

// Depuis l'etape 7E, le module lit les profils d'Omnes-Orga via la vue
// agenda.profiles : <Avatar> recoit directement le profil du medecin et
// affiche sa vraie photo quand il en a une, ses initiales sinon.

export default function DailyScheduleView() {
  const [selectedDate, setSelectedDate] = useState(aujourdhuiCabinet());
  const [shifts, setShifts] = useState<ShiftWithDoctor[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSites();
  }, []);

  useEffect(() => {
    loadDailySchedule();

    const subscription = supabaseOrga
      .channel('daily_schedule_changes')
      .on('postgres_changes', { event: '*', schema: 'agenda', table: 'shifts' }, () => {
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
        assigned_doctor:profiles!assigned_doctor_id(*),
        shift_type_data:shift_types!shift_type_id(name)
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

  const changeDate = (days: number) => {
    const date = depuisJour(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(jourLocal(date));
  };

  const filteredShifts = selectedSite === 'all'
    ? shifts
    : shifts.filter(shift => shift.location === selectedSite);

  // Une carte par garde (le cas normal etant une seule garde par medecin ; en
  // cas d'erreur de saisie, le medecin apparait sur deux cartes). Tri par
  // horaire depuis le 24/09/2026 — on lit la journee dans l'ordre, matins
  // d'abord — puis par nom. `shift_type` est la plage "HH:MM-HH:MM", sur deux
  // chiffres : l'ordre alphabetique est l'ordre chronologique.
  const sortedShifts = filteredShifts
    .filter((s): s is ShiftWithDoctor & { assigned_doctor: Profile } => s.assigned_doctor !== null)
    .sort((a, b) =>
      a.shift_type.localeCompare(b.shift_type) ||
      a.assigned_doctor.full_name.localeCompare(b.assigned_doctor.full_name, 'fr'));

  // libelleJour et non new Date(dateStr) : voir lib/dates.ts (8M).
  const nomDuJour = libelleJour(selectedDate, { weekday: 'long' });
  const dateDuJour = libelleJour(selectedDate, { day: 'numeric', month: 'long' });
  const weekend = isWeekend(selectedDate);

  const choixSite = [{ value: 'all', label: 'Tous les sites' }, ...sites.map((s) => ({ value: s.name, label: s.name }))];

  return (
    <div className="flex flex-col gap-3">
      {/* Date du jour a gauche, commandes regroupees a droite. Le bloc titre
          "Planning du jour" a disparu : l'onglet actif du header le dit deja. */}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-eyebrow ${weekend ? 'text-brique' : ''}`}>{nomDuJour}</p>
          <h2 className="text-h1 truncate text-ink">{dateDuJour}</h2>
        </div>
        <button onClick={() => changeDate(-1)} aria-label="Jour précédent" className={boutonIcone}>
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
        {/* Le vrai champ date, invisible, recouvre l'icone : le doigt tape
            directement dessus et le selecteur natif s'ouvre. Plus fiable sur
            iPhone qu'un bouton qui ouvrirait le champ par programme. */}
        <label className={boutonIcone}>
          <CalendarDays size={20} strokeWidth={2} />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            aria-label="Choisir une date"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <button onClick={() => changeDate(1)} aria-label="Jour suivant" className={boutonIcone}>
          <ChevronRight size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Choix du site : chips en defilement horizontal (hide-scrollbar),
          au lieu de la liste deroulante. Actif en canard, comme Segmented. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 hide-scrollbar md:mx-0 md:px-0">
        {choixSite.map((choix) => (
          <button
            key={choix.value}
            onClick={() => setSelectedSite(choix.value)}
            aria-pressed={selectedSite === choix.value}
            className={`flex h-11 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-4 text-body-m font-semibold transition-colors ${
              selectedSite === choix.value ? 'bg-canard text-white' : 'bg-carte text-muted shadow-card'
            }`}
          >
            {choix.value !== 'all' && <MapPin size={15} strokeWidth={2} />}
            {choix.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted">Chargement…</div>
      ) : sortedShifts.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-carte">
            <Users className="h-8 w-8 text-faint" />
          </div>
          <p className="mb-2 text-muted">Aucun médecin assigné</p>
          <p className="text-caption">Il n'y a pas de gardes assignées pour cette date</p>
        </div>
      ) : (
        <>
          <p className="text-caption">{libelleNombre(sortedShifts.length)}</p>
          <ul className="flex flex-col gap-2.5">
            {sortedShifts.map((shift) => {
              const doctorName = shift.assigned_doctor.full_name;
              const style = getHoraireStyle(shift.shift_type, shift.date);
              const creneau = shift.shift_type_data ? nomCourtCreneau(shift.shift_type_data.name, sites) : '';
              return (
                // Carte entiere teintee a la couleur du creneau (24/09/2026,
                // remplace le lisere en L sur cet ecran). Avatar 72 px, taille
                // de MedecinCard, sur une colonne blanche pleine hauteur.
                <li key={shift.id} className={`flex items-stretch overflow-hidden rounded-card ${style.bgClass}`}>
                  <div className="flex w-[88px] flex-shrink-0 items-center justify-center bg-carte py-3">
                    <Avatar profile={shift.assigned_doctor} size={72} alt={doctorName} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`text-h2 tabular-nums ${style.textClass}`}>{shift.shift_type}</p>
                      {creneau && (
                        <span className={`flex-shrink-0 rounded-full bg-carte px-2.5 py-0.5 text-body-m font-semibold ${style.textClass}`}>
                          {creneau}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-body-m font-semibold text-ink">{doctorName}</p>
                    <p className="flex items-center gap-1.5 text-caption">
                      <MapPin size={15} strokeWidth={2} className="flex-shrink-0" />
                      {shift.location} · {shift.room}
                    </p>
                    {shift.coordinator_note && (
                      <p className="mt-1 flex items-start gap-1.5 rounded-pill bg-carte px-3 py-2 text-caption text-ink">
                        <FileText size={15} strokeWidth={2} className="mt-0.5 flex-shrink-0" />
                        {shift.coordinator_note}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
