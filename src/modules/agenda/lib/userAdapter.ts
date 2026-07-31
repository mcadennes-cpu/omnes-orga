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
