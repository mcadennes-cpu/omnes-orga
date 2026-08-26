import { STATUS_STYLES } from './statusStyles';

// ---------------------------------------------------------------------------
// Mise en mots du journal d'activité (MOD2-C).
//
// Le journal enregistre des FAITS — quelle table, quelle opération, quelles
// lignes avant et après. Il ne stocke aucune phrase : une formulation figée en
// base ne se corrige qu'avec une migration, et se serait retrouvée à répéter la
// logique métier en SQL. La mise en mots vit donc ici, en un seul endroit.
//
// Principe de rédaction : dire ce qui s'est passé, sans l'interpréter. Quand une
// action a réécrit des lignes sans rien y changer, on l'écrit — c'est justement
// ce qu'on veut voir.
// ---------------------------------------------------------------------------

export type TableJournalisee =
  | 'shifts'
  | 'requests'
  | 'fixed_duty_series'
  | 'rotation_plans'
  // Tables de parametrage, journalisees depuis MOD2-F-4.
  | 'sites'
  | 'rooms'
  | 'shift_types';

/** Forme commune aux trois tables de parametrage (voir journal_extrait). */
export type LigneParametre = {
  nom?: string;
  actif?: boolean;
  horaire?: string;
  couleur?: string;
  ordre?: number;
  site?: string;
};

export type LigneGarde = {
  jour?: string;
  statut?: string;
  medecin?: string | null;
  site?: string;
  creneau?: string;
  supprimee?: boolean;
};

export type LigneDemande = {
  garde?: string;
  medecin?: string | null;
  statut?: string;
};

export type EntreeJournal = {
  id: number;
  txid: number;
  occurred_at: string;
  actor_id: string | null;
  actor_nom: string | null;
  table_name: TableJournalisee;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  row_count: number;
  payload_truncated: boolean;
  undone_at: string | null;
  undone_par: string | null;
  avant: Record<string, any> | null;
  apres: Record<string, any> | null;
};

/** Un écart relevé par le garde-fou de `restaurer_action`. */
export type Conflit = {
  id: string;
  table: string;
  jour?: string;
  champ?: string;
  attendu?: string | null;
  actuel?: string | null;
  motif?: string;
};

export type RapportRestauration = {
  ok: boolean;
  ecrit: boolean;
  lignes: number;
  conflits: Conflit[];
};

const LIBELLE_CHAMP: Record<string, string> = {
  status: 'le statut',
  assigned_doctor_id: 'le médecin',
  deleted_at: 'la suppression',
  coordinator_note: 'la note',
};

// Les valeurs brutes de la base sont en anglais ; l'écran, lui, parle
// français. Pour les gardes on reprend les libellés de STATUS_STYLES, source
// unique des états depuis l'étape 4, plutôt que d'en réécrire une seconde
// série qui divergerait tôt ou tard.
//
// « pending » est le seul cas que STATUS_STYLES ne tranche pas : il y distingue
// « demandes en attente » de « pré-validé » selon le nombre de demandes, alors
// que le journal n'a que la valeur de la colonne. On s'en tient au sens de la
// colonne, sans surinterpréter.
const STATUT_GARDE: Record<string, string> = {
  free: STATUS_STYLES.libre.label,
  assigned: STATUS_STYLES.assigne.label,
  pending: 'En attente',
};

const STATUT_DEMANDE: Record<string, string> = {
  pending: 'En attente',
  on_hold: 'Pré-validée',
  approved: 'Validée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
};

export function libelleStatut(table: string, valeur?: string | null): string {
  if (!valeur) return '—';
  const table_ = table === 'requests' ? STATUT_DEMANDE : STATUT_GARDE;
  return table_[valeur] ?? valeur;
}

/** Met un conflit en français, pour la modale de confirmation. */
export function lireConflit(c: Conflit, nomMedecin: (id?: string | null) => string): string {
  if (c.motif) return `${formaterJour(c.jour)} — ${c.motif}`;
  const quoi = LIBELLE_CHAMP[c.champ ?? ''] ?? c.champ;
  const valeur = (v?: string | null) =>
    c.champ === 'assigned_doctor_id'
      ? nomMedecin(v)
      : c.champ === 'deleted_at'
        ? (v ? 'supprimée' : 'active')
        : c.champ === 'status'
          ? libelleStatut(c.table, v)
          : (v ?? '—');
  return `${formaterJour(c.jour)} — ${quoi} a changé depuis : `
    + `${valeur(c.attendu)} → ${valeur(c.actuel)}`;
}

