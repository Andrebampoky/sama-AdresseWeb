import { ArrowLeft, ClipboardCheck, Flag, LayoutDashboard, ListChecks, LogOut, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { getAdminStats } from '../../lib/api'
import { initials } from '../../lib/labels'
import type { AdminOutletContext } from '../../pages/admin/adminData'
import { Logo } from './Logo'

/** Console d'administration sombre. L'accès réel est contrôlé par le backend (ROLE_ADMIN). */
export function AdminLayout() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [reportCount, setReportCount] = useState<number | null>(null)
  const [version, setVersion] = useState(0)
  const isAdmin = user?.role === 'ADMIN'

  // Compteurs de la navigation (file de modération, signalements ouverts), exacts côté serveur.
  useEffect(() => {
    if (!token || !isAdmin) return
    let cancelled = false
    getAdminStats(token)
      .then((stats) => {
        if (cancelled) return
        setPendingCount(stats.byStatus.PENDING_VALIDATION ?? 0)
        setReportCount(stats.openReports)
      })
      .catch(() => { if (!cancelled) { setPendingCount(null); setReportCount(null) } })
    return () => { cancelled = true }
  }, [token, isAdmin, version])

  const refreshPending = useCallback(() => setVersion((v) => v + 1), [])
  const context: AdminOutletContext = { pendingCount, refreshPending }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Logo tone="dark" to="/admin" suffix="Admin" />
        <nav className="admin-nav" aria-label="Navigation d’administration">
          <NavLink to="/admin" end className="admin-nav__link"><LayoutDashboard aria-hidden="true" />Tableau de bord</NavLink>
          <NavLink to="/admin/moderation" className="admin-nav__link">
            <ClipboardCheck aria-hidden="true" />Modération
            {pendingCount !== null && pendingCount > 0 && <span className="admin-nav__badge" aria-label={`${pendingCount} en attente`}>{pendingCount}</span>}
          </NavLink>
          <NavLink to="/admin/signalements" className="admin-nav__link">
            <Flag aria-hidden="true" />Signalements
            {reportCount !== null && reportCount > 0 && <span className="admin-nav__badge" aria-label={`${reportCount} signalements ouverts`}>{reportCount}</span>}
          </NavLink>
          <NavLink to="/admin/adresses" className="admin-nav__link"><ListChecks aria-hidden="true" />Adresses</NavLink>
          <NavLink to="/admin/utilisateurs" className="admin-nav__link"><Users aria-hidden="true" />Utilisateurs</NavLink>
          <NavLink to="/tableau-de-bord" className="admin-nav__link admin-nav__link--back"><ArrowLeft aria-hidden="true" />Mon espace</NavLink>
        </nav>
        <p className="admin-sidebar__note">Journal d’audit détaillé : pas encore disponible.</p>
        <div className="admin-sidebar__user">
          <span className="avatar" aria-hidden="true">{initials(user?.displayName ?? '')}</span>
          <span><strong>{user?.displayName}</strong><small>{isAdmin ? 'Administrateur' : 'Utilisateur'}</small></span>
          <button className="icon-button" type="button" onClick={() => { logout(); navigate('/') }} aria-label="Se déconnecter"><LogOut /></button>
        </div>
      </aside>
      <div className="admin-main"><Outlet context={context} /></div>
    </div>
  )
}
