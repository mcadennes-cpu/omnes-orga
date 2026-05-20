// src/pages/ImmobilierBoard.jsx
// Stub temporaire pour la route /immobilier/:boardId.
// Sera remplace par la vraie vue tableau en 10C.

import { useParams, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import AppLayout from '../components/layout/AppLayout';

export default function ImmobilierBoard() {
  const { boardId } = useParams();

  return (
    <AppLayout>
      <div className="px-4 py-6">
        <Link
          to="/immobilier"
          className="inline-flex items-center gap-1 text-body-m text-canard mb-4"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          <span>Retour</span>
        </Link>
        <h1 className="text-h1 text-ink">Tableau</h1>
        <p className="text-body-m text-muted mt-4">
          ID : <code>{boardId}</code>
        </p>
        <p className="text-body-m text-muted mt-2">
          Vue tableau a venir en etape 10C.
        </p>
      </div>
    </AppLayout>
  );
}
