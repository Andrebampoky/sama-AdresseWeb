import { ArrowRight, Clock, Flag, Globe, MapPinned, UserRound, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AddressMap } from '../../components/map/AddressMap'
import { StatusBadge } from '../../components/StatusBadge'
import { useApiResource } from '../../hooks/useApiResource'
import { getAdminStats, listReports, listUsers } from '../../lib/api'
import { formatShortDate, initials, PLACE_TYPE_LABELS, REPORT_REASONS } from '../../lib/labels'
import { AdminOnly } from './AdminOnly'
import { flatten, loadAllByStatus } from './adminData'
import { EvolutionChart, TypeDonut } from './charts'

export function AdminDashboardPage() {
  return <AdminOnly><Dashboard /></AdminOnly>
}

/** Indicateurs exacts (calculés en base), puis listes récentes et carte. */
async function loadDashboard(token: string) {
  const [stats, reports, users, addresses] = await Promise.all([
    getAdminStats(token), listReports(token, 'OPEN', 0, 5), listUsers(token, 0, 5), loadAllByStatus(token),
  ])
  return { stats, reports, users, addresses }
}

function Dashboard() {
  const { state } = useApiResource(loadDashboard, [])
  const today = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())

  return (
    <main className="admin-page">
      <header className="admin-page__head">
        <h1>Tableau de bord</h1>
        <span>{today}</span>
      </header>

      {state.kind === 'loading' && <p className="loading" role="status">Chargement des données…</p>}
      {state.kind === 'error' && <p className="alert alert--error" role="alert">{state.message}</p>}
      {state.kind === 'ready' && (() => {
        const { stats, reports, users, addresses } = state.data
        const all = flatten(addresses)
        const truncated = Object.values(addresses).some((c) => c.truncated)
        const latest = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)
        const thisMonth = stats.monthly[stats.monthly.length - 1]?.total ?? 0
        const pending = stats.byStatus.PENDING_VALIDATION ?? 0
        return (
          <>
            <div className="kpi-grid">
              <Kpi icon={Users} tone="blue" label="Utilisateurs" value={stats.users} trend={`${stats.activeUsers} actifs`} />
              <Kpi icon={MapPinned} tone="green" label="Adresses enregistrées" value={stats.totalAddresses} trend={`+${thisMonth} ce mois`} />
              <Kpi icon={Flag} tone="red" label="Signalements en attente" value={stats.openReports} trend={stats.openReports ? 'À traiter' : 'Aucun'} />
              <Kpi icon={Globe} tone="amber" label="Adresses publiques" value={stats.publicAddresses} trend={`${pending} en attente de validation`} />
            </div>
            {truncated && <p className="alert alert--warning">Carte et liste calculées sur les 500 adresses les plus récentes de chaque statut ; les indicateurs restent exacts.</p>}

            <div className="admin-grid admin-grid--3">
              <section className="admin-panel admin-panel--span2" aria-labelledby="evolution-title">
                <h2 id="evolution-title">Évolution des adresses</h2>
                <EvolutionChart monthly={stats.monthly} />
              </section>
              <section className="admin-panel" aria-labelledby="types-title">
                <h2 id="types-title">Types de lieux</h2>
                <TypeDonut byType={stats.byType} />
              </section>

              <section className="admin-panel admin-panel--span2" aria-labelledby="latest-title">
                <div className="admin-panel__head">
                  <h2 id="latest-title">Dernières adresses ajoutées</h2>
                  <Link className="admin-link" to="/admin/adresses">Voir tout</Link>
                </div>
                {latest.length === 0 ? <p className="admin-empty">Aucune adresse enregistrée.</p> : (
                  <div className="table-scroll">
                    <table className="admin-table admin-table--compact">
                      <thead><tr><th scope="col">Code</th><th scope="col">Lieu</th><th scope="col">Type</th><th scope="col">Quartier</th><th scope="col">Date</th><th scope="col">Statut</th></tr></thead>
                      <tbody>
                        {latest.map((a) => (
                          <tr key={a.id}>
                            <td className="admin-table__code">{a.publicCode}</td>
                            <td className="admin-table__title" title={a.title}>{a.title}</td>
                            <td>{PLACE_TYPE_LABELS[a.placeType]}</td>
                            <td className="admin-table__title">{a.district}</td>
                            <td>{formatShortDate(a.createdAt)}</td>
                            <td><StatusBadge status={a.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="admin-panel" aria-labelledby="reports-title">
                <div className="admin-panel__head">
                  <h2 id="reports-title">Signalements récents</h2>
                  <Link className="admin-link" to="/admin/signalements">Voir tout</Link>
                </div>
                {reports.items.length === 0 ? <p className="admin-empty">Aucun signalement en attente.</p> : (
                  <ul className="queue-list">
                    {reports.items.map((r) => (
                      <li key={r.id}>
                        <Link to="/admin/signalements" className="queue-list__item">
                          <span className="queue-list__icon queue-list__icon--red"><Flag aria-hidden="true" /></span>
                          <span className="queue-list__text">
                            <strong>{r.publicCode}</strong>
                            <small>{REPORT_REASONS[r.reason]}</small>
                            <small>{formatShortDate(r.createdAt)} · par {r.reporterName}</small>
                          </span>
                          <span className="queue-list__tag">À traiter <ArrowRight aria-hidden="true" /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="admin-panel__foot">
                  <Link className="admin-link" to="/admin/moderation"><Clock aria-hidden="true" className="inline-icon" /> {pending} adresse{pending > 1 ? 's' : ''} à valider</Link>
                </div>
              </section>

              <section className="admin-panel admin-panel--span2" aria-labelledby="map-title">
                <div className="admin-panel__head">
                  <h2 id="map-title">Carte des adresses</h2>
                  <ul className="map-legend">
                    <li><span className="map-legend__dot map-legend__dot--green" />Validée</li>
                    <li><span className="map-legend__dot map-legend__dot--amber" />En attente</li>
                    <li><span className="map-legend__dot map-legend__dot--red" />Rejetée</li>
                  </ul>
                </div>
                <div className="map-frame admin-map">
                  <AddressMap addresses={all.map((a) => ({ key: a.id, ...a, href: undefined }))} label="Carte de toutes les adresses" />
                </div>
              </section>

              <section className="admin-panel" aria-labelledby="users-title">
                <div className="admin-panel__head">
                  <h2 id="users-title">Utilisateurs récents</h2>
                  <Link className="admin-link" to="/admin/utilisateurs">Voir tout</Link>
                </div>
                <ul className="user-list">
                  {users.items.map((u) => (
                    <li key={u.id}>
                      <span className="avatar avatar--sm" aria-hidden="true">{initials(u.displayName)}</span>
                      <span className="user-list__text"><strong>{u.displayName}</strong><small>{u.role === 'ADMIN' ? 'Administrateur' : `Propriétaire · ${u.addressCount} adresse${u.addressCount > 1 ? 's' : ''}`}</small></span>
                      <small>{formatShortDate(u.createdAt)}</small>
                    </li>
                  ))}
                  {users.items.length === 0 && <li className="admin-empty"><UserRound aria-hidden="true" className="inline-icon" /> Aucun compte.</li>}
                </ul>
              </section>
            </div>
          </>
        )
      })()}
    </main>
  )
}

function Kpi({ icon: Icon, tone, label, value, trend }: { icon: LucideIcon; tone: 'blue' | 'amber' | 'green' | 'red'; label: string; value: number; trend: string }) {
  return (
    <div className={`kpi kpi--${tone}`}>
      <span className="kpi__icon"><Icon aria-hidden="true" /></span>
      <span className="kpi__body">
        <small>{label}</small>
        <strong>{value.toLocaleString('fr-FR')}</strong>
        <em>{trend}</em>
      </span>
    </div>
  )
}
