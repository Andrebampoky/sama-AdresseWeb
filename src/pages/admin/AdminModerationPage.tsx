import { Camera, CircleCheck, ExternalLink, Globe, Lock, MapPin, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { AddressMap } from '../../components/map/AddressMap'
import { useApiResource } from '../../hooks/useApiResource'
import { useProtectedPhoto } from '../../hooks/useProtectedPhoto'
import { adminPhotoPath, ApiError, listAdminAddresses, moderateAddress, type OwnerAddress } from '../../lib/api'
import { collectPages } from '../../lib/collect'
import { errorMessage } from '../../lib/errors'
import { osmUrl } from '../../lib/geo'
import { formatDate, formatShortDate, PLACE_TYPE_LABELS } from '../../lib/labels'
import { AdminOnly } from './AdminOnly'
import type { AdminOutletContext } from './adminData'

type Decision = 'validate' | 'reject'

export function AdminModerationPage() {
  return <AdminOnly><Moderation /></AdminOnly>
}

/**
 * File de modération : l'API renvoie les adresses en attente les plus anciennes d'abord.
 * L'administrateur examine la fiche et la position sur la carte avant de décider ; chaque décision
 * demande une confirmation et est définitive (une adresse déjà modérée renvoie 409).
 */
function Moderation() {
  const { token, logout } = useAuth()
  const outlet = useOutletContext<AdminOutletContext | undefined>()
  const [params, setParams] = useSearchParams()
  const { state, reload } = useApiResource((t) => collectPages((page) => listAdminAddresses(t, 'PENDING_VALIDATION', page, 50)), [])
  const [confirming, setConfirming] = useState<Decision | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const queue = state.kind === 'ready' ? state.data.items : []
  const selected = queue.find((a) => a.id === params.get('id')) ?? queue[0]
  const photo = useProtectedPhoto(selected?.hasPhoto ? adminPhotoPath(selected.id) : null)

  function select(address: OwnerAddress) {
    setConfirming(null)
    setParams({ id: address.id }, { replace: true })
  }

  async function decide(address: OwnerAddress, decision: Decision) {
    if (!token) return
    setBusy(true)
    try {
      const updated = await moderateAddress(token, address.id, decision)
      setMessage({ tone: 'success', text: `${updated.publicCode} : ${decision === 'validate' ? 'adresse validée' : 'adresse rejetée'}.` })
      setConfirming(null)
      // On passe à l'adresse suivante de la file.
      const next = queue.find((a) => a.id !== address.id)
      setParams(next ? { id: next.id } : {}, { replace: true })
      reload()
      outlet?.refreshPending()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) logout()
      if (error instanceof ApiError && error.status === 409) {
        setMessage({ tone: 'error', text: `${address.publicCode} a déjà été modérée par un autre administrateur.` })
        setConfirming(null)
        reload()
        outlet?.refreshPending()
      } else {
        setMessage({ tone: 'error', text: errorMessage(error) })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-page__head">
        <h1>Modération</h1>
        <span>{state.kind === 'ready' ? `${state.data.total} adresse${state.data.total > 1 ? 's' : ''} en attente` : ''}</span>
      </header>
      {message && <p className={`alert alert--${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      {state.kind === 'loading' && <p className="loading" role="status">Chargement de la file…</p>}
      {state.kind === 'error' && <p className="alert alert--error" role="alert">{state.message}</p>}
      {state.kind === 'ready' && queue.length === 0 && (
        <section className="admin-panel state">
          <CircleCheck aria-hidden="true" className="state__ok" />
          <h2>File de modération vide</h2>
          <p>Toutes les adresses enregistrées ont été examinées.</p>
        </section>
      )}
      {state.kind === 'ready' && selected && (
        <div className="moderation">
          <section className="admin-panel moderation__queue" aria-labelledby="queue-title">
            <h2 id="queue-title">File d’attente <small>(plus anciennes d’abord)</small></h2>
            <ul className="queue-list" aria-label="Adresses en attente">
              {queue.map((a) => (
                <li key={a.id}>
                  <button type="button" className={a.id === selected.id ? 'queue-list__item queue-list__item--active' : 'queue-list__item'}
                    aria-current={a.id === selected.id ? 'true' : undefined} onClick={() => select(a)}>
                    <span className="queue-list__text">
                      <strong>{a.publicCode}</strong>
                      <small>{a.title} · {PLACE_TYPE_LABELS[a.placeType]}</small>
                      <small>{a.district}, {a.city} · {formatShortDate(a.createdAt)}</small>
                    </span>
                    {a.publicationConsent ? <Globe role="img" aria-label="Publication demandée" /> : <Lock role="img" aria-label="Adresse privée" />}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-panel moderation__detail" aria-labelledby="review-title">
            <div className="admin-panel__head">
              <div>
                <h2 id="review-title" className="moderation__code">{selected.publicCode}</h2>
                <p className="moderation__meta">{selected.title} · {PLACE_TYPE_LABELS[selected.placeType]}</p>
              </div>
              <span className={selected.publicationConsent ? 'consent-tag consent-tag--public' : 'consent-tag'}>
                {selected.publicationConsent ? <><Globe aria-hidden="true" />Publication demandée</> : <><Lock aria-hidden="true" />Reste privée</>}
              </span>
            </div>
            <div className="moderation__photo">
              {photo.url
                ? <img src={photo.url} alt={`Façade proposée pour ${selected.publicCode}`} />
                : <div className="moderation__no-photo"><Camera aria-hidden="true" />{selected.hasPhoto ? (photo.failed ? 'Photo indisponible' : 'Chargement de la photo…') : 'Aucune photo fournie'}</div>}
            </div>
            <div className="moderation__body">
              <dl className="admin-facts">
                <div><dt>Quartier · Ville</dt><dd>{selected.district}, {selected.city}</dd></div>
                <div><dt>Coordonnées GPS</dt><dd>{selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}</dd></div>
                <div><dt>Repères</dt><dd>{selected.description || <span className="admin-muted">Aucun repère fourni</span>}</dd></div>
                <div><dt>Enregistrée le</dt><dd>{formatDate(selected.createdAt)}</dd></div>
              </dl>
              <div className="moderation__map">
                <div className="map-frame admin-map admin-map--sm">
                  <AddressMap addresses={[{ key: selected.id, ...selected, href: undefined }]} label={`Position de ${selected.publicCode}`} zoom={17} />
                </div>
                <a className="admin-link" href={osmUrl(selected.latitude, selected.longitude)} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" className="inline-icon" /> Ouvrir dans OpenStreetMap</a>
              </div>
            </div>
            <div className="moderation__checks">
              <h3><MapPin aria-hidden="true" className="inline-icon" /> Points à vérifier</h3>
              <ul>
                <li>Le marqueur tombe sur un bâtiment ou une parcelle plausible, dans le quartier indiqué.</li>
                <li>Le nom et les repères ne contiennent ni donnée personnelle sensible ni contenu inapproprié.</li>
                {selected.hasPhoto && <li>La photo montre bien une façade (pas de visage reconnaissable, de plaque d’immatriculation ni de document).</li>}
                <li>{selected.publicationConsent
                  ? 'Une fois validée, l’adresse sera consultable par toute personne connaissant son code.'
                  : 'Le propriétaire n’a pas autorisé la publication : validée, elle restera privée.'}</li>
              </ul>
            </div>
            <div className="moderation__actions">
              {confirming ? (
                <>
                  <p className="moderation__confirm" role="status">
                    {confirming === 'validate' ? 'Confirmer la validation' : 'Confirmer le rejet'} de {selected.publicCode} ? Cette décision est définitive.
                  </p>
                  <button className={confirming === 'validate' ? 'button button-success' : 'button button-danger'} type="button" disabled={busy} onClick={() => decide(selected, confirming)}>
                    {busy ? 'Enregistrement…' : confirming === 'validate' ? 'Confirmer la validation' : 'Confirmer le rejet'}
                  </button>
                  <button className="button button-ghost-dark" type="button" disabled={busy} onClick={() => setConfirming(null)}>Annuler</button>
                </>
              ) : (
                <>
                  <button className="button button-success" type="button" onClick={() => setConfirming('validate')} aria-label={`Valider ${selected.publicCode}`}><CircleCheck aria-hidden="true" />Valider</button>
                  <button className="button button-ghost-dark" type="button" onClick={() => setConfirming('reject')} aria-label={`Rejeter ${selected.publicCode}`}><XCircle aria-hidden="true" />Rejeter</button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
