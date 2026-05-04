import { Home, Search, User } from 'lucide-react'

const TABS = [
  { key: 'home', label: 'Accueil', icon: Home },
  { key: 'search', label: 'Rechercher', icon: Search },
  { key: 'user', label: 'Profil', icon: User },
]

export default function BottomNav({ active = 'home', onTabChange }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 border-t border-border z-20"
      style={{
        backgroundColor: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingBottom: 'env(safe-area-inset-bottom, 28px)',
      }}
    >
      <ul className="flex items-stretch justify-around h-[62px]">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = active === key
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => onTabChange?.(key)}
                className="w-full h-full flex flex-col items-center justify-center gap-1"
              >
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  className={isActive ? 'text-marine' : 'text-faint'}
                />
                <span
                  className={
                    isActive
                      ? 'text-[11px] text-marine font-semibold'
                      : 'text-[11px] text-faint font-medium'
                  }
                >
                  {label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
