import { CircleCheck, CirclePlus, Clock, Globe, MapPinned, Search, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { AddressRow } from '../components/AddressRow'
import { AddressMap } from '../components/map/AddressMap'
import { StatCard } from '../components/StatCard'
import { useApiResource } from '../hooks/useApiResource'
import { listMyAddresses } from '../lib/api'
import { countByStatus, toMapAddress } from '../lib/addressViews'
import { collectPages } from '../lib/collect'

export function DashboardPage() {
  const { user } = useAuth()
  const { state } = useApiResource((token) => collectPages((page) => listMyAddresses(token, page, 50)), [])
  const firstName = user?.displayName.split(' ')[0] ?? ''

  return (
    <main className="app-page">
      <div className="app-page__head">
        <div>
          <h1>Bonjour {firstName}</h1>
          <p className="muted">Bienvenue sur SamaAdresse !</p>
        </div>
        <div className="app-page__actions">
          <Link className="button button-secondary" to="/recherche"><Search aria-hidden="true" />Rechercher</Link>
          <Link className="button button-primary" to="/mes-adresses/nouvelle"><CirclePlus aria-hidden="true" />Créer une adresse</Link>
        </div>
      </div>

      {state.kind === 'loading' && <p className="loading" role="status">Chargement de vos adresses…</p>}
      {state.kind === 'error' && <p className="alert alert--error" role="alert">{state.message}</p>}
      {state.kind === 'ready' && (() => {
        const { items, total, truncated } = state.data
        const counts = countByStatus(items)
        const latest = items.slice(0, 3)
        return (
          <>
            <div className="stat-grid">
              <StatCard icon={MapPinned} tone="blue" value={total} label="Mes adresses" />
              <StatCard icon={CircleCheck} tone="green" value={counts.validated} label="Validées" />
              <StatCard icon={Clock} tone="amber" value={counts.pending} label="En attente de validation" />
              <StatCard icon={XCircle} tone="red" value={counts.rejected} label="Rejetées" />
            </div>
            {truncated && <p className="alert alert--warning">Seules les {items.length} adresses les plus récentes sont prises en compte ici.</p>}
            {total > 0 && (
              <ul className="dashboard-notes">
                <li><Globe aria-hidden="true" /><span><strong>{counts.publicOnes}</strong> adresse{counts.publicOnes > 1 ? 's' : ''} consultable{counts.publicOnes > 1 ? 's' : ''} publiquement par code, lien ou QR code</span></li>
                {counts.pending > 0 && <li><Clock aria-hidden="true" /><span><strong>{counts.pending}</strong> en cours de vérification par l’équipe : le lien public sera actif après validation</span></li>}
                {counts.rejected > 0 && <li className="dashboard-notes__warn"><XCircle aria-hidden="true" /><span><strong>{counts.rejected}</strong> rejetée{counts.rejected > 1 ? 's' : ''} : vérifiez la position puis enregistrez une adresse corrigée</span></li>}
              </ul>
            )}

            {total === 0 ? (
              <section className="panel state">
                <MapPinned aria-hidden="true" />
                <h2>Aucune adresse pour le moment</h2>
                <p>Créez votre première adresse pour obtenir un code SamaAdresse à partager.</p>
                <Link className="button button-primary" to="/mes-adresses/nouvelle"><CirclePlus aria-hidden="true" />Créer ma première adresse</Link>
              </section>
            ) : (
              <section className="dashboard-map" aria-label="Carte de mes adresses">
                <div className="map-frame dashboard-map__frame">
                  <AddressMap addresses={items.map(toMapAddress)} label="Carte de mes adresses" />
                </div>
                <aside className="dashboard-map__panel">
                  <h2 className="panel-title"><MapPinned aria-hidden="true" />Mes dernières adresses</h2>
                  <div className="dashboard-map__list">
                    {latest.map((address) => <AddressRow key={address.id} address={address} compact />)}
                  </div>
                  <Link className="text-link" to="/mes-adresses">Voir tout</Link>
                </aside>
              </section>
            )}
          </>
        )
      })()}
    </main>
  )
}
