// Notifications push du Planning (8R) : les textes, et l'envoi groupe.
//
// Tous les textes des push du module sont ici, et nulle part ailleurs : pour
// les relire ou les reformuler, c'est le seul fichier a ouvrir.
//
// L'envoi passe par notifyUsers (src/lib/notify.js), comme Discussion et
// Immobilier : appel APRES ecriture reussie, jamais d'attente du resultat,
// jamais d'erreur qui remonte -- un push rate ne doit pas casser l'action.
//
// Regle anti-bruit, decidee avec Matthieu le 25/09/2026 : UN push par
// personne et par geste. Un geste qui touche 12 gardes du meme medecin lui
// envoie un resume, pas 12 notifications.

import { notifyUsers } from '../../../lib/notify';
import { libelleJour } from './dates';
import { nomCourtCreneau } from './horaireStyles';
import { supabaseOrga } from './supabase';

// Pages ouvertes au clic. Le parametre ?vue= est lu a partir de 8R-4 ;
// avant, il est simplement ignore et le Planning s'ouvre sur l'onglet
// d'accueil du role.
export const URL_MES_GARDES = '/planning?vue=schedule';
export const URL_VALIDATION = '/planning?vue=requests';
export const URL_OUVERTURES = '/planning?vue=calendar';

// Le minimum pour decrire une garde. Ces colonnes sont presentes sur toute
// garde chargee par le module, quel que soit l'ecran : le texte ne depend
// d'aucune jointure. `creneau` (nom court, ex. « J3 ») est un bonus quand
// l'ecran le connait.
export type GardeNotif = {
  date: string;
  location?: string | null;
  shift_type?: string | null;
  creneau?: string | null;
};

// Une garde telle que les ecrans du module la chargent -> GardeNotif. Le nom
// court (« J3 ») n'est calcule que si l'ecran a charge le creneau.
export function gardeDepuisShift(shift: {
  date: string;
  location?: string | null;
  shift_type?: string | null;
  shift_type_data?: { name?: string | null } | null;
}): GardeNotif {
  const nom = shift.shift_type_data?.name;
  return {
    date: shift.date,
    location: shift.location,
    shift_type: shift.shift_type,
    creneau: nom ? nomCourtCreneau(nom, shift.location ? [shift.location] : []) || null : null,
  };
}

export type ContenuNotif = { title: string; body: string; url: string };

