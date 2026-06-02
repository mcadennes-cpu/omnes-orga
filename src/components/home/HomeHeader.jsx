import LogoOmnes from '../common/LogoOmnes'

function formatDateFr(date = new Date()) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
    .format(date)
    .toUpperCase()
}

export default function HomeHeader({ prenom }) {
  const dateLabel = formatDateFr()
  const greeting = prenom ? `Bonjour ${prenom}` : 'Bonjour'
  return (
    <header className="px-5 pt-8 pb-5 relative">
      {/* Logo en absolute : couvre presque tout le bloc texte en fond */}
      <LogoOmnes
        color="marine"
        width={320}
        height={128}
        opacity={0.07}
        className="absolute pointer-events-none select-none"
        style={{ top: 40, right: -30 }}
      />
      {/* Bloc texte en flux normal, relative z-10 pour rester au-dessus du logo */}
      <div className="relative z-10">
        <p className="text-eyebrow">
          {dateLabel}
        </p>
        <h1 className="mt-2 text-h1 text-marine">
          {greeting}
        </h1>
      </div>
    </header>
  )
}
