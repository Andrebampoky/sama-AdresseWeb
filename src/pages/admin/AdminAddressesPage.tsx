import { Eye, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { StatusBadge } from '../../components/StatusBadge'
import { useApiResource } from '../../hooks/useApiResource'
import { listAdminAddresses, type AddressStatus } from '../../lib/api'
import { formatShortDate, PLACE_TYPE_LABELS, STATUS_LABELS } from '../../lib/labels'
import { AdminOnly } from './AdminOnly'
import { ADMIN_STATUSES } from './adminData'

const PAGE_SIZE = 20

export function AdminAddressesPage() {
  return <AdminOnly><Addresses /></AdminOnly>
}

/** Registre des adresses par statut, paginé côté serveur (GET /admin/addresses?status=…). */
function Addresses() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('statut') as AddressStatus | null
  const status: AddressStatus = requested && ADMIN_STATUSES.includes(requested) ? requested : 'VALIDATED'
  const page = Math.max(0, Number(params.get('page') ?? 0) || 0)
  const { state } = useApiResource((token) => listAdminAddresses(token, status, page, PAGE_SIZE), [status, page])
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => {
    if (state.kind !== 'ready') return []
    const q = filter.trim().toLowerCase()
    return state.data.items.filter((a) => !q || [a.publicCode, a.title, a.district, a.city].some((v) => v.toLowerCase().includes(q)))
  }, [state, filter])

  return (
    <main className="admin-page">
      <header className="admin-page__head">
        <h1>Adresses</h1>
        <span>Registre complet, par statut</span>
      </header>
      <div className="admin-toolbar">
        <div className="admin-tabs" role="group" aria-label="Statut">
          {ADMIN_STATUSES.map((s) => (
            <button key={s} type="button" aria-pressed={s === status} onClick={() => setParams({ statut: s })}>{STATUS_LABELS[s]}</button>
          ))}
        </div>
        <div className="admin-search">
          <Search aria-hidden="true" />
          <label className="visually-hidden" htmlFor="admin-filter">Filtrer cette page</label>
          <input id="admin-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer : code, lieu, quartier…" />
        </div>
      </div>

      <section className="admin-panel" aria-label={`Adresses : ${STATUS_LABELS[status]}`}>
        {state.kind === 'loading' && <p className="loading" role="status">Chargement…</p>}
        {state.kind === 'error' && <p className="alert alert--error" role="alert">{state.message}</p>}
        {state.kind === 'ready' && (
          <>
            <p className="admin-muted admin-count">{state.data.totalElements} adresse{state.data.totalElements > 1 ? 's' : ''} · {STATUS_LABELS[status].toLowerCase()}</p>
            {rows.length === 0 ? <p className="admin-empty">{state.data.totalElements === 0 ? 'Aucune adresse avec ce statut.' : 'Aucune adresse de cette page ne correspond au filtre.'}</p> : (
              <div className="table-scroll">
                <table className="admin-table">
                  <thead><tr><th scope="col">Code</th><th scope="col">Lieu</th><th scope="col">Type</th><th scope="col">Quartier · Ville</th><th scope="col">Publication</th><th scope="col">Créée</th><th scope="col">Décision</th><th scope="col">Statut</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td className="admin-table__code">{a.publicCode}</td>
                        <td>{a.title}</td>
                        <td>{PLACE_TYPE_LABELS[a.placeType]}</td>
                        <td>{a.district}, {a.city}</td>
                        <td>{a.publiclyAccessible ? 'Publique' : a.publicationConsent ? 'Autorisée' : 'Privée'}</td>
                        <td>{formatShortDate(a.createdAt)}</td>
                        <td>{a.moderatedAt ? formatShortDate(a.moderatedAt) : '—'}</td>
                        <td><StatusBadge status={a.status} /></td>
                        <td className="admin-table__actions">
                          {a.status === 'PENDING_VALIDATION' && <Link className="button button-primary button-sm" to={`/admin/moderation?id=${encodeURIComponent(a.id)}`}>Examiner</Link>}
                          {a.publiclyAccessible && <Link className="button button-ghost-dark button-sm" to={`/a/${encodeURIComponent(a.publicCode)}`} aria-label={`Fiche publique de ${a.publicCode}`}><Eye aria-hidden="true" />Fiche</Link>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {state.data.totalPages > 1 && (
              <nav className="pager pager--dark" aria-label="Pagination">
                <button className="button button-ghost-dark button-sm" type="button" disabled={page === 0} onClick={() => setParams({ statut: status, page: String(page - 1) })}>Précédent</button>
                <span>Page {page + 1} sur {state.data.totalPages}</span>
                <button className="button button-ghost-dark button-sm" type="button" disabled={page + 1 >= state.data.totalPages} onClick={() => setParams({ statut: status, page: String(page + 1) })}>Suivant</button>
              </nav>
            )}
          </>
        )}
      </section>
    </main>
  )
}
