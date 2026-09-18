import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Sauvegarde manuelle du planning (8J-3), declenchee par un coordinateur.
//
// POURQUOI DANS L'APPLI
// Le projet Supabase est sur l'offre gratuite : aucune sauvegarde (mesure du
// 17/09/2026). Charlotte travaille tous les jours dans le Planning : un clic de
// sa part range un fichier sur l'ordinateur du cabinet, sans tache planifiee
// ni installation. Le script 23-16 reste la sauvegarde complete, lancee par
// Matthieu avant toute ecriture risquee en base.
//
// CE QUE CONTIENT LE FICHIER : ce que la RLS laisse lire a un coordinateur.
//  - Les gardes supprimees (deleted_at) et les series supprimees n'y sont
//    PAS : la policy les cache. C'est une sauvegarde du planning vivant.
//  - Les medecins : identifiant, prenom, nom, role — ni email ni photo.
//  - Une table ajoutee au schema agenda doit etre ajoutee a TABLES, sinon
//    elle n'est pas sauvegardee.
//
// LECTURE SEULE : aucune ecriture, seulement des SELECT.
//
// LA LIMITE DES 1 000 LIGNES
// PostgREST renvoie au plus 1 000 lignes par requete (max_rows), sans erreur
// au-dela. Chaque table est donc lue par tranches, triee sur son id, et le
// nombre de lignes recues est confronte au decompte de la base, pris avant
// ET apres la lecture. Si quelqu'un ajoute ou supprime une ligne pendant ce
// temps, une tranche peut glisser : le decompte le voit, on recommence.
// ---------------------------------------------------------------------------

const TAILLE_TRANCHE = 1000;
const ESSAIS = 3;

export const CLE_DERNIERE_SAUVEGARDE = 'agenda-derniere-sauvegarde';

type TableSauvegardee = { nom: string; colonnes: string };

const TABLES: TableSauvegardee[] = [
  { nom: 'shifts', colonnes: '*' },
  { nom: 'requests', colonnes: '*' },
  { nom: 'activity_log', colonnes: '*' },
  { nom: 'sites', colonnes: '*' },
  { nom: 'rooms', colonnes: '*' },
  { nom: 'shift_types', colonnes: '*' },
  { nom: 'rotation_plans', colonnes: '*' },
  { nom: 'rotation_plan_rules', colonnes: '*' },
  { nom: 'rotation_plan_changes', colonnes: '*' },
  { nom: 'rotation_import_mappings', colonnes: '*' },
  { nom: 'week_templates', colonnes: '*' },
  { nom: 'week_template_items', colonnes: '*' },
  { nom: 'opening_week_templates', colonnes: '*' },
  { nom: 'opening_week_template_items', colonnes: '*' },
  { nom: 'fixed_duty_series', colonnes: '*' },
  { nom: 'fixed_duty_patterns', colonnes: '*' },
  // Vue agenda.profiles : liste blanche de colonnes, pas d'email.
  { nom: 'profiles', colonnes: 'id, prenom, nom, full_name, role, is_active, is_agenda_doctor' },
];

export type ResultatSauvegarde =
  | { ok: true; nomFichier: string; lignes: number; octets: number; date: Date }
  | { ok: false; erreur: string };

class ErreurSauvegarde extends Error {}

async function compter(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true });
  if (error || count === null) {
    throw new ErreurSauvegarde(`Lecture impossible de « ${table} ».`);
  }
  return count;
}

async function lireTable({ nom, colonnes }: TableSauvegardee) {
  for (let essai = 1; essai <= ESSAIS; essai++) {
    const avant = await compter(nom);
    const lignes: Record<string, unknown>[] = [];
    for (let debut = 0; ; debut += TAILLE_TRANCHE) {
      const { data, error } = await supabase
        .from(nom)
        .select(colonnes)
        .order('id', { ascending: true })
        .range(debut, debut + TAILLE_TRANCHE - 1);
      if (error || !data) {
        throw new ErreurSauvegarde(`Lecture impossible de « ${nom} ».`);
      }
      lignes.push(...(data as unknown as Record<string, unknown>[]));
      if (data.length < TAILLE_TRANCHE) break;
    }
    const apres = await compter(nom);
    const idsUniques = new Set(lignes.map((l) => l.id)).size;
    if (lignes.length === avant && avant === apres && idsUniques === lignes.length) {
      return lignes;
    }
  }
  throw new ErreurSauvegarde(
    'Le planning a été modifié pendant la sauvegarde. Réessayez dans un instant.'
  );
}

