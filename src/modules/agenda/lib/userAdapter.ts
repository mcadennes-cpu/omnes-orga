import { Profile, UserRole } from './supabase';

// ---------------------------------------------------------------------------
// Adaptateur utilisateur : profil Omnès-Orga → utilisateur du module agenda.
//
// PENDANT LA BÊTA (étapes 3 à 6), les données vivent dans le projet Supabase
// Planning : ses policies RLS ne connaissent que auth.uid() et le rôle du
// profil PLANNING. L'identité effective (id, rôle) vient donc obligatoirement
// du profil Planning. Le mapping Orga → agenda défini ici ne prendra le
// relais qu'à l'étape 7, quand les données et les RLS auront migré vers le
// projet principal. D'ici là, l'adaptateur sert de point de bascule unique
// et signale toute divergence entre les deux profils.
// ---------------------------------------------------------------------------

// Champs du profil Orga (table profiles du projet principal) utiles au module.
export type OrgaProfile = {
  id: string;
  role: string; // 'super_admin' | 'associe_gerant' | 'associe' | 'remplacant' | 'poste_bureau'
  prenom: string | null;
  nom: string | null;
  email: string | null;
};

// Mapping des rôles (doc integration-agenda.md, section « Mapping des rôles »).
// Seul super_admin obtient les droits coordinateur — pour les associés
// gérants, la décision par défaut est NON (à confirmer avant l'étape 7).
export function mapOrgaRoleToAgenda(orgaRole: string): UserRole {
  return orgaRole === 'super_admin' ? 'coordinator' : 'doctor';
}

// Construit l'utilisateur effectif passé aux vues du module.
// Aujourd'hui : retourne le profil Planning tel quel (contrainte RLS) et
// avertit en console si le rôle attendu d'après le profil Orga diverge.
// Étape 7 : cette fonction deviendra la source unique de l'utilisateur
// agenda, construite à partir du seul profil Orga.
export function buildAgendaUser(
  planningProfile: Profile,
  orgaProfile?: OrgaProfile | null
): Profile {
  if (orgaProfile) {
    const expectedRole = mapOrgaRoleToAgenda(orgaProfile.role);
    if (expectedRole !== planningProfile.role) {
      console.warn(
        `[agenda] Divergence de roles : profil Orga "${orgaProfile.role}" ` +
          `(attendu : ${expectedRole}) vs profil Planning "${planningProfile.role}". ` +
          `Pendant la beta, le role Planning fait foi.`
      );
    }
  }
  return planningProfile;
}
