import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Home from './pages/Home'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  return user ? <Home /> : <Login />
}
