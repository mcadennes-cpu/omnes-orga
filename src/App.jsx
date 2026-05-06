import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Home from './pages/Home'
import Trombinoscope from './pages/Trombinoscope'
import MedecinDetail from './pages/MedecinDetail'
import Annuaire from './pages/Annuaire'
import Recherche from './pages/Recherche'
import Profil from './pages/Profil'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Home />} />
        <Route path="/trombinoscope" element={<Trombinoscope />} />
        <Route path="/trombinoscope/:id" element={<MedecinDetail />} />
        <Route path="/annuaire" element={<Annuaire />} />
        <Route path="/recherche" element={<Recherche />} />
        <Route path="/profil" element={<Profil />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
