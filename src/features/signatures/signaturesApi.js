// src/features/signatures/signaturesApi.js
//
// Acces aux donnees du module Signatures (etape 24).
//
// Deux voies, volontairement separees :
//   - le BROUILLON se prepare directement en base (tables + bucket), sous
//     RLS : creer, renommer, deposer le PDF, choisir les signataires ;
//   - tout le reste passe par l'Edge Function `signature` (envoi, code,
//     signature, refus, relance, annulation, scellement), seule autorisee a
//     ecrire statuts et preuves.
//
// Colonnes listees explicitement : sur signature_signataires et
// signature_journal, ip et user_agent ne sont pas lisibles par l'appli
// (droits par colonne, 24A-2), donc `select('*')` serait refuse.

import { supabase } from '../../lib/supabaseClient'
import { openOrDownload } from '../../lib/storageOpen'

export const BUCKET = 'signatures'
export const TAILLE_MAX = 20 * 1024 * 1024

export const COLONNES_SIGNATAIRE =
  'id, demande_id, profil_id, ordre, qualite, statut, nom_fige, consulte_at, ' +
  'signe_at, refuse_at, motif_refus, derniere_relance_at, nb_relances'

export const COLONNES_JOURNAL = 'id, evenement, acteur_id, signataire_id, details, created_at'

/** Appelle l'Edge Function. Renvoie la reponse, ou leve une Error affichable. */
export async function appelerSignature(action, demandeId, params = {}) {
  const { data, error } = await supabase.functions.invoke('signature', {
    body: { action, demandeId, ...params },
  })
  if (error) {
    // Erreur HTTP (401, 500...) : on tente de lire le message du serveur.
    let message = 'Le serveur ne répond pas. Vérifiez votre connexion et réessayez.'
    try {
      const corps = await error.context?.json?.()
      if (corps?.erreur) message = corps.erreur
    } catch {
      // corps illisible : message par defaut
    }
    throw new Error(message)
  }
  if (!data?.ok) throw new Error(data?.erreur || "L'action n'a pas pu aboutir.")
  return data
}

/** Depose (ou remplace) le PDF source d'un brouillon. */
export async function deposerSource(demandeId, fichier) {
  if (!fichier) throw new Error('Aucun fichier choisi.')
  const estPdf = fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name)
  if (!estPdf) throw new Error('Seuls les fichiers PDF peuvent être signés.')
  if (fichier.size > TAILLE_MAX) throw new Error('Le fichier dépasse 20 Mo.')

  const chemin = `${demandeId}/source.pdf`
  const { error: errUpload } = await supabase.storage
    .from(BUCKET)
    .upload(chemin, fichier, { upsert: true, contentType: 'application/pdf' })
  if (errUpload) throw new Error("Le dépôt du fichier a échoué. Réessayez.")

  const { error } = await supabase
    .from('signature_demandes')
    .update({ source_chemin: chemin, source_nom: fichier.name, source_taille: fichier.size })
    .eq('id', demandeId)
  if (error) throw new Error("Le fichier est déposé mais la demande n'a pas pu être mise à jour.")
}

/** Ouvre le PDF (source ou final). Un signataire qui ouvre la source est
 *  inscrit au journal « ouverture du document » (condition pour signer). */
export async function ouvrirDocument({ demande, final = false, marquerConsulte = false }) {
  if (marquerConsulte) {
    // Avant l'ouverture : sur iPhone, l'ouverture fait quitter la page.
    await supabase.rpc('signature_marquer_consulte', { p_demande_id: demande.id })
  }
  const chemin = final ? demande.final_chemin : demande.source_chemin
  if (!chemin) throw new Error('Document indisponible.')
  const base = (demande.source_nom || 'document.pdf').replace(/\.pdf$/i, '')
  await openOrDownload({
    supabase,
    bucket: BUCKET,
    storagePath: chemin,
    filename: final ? `${base} - signé.pdf` : `${base}.pdf`,
    mimeType: 'application/pdf',
  })
}

// --- Etape « saisie du code » memorisee (16/11/2026) ----------------------
// Sur iPhone, aller lire le code dans Mail peut recharger la page Safari au
// retour (onglet decharge par iOS). Sans memoire, la feuille se refermait et
// le signataire redemandait un code en boucle. On garde donc 10 minutes (la
// duree de vie du code), dans l'onglet seulement, que le code a ete envoye.
// Rien de secret ici : ni le code, ni le texte, juste l'e-mail masque.
const CLE_CODE = (demandeId) => `omnes-signature-code:${demandeId}`
const DUREE_CODE_MS = 10 * 60 * 1000

export function memoriserCodeEnvoye(demandeId, email) {
  try {
    sessionStorage.setItem(CLE_CODE(demandeId), JSON.stringify({ email, at: Date.now() }))
  } catch {
    // stockage indisponible (navigation privee...) : simple confort perdu
  }
}

export function codeEnCours(demandeId) {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLE_CODE(demandeId)) || 'null')
    if (v && Date.now() - v.at < DUREE_CODE_MS) return v
  } catch {
    // ignore
  }
  return null
}

export function oublierCode(demandeId) {
  try {
    sessionStorage.removeItem(CLE_CODE(demandeId))
  } catch {
    // ignore
  }
}
