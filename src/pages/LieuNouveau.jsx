import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import LieuForm from '../components/codes/LieuForm'
import { supabase } from '../lib/supabaseClient'
import { useLieux } from '../hooks/useLieux'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import { canWriteCodes } from '../lib/permissions'
import HeaderWatermark from '../components/common/HeaderWatermark'

export default function LieuNouveau() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { role, loading: roleLoading } = useRole()
  const { lieux: allLieux } = useLieux()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Categories existantes pour l'auto-complete (fusionnees avec les
  // suggestions par defaut dans LieuForm).
  const existingCategories = useMemo(() => {
    const set = new Set(
      allLieux
        .map((l) => l.categorie)
        .filter((c) => c && c.trim() !== '')
    )
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [allLieux])

  function handleCancel() {
    navigate('/codes')
  }

  async function handleSubmit(values) {
    if (!user?.id) {
      setSubmitError('Vous devez être connecté pour créer un lieu.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    // auteur_id depuis le user courant. La RLS (lieux_insert_writer) verifie
    // cote serveur que auteur_id = auth.uid() ET que le role est associe :
    // un remplacant qui forcerait ce formulaire serait rejete par Postgres.
    const payload = {
      ...values,
      auteur_id: user.id,
    }

    const { data, error: insertError } = await supabase
      .from('lieux')
      .insert(payload)
      .select()
      .single()

    setSubmitting(false)

    if (insertError) {
      setSubmitError(
        insertError.message
          ? `Erreur : ${insertError.message}`
          : 'Impossible de créer le lieu.'
      )
      return
    }

    // Retour a la liste pour l'instant ; en 21C (fiche lieu), on redirigera
    // vers /codes/{id} pour ajouter les codes dans la foulee.
    void data
    navigate('/codes')
  }

  // Garde de page : lecture seule (remplacant) ou role exclu -> retour liste.
  if (!roleLoading && !canWriteCodes(role)) {
    return <Navigate to="/codes" replace />
  }

  return (
    <AppLayout>
      <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border relative overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 relative z-10">
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Retour aux codes d'accès"
            className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
          >
            <ChevronLeft size={20} strokeWidth={2} className="text-marine" />
          </button>
          <h1 className="flex-1 text-h1 text-marine truncate">
            Nouveau lieu
          </h1>
        </div>
        <HeaderWatermark color="olive" />
      </header>

      <div className="px-4 pt-6 pb-8">
        <LieuForm
          existingCategories={existingCategories}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitting={submitting}
          error={submitError}
          isNew={true}
        />
      </div>
    </AppLayout>
  )
}
