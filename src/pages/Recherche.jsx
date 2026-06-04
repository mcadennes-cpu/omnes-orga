// src/pages/Recherche.jsx
// Page de recherche globale.
// Couvre :
// - Trombinoscope (medecins actifs du cabinet)
// - Tableaux et cartes Discussion ou je suis membre
// - Tableaux et cartes Immobilier ou je suis membre
//
// La recherche est insensible aux accents et a la casse.
// Affichage par section, masquees si aucun resultat.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Search, MessageSquare, Building2, BookOpen } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import MedecinCard from '../components/trombinoscope/MedecinCard'
import { useMedecins } from '../hooks/useMedecins'
import { useEntreesAnnuaire } from '../hooks/useEntreesAnnuaire'
import { useRole } from '../hooks/useRole'
import { normalizeForSearch } from '../lib/profileFormat'
import { supabase } from '../lib/supabaseClient'
import HeaderWatermark from '../components/common/HeaderWatermark'

export default function Recherche() {
  const navigate = useNavigate()
  const { medecins, loading: medecinsLoading, error: medecinsError } = useMedecins()
  const { entrees: annuaireEntrees, loading: annuaireLoading, error: annuaireError } = useEntreesAnnuaire()
  const { role } = useRole()
  const [query, setQuery] = useState('')

  // Donnees Discussion + Immobilier
  const [discussionBoards, setDiscussionBoards] = useState([])
  const [discussionCards, setDiscussionCards] = useState([])
  const [immobilierBoards, setImmobilierBoards] = useState([])
  const [immobilierCards, setImmobilierCards] = useState([])
  const [boardsLoading, setBoardsLoading] = useState(true)

  const canViewNotes = role && role !== 'remplacant'
  const canViewSchedule = role && role !== 'remplacant'

  // Chargement initial des tableaux et cartes accessibles.
  // RLS s'occupe du filtrage : on ne recoit que les tableaux ou je suis
  // membre, donc les cartes via INNER JOIN implicite.
  useEffect(() => {
    let active = true

    async function fetchAll() {
      setBoardsLoading(true)

      const [resDiscBoards, resDiscCards, resImmoBoards, resImmoCards] = await Promise.all([
        supabase
          .from('discussion_boards')
          .select('id, title, archived')
          .eq('archived', false),
        supabase
          .from('discussion_cards')
          .select('id, board_id, title, status, archived')
          .eq('archived', false),
        supabase
          .from('immobilier_boards')
          .select('id, titre, archive')
          .eq('archive', false),
        supabase
          .from('immobilier_cards')
          .select('id, board_id, titre, statut, archive')
          .eq('archive', false),
      ])

      if (!active) return

      if (resDiscBoards.data) setDiscussionBoards(resDiscBoards.data)
      if (resDiscCards.data) setDiscussionCards(resDiscCards.data)
      if (resImmoBoards.data) setImmobilierBoards(resImmoBoards.data)
      if (resImmoCards.data) setImmobilierCards(resImmoCards.data)
      setBoardsLoading(false)
    }

    fetchAll()
    return () => { active = false }
  }, [])

  const trimmed = normalizeForSearch(query).trim()

  // Filtrage des medecins (existant)
  const filteredMedecins = useMemo(() => {
    if (trimmed === '') return []
    return medecins.filter((m) => {
      const text = normalizeForSearch(
        `${m.prenom ?? ''} ${m.nom ?? ''} ${m.specialite ?? ''}`
      )
      return text.includes(trimmed)
    })
  }, [trimmed, medecins])

  // Filtrage Annuaire : memes champs que la recherche locale de la page
  // Annuaire (nom, categorie, note), mais avec normalizeForSearch pour
  // rester insensible aux accents comme le reste de la recherche globale.
  const filteredAnnuaire = useMemo(() => {
    if (trimmed === '') return []
    return annuaireEntrees.filter((e) => {
      const text = normalizeForSearch(
        `${e.nom ?? ''} ${e.categorie ?? ''} ${e.note ?? ''}`
      )
      return text.includes(trimmed)
    })
  }, [trimmed, annuaireEntrees])

  // Filtrage Discussion
  // Note : Discussion utilise des noms anglais (title/status/archived)
  // alors qu'Immobilier utilise le francais (titre/statut/archive).
  // On normalise vers le francais cote affichage en transformant les objets.
  const filteredDiscussionBoards = useMemo(() => {
    if (trimmed === '') return []
    return discussionBoards
      .filter((b) => normalizeForSearch(b.title ?? '').includes(trimmed))
      .map((b) => ({ ...b, titre: b.title }))
  }, [trimmed, discussionBoards])

  const filteredDiscussionCards = useMemo(() => {
    if (trimmed === '') return []
    return discussionCards
      .filter((c) => normalizeForSearch(c.title ?? '').includes(trimmed))
      .map((c) => ({
        ...c,
        titre: c.title,
        statut: c.status,
        boardTitre: discussionBoards.find((b) => b.id === c.board_id)?.title,
      }))
      .filter((c) => c.boardTitre !== undefined)
  }, [trimmed, discussionCards, discussionBoards])

  // Filtrage Immobilier
  const filteredImmobilierBoards = useMemo(() => {
    if (trimmed === '') return []
    return immobilierBoards.filter((b) =>
      normalizeForSearch(b.titre ?? '').includes(trimmed)
    )
  }, [trimmed, immobilierBoards])

  const filteredImmobilierCards = useMemo(() => {
    if (trimmed === '') return []
    return immobilierCards
      .filter((c) => normalizeForSearch(c.titre ?? '').includes(trimmed))
      .map((c) => ({
        ...c,
        boardTitre: immobilierBoards.find((b) => b.id === c.board_id)?.titre,
      }))
      .filter((c) => c.boardTitre !== undefined)
  }, [trimmed, immobilierCards, immobilierBoards])

  const totalResults =
    filteredMedecins.length +
    filteredAnnuaire.length +
    filteredDiscussionBoards.length +
    filteredDiscussionCards.length +
    filteredImmobilierBoards.length +
    filteredImmobilierCards.length

  const loading = medecinsLoading || boardsLoading || annuaireLoading

  return (
    <AppLayout>
      <header className="flex items-center gap-3 px-5 pt-6 pb-4 relative overflow-hidden">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Retour à l'accueil"
          className="h-10 w-10 flex items-center justify-center rounded-full text-marine hover:bg-marine/5"
        >
          <ChevronLeft size={22} strokeWidth={2} />
        </button>
        <h1 className="font-display font-extrabold text-2xl text-marine">
          Rechercher
        </h1>
        <HeaderWatermark color="marine" />
      </header>

      <div className="px-5 pt-2 pb-8">
        <div className="relative">
          <Search
            size={20}
            strokeWidth={2}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un médecin, une entrée, un tableau…"
            aria-label="Rechercher"
            className="w-full h-12 pl-11 pr-4 rounded-input bg-white border border-border text-marine placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard"
          />
        </div>

        <div className="mt-6 space-y-8">
          {loading && (
            <p className="text-center text-muted py-8">Chargement…</p>
          )}

          {!loading && medecinsError && (
            <p className="text-center text-brique py-4">
              Impossible de charger la liste des médecins.
            </p>
          )}

          {!loading && annuaireError && (
            <p className="text-center text-brique py-4">
              Impossible de charger l'annuaire.
            </p>
          )}

          {!loading && trimmed === '' && (
            <p className="text-center text-muted py-8">
              Tapez quelques lettres pour lancer la recherche.
            </p>
          )}

          {!loading && trimmed !== '' && totalResults === 0 && (
            <p className="text-center text-muted py-8">
              Aucun résultat pour « {query} ».
            </p>
          )}

          {/* Section Médecins */}
          {!loading && filteredMedecins.length > 0 && (
            <section>
              <h2 className="font-display font-extrabold text-marine text-lg mb-3">
                Médecins du cabinet
                <span className="text-muted text-sm font-normal ml-2">
                  ({filteredMedecins.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filteredMedecins.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => navigate(`/trombinoscope/${m.id}`)}
                    aria-label={`Ouvrir la fiche de ${m.prenom ?? ''} ${m.nom ?? ''}`.trim()}
                    className="text-left rounded-card focus:outline-none focus:ring-2 focus:ring-canard focus:ring-offset-2 focus:ring-offset-fond hover:shadow-md transition-shadow"
                  >
                    <MedecinCard
                      medecin={m}
                      canViewNotes={canViewNotes}
                      canViewSchedule={canViewSchedule}
                    />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Section Annuaire */}
          {!loading && filteredAnnuaire.length > 0 && (
            <section>
              <h2 className="font-display font-extrabold text-marine text-lg mb-3 flex items-center gap-2">
                <BookOpen size={18} className="text-ocre-fonce" aria-hidden="true" />
                Annuaire
                <span className="text-muted text-sm font-normal">
                  ({filteredAnnuaire.length})
                </span>
              </h2>
              <div className="space-y-2">
                {filteredAnnuaire.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => navigate(`/annuaire/${e.id}`)}
                    className="w-full text-left bg-carte rounded-card shadow-card border border-border p-3 hover:shadow-button transition-shadow"
                  >
                    <p className="text-body-l text-ink font-medium">{e.nom}</p>
                    {(e.categorie || e.telephone) && (
                      <p className="text-caption text-muted mt-0.5">
                        {e.categorie}
                        {e.categorie && e.telephone ? ' · ' : ''}
                        {e.telephone}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Section Discussion */}
          {!loading && (filteredDiscussionBoards.length > 0 || filteredDiscussionCards.length > 0) && (
            <section>
              <h2 className="font-display font-extrabold text-marine text-lg mb-3 flex items-center gap-2">
                <MessageSquare size={18} className="text-brique" aria-hidden="true" />
                Discussion
                <span className="text-muted text-sm font-normal">
                  ({filteredDiscussionBoards.length + filteredDiscussionCards.length})
                </span>
              </h2>

              {filteredDiscussionBoards.length > 0 && (
                <div className="space-y-2 mb-3">
                  <p className="text-eyebrow text-muted">Tableaux</p>
                  {filteredDiscussionBoards.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => navigate(`/discussion/${b.id}`)}
                      className="w-full text-left bg-carte rounded-card shadow-card border border-border p-3 hover:shadow-button transition-shadow"
                    >
                      <p className="text-body-l text-ink font-medium">{b.titre}</p>
                    </button>
                  ))}
                </div>
              )}

              {filteredDiscussionCards.length > 0 && (
                <div className="space-y-2">
                  <p className="text-eyebrow text-muted">Cartes</p>
                  {filteredDiscussionCards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => navigate(`/discussion/${c.board_id}/${c.id}`)}
                      className="w-full text-left bg-carte rounded-card shadow-card border border-border p-3 hover:shadow-button transition-shadow"
                    >
                      <p className="text-body-l text-ink font-medium">{c.titre}</p>
                      <p className="text-caption text-muted mt-0.5">
                        dans <span className="text-ink">{c.boardTitre}</span>
                        {c.statut === 'clos' && (
                          <span className="ml-2 text-faint italic">(close)</span>
                        )}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Section Immobilier */}
          {!loading && (filteredImmobilierBoards.length > 0 || filteredImmobilierCards.length > 0) && (
            <section>
              <h2 className="font-display font-extrabold text-marine text-lg mb-3 flex items-center gap-2">
                <Building2 size={18} className="text-canard" aria-hidden="true" />
                Immobilier
                <span className="text-muted text-sm font-normal">
                  ({filteredImmobilierBoards.length + filteredImmobilierCards.length})
                </span>
              </h2>

              {filteredImmobilierBoards.length > 0 && (
                <div className="space-y-2 mb-3">
                  <p className="text-eyebrow text-muted">Tableaux</p>
                  {filteredImmobilierBoards.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => navigate(`/immobilier/${b.id}`)}
                      className="w-full text-left bg-carte rounded-card shadow-card border border-border p-3 hover:shadow-button transition-shadow"
                    >
                      <p className="text-body-l text-ink font-medium">{b.titre}</p>
                    </button>
                  ))}
                </div>
              )}

              {filteredImmobilierCards.length > 0 && (
                <div className="space-y-2">
                  <p className="text-eyebrow text-muted">Cartes</p>
                  {filteredImmobilierCards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => navigate(`/immobilier/${c.board_id}/${c.id}`)}
                      className="w-full text-left bg-carte rounded-card shadow-card border border-border p-3 hover:shadow-button transition-shadow"
                    >
                      <p className="text-body-l text-ink font-medium">{c.titre}</p>
                      <p className="text-caption text-muted mt-0.5">
                        dans <span className="text-ink">{c.boardTitre}</span>
                        {c.statut === 'clos' && (
                          <span className="ml-2 text-faint italic">(close)</span>
                        )}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
