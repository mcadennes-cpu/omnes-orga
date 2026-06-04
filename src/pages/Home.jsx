import { useNavigate } from 'react-router-dom'
import { useRole } from '../hooks/useRole'
import { getVisibleModules } from '../lib/modules'
import AppLayout from '../components/layout/AppLayout'
import HomeHeader from '../components/home/HomeHeader'
import ModuleTile from '../components/home/ModuleTile'
import ActivityList from '../components/home/ActivityList'
import LogoOmnes from '../components/common/LogoOmnes'

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
    if (moduleKey === 'cabinet_pratique') {
      navigate('/cabinet')
      return
    }
    if (moduleKey === 'discussion') {
      navigate('/discussion')
      return
    }
    if (moduleKey === 'evenements') {
      navigate('/evenements')
      return
    }
    if (moduleKey === 'sim') {
      navigate('/sim')
      return
    }
    if (moduleKey === 'immobilier') {
      navigate('/immobilier')
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

      {/* 2e filigrane Omnes : meme logo que HomeHeader, en bas a gauche
          (oriente normalement, pas en miroir). left negatif pour deborder
          a gauche ; zIndex -1 pour rester derriere la grille (mais
          au-dessus du bg-fond). */}
      <LogoOmnes
        color="marine"
        width={320}
        height={128}
        opacity={0.07}
        className="absolute pointer-events-none select-none"
        style={{ bottom: 0, left: -100, zIndex: -1 }}
      />
    </AppLayout>
  )
}
