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
import appIcon from '../archivy_icon_512 (1).svg'

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
  const [vertragIds, setVertragIds] = useState([])
  const [user, setUser] = useState(null)
  const [selectedOwner, setSelectedOwner] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loadingAdmin, setLoadingAdmin] = useState(true)

  function openVorgang(id, ids = []) {
    if (!id) return
    setSelectedContractId(null)
    setVorgangIds(ids?.length ? ids : [id])
    setSelectedVorgangId(id)
  }

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
        setIsAdmin(false)
      }
    })

    return () => listener?.subscription?.unsubscribe()
  }, [])

  useEffect(() => {
    async function checkAdmin() {
      setLoadingAdmin(true)
      if (!user?.email) {
        setIsAdmin(false)
        setLoadingAdmin(false)
        return
      }

      try {
        const { data } = await supabase
          .from('app_admin')
          .select('admin_email')
          .eq('id', 1)
          .single()

        if (data?.admin_email && data.admin_email.toLowerCase() === user.email.toLowerCase()) {
          setIsAdmin(true)
        } else {
          setIsAdmin(false)
        }
      } catch (e) {
        // Tabelle existiert nicht oder andere Fehler -> nicht Admin
        setIsAdmin(false)
      } finally {
        setLoadingAdmin(false)
      }
    }

    checkAdmin()
  }, [user])

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
          <img src={appIcon} alt="Archivy" style={{ height: 32 }} />
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
          (n.id !== 'admin' || isAdmin) && (
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
          )
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
            vertragIds={vertragIds}
            owner={selectedOwner}
            onNavigate={(id) => setSelectedContractId(id)}
            onSelectVorgang={(id, ids) => {
              setSelectedVorgangId(id)
              setVorgangIds(ids || [])
            }}
            onClose={() => setSelectedContractId(null)}
          />
        ) : (
          <>
            {aktiv === 'dashboard' && <Dashboard user={user} owner={selectedOwner} onNavigate={setAktiv} onSelectVorgang={openVorgang} />}
            {aktiv === 'vertraege' && (
              <Vertraege
                owner={selectedOwner}
                onSelectContract={(id, ids = []) => {
                  setSelectedContractId(id)
                  setVertragIds(ids?.length ? ids : [id])
                }}
              />
            )}
            {aktiv === 'kalender'  && <Kalender owner={selectedOwner} onSelectVorgang={openVorgang} />}
            {aktiv === 'admin'     && isAdmin && <VertragsbesitzerAdmin />}
          </>
        )}
      </main>
    </div>
  )
}
