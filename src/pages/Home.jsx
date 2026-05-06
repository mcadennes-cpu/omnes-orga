import { useNavigate } from 'react-router-dom'
import { useRole } from '../hooks/useRole'
import { getVisibleModules } from '../lib/modules'
import AppLayout from '../components/layout/AppLayout'
import HomeHeader from '../components/home/HomeHeader'
import ModuleTile from '../components/home/ModuleTile'
import ActivityList from '../components/home/ActivityList'

export default function Home() {
  const navigate = useNavigate()
  const { role, prenom, loading } = useRole()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  function handleModuleClick(moduleKey) {
    if (moduleKey === 'trombinoscope') {
      navigate('/trombinoscope')
      return
    }
    if (moduleKey === 'annuaire') {
      navigate('/annuaire')
      return
    }
    alert(`Module "${moduleKey}" à venir`)
  }

  const visibleModules = getVisibleModules(role)

  return (
    <AppLayout>
      <HomeHeader prenom={prenom} />
      <div className="grid grid-cols-3 gap-3 px-5">
        {visibleModules.map((m) => (
          <ModuleTile
            key={m.key}
            label={m.label}
            icon={m.icon}
            color={m.color}
            onClick={() => handleModuleClick(m.key)}
          />
        ))}
      </div>
      <ActivityList />
    </AppLayout>
  )
}
