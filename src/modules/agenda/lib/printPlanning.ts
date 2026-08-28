import { supabase } from './supabase';
import { getRotationPlans, getPlanForDate, getRotationWeek } from './rotationUtils';

// ---------------------------------------------------------------------------
// Planning a imprimer (8B-3).
//
// CE QU'IL REMPLACE
// L'export « Matrice » produisait un CSV que le tableur affichait sans mise en
// forme, avec deux defauts propres a ce format : les libelles de lignes
// repetaient le site (« J1 BEAUNE BEAUNE » -- le nom du creneau le porte deja),
// et une garde non pourvue affichait le NOMBRE de demandes en attente a la
// place du nom, si bien qu'un chiffre et un nom partageaient la meme colonne.
//
// CE QU'IL PRODUIT
// Un document HTML autonome, en noir et blanc, calque sur la grille de la vue
// Semaine : salles en lignes, jours en colonnes. Une semaine par page, en
// paysage. Aucune dependance ajoutee -- c'est le navigateur qui imprime.
//
// POURQUOI DU HTML ET PAS UN PDF
// Produire un PDF supposerait une bibliotheque (jsPDF...), donc une
// installation. Le navigateur sait deja imprimer une page et proposer
// « Enregistrer au format PDF » dans sa propre boite d'impression : la
// fonctionnalite est acquise sans rien ajouter au projet.
// ---------------------------------------------------------------------------

type PrintOptions = {
  startDate: string;
  endDate: string;
};

type PrintResult = {
  success: boolean;
  html?: string;
  error?: string;
};

type GardeImprimable = {
  date: string;
  salle: string;
  site: string;
  creneau: string;
  medecin: string | null;
  note: string | null;
  demandes: number;
};

const JOURS_COURTS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

function versDate(iso: string): Date {
  return new Date(iso + 'T12:00:00');
}

function versIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lundi de la semaine contenant `d`. La semaine du cabinet va du lundi au dimanche. */
function lundiDeLaSemaine(d: Date): Date {
  const lundi = new Date(d);
  const jour = lundi.getDay();
  lundi.setDate(lundi.getDate() - (jour === 0 ? 6 : jour - 1));
  return lundi;
}

