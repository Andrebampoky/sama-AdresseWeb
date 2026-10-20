import { Archive, CircleCheck, Flag } from 'lucide-react'
import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { StatusBadge } from '../../components/StatusBadge'
import { useApiResource } from '../../hooks/useApiResource'
import { ApiError, listReports, resolveReport, type AdminReport, type ReportStatus } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { formatDate, REPORT_REASONS } from '../../lib/labels'
import { AdminOnly } from './AdminOnly'
import type { AdminOutletContext } from './adminData'

const TABS: Array<{ status: ReportStatus; label: string }> = [
  { status: 'OPEN', label: 'À traiter' },
  { status: 'ACTION_TAKEN', label: 'Adresse archivée' },
  { status: 'DISMISSED', label: 'Écartés' },
]

export function AdminReportsPage() {
  return <AdminOnly><Reports /></AdminOnly>
}

/**
 * Signalements (rôle Admin du cahier des charges) : écarter un signalement non fondé, ou archiver
 * l'adresse signalée, ce qui clôt aussi les autres signalements ouverts sur la même adresse.
 */
function Reports() {
  const { token, logout } = useAuth()
  const outlet = useOutletContext<AdminOutletContext | undefined>()
  const [status, setStatus] = useState<ReportStatus>('OPEN')
  const [page, setPage] = useState(0)
  const { state, reload } = useApiResource((t) => listReports(t, status, page, 20), [status, page])
  const [confirming, setConfirming] = useState<{ id: string; decision: 'dismiss' | 'archive-address' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  async function decide(report: AdminReport, decision: 'dismiss' | 'archive-address') {
    if (!token) return
    setBusy(true)
    try {
      await resolveReport(token, report.id, decision)
      setMessage({ tone: 'success', text: decision === 'dismiss' ? `Signalement sur ${report.publicCode} écarté : l’adresse reste en ligne.` : `${report.publicCode} archivée : elle n’est plus publique.` })
      setConfirming(null)
      reload()
      outlet?.refreshPending()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) logout()
      setMessage({ tone: 'error', text: errorMessage(error) })
      if (error instanceof ApiError && error.status === 409) reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-page__head"><h1>Signalements</h1><span>Adresses signalées par les utilisateurs</span></header>
      <div className="admin-toolbar">
        <div className="admin-tabs" role="group" aria-label="Statut des signalements">
          {TABS.map((t) => <button key={t.status} type="button" aria-pressed={status === t.status} onClick={() => { setStatus(t.status); setPage(0); setMessage(null) }}>{t.label}</button>)}
        </div>
      </div>
      {message && <p className={`alert alert--${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      {state.kind === 'loading' && <p className="loading" role="status">Chargement…</p>}
      {state.kind === 'error' && <p className="alert alert--error" role="alert">{state.message}</p>}
      {state.kind === 'ready' && state.data.items.length === 0 && (
        <section className="admin-panel state"><CircleCheck aria-hidden="true" className="state__ok" /><h2>Aucun signalement</h2><p>Rien à afficher pour ce statut.</p></section>
      )}
      {state.kind === 'ready' && state.data.items.length > 0 && (
        <ul className="report-cards">
          {state.data.items.map((r) => (
            <li key={r.id} className="admin-panel report-card">
              <div className="report-card__head">
                <span className="queue-list__icon queue-list__icon--red"><Flag aria-hidden="true" /></span>
                <div>
                  <h2>{REPORT_REASONS[r.reason]} — <span className="admin-table__code">{r.publicCode}</span></h2>
                  <p className="admin-muted">{r.addressTitle} · {r.district}, {r.city} · signalé par {r.reporterName} le {formatDate(r.createdAt)}</p>
                </div>
                <StatusBadge status={r.addressStatus} />
              </div>
              {r.comment && <blockquote className="report-card__comment">« {r.comment} »</blockquote>}
              {r.status === 'OPEN' && (
                <div className="moderation__actions">
                  {r.addressStatus === 'VALIDATED' && <Link className="admin-link" to={`/a/${encodeURIComponent(r.publicCode)}`}>Voir la fiche publique</Link>}
                  {confirming?.id === r.id ? (
                    <>
                      <p className="moderation__confirm" role="status">{confirming.decision === 'dismiss' ? 'Écarter ce signalement ? L’adresse restera en ligne.' : `Archiver ${r.publicCode} ? La fiche publique disparaîtra définitivement.`}</p>
                      <button className={confirming.decision === 'dismiss' ? 'button button-success' : 'button button-danger'} type="button" disabled={busy} onClick={() => decide(r, confirming.decision)}>
                        {confirming.decision === 'dismiss' ? 'Confirmer : écarter' : 'Confirmer l’archivage'}
                      </button>
                      <button className="button button-ghost-dark" type="button" disabled={busy} onClick={() => setConfirming(null)}>Annuler</button>
                    </>
                  ) : (
                    <>
                      <button className="button button-ghost-dark" type="button" onClick={() => setConfirming({ id: r.id, decision: 'dismiss' })} aria-label={`Écarter le signalement sur ${r.publicCode}`}><CircleCheck aria-hidden="true" />Écarter</button>
                      <button className="button button-danger" type="button" onClick={() => setConfirming({ id: r.id, decision: 'archive-address' })} aria-label={`Archiver l’adresse ${r.publicCode}`}><Archive aria-hidden="true" />Archiver l’adresse</button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {state.kind === 'ready' && state.data.totalPages > 1 && (
        <nav className="pager pager--dark" aria-label="Pagination">
          <button className="button button-ghost-dark button-sm" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button>
          <span>Page {page + 1} sur {state.data.totalPages}</span>
          <button className="button button-ghost-dark button-sm" type="button" disabled={page + 1 >= state.data.totalPages} onClick={() => setPage(page + 1)}>Suivant</button>
        </nav>
      )}
    </main>
  )
}
