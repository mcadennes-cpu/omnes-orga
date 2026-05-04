export default function ActivityList() {
  return (
    <section className="px-5 pt-6">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
        Activité récente
      </h2>
      <div className="rounded-card border border-border bg-carte p-[14px]">
        <p className="text-center text-sm text-muted">
          Aucune activité récente pour l'instant
        </p>
      </div>
    </section>
  )
}
