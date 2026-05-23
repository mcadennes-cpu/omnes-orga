// src/features/immobilier/BoardSkeleton.jsx
// Etat de chargement de la liste de cartes d'un tableau.
// 3 placeholders empiles avec animation pulse.

export default function BoardSkeleton() {
  return (
    <div className="px-4 py-4 space-y-5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 animate-pulse">
          <div className="h-3 bg-border rounded-full w-2/3" />
          <div className="h-2.5 bg-border/60 rounded-full w-1/2" />
          <div className="h-2.5 bg-border/60 rounded-full w-1/4" />
        </div>
      ))}
    </div>
  );
}