function enteteJour(d: Date): string {
  return `${JOURS_COURTS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dateLongue(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Tout texte venant de la base traverse cette fonction avant d'entrer dans le
// document : un nom de medecin ou une note de coordination sont de la saisie
// libre, et le document est construit par concatenation de chaines.
function echapper(texte: string | null | undefined): string {
  if (!texte) return '';
  return String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Le nom du creneau porte deja le site (« J1 Beaune ») : on le retire pour
// eviter la repetition qui alourdissait l'ancien export. Meme traitement que
// dans OpenWeeksModal.
function codeCourt(creneau: string, site: string): string {
  return creneau.replace(new RegExp(site, 'i'), '').replace(/\s+/g, ' ').trim() || creneau;
}

const STYLES = `
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #000;
    background: #fff;
    font-size: 10pt;
  }
  .barre {
    padding: 12px 16px;
    border-bottom: 1px solid #000;
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }
  .barre button {
    font: inherit;
    padding: 8px 18px;
    border: 1px solid #000;
    background: #fff;
    cursor: pointer;
    border-radius: 4px;
  }
  .contenu { padding: 8px 16px 16px; }
  .semaine { page-break-after: always; break-after: page; }
  .semaine:last-child { page-break-after: auto; break-after: auto; }
  h1 { font-size: 13pt; margin: 12px 0 2px; }
  .roulement { font-size: 9pt; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td {
    border: 1px solid #000;
    padding: 3px 4px;
    vertical-align: top;
    text-align: left;
  }
  thead th { background: #e8e8e8; font-size: 9pt; text-align: center; }
  th.salle { width: 90px; background: #e8e8e8; font-size: 9pt; }
  td.salle { font-weight: 600; font-size: 9pt; vertical-align: middle; }
  .garde { padding: 2px 0; }
  .garde + .garde { border-top: 1px dotted #999; margin-top: 2px; }
  .creneau { font-weight: 600; font-size: 8.5pt; }
  .medecin { font-size: 9pt; }
  .vide { font-size: 8.5pt; font-style: italic; color: #555; }
  .note { font-size: 7.5pt; font-style: italic; color: #333; }
  .pied { margin-top: 8px; font-size: 8pt; color: #333; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  @media print {
    .barre { display: none; }
    .contenu { padding: 0; }
  }
`;

/**
 * Construit le document imprimable. Ne l'ouvre pas : c'est l'appelant qui
 * possede la fenetre, laquelle doit etre ouverte AVANT tout `await` sous peine
 * d'etre bloquee comme une popup.
 */
export async function construirePlanningImprimable(options: PrintOptions): Promise<PrintResult> {
  try {
    const { data, error } = await supabase
      .from('shifts')
      .select(`
        date,
        location,
        room,
        status,
        coordinator_note,
        shift_type_data:shift_types!shift_type_id(name),
        assigned_doctor:profiles!assigned_doctor_id(full_name),
        requests(id, status)
      `)
      .gte('date', options.startDate)
      .lte('date', options.endDate)
      .order('date', { ascending: true });

    if (error) {
      console.error('[Impression] Erreur de chargement :', error);
      return { success: false, error: 'Erreur lors de la récupération des données.' };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Aucune garde trouvée sur cette période.' };
    }

    const gardes: GardeImprimable[] = data.map((g: any) => ({
      date: g.date,
      salle: g.room || '',
      site: g.location || '',
      creneau: g.shift_type_data?.name || '',
      medecin: g.assigned_doctor?.full_name ?? null,
      note: g.coordinator_note ?? null,
      // Une demande en attente ou en pre-validation : le compte n'est affiche
      // que faute de medecin, et toujours accompagne du mot « demande » --
      // c'est ce qui manquait a l'ancien export, ou un « 1 » nu occupait la
      // colonne des noms.
      demandes: Array.isArray(g.requests)
        ? g.requests.filter((r: any) => r.status === 'pending' || r.status === 'on_hold').length
        : 0,
    }));

    const plans = await getRotationPlans();

    // Les semaines couvertes, du lundi de la premiere au dimanche de la
    // derniere. Les colonnes d'une semaine sont bornees a la periode demandee :
    // une periode commencant un mercredi ne fabrique pas deux colonnes vides.
    const debut = versDate(options.startDate);
    const fin = versDate(options.endDate);
    const semaines: Date[][] = [];
    const curseur = lundiDeLaSemaine(debut);
    while (curseur <= fin) {
      const jours: Date[] = [];
      for (let i = 0; i < 7; i++) {
        const jour = new Date(curseur);
        jour.setDate(curseur.getDate() + i);
        if (jour >= debut && jour <= fin) jours.push(jour);
      }
      if (jours.length > 0) semaines.push(jours);
      curseur.setDate(curseur.getDate() + 7);
    }

    const blocs = semaines.map((jours) => {
      const isoJours = jours.map(versIso);
      const gardesSemaine = gardes.filter((g) => isoJours.includes(g.date));

      // Les lignes : les salles reellement occupees cette semaine-la, comme a
      // l'ecran. Une salle sans garde ne fabrique pas une ligne vide.
      const salles = [...new Set(gardesSemaine.map((g) => g.salle))].sort();

      const plan = getPlanForDate(jours[0], plans);
      const roulement = plan
        ? `Semaine de roulement n°${getRotationWeek(jours[0], plan, {
            componentName: 'printPlanning',
            inputOrigin: `premier jour imprime : ${isoJours[0]}`,
          })} / ${plan.cycle_length_weeks}`
        : 'Aucun plan de roulement sur cette semaine';

      const entetes = jours
        .map((j) => `<th>${echapper(enteteJour(j))}</th>`)
        .join('');

      const lignes = salles
        .map((salle) => {
          const cellules = jours
            .map((jour) => {
              const iso = versIso(jour);
              const duJour = gardesSemaine.filter((g) => g.salle === salle && g.date === iso);
              if (duJour.length === 0) return '<td></td>';

              const contenu = duJour
                .map((g) => {
                  const titre = `<div class="creneau">${echapper(codeCourt(g.creneau, g.site))} · ${echapper(g.site)}</div>`;
                  let etat: string;
                  if (g.medecin) {
                    etat = `<div class="medecin">${echapper(g.medecin)}</div>`;
                  } else if (g.demandes > 0) {
                    etat = `<div class="vide">${g.demandes} demande${g.demandes > 1 ? 's' : ''}</div>`;
                  } else {
                    etat = '<div class="vide">libre</div>';
                  }
                  const note = g.note ? `<div class="note">${echapper(g.note)}</div>` : '';
                  return `<div class="garde">${titre}${etat}${note}</div>`;
                })
                .join('');

              return `<td>${contenu}</td>`;
            })
            .join('');

          return `<tr><td class="salle">${echapper(salle)}</td>${cellules}</tr>`;
        })
        .join('');

      const titre = jours.length === 1
        ? dateLongue(jours[0])
        : `${dateLongue(jours[0])} — ${dateLongue(jours[jours.length - 1])}`;

      // Une semaine sans garde garde sa page et le dit : un tableau aux
      // en-tetes vides laisserait croire a un defaut d'impression.
      const corps = salles.length === 0
        ? '<p class="vide">Aucune garde ouverte sur cette semaine.</p>'
        : `<table>
            <thead><tr><th class="salle">Salle</th>${entetes}</tr></thead>
            <tbody>${lignes}</tbody>
          </table>`;

      return `
        <section class="semaine">
          <h1>${echapper(titre)}</h1>
          <p class="roulement">${echapper(roulement)}</p>
          ${corps}
        </section>`;
    });

    const editeLe = new Date().toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Planning ${echapper(options.startDate)} au ${echapper(options.endDate)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="barre">
    <span>Planning OMNÈS MÉDECINS — ${echapper(dateLongue(debut))} au ${echapper(dateLongue(fin))}</span>
    <button type="button" onclick="window.print()">Imprimer</button>
  </div>
  <div class="contenu">
    ${blocs.join('')}
    <p class="pied">OMNÈS MÉDECINS — planning édité le ${echapper(editeLe)}.</p>
  </div>
</body>
</html>`;

    return { success: true, html };
  } catch (err) {
    console.error('[Impression] Erreur inattendue :', err);
    return { success: false, error: 'Une erreur inattendue est survenue.' };
  }
}
