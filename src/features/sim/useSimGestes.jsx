// src/features/sim/useSimGestes.jsx
//
// Gestes communs aux deux pages Drive du module Contrats (racine et
// sous-dossier) : ouvrir / telecharger, menus « ... », renommer, supprimer,
// et depuis l'etape 25 : faire signer un PDF, personnes concernees, ouvrir un
// dossier aux associes. Avant l'etape 25, Sim.jsx et SimFolder.jsx
// dupliquaient ce code ; il est regroupe ici pour ne l'ecrire qu'une fois.
//
// Le hook renvoie les fonctions a brancher sur DrivePage et `modales`, le
// JSX des feuilles a rendre a cote.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import {
  canAccessSim,
  canCreateSignature,
  canDeleteSim,
  canEditSim,
  canGererAccesSim,
} from '../../lib/permissions'
import ActionsMenu from './ActionsMenu'
import RenameModal from './RenameModal'
import DeleteConfirmModal from './DeleteConfirmModal'
import ConcernesSheet from './ConcernesSheet'
import { downloadSimFile, openSimFile } from './simStorage'
import DemandeFormModal from '../signatures/DemandeFormModal'
import { TAILLE_MAX, deposerSource } from '../signatures/signaturesApi'

function estPdf(f) {
  return f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.name || '')
}

export function useSimGestes({ role, refetch }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [actionsTarget, setActionsTarget] = useState(null)
  const [renameTarget, setRenameTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [concernesTarget, setConcernesTarget] = useState(null)
  const [signerTarget, setSignerTarget] = useState(null)

  // Tout membre SIM cree des dossiers et importe ; un associe lit seulement.
  const canWrite = canAccessSim(role)
  const superAdmin = canGererAccesSim(role)

  // ─── Droits par element ────────────────────────────────────────────────
  // canMenu : l'icone « ... » n'apparait que si une action est possible.
  // Un fichier a toujours « Telecharger » -> menu toujours ouvrable.
  function decorer(folders, files) {
    const args = { role, currentUserId: user?.id }
    return {
      folders: folders.map((f) => {
        const canEdit = canEditSim({ ...args, auteurId: f.auteurId })
        const canDelete = canDeleteSim({ ...args, auteurId: f.auteurId })
        return { ...f, canEdit, canDelete, canMenu: canEdit || canDelete || superAdmin }
      }),
      files: files.map((f) => {
        const canEdit = canEditSim({ ...args, auteurId: f.auteurId, signe: f.signe })
        const canDelete = canDeleteSim({ ...args, auteurId: f.auteurId, signe: f.signe })
        return { ...f, canEdit, canDelete, canMenu: true }
      }),
    }
  }

  async function handleFileDownload(id, nom) {
    try {
      await downloadSimFile(id, nom)
    } catch (e) {
      console.error('Telechargement echoue', e)
      alert('Erreur lors du téléchargement.')
    }
  }

  async function handleFileOpen(id, nom, mimeType) {
    try {
      await openSimFile(id, nom, mimeType)
    } catch (e) {
      console.error('Ouverture echouee', e)
      alert("Erreur lors de l'ouverture du fichier.")
    }
  }

  function ouvrirMenuDossier(f) {
    if (!f || !f.canMenu) return
    setActionsTarget({ kind: 'folder', ...f })
  }

  function ouvrirMenuFichier(f) {
    if (!f) return
    setActionsTarget({ kind: 'file', ...f })
  }

  async function basculerOuverture(dossier) {
    setActionsTarget(null)
    const { error } = await supabase
      .from('sim_dossiers')
      .update({ ouvert_associes: !dossier.ouvertAssocies })
      .eq('id', dossier.id)
    if (error) {
      console.error('Ouverture aux associes', error)
      alert("Le réglage n'a pas pu être enregistré.")
      return
    }
    refetch()
  }

  // « Faire signer » : brouillon cree avec ce PDF comme document et son
  // dossier comme destination ; le PDF est COPIE dans le bucket signatures
  // (l'original reste dans le SIM, la copie sera figee a l'envoi).
  async function creerDemande(valeurs, fichier) {
    const { data, error } = await supabase
      .from('signature_demandes')
      .insert({ ...valeurs, createur_id: user.id })
      .select('id')
      .single()
    if (error) throw new Error("La demande n'a pas pu être créée.")
    try {
      const { data: blob, error: errDl } = await supabase.storage.from('sim').download(fichier.id)
      if (errDl || !blob) throw errDl ?? new Error('vide')
      await deposerSource(data.id, new File([blob], fichier.name, { type: 'application/pdf' }))
    } catch (e) {
      // Le brouillon existe : on y va quand meme, le PDF pourra y etre depose.
      console.error('Copie du PDF vers la demande', e)
    }
    navigate(`/sim/signatures/${data.id}`)
  }

  const cible = actionsTarget
  const fichierCible = cible?.kind === 'file'
  const modales = (
    <>
      {cible && (
        <ActionsMenu
          kind={cible.kind}
          name={cible.name}
          canEdit={cible.canEdit}
          canDelete={cible.canDelete}
          onClose={() => setActionsTarget(null)}
          onRename={() => { setRenameTarget(cible); setActionsTarget(null) }}
          onDownload={fichierCible ? () => { setActionsTarget(null); handleFileDownload(cible.id, cible.name) } : undefined}
          onDelete={() => { setDeleteTarget(cible); setActionsTarget(null) }}
          onFaireSigner={
            fichierCible && canCreateSignature(role) && estPdf(cible) && !cible.signe
              ? () => {
                  setActionsTarget(null)
                  if (cible.tailleOctets > TAILLE_MAX) {
                    alert('Ce PDF dépasse 20 Mo : il ne peut pas être envoyé en signature.')
                    return
                  }
                  setSignerTarget(cible)
                }
              : undefined
          }
          onConcernes={
            fichierCible && superAdmin
              ? () => { setConcernesTarget(cible); setActionsTarget(null) }
              : undefined
          }
          onOuverture={!fichierCible && superAdmin ? () => basculerOuverture(cible) : undefined}
          ouvertAssocies={Boolean(cible.ouvertAssocies)}
        />
      )}
      {renameTarget && (
        <RenameModal
          kind={renameTarget.kind}
          id={renameTarget.id}
          currentName={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onRenamed={() => { setRenameTarget(null); refetch() }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          kind={deleteTarget.kind}
          id={deleteTarget.id}
          name={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); refetch() }}
        />
      )}
      <ConcernesSheet
        open={Boolean(concernesTarget)}
        fichier={concernesTarget ?? {}}
        onClose={() => setConcernesTarget(null)}
        onSaved={refetch}
      />
      <DemandeFormModal
        open={Boolean(signerTarget)}
        onClose={() => setSignerTarget(null)}
        prerempli={
          signerTarget
            ? { titre: signerTarget.name.replace(/\.pdf$/i, ''), sim_dossier_id: signerTarget.dossierId }
            : null
        }
        onSubmit={(valeurs) => creerDemande(valeurs, signerTarget)}
      />
    </>
  )

  return {
    canWrite,
    decorer,
    handleFileOpen,
    handleFileDownload,
    ouvrirMenuDossier,
    ouvrirMenuFichier,
    modales,
  }
}
