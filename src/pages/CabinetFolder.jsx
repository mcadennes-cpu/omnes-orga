import { Navigate, useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import DrivePage from '../features/cabinet/DrivePage'
import { getSubfolder } from '../features/cabinet/data'
import { useRole } from '../hooks/useRole'
import { canEditCabinet } from '../lib/permissions'

export default function CabinetFolder() {
  const navigate = useNavigate()
  const { slug } = useParams()
  const { role, loading } = useRole()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  const data = getSubfolder(slug)
  if (!data) {
    return <Navigate to="/cabinet" replace />
  }

  const canWrite = canEditCabinet(role)

  return (
    <AppLayout>
      <DrivePage
        {...data}
        canWrite={canWrite}
        compact={false}
        onBack={() => navigate('/cabinet')}
        onCrumb={(i) => { if (i === 0) navigate('/cabinet') }}
        onUpload={() => alert('Upload — à venir en 6E-3')}
        onNewFolder={() => alert('Nouveau dossier — à venir en 6E-3')}
      />
    </AppLayout>
  )
}
