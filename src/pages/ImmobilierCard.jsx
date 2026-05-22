// src/pages/ImmobilierCard.jsx
// Page routee /immobilier/:boardId/:cardId.
// Thin wrapper qui extrait les params de l'URL et delegue
// l'affichage a CardPage (sous features/immobilier).
// La garde de role (canAccessImmobilier) est appliquee ici ;
// la garde de membership du board est portee par useCard/useBoardOwnerIds.

import { useParams, Navigate } from 'react-router-dom';
import { useRole } from '../hooks/useRole';
import { canAccessImmobilier } from '../lib/permissions';
import CardPage from '../features/immobilier/CardPage';

export default function ImmobilierCard() {
  const { boardId, cardId } = useParams();
  const { role, loading: roleLoading } = useRole();

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-body-m text-muted">Chargement...</p>
      </div>
    );
  }
  if (!canAccessImmobilier(role)) {
    return <Navigate to="/" replace />;
  }

  return <CardPage boardId={boardId} cardId={cardId} />;
}
