import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import DrivePage from '../features/sim/DrivePage'
import NewFolderModal from '../features/sim/NewFolderModal'
import UploadModal from '../features/sim/UploadModal'
import ActionsMenu from '../features/sim/ActionsMenu'
import RenameModal from '../features/sim/RenameModal'
import DeleteConfirmModal from '../features/sim/DeleteConfirmModal'
import { downloadSimFile, openSimFile } from '../features/sim/simStorage'
import { useSimRoot, filterByTerm } from '../features/sim/useSim'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import { canAccessSim, canEditSim, canDeleteSim } from '../lib/permissions'

export default function Sim() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { role, loading: roleLoading } = useRole()
  const { folders, files, loading: dataLoading, error, refetch } = useSimRoot()
  const [search, setSearch] = useState('')
  const [isNewFolderOpen, setNewFolderOpen] = useState(false)
  const [isUploadOpen, setUploadOpen] = useState(false)
  const [actionsTarget, setActionsTarget] = useState(null)
  const [renameTarget, setRenameTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const loading = roleLoading || dataLoading

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  // Garde de page : un associe ou un remplacant qui forcerait l'URL /sim est
  // bloque ici. La tuile leur est deja masquee par getVisibleModules cote Home.
  if (!canAccessSim(role)) {
    return (
      <AppLayout>
        <div className="px-5 py-12 text-center">
          <p className="text-marine font-semibold mb-1">Accès restreint</p>
          <p className="text-muted text-sm mb-4">
            Cet espace est réservé aux membres de la SIM.
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-canard text-sm font-semibold underline"
          >
            Retour à l'accueil
          </button>
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout>
        <p className="text-center text-brique py-12 px-5">
          Impossible de charger le contenu de la SIM.
        </p>
      </AppLayout>
    )
  }

  // Tout membre SIM peut creer un dossier / importer (droit "membre").
  const canWrite = canAccessSim(role)

  // ─── Calcul des droits par element ───────────────────────────────────────
  // Chaque dossier/fichier recoit un champ canMenu : l'icone "..." n'apparait
  // que si au moins une action est possible. Pour un fichier, "Telecharger" est
  // toujours dispo -> canMenu vrai. Pour un dossier, canMenu suit canEdit/Delete.
  const editArgs = { role, currentUserId: user?.id }

  const decoratedFolders = filterByTerm(folders, search).map((f) => {
    const canEdit = canEditSim({ ...editArgs, auteurId: f.auteurId })
    const canDelete = canDeleteSim({ ...editArgs, auteurId: f.auteurId })
    return { ...f, canEdit, canDelete, canMenu: canEdit || canDelete }
  })

  const decoratedFiles = filterByTerm(files, search).map((f) => {
    const canEdit = canEditSim({ ...editArgs, auteurId: f.auteurId })
    const canDelete = canDeleteSim({ ...editArgs, auteurId: f.auteurId })
    // Un fichier a toujours au moins "Telecharger" -> menu toujours ouvrable.
    return { ...f, canEdit, canDelete, canMenu: true }
  })

  const isSearching = search.trim().length > 0

  const handleFileDownload = async (id, nom) => {
    try {
      await downloadSimFile(id, nom)
    } catch (e) {
      console.error('Telechargement echoue', e)
      alert('Erreur lors du téléchargement.')
    }
  }

  const handleFileOpen = async (id, nom, mimeType) => {
    try {
      await openSimFile(id, nom, mimeType)
    } catch (e) {
      console.error('Ouverture echouee', e)
      alert("Erreur lors de l'ouverture du fichier.")
    }
  }

  // Ouverture du menu d'actions : on retrouve l'element decore (avec ses droits)
  // et on n'ouvre le menu que s'il y a quelque chose a faire.
  const handleMenuFolder = (id) => {
    const f = decoratedFolders.find((x) => x.id === id)
    if (!f || !f.canMenu) return
    setActionsTarget({
      kind: 'folder',
      id: f.id,
      name: f.name,
      canEdit: f.canEdit,
      canDelete: f.canDelete,
    })
  }

  const handleMenuFile = (id) => {
    const f = decoratedFiles.find((x) => x.id === id)
    if (!f) return
    setActionsTarget({
      kind: 'file',
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      canEdit: f.canEdit,
      canDelete: f.canDelete,
    })
  }

  const goToRename = () => {
    setRenameTarget(actionsTarget)
    setActionsTarget(null)
  }

  const goToDelete = () => {
    setDeleteTarget(actionsTarget)
    setActionsTarget(null)
  }

  const goToDownloadFromMenu = async () => {
    if (!actionsTarget || actionsTarget.kind !== 'file') return
    const t = actionsTarget
    setActionsTarget(null)
    await handleFileDownload(t.id, t.name)
  }

  return (
    <AppLayout>
      <DrivePage
        trail={['SIM']}
        subtitle="Société d'Intendance Médicale"
        accent="#6B7A3A"
        folders={decoratedFolders}
        files={decoratedFiles}
        search={search}
        onSearchChange={setSearch}
        isSearching={isSearching}
        canWrite={canWrite}
        compact
        onBack={() => navigate('/')}
        onOpenFolder={(id) => navigate(`/sim/${id}`)}
        onOpenFile={handleFileOpen}
        onDownloadFile={handleFileDownload}
        onMenuFolder={handleMenuFolder}
        onMenuFile={handleMenuFile}
        onUpload={() => setUploadOpen(true)}
        onNewFolder={() => setNewFolderOpen(true)}
      />
      {isNewFolderOpen && (
        <NewFolderModal
          parentId={null}
          onClose={() => setNewFolderOpen(false)}
          onCreated={() => { setNewFolderOpen(false); refetch() }}
        />
      )}
      {isUploadOpen && (
        <UploadModal
          dossierId={null}
          dossierName={null}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => { setUploadOpen(false); refetch() }}
        />
      )}
      {actionsTarget && (
        <ActionsMenu
          kind={actionsTarget.kind}
          name={actionsTarget.name}
          canEdit={actionsTarget.canEdit}
          canDelete={actionsTarget.canDelete}
          onClose={() => setActionsTarget(null)}
          onRename={goToRename}
          onDownload={actionsTarget.kind === 'file' ? goToDownloadFromMenu : undefined}
          onDelete={goToDelete}
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
    </AppLayout>
  )
}
