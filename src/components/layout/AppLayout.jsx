import BottomNav from './BottomNav'
import OfflineBanner from '../common/OfflineBanner'
import InstallPromptModal from '../common/InstallPromptModal'

// Note d'historique : ce layout affichait auparavant un filigrane decoratif
// plein ecran (cercle + triangle) via le composant Filigrane. Ce filigrane
// a ete retire en etape 16A au profit d'un filigrane "logo Omnes teinte
// couleur du module" applique au header de chaque page module via le
// composant HeaderWatermark. Filigrane.jsx reste utilise sur les pages
// publiques d'authentification (Login, MotDePasseOublie, NouveauMotDePasse).
export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-fond relative overflow-hidden">
      <OfflineBanner />
      <main className="relative z-10 pb-[110px]">{children}</main>
      <BottomNav />
      <InstallPromptModal />
    </div>
  )
}
