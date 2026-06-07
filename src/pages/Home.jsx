import { useNavigate } from 'react-router-dom'
import { useRole } from '../hooks/useRole'
import { useMonActivite } from '../hooks/useMonActivite'
import { getVisibleModules } from '../lib/modules'
import AppLayout from '../components/layout/AppLayout'
import HomeHeader from '../components/home/HomeHeader'
import ModuleTile from '../components/home/ModuleTile'
import ActivityList from '../components/home/ActivityList'
import LogoOmnes from '../components/common/LogoOmnes'

export default function Home() {
  const navigate = useNavigate()
  const { role, prenom, loading } = useRole()
  const { items, parModule, loading: activiteLoading } = useMonActivite()

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

  // Clic sur une ligne du feed "Ce qui m'attend" -> on ouvre la carte
  // (Discussion / Immobilier) ou l'evenement concerne.
  function handleActiviteClick(item) {
    if (item.module === 'evenements') {
      navigate(`/evenements/${item.evenement_id}`)
      return
    }
    if (item.module === 'immobilier') {
      navigate(`/immobilier/${item.board_id}/${item.card_id}`)
      return
    }
    // discussion : message ou sondage -> la carte qui porte le fil / le sondage
    navigate(`/discussion/${item.board_id}/${item.card_id}`)
  }

  const visibleModules = getVisibleModules(role)

  // Pastille de non-lus par module. total = nb de choses distinctes a traiter
  // (cartes avec du nouveau + sondages en attente). Les modules absents de
  // cette map (Trombinoscope, Annuaire, Cabinet, SIM) n'ont pas de pastille :
  // badges[key] vaut undefined -> ModuleTile n'affiche rien.
  const badges = {
    discussion: parModule.discussion.total,
    immobilier: parModule.immobilier.total,
    evenements: parModule.evenements.total,
  }

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
            badge={badges[m.key]}
            onClick={() => handleModuleClick(m.key)}
          />
        ))}
      </div>
      <ActivityList
        items={items}
        loading={activiteLoading}
        onSelect={handleActiviteClick}
      />

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
