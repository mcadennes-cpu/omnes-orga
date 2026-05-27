import Filigrane from './Filigrane'
import BottomNav from './BottomNav'
import OfflineBanner from '../common/OfflineBanner'
import InstallPromptModal from '../common/InstallPromptModal'

export default function AppLayout({ children, showFiligrane = true }) {
  return (
    <div className="min-h-screen bg-fond relative overflow-hidden">
      <OfflineBanner />
      {showFiligrane && <Filigrane />}
      <main className="relative z-10 pb-[110px]">{children}</main>
      <BottomNav />
      <InstallPromptModal />
    </div>
  )
}
