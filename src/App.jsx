import { useEffect, useRef, useState } from 'react'
import { T } from './tokens'
import Dashboard from './components/Dashboard'
import VorgangDetail from './components/VorgangDetail'
import Vertraege from './components/Vertraege'
import VertragDetail from './components/VertragDetail'
import VertragsbesitzerAdmin from './components/VertragsbesitzerAdmin'
import Kalender from './components/Kalender'
import Impressum from './components/Impressum'
import OwnerSelector from './components/OwnerSelector'
import Login from './components/Login'
import { supabase } from './lib/supabase'
const appIcon = '/icons/archivy-icon.svg'

const NAV = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'vertraege',  label: 'Verträge' },
  { id: 'kalender',   label: 'Kalender' },
  { id: 'impressum',  label: 'Impressum' },
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
  const [ownerOptions, setOwnerOptions] = useState([])
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loadingAdmin, setLoadingAdmin] = useState(true)
  const headerRef = useRef(null)
  const navRef = useRef(null)
  const [stickyOffsets, setStickyOffsets] = useState({ header: 0, nav: 0 })
  const mainTopPadding = aktiv === 'vertraege' ? '6px' : 'clamp(12px, 3vw, 24px)'

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
        setIsAdmin(false)
      } finally {
        setLoadingAdmin(false)
      }
    }

    checkAdmin()
  }, [user])

  useEffect(() => {
    async function loadOwnerOptions() {
      if (!user?.email) {
        setOwnerOptions([])
        return
      }

      const { data, error } = await supabase
        .from('vertragsbesitzer')
        .select('id,name,display_name,allowed_users')
        .order('name', { ascending: true })

      if (error) {
        if (selectedOwner) setOwnerOptions([selectedOwner])
        return
      }

      const nextOwners = buildOwnerOptions(data, user.email)
      if (nextOwners.length > 0) {
        setOwnerOptions(nextOwners)
      } else if (selectedOwner) {
        setOwnerOptions([selectedOwner])
      } else {
        setOwnerOptions([])
      }
    }

    loadOwnerOptions()
  }, [user?.email, selectedOwner?.id])

  useEffect(() => {
    const updateStickyOffsets = () => {
      setStickyOffsets({
        header: headerRef.current?.offsetHeight ?? 0,
        nav: navRef.current?.offsetHeight ?? 0,
      })
    }

    updateStickyOffsets()
    window.addEventListener('resize', updateStickyOffsets)
    return () => window.removeEventListener('resize', updateStickyOffsets)
  }, [selectedOwner?.id, ownerOptions.length, isAdmin, aktiv])

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
      <header ref={headerRef} style={{
        background: T.primary,
        color: T.textOnTeal,
        padding: `clamp(8px, 2vw, ${T.sp3}) clamp(10px, 3vw, ${T.sp5})`,
        paddingTop: `calc(clamp(8px, 2vw, ${T.sp3}) + env(safe-area-inset-top))`,
        position: 'fixed',
        left: 0,
        right: 0,
        top: 0,
        zIndex: 80,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        boxShadow: T.shadowMd,
      }}>
        {/* Logo + Titel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '0 0 auto' }}>
          <img src={appIcon} alt="Archivy" style={{ width: 48, height: 48, flex: '0 0 auto', marginTop: -3 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px' }}>Archivy</div>
            <div style={{ fontSize: 11, color: T.textOnTeal, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40vw' }}>
              {user.email}
            </div>
          </div>
        </div>

        {/* Rechte Seite: Buttons + Inhaberauswahl */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              setSelectedOwner(null)
              setSelectedContractId(null)
              setSelectedVorgangId(null)
            }}
            style={{
              background: 'rgba(255,255,255,0.14)',
              color: T.textOnTeal,
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: T.r2,
              padding: '5px 10px',
              cursor: 'pointer',
              fontSize: 13,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            title="Zum Willkommensbildschirm"
          >
            ⬚
          </button>
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
              padding: '5px 10px',
              cursor: 'pointer',
              fontSize: 13,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            title="Abmelden"
          >
            ↪
          </button>
          <select
            value={selectedOwner?.id || ''}
            onChange={(e) => {
              const next = ownerOptions.find(o => o.id === e.target.value)
              if (!next) return
              setSelectedOwner(next)
              setSelectedContractId(null)
              setSelectedVorgangId(null)
            }}
            title="Inhaber wechseln"
            style={{
              background: 'rgba(255,255,255,0.14)',
              color: T.textOnTeal,
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: T.r2,
              padding: '5px 8px',
              cursor: 'pointer',
              fontSize: 13,
              minWidth: 0,
              flex: '1 1 120px',
              maxWidth: 220,
            }}
          >
            {(ownerOptions.length > 0 ? ownerOptions : [selectedOwner].filter(Boolean)).map(owner => (
              <option key={owner.id} value={owner.id} style={{ color: T.textMain, background: T.bgCard }}>
                {owner.display_name || owner.name || owner.id}
              </option>
            ))}
          </select>
        </div>
      </header>

      <nav ref={navRef} style={{
        background: T.surface,
        position: 'fixed',
        left: 0,
        right: 0,
        top: stickyOffsets.header,
        zIndex: 70,
        display: 'flex',
        gap: 2,
        padding: `0 clamp(12px, 3vw, ${T.sp6})`,
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

      <div style={{ height: stickyOffsets.header + stickyOffsets.nav }} />

      <main style={{ flex: 1, padding: `${mainTopPadding} clamp(12px, 3vw, 24px) clamp(12px, 3vw, 24px)`, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
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
            stickyTop={stickyOffsets.header + stickyOffsets.nav}
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
                stickyTop={stickyOffsets.header + stickyOffsets.nav}
                onSelectContract={(id, ids = []) => {
                  setSelectedContractId(id)
                  setVertragIds(ids?.length ? ids : [id])
                }}
              />
            )}
            {aktiv === 'kalender'  && <Kalender owner={selectedOwner} onSelectVorgang={openVorgang} />}
            {aktiv === 'impressum' && <Impressum />}
            {aktiv === 'admin'     && isAdmin && <VertragsbesitzerAdmin />}
          </>
        )}
      </main>
    </div>
  )
}

function buildOwnerOptions(rows, userEmail) {
  const normalizedEmail = String(userEmail ?? '').trim().toLowerCase()

  return (rows ?? [])
    .map(row => ({
      id: String(row?.id ?? '').trim(),
      name: String(row?.name ?? '').trim(),
      display_name: String(row?.display_name ?? '').trim(),
      allowed_users: Array.isArray(row?.allowed_users) ? row.allowed_users : [],
    }))
    .filter(row => row.id)
    .filter(row => {
      if (row.allowed_users.length === 0) return true
      return row.allowed_users.some(email => String(email || '').trim().toLowerCase() === normalizedEmail)
    })
}
