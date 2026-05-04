import {
  Users,
  BookOpen,
  Building2,
  MessageSquare,
  Calendar,
  FileText,
  Home,
} from 'lucide-react'

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ASSOCIE_GERANT: 'associe_gerant',
  ASSOCIE: 'associe',
  REMPLACANT: 'remplacant',
}

export const ROLE_LABELS = {
  super_admin: 'Super administrateur',
  associe_gerant: 'Associé gérant',
  associe: 'Associé',
  remplacant: 'Remplaçant',
}

export const MODULES = [
  {
    key: 'trombinoscope',
    label: 'Trombinoscope',
    icon: Users,
    color: 'canard',
    allowedRoles: ['super_admin', 'associe_gerant', 'associe', 'remplacant'],
  },
  {
    key: 'annuaire',
    label: 'Annuaire',
    icon: BookOpen,
    color: 'ocre',
    allowedRoles: ['super_admin', 'associe_gerant', 'associe', 'remplacant'],
  },
  {
    key: 'cabinet_pratique',
    label: 'Cabinet pratique',
    icon: Building2,
    color: 'marine',
    allowedRoles: ['super_admin', 'associe_gerant', 'associe', 'remplacant'],
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
]

export function getVisibleModules(role) {
  if (!role) return []
  return MODULES.filter((m) => m.allowedRoles.includes(role))
}
