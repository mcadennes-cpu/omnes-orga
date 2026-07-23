import {
  Users,
  BookOpen,
  Building2,
  MessageSquare,
  Calendar,
  CalendarClock,
  FileText,
  Home,
  KeyRound,
} from 'lucide-react'

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ASSOCIE_GERANT: 'associe_gerant',
  ASSOCIE: 'associe',
  REMPLACANT: 'remplacant',
  POSTE_BUREAU: 'poste_bureau',
}

export const ROLE_LABELS = {
  super_admin: 'Super administrateur',
  associe_gerant: 'Associé gérant',
  associe: 'Associé',
  remplacant: 'Remplaçant',
  poste_bureau: 'Poste bureau',
}

export const MODULES = [
  {
    key: 'trombinoscope',
    label: 'Trombinoscope',
    icon: Users,
    color: 'canard',
    allowedRoles: ['super_admin', 'associe_gerant', 'associe', 'remplacant', 'poste_bureau'],
  },
  {
    key: 'annuaire',
    label: 'Annuaire',
    icon: BookOpen,
    color: 'ocre',
    allowedRoles: ['super_admin', 'associe_gerant', 'associe', 'remplacant', 'poste_bureau'],
  },
  {
    key: 'cabinet_pratique',
    label: 'Cabinet pratique',
    icon: Building2,
    color: 'marine',
    allowedRoles: ['super_admin', 'associe_gerant', 'associe', 'remplacant', 'poste_bureau'],
  },
  {
    key: 'discussion',
    label: 'Discussion',
    icon: MessageSquare,
    color: 'brique',
    allowedRoles: ['super_admin', 'associe_gerant', 'associe', 'remplacant'],
  },
  {
    key: 'evenements',
    label: 'Événements',
    icon: Calendar,
    color: 'fuchsia',
    allowedRoles: ['super_admin', 'associe_gerant', 'associe', 'remplacant'],
  },
  {
    key: 'sim',
    label: 'SIM',
    icon: FileText,
    color: 'olive',
    allowedRoles: ['super_admin', 'associe_gerant'],
  },
  {
    key: 'immobilier',
    label: 'Immobilier',
    icon: Home,
    color: 'canard',
    allowedRoles: ['super_admin', 'associe_gerant', 'associe'],
  },
  {
    key: 'codes',
    label: "Codes d'accès",
    icon: KeyRound,
    color: 'olive',
    // Remplacants inclus (lecture seule, cf. permissions.js) ; poste_bureau
    // exclu : jamais de codes d'acces sur la borne partagee du cabinet.
    allowedRoles: ['super_admin', 'associe_gerant', 'associe', 'remplacant'],
  },
  {
    // "agenda" reste l'identifiant interne partout (dossier src/modules/agenda,
    // colonne agenda_beta_access, docs) ; seul le label affiche dit "Planning",
    // le nom que le cabinet utilise deja (OMNES PLANNING).
    key: 'agenda',
    label: 'Planning',
    icon: CalendarClock,
    color: 'canard',
    // poste_bureau exclu : le planning de gardes ne concerne que les medecins.
    allowedRoles: ['super_admin', 'associe_gerant', 'associe', 'remplacant'],
    // Phase beta (etapes 2-6 integration agenda) : visible uniquement si
    // profiles.agenda_beta_access = true. A la sortie de beta, supprimer
    // simplement cette ligne pour ouvrir le module a tous les allowedRoles.
    betaFlag: 'agenda_beta_access',
  },
]

// role : filtre principal (comme les RLS cote base). profile : le profil
// complet (useRole), utilise pour les modules en beta — si un module porte
// betaFlag, il n'est visible que si profile[betaFlag] est vrai.
export function getVisibleModules(role, profile = null) {
  if (!role) return []
  return MODULES.filter((m) => {
    if (!m.allowedRoles.includes(role)) return false
    if (m.betaFlag && !profile?.[m.betaFlag]) return false
    return true
  })
}
