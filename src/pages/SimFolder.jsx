import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import DrivePage from '../features/sim/DrivePage'
import NewFolderModal from '../features/sim/NewFolderModal'
import UploadModal from '../features/sim/UploadModal'
import ActionsMenu from '../features/sim/ActionsMenu'
import RenameModal from '../features/sim/RenameModal'
import DeleteConfirmModal from '../features/sim/DeleteConfirmModal'
import { downloadSimFile, openSimFile } from '../features/sim/simStorage'
import { useSimFolder, filterByTerm } from '../features/sim/useSim'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import { canAccessSim, canEditSim, canDeleteSim } from '../lib/permissions'

export default function SimFolder() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useAuth()
  const { role, loading: roleLoading } = useRole()
  const { folder, folders, files, loading: dataLoading, error, notFound, refetch } =
    useSimFolder(id)
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

  // Garde de page : un associe ou un remplacant qui forcerait l'URL est bloque
  // ici. Meme garde qu'en racine SIM (cf. Sim.jsx).
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

  // Dossier introuvable (id invalide ou supprime entre temps) : retour racine.
  if (notFound) {
    return <Navigate to="/sim" replace />
  }

  if (error || !folder) {
    return (
      <AppLayout>
        <p className="text-center text-brique py-12 px-5">
          Impossible de charger ce dossier.
        </p>
      </AppLayout>
    )
  }

  // Tout membre SIM peut creer un dossier / importer (droit "membre").
  const canWrite = canAccessSim(role)

  // ─── Calcul des droits par element ───────────────────────────────────────
  // Meme decoration qu'en racine : canMenu n'apparait que si une action est
  // possible. Pour un fichier, "Telecharger" est toujours dispo -> canMenu vrai.
  const editArgs = { role, currentUserId: user?.id }

  const decoratedFolders = filterByTerm(folders, search).map((f) => {
    const canEdit = canEditSim({ ...editArgs, auteurId: f.auteurId })
    const canDelete = canDeleteSim({ ...editArgs, auteurId: f.auteurId })
    return { ...f, canEdit, canDelete, canMenu: canEdit || canDelete }
  })

  const decoratedFiles = filterByTerm(files, search).map((f) => {
    const canEdit = canEditSim({ ...editArgs, auteurId: f.auteurId })
    const canDelete = canDeleteSim({ ...editArgs, auteurId: f.auteurId })
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

  const handleMenuFolder = (childId) => {
    const f = decoratedFolders.find((x) => x.id === childId)
    if (!f || !f.canMenu) return
    setActionsTarget({
      kind: 'folder',
      id: f.id,
      name: f.name,
      canEdit: f.canEdit,
      canDelete: f.canDelete,
    })
  }

  const handleMenuFile = (childId) => {
    const f = decoratedFiles.find((x) => x.id === childId)
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
        // Breadcrumb a 2 segments comme Cabinet pratique : "SIM > NomDossier".
        // Le segment "SIM" est cliquable et ramene a la racine.
        trail={['SIM', folder.name]}
        // Accent = couleur du dossier courant (icone et CTA "Importer" prennent
        // sa teinte). En racine SIM, l'accent est olive ; ici, il suit le dossier.
        accent={folder.accent}
        folders={decoratedFolders}
        files={decoratedFiles}
        search={search}
        onSearchChange={setSearch}
        isSearching={isSearching}
        canWrite={canWrite}
        compact={false}
        onBack={() => navigate('/sim')}
        onCrumb={(i) => { if (i === 0) navigate('/sim') }}
        onOpenFolder={(childId) => navigate(`/sim/${childId}`)}
        onOpenFile={handleFileOpen}
        onDownloadFile={handleFileDownload}
        onMenuFolder={handleMenuFolder}
        onMenuFile={handleMenuFile}
        onUpload={() => setUploadOpen(true)}
        onNewFolder={() => setNewFolderOpen(true)}
      />
      {isNewFolderOpen && (
        <NewFolderModal
          parentId={folder.id}
          onClose={() => setNewFolderOpen(false)}
          onCreated={() => { setNewFolderOpen(false); refetch() }}
        />
      )}
      {isUploadOpen && (
        <UploadModal
          dossierId={folder.id}
          dossierName={folder.name}
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
