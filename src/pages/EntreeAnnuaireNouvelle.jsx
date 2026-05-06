import { Link } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'

export default function EntreeAnnuaireNouvelle() {
  return (
    <AppLayout>
      <div className="px-5 pt-6">
        <Link to="/annuaire" className="text-sm text-canard">
          ← Retour à l'annuaire
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-marine">
          Nouvelle entrée
        </h1>
        <p className="mt-2 text-sm text-muted">
          Le formulaire de création arrive en sous-étape 5G.
        </p>
      </div>
    </AppLayout>
  )
}
