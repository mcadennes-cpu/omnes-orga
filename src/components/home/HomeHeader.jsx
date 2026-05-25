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
    <header className="px-5 pt-8 pb-5">
      <p className="text-eyebrow">
        {dateLabel}
      </p>
      <h1 className="mt-2 text-h1 text-marine">
        {greeting}
      </h1>
    </header>
  )
}
