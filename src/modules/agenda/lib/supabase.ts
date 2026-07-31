// Client Supabase du module Agenda.
//
// Depuis l'étape 7E, le module lit et écrit dans le schéma `agenda` du projet
// principal Omnès-Orga. Il n'y a plus de second projet Supabase, plus de
// session séparée, plus d'écran de liaison : l'utilisateur connecté à
// Omnès-Orga est l'utilisateur de l'agenda.
//
// `.schema('agenda')` scope toutes les requêtes du module au bon schéma sans
// toucher aux quelque 40 fichiers qui font `.from('shifts')`, `.from('sites')`…
// La table `profiles` du module pointe ainsi vers la vue `agenda.profiles`,
// qui traduit `public.profiles` au format attendu (full_name reconstitué,
// rôle calculé depuis is_agenda_coordinator).

import { supabase as clientOrga } from '../../../lib/supabaseClient';

// Requêtes de données : scopées au schéma `agenda`.
// Attention : `.schema()` renvoie un client PostgREST — il porte `.from()`
// et `.rpc()`, mais NI `.auth` NI `.channel()`. Tout ce qui touche à la
// session ou au temps réel doit passer par `supabaseOrga` ci-dessous.
export const supabase = clientOrga.schema('agenda');

// Client complet du projet Orga : authentification et abonnements temps réel.
export const supabaseOrga = clientOrga;

// ---------------------------------------------------------------------------
// Types du domaine agenda.
// ---------------------------------------------------------------------------

export type UserRole = 'coordinator' | 'doctor';

// Reflète la vue `agenda.profiles` — et non la table `public.profiles`.
// Les champs propres à l'ancienne base Planning (temp_password,
// must_change_password, deleted_at, created_by…) ont disparu avec elle ;
// aucun n'était utilisé par le module.
export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  // Exposés par la vue depuis 7E-1 : alimentent <Avatar> (initiales et
  // vraie photo). Optionnels — l'utilisateur courant est construit par
  // buildAgendaUser, qui ne les renseigne pas tous.
  prenom?: string | null;
  nom?: string | null;
  photo_url?: string | null;
  updated_at?: string | null;
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