function horodatage(date: Date): string {
  const d = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${d(date.getMonth() + 1)}-${d(date.getDate())}` +
    `-${d(date.getHours())}h${d(date.getMinutes())}`
  );
}

function telecharger(contenu: string, nomFichier: string): number {
  const blob = new Blob([contenu], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  // Laisser au navigateur le temps de démarrer le téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return blob.size;
}

export async function sauvegarderPlanning(auteur: {
  id: string;
  full_name: string;
}): Promise<ResultatSauvegarde> {
  try {
    const date = new Date();
    const tables: Record<string, { lignes: number; donnees: Record<string, unknown>[] }> = {};
    let total = 0;
    for (const table of TABLES) {
      const donnees = await lireTable(table);
      tables[table.nom] = { lignes: donnees.length, donnees };
      total += donnees.length;
    }

    const nomFichier = `sauvegarde-planning-${horodatage(date)}.json`;
    const contenu = JSON.stringify(
      {
        format: 'omnes-planning-sauvegarde',
        version: 1,
        creee_le: date.toISOString(),
        creee_par: { id: auteur.id, nom: auteur.full_name },
        remarque:
          'Sauvegarde du planning vivant, lue avec les droits du coordinateur. ' +
          'Gardes et séries supprimées non incluses. Médecins sans email.',
        tables,
      },
      null,
      1
    );
    const octets = telecharger(contenu, nomFichier);

    try {
      localStorage.setItem(CLE_DERNIERE_SAUVEGARDE, date.toISOString());
    } catch {
      // stockage indisponible : le rappel ne saura pas, la sauvegarde est faite
    }
    return { ok: true, nomFichier, lignes: total, octets, date };
  } catch (e) {
    return {
      ok: false,
      erreur:
        e instanceof ErreurSauvegarde
          ? e.message
          : 'La sauvegarde a échoué. Vérifiez la connexion et réessayez.',
    };
  }
}

// --- rappel : regles partagees par l'onglet Sauvegarde et le bandeau de Validation

/** Au-dela, le rappel s'affiche (decision de Matthieu, 17/09/2026). */
export const JOURS_AVANT_RAPPEL = 7;

/**
 * Jours calendaires ecoules : une sauvegarde d'hier 23h est « hier », meme
 * consultee ce matin a 8h.
 */
export function joursDepuisSauvegarde(date: Date, maintenant: Date = new Date()): number {
  const debutJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((debutJour(maintenant) - debutJour(date)) / 86400000);
}

export function sauvegardeEnRetard(date: Date | null, maintenant: Date = new Date()): boolean {
  return date === null || joursDepuisSauvegarde(date, maintenant) > JOURS_AVANT_RAPPEL;
}

/** « aujourd'hui à 9h19 », « hier à 18h05 », « il y a 9 jours (le 09/09 à 8h30) ». */
export function decrireSauvegarde(date: Date, maintenant: Date = new Date()): string {
  const jours = joursDepuisSauvegarde(date, maintenant);
  const heure = `${date.getHours()}h${String(date.getMinutes()).padStart(2, '0')}`;
  if (jours <= 0) return `aujourd'hui à ${heure}`;
  if (jours === 1) return `hier à ${heure}`;
  const jourMois = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  return `il y a ${jours} jours (le ${jourMois} à ${heure})`;
}

export function lireDerniereSauvegarde(): Date | null {
  try {
    const valeur = localStorage.getItem(CLE_DERNIERE_SAUVEGARDE);
    if (!valeur) return null;
    const date = new Date(valeur);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}
