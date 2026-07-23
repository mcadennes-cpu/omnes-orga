// Client Supabase du module Agenda — pointe vers le projet Supabase PLANNING
// (celui de l'appli Bolt), distinct du projet principal Omnès-Orga.
//
// Ce fichier est TEMPORAIRE : à l'étape 7 (migration des données vers le
// projet principal), il sera supprimé et le module utilisera le client
// unique src/lib/supabaseClient.js. Tout ce qui touche au projet Planning
// doit rester cloisonné dans src/modules/agenda/.
//
// L'alias `export const supabase` permet aux composants copiés depuis
// reference-agenda/ de fonctionner sans modifier leurs imports.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_AGENDA_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_AGENDA_SUPABASE_ANON_KEY;

// Si les variables manquent, on crée un client factice plutôt que de faire
// planter tout le bundle au chargement : le composant App du module détecte
// hasValidConfig=false et affiche une erreur de configuration.
// (Comportement repris de l'agenda d'origine.)
export const supabaseAgenda =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          // Clé de stockage dédiée : la session auth du projet Planning ne
          // partage pas l'entrée localStorage du client principal.
          storageKey: 'sb-agenda-auth',
        },
      })
    : createClient('https://placeholder.supabase.co', 'placeholder-key');

export const supabase = supabaseAgenda;

export const hasValidConfig = !!(supabaseUrl && supabaseAnonKey);

// ---------------------------------------------------------------------------
// Types du domaine agenda — copiés tels quels depuis reference-agenda
// (src/lib/supabase.ts). Ils décrivent les tables du projet Planning.
// ---------------------------------------------------------------------------

export type UserRole = 'coordinator' | 'doctor';

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  temp_password: boolean;
  must_change_password: boolean;
  is_active?: boolean;
  deleted_at?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ShiftStatus = 'free' | 'pending' | 'assigned';
export type ShiftLocation = 'Dijon' | 'Beaune';

export type Site = {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Room = {
  id: string;
  site_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  site?: Site;
};

export type ShiftType = {
  id: string;
  name: string;
  time_range: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Shift = {
  id: string;
  date: string;
  location: ShiftLocation;
  room: string;
  shift_type: string;
  status: ShiftStatus;
  assigned_doctor_id: string | null;
  site_id: string | null;
  room_id: string | null;
  shift_type_id: string | null;
  series_id: string | null;
  series_instance_date: string | null;
  coordinator_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assigned_doctor?: Pick<Profile, 'id' | 'full_name' | 'email'>;
  site?: Site;
  room_data?: Room;
  shift_type_data?: ShiftType;
  hasPendingRequest?: boolean;
  pendingRequestsCount?: number;
};

export type RequestStatus = 'pending' | 'approved' | 'rejected';

export type Request = {
  id: string;
  shift_id: string;
  doctor_id: string;
  status: RequestStatus;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_note: string | null;
  doctor?: Pick<Profile, 'id' | 'full_name' | 'email'>;
  shift?: Shift;
};
