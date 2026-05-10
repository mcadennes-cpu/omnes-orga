import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import DrivePage from '../features/cabinet/DrivePage'
import NewFolderModal from '../features/cabinet/NewFolderModal'
import UploadModal from '../features/cabinet/UploadModal'
import ActionsMenu from '../features/cabinet/ActionsMenu'
import RenameModal from '../features/cabinet/RenameModal'
import DeleteConfirmModal from '../features/cabinet/DeleteConfirmModal'
import { downloadCabinetFile, openCabinetFile } from '../features/cabinet/cabinetStorage'
import { useCabinetFolder, useCabinetSearch } from '../features/cabinet/useCabinet'
import { useRole } from '../hooks/useRole'
import { canEditCabinet } from '../lib/permissions'

export default function CabinetFolder() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { role, loading: roleLoading } = useRole()
  const { folder, folders, files, loading: dataLoading, error, notFound, refetch } =
    useCabinetFolder(id)
  const [search, setSearch] = useState('')
  const searchResults = useCabinetSearch(search)
  const isSearching = searchResults.isActive
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

  if (notFound) {
    return <Navigate to="/cabinet" replace />
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

  const canWrite = canEditCabinet(role)

  const handleFileDownload = async (id, nom) => {
    try {
      await downloadCabinetFile(id, nom)
    } catch (e) {
      console.error('Telechargement echoue', e)
      alert('Erreur lors du téléchargement.')
    }
  }

  const handleFileOpen = async (id, nom, mimeType) => {
    try {
      await openCabinetFile(id, nom, mimeType)
    } catch (e) {
      console.error('Ouverture echouee', e)
      alert("Erreur lors de l'ouverture du fichier.")
    }
  }

  const handleMenuFolder = (id, name) => {
    setActionsTarget({ kind: 'folder', id, name })
  }

  const handleMenuFile = (id, name, mimeType) => {
    setActionsTarget({ kind: 'file', id, name, mimeType })
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
        trail={['Cabinet pratique', folder.name]}
        accent={folder.accent}
        folders={isSearching ? searchResults.folders : folders}
        files={isSearching ? searchResults.files : files}
        search={search}
        onSearchChange={setSearch}
        isSearching={isSearching}
        canWrite={canWrite}
        compact={false}
        onBack={() => navigate('/cabinet')}
        onCrumb={(i) => { if (i === 0) navigate('/cabinet') }}
        onOpenFolder={(childId) => navigate(`/cabinet/${childId}`)}
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
