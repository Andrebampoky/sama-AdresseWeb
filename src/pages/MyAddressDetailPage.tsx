import { ArrowLeft, Copy, Eye, Info, QrCode } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { AddressDetails } from '../components/AddressDetails'
import { OwnerManagePanel } from '../components/OwnerManagePanel'
import { OwnerPhotoPanel } from '../components/OwnerPhotoPanel'
import { StatusBadge } from '../components/StatusBadge'
import { StatusTimeline } from '../components/StatusTimeline'
import { useApiResource } from '../hooks/useApiResource'
import { useProtectedPhoto } from '../hooks/useProtectedPhoto'
import { getMyAddress, myPhotoPath, type OwnerAddress } from '../lib/api'
import { copyText } from '../lib/clipboard'
import { formatDate, visibilityLabel } from '../lib/labels'

export function MyAddressDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const navState = location.state as { justCreated?: boolean; provisionalCode?: string; photoError?: string | null } | null
  const justCreated = navState?.justCreated === true
  const { state } = useApiResource((token) => getMyAddress(token, id), [id])
  // Version renvoyée par l'API après un envoi/retrait de photo, sans recharger toute la page.
  const [updated, setUpdated] = useState<OwnerAddress | null>(null)
  const [photoVersion, setPhotoVersion] = useState(0)
  const current = updated?.id === id ? updated : state.kind === 'ready' ? state.data : null
  const photo = useProtectedPhoto(current?.hasPhoto ? myPhotoPath(id) : null, photoVersion)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle')

  async function copyCode(code: string) {
    setCopied(await copyText(code) ? 'ok' : 'failed')
  }

  if (state.kind === 'loading') return <main className="app-page"><p className="loading" role="status">Chargement…</p></main>
  if (state.kind === 'error' && (state.status === 404 || state.status === 400)) {
    return (
      <main className="app-page">
        <section className="panel state">
          <h1>Adresse introuvable</h1>
          <p>Cette adresse n’existe pas ou ne vous appartient pas.</p>
          <Link className="button button-primary" to="/mes-adresses">Retour à mes adresses</Link>
        </section>
      </main>
    )
  }
  if (state.kind === 'error') return <main className="app-page"><p className="alert alert--error" role="alert">{state.message}</p></main>

  const a = current ?? state.data
  const code = encodeURIComponent(a.publicCode)
  return (
    <main className="app-page app-page--narrow">
      <Link className="back-link" to="/mes-adresses"><ArrowLeft aria-hidden="true" />Mes adresses</Link>
      {justCreated && (
        <p className="alert alert--success" role="status">
          Adresse enregistrée avec le code définitif <strong>{a.publicCode}</strong>. Elle est maintenant en attente de validation.
          {navState?.provisionalCode && navState.provisionalCode !== a.publicCode
            && <> Le code provisoire {navState.provisionalCode} était déjà pris dans cette case : le serveur a ajouté un chiffre de départage.</>}
        </p>
      )}
      {justCreated && navState?.photoError && <p className="alert alert--warning" role="alert">La photo n’a pas pu être envoyée ({navState.photoError}). Vous pouvez la réessayer ci-dessous.</p>}
      <AddressDetails
        address={{ ...a, photoUrl: photo.url }}
        badge={<StatusBadge status={a.status} />}
        actions={<>
          <button className="button button-secondary" type="button" onClick={() => copyCode(a.publicCode)}><Copy aria-hidden="true" />Copier le code</button>
          {a.publiclyAccessible ? (
            <>
              <Link className="button button-secondary" to={`/a/${code}`}><Eye aria-hidden="true" />Fiche publique</Link>
              <Link className="button button-primary" to={`/a/${code}/partage`}><QrCode aria-hidden="true" />QR code et partage</Link>
            </>
          ) : (
            <p className="address-sheet__hint"><Info aria-hidden="true" />Le lien public et le QR code seront disponibles une fois l’adresse validée{a.publicationConsent ? '' : ' et sa publication autorisée'}.</p>
          )}
          {copied === 'ok' && <span className="copy-feedback" role="status">Code copié.</span>}
          {copied === 'failed' && <span className="copy-feedback copy-feedback--error" role="alert">Copie impossible : sélectionnez le code manuellement.</span>}
        </>}
      />
      <OwnerPhotoPanel address={a} currentUrl={photo.url} onChanged={(next) => { setUpdated(next); setPhotoVersion((v) => v + 1) }} />
      <OwnerManagePanel key={a.id} address={a} onChanged={setUpdated} />
      <section className="panel owner-facts" aria-labelledby="follow-title">
        <h2 className="panel-title" id="follow-title">Suivi de l’adresse</h2>
        <StatusTimeline address={a} />
        <dl>
          <div><dt>Visibilité</dt><dd>{visibilityLabel(a)}</dd></div>
          <div><dt>Créée le</dt><dd>{formatDate(a.createdAt)}</dd></div>
          {a.moderatedAt && <div><dt>Décision de modération</dt><dd>{formatDate(a.moderatedAt)}</dd></div>}
        </dl>
        {a.status === 'REJECTED' && (
          <p className="alert alert--warning">Cette adresse a été rejetée par l’équipe. Vérifiez la position et les informations, puis enregistrez une nouvelle adresse corrigée.</p>
        )}
      </section>
    </main>
  )
}