/** « jeu. 2 oct. » */
function jourCourt(date: string): string {
  return libelleJour(date, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** « jeu. 2 oct. · J3 Dijon · 08:00-18:30 » */
export function libelleGarde(garde: GardeNotif): string {
  const lieu = [garde.creneau, garde.location].filter(Boolean).join(' ');
  return [jourCourt(garde.date), lieu, garde.shift_type]
    .filter(Boolean)
    .join(' · ');
}

// Une garde : son libelle complet. Plusieurs : le nombre et les premieres
// dates, dans l'ordre du calendrier (« 3 gardes : 2 oct., 5 oct., 9 oct. »).
function resumeGardes(gardes: GardeNotif[]): string {
  if (gardes.length === 1) return libelleGarde(gardes[0]);

  const dates = [...new Set(gardes.map(g => g.date))].sort();
  const affichees = dates
    .slice(0, 3)
    .map(d => libelleJour(d, { day: 'numeric', month: 'short' }));
  const suite = dates.length > 3 ? '…' : '';
  return `${gardes.length} gardes : ${affichees.join(', ')}${suite}`;
}

function accordGardes(n: number, singulier: string, pluriel: string): string {
  return n > 1 ? pluriel : singulier;
}

// ---- Les textes, un par evenement retenu en 8R-0 ----

/** A — demande(s) validee(s) par la coordination. */
export function texteGardesValidees(gardes: GardeNotif[]): ContenuNotif {
  return {
    title: accordGardes(gardes.length, 'Garde validée', 'Gardes validées'),
    body: resumeGardes(gardes),
    url: URL_MES_GARDES,
  };
}

/** B — garde(s) attribuee(s) directement par la coordination. */
export function texteGardesAttribuees(gardes: GardeNotif[]): ContenuNotif {
  return {
    title: accordGardes(gardes.length, 'Garde attribuée', 'Gardes attribuées'),
    body: resumeGardes(gardes),
    url: URL_MES_GARDES,
  };
}

/** C — garde(s) liberee(s) par la coordination. */
export function texteGardesRetirees(gardes: GardeNotif[]): ContenuNotif {
  return {
    title: accordGardes(gardes.length, 'Garde retirée', 'Gardes retirées'),
    body: `${resumeGardes(gardes)} — contactez la coordination si besoin.`,
    url: URL_MES_GARDES,
  };
}

// E — refus en cascade (garde attribuee a un autre) : PAS de push, decide
// par Matthieu le 25/09/2026. Un medecin se positionne souvent sur plusieurs
// creneaux et sites le meme jour : chaque validation en refuserait plusieurs,
// et le push deviendrait du bruit. Le refus reste visible dans « Mes gardes ».

/** D — nouvelle(s) demande(s) d'un medecin, pour la coordination. */
export function texteNouvellesDemandes(nomMedecin: string, nombre: number): ContenuNotif {
  const qui = nomMedecin.trim() || 'Un médecin';
  return {
    title: accordGardes(nombre, 'Nouvelle demande', 'Nouvelles demandes'),
    body: `${qui} demande ${nombre} ${accordGardes(nombre, 'garde', 'gardes')}.`,
    url: URL_VALIDATION,
  };
}

/** F — nouvelles semaines ouvertes (bornes au format AAAA-MM-JJ). */
export function texteSemainesOuvertes(debut: string, fin: string): ContenuNotif {
  const format: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  return {
    title: 'Nouvelles gardes ouvertes',
    body: `Semaines du ${libelleJour(debut, format)} au ${libelleJour(fin, format)} : vous pouvez faire vos demandes.`,
    url: URL_OUVERTURES,
  };
}

// ---- L'envoi ----

// L'auteur du geste = l'utilisateur connecte. Le module partage la session
// de l'appli principale (lib/supabase.ts) : on la lit ici plutot que de faire
// passer l'identifiant par chaque ecran. getSession lit le stockage local,
// sans appel reseau.
async function auteurCourant(): Promise<string | null> {
  const { data } = await supabaseOrga.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Envoie un meme contenu a plusieurs personnes, auteur exclu.
 * Fire-and-forget : on n'attend pas, rien ne remonte.
 */
export function notifier(
  destinataires: (string | null | undefined)[],
  contenu: ContenuNotif
): void {
  void (async () => {
    try {
      const auteur = await auteurCourant();
      const ids = [...new Set(destinataires)].filter(
        (id): id is string => !!id && id !== auteur
      );
      if (ids.length === 0) return;
      await notifyUsers({ userIds: ids, ...contenu });
    } catch (err) {
      console.error('[agenda] echec notification', err);
    }
  })();
}

/**
 * Regroupe des gardes par medecin et envoie UN push par medecin, auteur
 * exclu. `fabrique` choisit le texte (texteGardesValidees, ...).
 */
export function notifierParMedecin(
  gardes: (GardeNotif & { doctorId: string | null | undefined })[],
  fabrique: (gardes: GardeNotif[]) => ContenuNotif
): void {
  const parMedecin = new Map<string, GardeNotif[]>();
  for (const { doctorId, ...garde } of gardes) {
    if (!doctorId) continue;
    const liste = parMedecin.get(doctorId) ?? [];
    liste.push(garde);
    parMedecin.set(doctorId, liste);
  }
  for (const [doctorId, liste] of parMedecin) {
    notifier([doctorId], fabrique(liste));
  }
}
