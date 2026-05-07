import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import EntreeAnnuaireForm from '../components/annuaire/EntreeAnnuaireForm'
import { supabase } from '../lib/supabaseClient'
import { useEntreesAnnuaire } from '../hooks/useEntreesAnnuaire'
import { useAuth } from '../hooks/useAuth'

export default function EntreeAnnuaireNouvelle() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { entrees: allEntrees } = useEntreesAnnuaire()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Categories existantes pour l'auto-complete.
  const existingCategories = useMemo(() => {
    const set = new Set(
      allEntrees
        .map((e) => e.categorie)
        .filter((c) => c && c.trim() !== '')
    )
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [allEntrees])

  function handleCancel() {
    navigate('/annuaire')
  }

  async function handleSubmit(values) {
    if (!user?.id) {
      setSubmitError('Vous devez être connecté pour créer une entrée.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    // On ajoute auteur_id depuis le user courant. La RLS (annuaire_insert_authenticated)
    // verifie cote serveur que auteur_id = auth.uid() : impossible de creer
    // une entree au nom de quelqu'un d'autre.
    const payload = {
      ...values,
      auteur_id: user.id,
    }

    const { data, error: insertError } = await supabase
      .from('annuaire')
      .insert(payload)
      .select()
      .single()

    setSubmitting(false)

    if (insertError) {
      setSubmitError(
        insertError.message
          ? `Erreur : ${insertError.message}`
          : "Impossible de créer l'entrée."
      )
      return
    }

    // Redirection vers la fiche fraichement creee : l'utilisateur voit
    // immediatement le resultat et peut la modifier/supprimer si besoin.
    navigate(`/annuaire/${data.id}`)
  }

  return (
    <AppLayout>
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button
          type="button"
          onClick={handleCancel}
          aria-label="Retour à l'annuaire"
          className="h-10 w-10 flex items-center justify-center rounded-full text-marine hover:bg-marine/5"
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
        <h1 className="font-display font-extrabold text-2xl text-marine truncate">
          Nouvelle entrée
        </h1>
      </header>

      <div className="px-5 pt-2">
        <EntreeAnnuaireForm
          existingCategories={existingCategories}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitting={submitting}
          error={submitError}
        />
      </div>
    </AppLayout>
  )
}
