import { useEffect, useState } from 'react'
import { T } from './tokens'
import Dashboard from './components/Dashboard'
import VorgangDetail from './components/VorgangDetail'
import Vertraege from './components/Vertraege'
import VertragDetail from './components/VertragDetail'
import VertragsbesitzerAdmin from './components/VertragsbesitzerAdmin'
import Kalender from './components/Kalender'
import OwnerSelector from './components/OwnerSelector'
import Login from './components/Login'
import { supabase } from './lib/supabase'

const NAV = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'vertraege',  label: 'Verträge' },
  { id: 'kalender',   label: 'Kalender' },
  { id: 'admin',      label: 'Admin' },
]

export default function App() {
  const [aktiv, setAktiv] = useState('dashboard')
  const [selectedVorgangId, setSelectedVorgangId] = useState(null)
  const [selectedContractId, setSelectedContractId] = useState(null)
  const [vorgangIds, setVorgangIds] = useState([])
  const [user, setUser] = useState(null)
  const [selectedOwner, setSelectedOwner] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(result => {
      if (!mounted) return
      setUser(result.data?.session?.user ?? null)
      setLoadingAuth(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) {
        setSelectedOwner(null)
        setSelectedContractId(null)
        setSelectedVorgangId(null)
      }
    })

    return () => listener?.subscription?.unsubscribe()
  }, [])

  if (loadingAuth) {
    return <p style={{ padding: T.sp6 }}>Lade Anmeldung…</p>
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  if (!selectedOwner) {
    return <OwnerSelector user={user} onSelectOwner={setSelectedOwner} />
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        background: T.primary,
        color: T.textOnTeal,
        padding: `${T.sp3} ${T.sp6}`,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: T.sp4,
        boxShadow: T.shadowMd,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: T.sp4 }}>
          <img src="/archivy_icon_512 (1).svg" alt="Archivy" style={{ height: 32 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.3px' }}>Archivy</div>
            <div style={{ fontSize: 13, color: T.textOnTeal, opacity: 0.85 }}>
              Angemeldet als {user.email} · Inhaber: {selectedOwner.display_name}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: T.sp3, alignItems: 'center' }}>
          <button
            onClick={() => {
              supabase.auth.signOut()
              setUser(null)
            }}
            style={{
              background: T.bgCard,
              color: T.textMain,
              border: `1px solid ${T.border}`,
              borderRadius: T.r2,
              padding: `${T.sp2} ${T.sp4}`,
              cursor: 'pointer',
            }}
          >
            Abmelden
          </button>
          <button
            onClick={() => {
              setSelectedOwner(null)
              setSelectedContractId(null)
            }}
            style={{
              background: T.accent,
              color: T.textOnTeal,
              border: 'none',
              borderRadius: T.r2,
              padding: `${T.sp2} ${T.sp4}`,
              cursor: 'pointer',
            }}
          >
            Anderen Inhaber wählen
          </button>
        </div>
      </header>

      <nav style={{
        background: T.surface,
        display: 'flex',
        gap: 2,
        padding: `0 ${T.sp6}`,
        overflowX: 'auto',
      }}>
        {NAV.map(n => (
          <button
            key={n.id}
            onClick={() => { setAktiv(n.id); setSelectedContractId(null); setSelectedVorgangId(null) }}
            style={{
              padding: `${T.sp3} ${T.sp5}`,
              color: T.textOnTeal,
              fontWeight: aktiv === n.id ? 700 : 400,
              borderBottom: aktiv === n.id ? `3px solid ${T.accent}` : '3px solid transparent',
              opacity: aktiv === n.id ? 1 : 0.8,
              whiteSpace: 'nowrap',
              transition: 'opacity 0.15s',
            }}
          >
            {n.label}
          </button>
        ))}
      </nav>

      <main style={{ flex: 1, padding: T.sp6, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {selectedVorgangId ? (
          <VorgangDetail
            vorgang_id={selectedVorgangId}
            vorgangIds={vorgangIds}
            onNavigate={(id) => setSelectedVorgangId(id)}
            onClose={() => setSelectedVorgangId(null)}
          />
        ) : selectedContractId ? (
          <VertragDetail
            vertragId={selectedContractId}
            owner={selectedOwner}
            onSelectVorgang={(id, ids) => {
              setSelectedVorgangId(id)
              setVorgangIds(ids || [])
            }}
            onClose={() => setSelectedContractId(null)}
          />
        ) : (
          <>
            {aktiv === 'dashboard' && <Dashboard user={user} owner={selectedOwner} onNavigate={setAktiv} />}
            {aktiv === 'vertraege' && <Vertraege owner={selectedOwner} onSelectContract={setSelectedContractId} />}
            {aktiv === 'kalender'  && <Kalender owner={selectedOwner} />}
            {aktiv === 'admin'     && <VertragsbesitzerAdmin />}
          </>
        )}
      </main>
    </div>
  )
}
