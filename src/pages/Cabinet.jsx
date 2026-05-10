import { useNavigate } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import DrivePage from '../features/cabinet/DrivePage'
import { useState } from 'react'
import NewFolderModal from '../features/cabinet/NewFolderModal'
import UploadModal from '../features/cabinet/UploadModal'
import { downloadCabinetFile, openCabinetFile } from '../features/cabinet/cabinetStorage'
import { useCabinetRoot } from '../features/cabinet/useCabinet'
import { useRole } from '../hooks/useRole'
import { canEditCabinet } from '../lib/permissions'

export default function Cabinet() {
  const navigate = useNavigate()
  const { role, loading: roleLoading } = useRole()
  const { folders, files, loading: dataLoading, error, refetch } = useCabinetRoot()
  const [isNewFolderOpen, setNewFolderOpen] = useState(false)
  const [isUploadOpen, setUploadOpen] = useState(false)

  const loading = roleLoading || dataLoading

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  if (error) {
    return (
      <AppLayout>
        <p className="text-center text-brique py-12 px-5">
          Impossible de charger le contenu du cabinet.
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

  return (
    <AppLayout>
      <DrivePage
        trail={['Cabinet pratique']}
        accent="#1C3D52"
        folders={folders}
        files={files}
        canWrite={canWrite}
        compact
        onBack={() => navigate('/')}
        onOpenFolder={(id) => navigate(`/cabinet/${id}`)}
        onOpenFile={handleFileOpen}
        onDownloadFile={handleFileDownload}
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
    </AppLayout>
  )
}