import { UserCheck, UserX } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/authContext'
import { useApiResource } from '../../hooks/useApiResource'
import { ApiError, listUsers, setUserEnabled, type AdminUser } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { formatShortDate, initials } from '../../lib/labels'
import { AdminOnly } from './AdminOnly'

export function AdminUsersPage() {
  return <AdminOnly><Users /></AdminOnly>
}

/** Comptes : désactivation (effet immédiat, même sur un jeton encore valide) et réactivation. */
function Users() {
  const { token, user: me, logout } = useAuth()
  const [page, setPage] = useState(0)
  const { state, reload } = useApiResource((t) => listUsers(t, page, 20), [page])
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function toggle(u: AdminUser) {
    if (!token) return
    setBusyId(u.id)
    try {
      await setUserEnabled(token, u.id, !u.enabled)
      setMessage({ tone: 'success', text: `${u.displayName} : compte ${u.enabled ? 'désactivé' : 'réactivé'}.` })
      reload()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) logout()
      setMessage({ tone: 'error', text: errorMessage(error) })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-page__head"><h1>Utilisateurs</h1><span>{state.kind === 'ready' ? `${state.data.totalElements} comptes` : ''}</span></header>
      {message && <p className={`alert alert--${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      <section className="admin-panel">
        {state.kind === 'loading' && <p className="loading" role="status">Chargement…</p>}
        {state.kind === 'error' && <p className="alert alert--error" role="alert">{state.message}</p>}
        {state.kind === 'ready' && (
          <div className="table-scroll">
            <table className="admin-table">
              <thead><tr><th scope="col">Nom</th><th scope="col">E-mail</th><th scope="col">Rôle</th><th scope="col">Adresses</th><th scope="col">Inscription</th><th scope="col">État</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {state.data.items.map((u) => (
                  <tr key={u.id}>
                    <td><span className="user-cell"><span className="avatar avatar--sm" aria-hidden="true">{initials(u.displayName)}</span>{u.displayName}</span></td>
                    <td>{u.email}</td>
                    <td>{u.role === 'ADMIN' ? 'Administrateur' : 'Propriétaire'}</td>
                    <td>{u.addressCount}</td>
                    <td>{formatShortDate(u.createdAt)}</td>
                    <td><span className={u.enabled ? 'status-badge status-badge--validated' : 'status-badge status-badge--rejected'}>{u.enabled ? 'Actif' : 'Désactivé'}</span></td>
                    <td className="admin-table__actions">
                      {u.role === 'USER' && u.id !== me?.id && (
                        <button className={u.enabled ? 'button button-ghost-dark button-sm' : 'button button-success button-sm'} type="button" disabled={busyId === u.id}
                          onClick={() => toggle(u)} aria-label={`${u.enabled ? 'Désactiver' : 'Réactiver'} ${u.displayName}`}>
                          {u.enabled ? <><UserX aria-hidden="true" />Désactiver</> : <><UserCheck aria-hidden="true" />Réactiver</>}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {state.kind === 'ready' && state.data.totalPages > 1 && (
          <nav className="pager pager--dark" aria-label="Pagination">
            <button className="button button-ghost-dark button-sm" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button>
            <span>Page {page + 1} sur {state.data.totalPages}</span>
            <button className="button button-ghost-dark button-sm" type="button" disabled={page + 1 >= state.data.totalPages} onClick={() => setPage(page + 1)}>Suivant</button>
          </nav>
        )}
      </section>
    </main>
  )
}
