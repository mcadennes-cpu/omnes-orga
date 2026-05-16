import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Home from './pages/Home'
import Trombinoscope from './pages/Trombinoscope'
import MedecinDetail from './pages/MedecinDetail'
import Annuaire from './pages/Annuaire'
import EntreeAnnuaireNouvelle from './pages/EntreeAnnuaireNouvelle'
import EntreeAnnuaireDetail from './pages/EntreeAnnuaireDetail'
import Recherche from './pages/Recherche'
import Profil from './pages/Profil'
import Cabinet from './pages/Cabinet'
import CabinetFolder from './pages/CabinetFolder'
import Discussion from './pages/Discussion'
import DiscussionBoard from './pages/DiscussionBoard'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Home />} />
        <Route path="/trombinoscope" element={<Trombinoscope />} />
        <Route path="/trombinoscope/:id" element={<MedecinDetail />} />
        <Route path="/annuaire" element={<Annuaire />} />
        <Route path="/annuaire/nouveau" element={<EntreeAnnuaireNouvelle />} />
        <Route path="/annuaire/:id" element={<EntreeAnnuaireDetail />} />
        <Route path="/recherche" element={<Recherche />} />
        <Route path="/profil" element={<Profil />} />
        <Route path="/cabinet" element={<Cabinet />} />
        <Route path="/cabinet/:id" element={<CabinetFolder />} />
        <Route path="/discussion" element={<Discussion />} />
        <Route path="/discussion/:boardId" element={<DiscussionBoard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