/** Nature de l'action, pour la pastille de couleur et le filtre. */
export type Nature =
  | 'creation'
  | 'suppression'
  | 'restauration'
  | 'attribution'
  | 'liberation'
  | 'demande'
  | 'roulement'
  | 'autre';

export type ActionLue = {
  nature: Nature;
  texte: string;
  /** Précision affichée en gris sous la phrase, quand il y a lieu. */
  precision?: string;
};

const s = (n: number, singulier: string, pluriel = singulier + 's') =>
  `${n} ${n > 1 ? pluriel : singulier}`;

function joindre(parties: string[]): string {
  if (parties.length <= 1) return parties[0] ?? '';
  return parties.slice(0, -1).join(', ') + ' et ' + parties[parties.length - 1];
}

export function formaterJour(iso?: string): string {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

// --- Gardes ----------------------------------------------------------------

type DiffGardes = {
  supprimees: number;
  restaurees: number;
  liberees: number;
  attribuees: number;
  reattribuees: number;
  statut: number;
  inchangees: number;
};

function diffGardes(avant: Record<string, LigneGarde> | null,
                    apres: Record<string, LigneGarde> | null): DiffGardes {
  const d: DiffGardes = {
    supprimees: 0, restaurees: 0, liberees: 0,
    attribuees: 0, reattribuees: 0, statut: 0, inchangees: 0,
  };
  const ids = Object.keys(apres ?? avant ?? {});
  for (const id of ids) {
    const a = avant?.[id];
    const b = apres?.[id];
    if (!a || !b) continue;

    if (!a.supprimee && b.supprimee) { d.supprimees++; continue; }
    if (a.supprimee && !b.supprimee) { d.restaurees++; continue; }

    const medAvant = a.medecin ?? null;
    const medApres = b.medecin ?? null;
    if (medAvant && !medApres) { d.liberees++; continue; }
    if (!medAvant && medApres) { d.attribuees++; continue; }
    if (medAvant && medApres && medAvant !== medApres) { d.reattribuees++; continue; }

    if (a.statut !== b.statut) { d.statut++; continue; }
    d.inchangees++;
  }
  return d;
}

function lireGardes(e: EntreeJournal): ActionLue {
  if (e.operation === 'INSERT') {
    return { nature: 'creation', texte: `a créé ${s(e.row_count, 'garde')}` };
  }
  if (e.operation === 'DELETE') {
    return {
      nature: 'suppression',
      texte: `a supprimé définitivement ${s(e.row_count, 'garde')}`,
      precision: 'Suppression réelle — hors application',
    };
  }

  const d = diffGardes(e.avant, e.apres);
  const parties: string[] = [];
  if (d.supprimees) parties.push(`a supprimé ${s(d.supprimees, 'garde')}`);
  if (d.restaurees) parties.push(`a restauré ${s(d.restaurees, 'garde')}`);
  if (d.liberees) parties.push(`a libéré ${s(d.liberees, 'garde')}`);
  if (d.attribuees) parties.push(`a attribué ${s(d.attribuees, 'garde')}`);
  if (d.reattribuees) parties.push(`a réattribué ${s(d.reattribuees, 'garde')}`);
  if (d.statut) parties.push(`a changé le statut de ${s(d.statut, 'garde')}`);

  // Tout a été réécrit sans qu'aucune ligne ne change : le cas de figure que le
  // journal a mis au jour dès son premier jour (« annuler l'assignation » sur
  // une série réécrit toute la série pour libérer une garde). On le dit.
  if (parties.length === 0) {
    return {
      nature: 'autre',
      texte: `a réécrit ${s(e.row_count, 'garde')} sans rien y changer`,
      precision: 'Aucune valeur modifiée — action plus large que son effet',
    };
  }

  const nature: Nature =
    d.supprimees ? 'suppression'
    : d.restaurees ? 'restauration'
    : d.attribuees || d.reattribuees ? 'attribution'
    : d.liberees ? 'liberation'
    : 'autre';

  return {
    nature,
    texte: joindre(parties),
    precision: d.inchangees
      ? `${s(d.inchangees, 'autre garde réécrite', 'autres gardes réécrites')} sans changement`
      : undefined,
  };
}

// --- Demandes --------------------------------------------------------------

const VERBE_STATUT: Record<string, string> = {
  approved: 'a validé',
  on_hold: 'a pré-validé',
  rejected: 'a refusé',
  // « retiré » et non « annulé » : dans ce module, annuler = défaire une
  // action (MOD2-F). Une demande, elle, se retire.
  cancelled: 'a retiré',
  pending: 'a remis en attente',
};

function lireDemandes(e: EntreeJournal): ActionLue {
  if (e.operation === 'INSERT') {
    return { nature: 'demande', texte: `a demandé ${s(e.row_count, 'garde')}` };
  }
  if (e.operation === 'DELETE') {
    return { nature: 'suppression', texte: `a supprimé ${s(e.row_count, 'demande')}` };
  }

  const compte = new Map<string, number>();
  for (const [id, apres] of Object.entries((e.apres ?? {}) as Record<string, LigneDemande>)) {
    const avant = (e.avant ?? {})[id] as LigneDemande | undefined;
    if (avant && avant.statut === apres.statut) continue;
    const verbe = VERBE_STATUT[apres.statut ?? ''] ?? 'a modifié';
    compte.set(verbe, (compte.get(verbe) ?? 0) + 1);
  }

  if (compte.size === 0) {
    return { nature: 'autre', texte: `a réécrit ${s(e.row_count, 'demande')} sans rien y changer` };
  }

  const parties = [...compte].map(([verbe, n]) => `${verbe} ${s(n, 'demande')}`);
  return { nature: 'demande', texte: joindre(parties) };
}

// --- Séries et plans de roulement ------------------------------------------

function premiereValeur<T>(obj: Record<string, T> | null): T | undefined {
  return obj ? Object.values(obj)[0] : undefined;
}

function lireSeries(e: EntreeJournal): ActionLue {
  const nom = (premiereValeur(e.apres) as any)?.nom
    ?? (premiereValeur(e.avant) as any)?.nom;
  const intitule = nom ? `la série « ${nom} »` : s(e.row_count, 'série');

  if (e.operation === 'INSERT') return { nature: 'creation', texte: `a créé ${intitule}` };
  if (e.operation === 'DELETE') {
    return { nature: 'suppression', texte: `a supprimé définitivement ${intitule}` };
  }

  const avant = premiereValeur(e.avant) as any;
  const apres = premiereValeur(e.apres) as any;
  if (avant && apres && !avant.supprimee && apres.supprimee) {
    return { nature: 'suppression', texte: `a supprimé ${intitule}` };
  }
  if (avant && apres && avant.supprimee && !apres.supprimee) {
    return { nature: 'restauration', texte: `a restauré ${intitule}` };
  }
  return { nature: 'autre', texte: `a modifié ${intitule}` };
}

function lirePlans(e: EntreeJournal): ActionLue {
  const nom = (premiereValeur(e.apres) as any)?.nom
    ?? (premiereValeur(e.avant) as any)?.nom;
  const intitule = nom ? `le plan « ${nom} »` : 'un plan de roulement';

  if (e.operation === 'INSERT') return { nature: 'roulement', texte: `a importé ${intitule}` };
  if (e.operation === 'DELETE') return { nature: 'roulement', texte: `a supprimé ${intitule}` };

  const avant = (premiereValeur(e.avant) as any)?.statut;
  const apres = (premiereValeur(e.apres) as any)?.statut;
  if (avant !== apres) {
    if (apres === 'active') return { nature: 'roulement', texte: `a activé ${intitule}` };
    if (apres === 'archived') return { nature: 'roulement', texte: `a archivé ${intitule}` };
  }
  return { nature: 'roulement', texte: `a modifié ${intitule}` };
}

// --- Paramètres : sites, salles, horaires (MOD2-F-4) ------------------------

// Ces trois tables partagent « nom » et « actif », d'où un lecteur unique.
// Elles n'ont pas de suppression douce : un DELETE y est définitif, et c'est
// exactement pourquoi le journal les couvre depuis le 24/08/2026 — la
// suppression de « J6 Beaune » n'avait laissé aucune trace.
const INTITULE_PARAMETRE: Record<string, { article: string; nom: string }> = {
  sites: { article: 'le', nom: 'site' },
  rooms: { article: 'la', nom: 'salle' },
  shift_types: { article: "l'", nom: 'horaire' },
};

function lireParametres(e: EntreeJournal): ActionLue {
  const { article, nom: quoi } = INTITULE_PARAMETRE[e.table_name];
  const apres = premiereValeur(e.apres) as LigneParametre | undefined;
  const avant = premiereValeur(e.avant) as LigneParametre | undefined;

  const nom = apres?.nom ?? avant?.nom;
  const horaire = e.table_name === 'shift_types' ? (apres?.horaire ?? avant?.horaire) : undefined;
  const suffixe = horaire ? ` (${horaire})` : '';
  const intitule = nom
    ? `${article}${article === "l'" ? '' : ' '}${quoi} « ${nom} »${suffixe}`
    : s(e.row_count, quoi);

  if (e.operation === 'INSERT') return { nature: 'creation', texte: `a créé ${intitule}` };
  if (e.operation === 'DELETE') {
    return {
      nature: 'suppression',
      texte: `a supprimé ${intitule}`,
      // Ces tables n'ont pas de deleted_at : rien à restaurer d'un clic. On le
      // dit ici plutôt que de laisser croire le contraire.
      precision: 'Suppression définitive — non restaurable depuis le Journal',
    };
  }

  // UPDATE : on nomme ce qui a bougé plutôt que d'écrire « a modifié ».
  if (avant && apres) {
    if (avant.actif && !apres.actif) return { nature: 'autre', texte: `a désactivé ${intitule}` };
    if (!avant.actif && apres.actif) return { nature: 'autre', texte: `a réactivé ${intitule}` };
    if (avant.nom && apres.nom && avant.nom !== apres.nom) {
      return { nature: 'autre', texte: `a renommé ${article}${article === "l'" ? '' : ' '}${quoi} « ${avant.nom} » en « ${apres.nom} »` };
    }
    if (avant.horaire && apres.horaire && avant.horaire !== apres.horaire) {
      return {
        nature: 'autre',
        texte: `a changé l'horaire de « ${apres.nom ?? avant.nom} »`,
        precision: `${avant.horaire} → ${apres.horaire}`,
      };
    }
  }
  return { nature: 'autre', texte: `a modifié ${intitule}` };
}

// --- Entrée publique --------------------------------------------------------

export function lireEntree(e: EntreeJournal): ActionLue {
  if (e.payload_truncated) {
    return {
      nature: 'autre',
      texte: `a modifié ${s(e.row_count, 'ligne')} (${e.table_name})`,
      precision: 'Opération trop volumineuse pour être détaillée',
    };
  }
  switch (e.table_name) {
    case 'shifts': return lireGardes(e);
    case 'requests': return lireDemandes(e);
    case 'fixed_duty_series': return lireSeries(e);
    case 'rotation_plans': return lirePlans(e);
    case 'sites':
    case 'rooms':
    case 'shift_types': return lireParametres(e);
    default: return { nature: 'autre', texte: `a modifié ${s(e.row_count, 'ligne')}` };
  }
}

/** Couleurs de pastille, alignées sur les tokens de la charte. */
export const STYLE_NATURE: Record<Nature, { pastille: string; texte: string; libelle: string }> = {
  creation:      { pastille: 'bg-canard/15',  texte: 'text-canard',      libelle: 'Créations' },
  suppression:   { pastille: 'bg-brique/15',  texte: 'text-brique',      libelle: 'Suppressions' },
  restauration:  { pastille: 'bg-olive/15',   texte: 'text-olive',       libelle: 'Restaurations' },
  attribution:   { pastille: 'bg-marine/10',  texte: 'text-marine',      libelle: 'Attributions' },
  liberation:    { pastille: 'bg-ocre/15',    texte: 'text-ocre-fonce',  libelle: 'Libérations' },
  demande:       { pastille: 'bg-fuchsia/15', texte: 'text-fuchsia',     libelle: 'Demandes' },
  roulement:     { pastille: 'bg-marine/10',  texte: 'text-marine',      libelle: 'Roulement' },
  autre:         { pastille: 'bg-faint/20',   texte: 'text-muted',       libelle: 'Autres' },
};
