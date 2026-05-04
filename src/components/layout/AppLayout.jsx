import Filigrane from './Filigrane'
import BottomNav from './BottomNav'

export default function AppLayout({
  children,
  activeTab = 'home',
  onTabChange,
  showFiligrane = true,
}) {
  return (
    <div className="min-h-screen bg-fond relative overflow-hidden">
      {showFiligrane && <Filigrane />}
      <main className="relative z-10 pb-[110px]">{children}</main>
      <BottomNav active={activeTab} onTabChange={onTabChange} />
    </div>
  )
}
