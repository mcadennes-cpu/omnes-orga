// Donnees Cabinet pratique — hardcodees pour 6E-2.
// A remplacer par des hooks Supabase en 6E-3+.

const FOLDERS = {
  protocoles: {
    name: 'Protocoles',
    accent: '#D4503A',
    folders: [],
    files: [
      { name: 'Protocole-gestes-barrieres-v3.pdf', author: 'Jean-Paul Renard', when: 'hier' },
      { name: 'Affiche-lavage-mains.png',           author: 'Sophie Bernard',   when: 'il y a 2 j' },
      { name: 'Tableau-suivi-stocks.xlsx',          author: 'Léa Martin',       when: 'il y a 5 j' },
      { name: 'Note-direction.docx',                author: 'Camille Dubois',   when: 'il y a 1 sem.' },
    ],
  },
  administratif: {
    name: 'Administratif',
    accent: '#2A8FA8',
    folders: [],
    files: [
      { name: 'Statuts-cabinet-2024.pdf', author: 'Léa Martin',     when: 'il y a 1 mois' },
      { name: 'Bail-local.pdf',           author: 'Camille Dubois', when: 'il y a 3 mois' },
    ],
  },
  rh: {
    name: 'RH',
    accent: '#E8A135',
    folders: [],
    files: [
      { name: 'Convention-collective.pdf',  author: 'Camille Dubois', when: 'il y a 6 mois' },
      { name: 'Planning-equipe-2025.xlsx',  author: 'Léa Martin',     when: 'la semaine dernière' },
    ],
  },
  hygiene: {
    name: 'Hygiène',
    accent: '#6B7A3A',
    folders: [],
    files: [],  // dossier vide — declenche l'etat DriveEmpty
  },
}

// Vue racine — derivee de FOLDERS pour eviter la duplication.
export const ROOT = {
  trail: ['Cabinet pratique'],
  accent: '#1C3D52',
  folders: Object.entries(FOLDERS).map(([slug, f]) => ({
    slug,
    name: f.name,
    accent: f.accent,
    count: f.folders.length + f.files.length,
  })),
  files: [
    { name: 'Charte-cabinet.pdf',           author: 'Léa Martin',     when: 'il y a 3 j' },
    { name: 'Reglement-interieur-2024.pdf', author: 'Camille Dubois', when: 'le 12 mars' },
  ],
}

// Recupere les donnees d'un sous-dossier par slug. Retourne null si inconnu.
export function getSubfolder(slug) {
  const f = FOLDERS[slug]
  if (!f) return null
  return {
    trail: ['Cabinet pratique', f.name],
    accent: f.accent,
    folders: f.folders,
    files: f.files,
  }
}
