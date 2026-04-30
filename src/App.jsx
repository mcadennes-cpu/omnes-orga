import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

const moduleColors = [
  { name: 'marine',  hex: '#1C3D52' },
  { name: 'canard',  hex: '#2A8FA8' },
  { name: 'ocre',    hex: '#E8A135' },
  { name: 'olive',   hex: '#6B7A3A' },
  { name: 'brique',  hex: '#D4503A' },
  { name: 'fuchsia', hex: '#D94F7E' },
]

const neutralColors = [
  { name: 'fond',  hex: '#F5F7F9' },
  { name: 'carte', hex: '#FFFFFF' },
]

const textLevels = [
  { className: 'text-ink',   label: 'text-ink' },
  { className: 'text-muted', label: 'text-muted' },
  { className: 'text-faint', label: 'text-faint' },
]

const interWeights = [
  { weight: 'font-normal',   label: '400' },
  { weight: 'font-medium',   label: '500' },
  { weight: 'font-semibold', label: '600' },
  { weight: 'font-bold',     label: '700' },
]

const archivoWeights = [
  { weight: 'font-bold',      label: '700' },
  { weight: 'font-extrabold', label: '800' },
  { weight: 'font-black',     label: '900' },
]

const radii = [
  { className: 'rounded-tile',  label: 'rounded-tile (18px)' },
  { className: 'rounded-card',  label: 'rounded-card (16px)' },
  { className: 'rounded-input', label: 'rounded-input (14px)' },
]

function SectionTitle({ children }) {
  return (
    <h2 className="text-faint font-semibold uppercase tracking-[0.16em] text-[11px] mb-3">
      {children}
    </h2>
  )
}

function ColorSwatch({ name, hex }) {
  return (
    <div>
      <div
        className="h-16 rounded-tile border border-border"
        style={{ backgroundColor: hex }}
      />
      <div className="mt-2 text-sm font-semibold text-ink">{name}</div>
      <div className="text-xs text-faint">{hex}</div>
    </div>
  )
}

function SupabaseStatus() {
  const [state, setState] = useState({ status: 'loading', error: null })
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ error }) => {
        if (error) {
          setState({ status: 'error', error: error.message })
        } else {
          setState({ status: 'ok', error: null })
        }
      })
      .catch((err) => {
        setState({ status: 'error', error: err?.message ?? String(err) })
      })
  }, [])

  if (state.status === 'loading') {
    return (
      <div className="rounded-card border border-border bg-carte p-4">
        <p className="text-muted text-sm">Test de connexion Supabase en cours…</p>
      </div>
    )
  }

  if (state.status === 'ok') {
    return (
      <div
        className="rounded-card border-2 p-4"
        style={{ borderColor: '#6B7A3A', backgroundColor: 'rgba(107,122,58,0.08)' }}
      >
        <p className="font-semibold text-ink mb-1">✓ Connexion Supabase OK</p>
        <p className="text-muted text-sm">
          URL utilisée :{' '}
          <span className="font-mono text-ink break-all">{supabaseUrl}</span>
        </p>
      </div>
    )
  }

  return (
    <div
      className="rounded-card border-2 p-4"
      style={{ borderColor: '#D4503A', backgroundColor: 'rgba(212,80,58,0.08)' }}
    >
      <p className="font-semibold text-ink mb-1">✕ Erreur de connexion Supabase</p>
      <p className="text-ink text-sm font-mono break-all">{state.error}</p>
      <p className="text-faint text-xs mt-2">
        URL configurée :{' '}
        <span className="font-mono break-all">{supabaseUrl || '(non définie)'}</span>
      </p>
    </div>
  )
}

export default function App() {
  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      <header className="mb-10">
        <h1 className="font-display font-extrabold text-2xl text-ink">
          Omnès Médecins — Test palette
        </h1>
        <p className="text-muted mt-1">
          Vérification visuelle de la configuration Tailwind
        </p>
      </header>

      <section className="mb-10">
        <SectionTitle>État de la connexion Supabase</SectionTitle>
        <SupabaseStatus />
      </section>

      <section className="mb-10">
        <SectionTitle>Couleurs des modules</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {moduleColors.map((c) => (
            <ColorSwatch key={c.name} name={c.name} hex={c.hex} />
          ))}
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Couleurs neutres</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {neutralColors.map((c) => (
            <ColorSwatch key={c.name} name={c.name} hex={c.hex} />
          ))}
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Niveaux de texte</SectionTitle>
        <div className="space-y-2">
          {textLevels.map((t) => (
            <div key={t.label} className="flex items-baseline justify-between">
              <span className={t.className}>
                Le médecin examine le patient avec attention.
              </span>
              <span className="text-faint text-xs ml-4">{t.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Police Inter (font-sans)</SectionTitle>
        <div className="space-y-2">
          {interWeights.map((w) => (
            <div key={w.label} className="flex items-baseline justify-between">
              <span className={`font-sans ${w.weight} text-ink`}>
                Le médecin examine le patient avec attention.
              </span>
              <span className="text-faint text-xs ml-4">font-sans / {w.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Police Archivo (font-display)</SectionTitle>
        <div className="space-y-2">
          {archivoWeights.map((w) => (
            <div key={w.label} className="flex items-baseline justify-between">
              <span className={`font-display ${w.weight} text-ink text-lg`}>
                OMNÈS MÉDECINS
              </span>
              <span className="text-faint text-xs ml-4">font-display / {w.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Coins arrondis</SectionTitle>
        <div className="grid grid-cols-3 gap-4">
          {radii.map((r) => (
            <div key={r.label}>
              <div className={`h-20 bg-carte border border-border ${r.className}`} />
              <div className="mt-2 text-xs text-faint">{r.label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
