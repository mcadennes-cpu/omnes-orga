import { Profile } from './supabase';

// ---------------------------------------------------------------------------
// Adaptateur utilisateur : profil Omnès-Orga → utilisateur du module agenda.
//
// Depuis l'étape 7E, l'utilisateur du module EST l'utilisateur connecté à
// Omnès-Orga : les données vivent dans le schéma `agenda` du projet principal
// et les policies RLS s'appuient sur son `auth.uid()`. Il n'y a plus de
// second profil ni de session à relier.
//
// Le rôle coordinateur vient d'une désignation explicite
// (`profiles.is_agenda_coordinator`) et NON du rôle applicatif : Matthieu et
// Charlotte sont tous deux super_admin sur Orga, mais seule Charlotte est
// coordinatrice de l'agenda. Les associés gérants n'ont pas ces droits
// (décision du 30/07/2026).
// ---------------------------------------------------------------------------

// Champs du profil Orga (table public.profiles) utiles au module.
export type OrgaProfile = {
  id: string;
  role: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  actif?: boolean;
  is_agenda_coordinator?: boolean;
};

// Rôles applicatifs Orga qui exercent au cabinet à demeure, par opposition aux
// remplaçants. `super_admin` en fait partie : Matthieu est l'un des 9 associés
// du roulement (cf. 23-3, la désignation porte sur des faits, pas sur des noms).
const ROLES_ASSOCIE = ['super_admin', 'associe_gerant', 'associe'];

// Côté agenda, les 9 associés et les 26 remplaçants sont TOUS `doctor` : le rôle
// du module ne permet pas de les distinguer. Or ils n'ouvrent pas le module pour
// la même raison — un associé veut voir qui exerce aujourd'hui, un remplaçant
// quelles gardes il peut demander. D'où ce critère, lu sur le rôle Orga, qui
// décide de l'onglet d'accueil (03/09/2026, demande de Matthieu).
export function estAssocieOrga(orgaProfile: OrgaProfile | null | undefined): boolean {
  return !!orgaProfile && ROLES_ASSOCIE.includes(orgaProfile.role);
}

// Construit l'utilisateur passé aux vues du module.
// Doit produire exactement ce que renvoie la vue `agenda.profiles`, pour que
// l'utilisateur courant et les médecins lus en base aient la même forme.
export function buildAgendaUser(orgaProfile: OrgaProfile): Profile {
  return {
    id: orgaProfile.id,
    email: orgaProfile.email ?? '',
    full_name: [orgaProfile.prenom, orgaProfile.nom]
      .filter(Boolean)
      .join(' ')
      .trim(),
    role: orgaProfile.is_agenda_coordinator ? 'coordinator' : 'doctor',
    is_active: orgaProfile.actif ?? true,
  };
}
