import { Archive, MessageSquare, PencilLine, Save, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/authContext'
import { publicAddressUrl } from '../hooks/usePublicAddress'
import { LocalLinkWarning } from './LocalLinkWarning'
import {
  ApiError, archiveMyAddress, sendAddressSms, updateMyAddress, type FieldErrors, type OwnerAddress, type PlaceType,
} from '../lib/api'
import { errorMessage } from '../lib/errors'
import { describedBy } from '../lib/forms'
import { PLACE_TYPE_LABELS } from '../lib/labels'
import { FormField } from './FormField'

type Feedback = { tone: 'success' | 'error' | 'warning'; text: string } | null

/**
 * Gestion d'une adresse par son propriétaire : modification (le serveur la renvoie en vérification
 * si le contenu change après une décision), publication, envoi du lien par SMS et archivage.
 */
export function OwnerManagePanel({ address, onChanged }: { address: OwnerAddress; onChanged: (a: OwnerAddress) => void }) {
  const archived = address.status === 'ARCHIVED'
  return (
    <section className="panel manage" aria-labelledby="manage-title">
      <h2 className="panel-title" id="manage-title"><PencilLine aria-hidden="true" />Gérer l’adresse</h2>
      {archived
        ? <p className="muted">Adresse archivée : elle n’est plus publique et ne peut plus être modifiée.</p>
        : (
          <>
            <EditForm address={address} onChanged={onChanged} />
            {address.publiclyAccessible && <SmsForm address={address} />}
            <ArchiveControl address={address} onChanged={onChanged} />
          </>
        )}
    </section>
  )
}

function useRunner() {
  const { token, logout } = useAuth()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  async function run<T>(action: (token: string) => Promise<T>, onSuccess: (result: T) => Feedback) {
    if (!token) return
    setBusy(true)
    setFeedback(null)
    setFieldErrors({})
    try {
      setFeedback(onSuccess(await action(token)))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { logout(); return }
      if (error instanceof ApiError) setFieldErrors(error.fieldErrors)
      setFeedback({ tone: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }
  return { busy, feedback, fieldErrors, run, setFeedback }
}

function EditForm({ address, onChanged }: { address: OwnerAddress; onChanged: (a: OwnerAddress) => void }) {
  const [title, setTitle] = useState(address.title)
  const [placeType, setPlaceType] = useState<PlaceType>(address.placeType)
  const [description, setDescription] = useState(address.description ?? '')
  const [consent, setConsent] = useState(address.publicationConsent)
  const [ownerNamePublic, setOwnerNamePublic] = useState(address.ownerNamePublic)
  const { busy, feedback, fieldErrors: fe, run } = useRunner()
  const contentChanged = title.trim() !== address.title || placeType !== address.placeType
    || (description.trim() || null) !== address.description
  const decided = address.status === 'VALIDATED' || address.status === 'REJECTED'

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(
      (token) => updateMyAddress(token, address.id, {
        title: title.trim(), placeType, description: description.trim() || null,
        publicationConsent: consent, ownerNamePublic: consent && ownerNamePublic,
      }),
      (updated) => {
        onChanged(updated)
        return updated.status === 'PENDING_VALIDATION' && decided
          ? { tone: 'warning', text: 'Modifications enregistrées. L’adresse repasse en vérification : le lien public reviendra après validation.' }
          : { tone: 'success', text: 'Modifications enregistrées.' }
      },
    )
  }

  return (
    <form className="stack-form manage__form" onSubmit={submit} noValidate aria-label="Modifier l’adresse">
      <div className="field-row">
        <FormField id="edit-title" label="Nom du lieu" error={fe.title}>
          <input id="edit-title" value={title} maxLength={160} aria-invalid={!!fe.title}
            aria-describedby={describedBy('edit-title', fe.title)} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField id="edit-type" label="Type de lieu" error={fe.placeType}>
          <select id="edit-type" value={placeType} onChange={(e) => setPlaceType(e.target.value as PlaceType)}>
            {(Object.keys(PLACE_TYPE_LABELS) as PlaceType[]).map((t) => <option key={t} value={t}>{PLACE_TYPE_LABELS[t]}</option>)}
          </select>
        </FormField>
      </div>
      <FormField id="edit-description" label="Repères utiles" error={fe.description}>
        <textarea id="edit-description" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <label className="choice choice--check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Publier l’adresse (après validation)<small>Décocher masque immédiatement la fiche publique et le QR code.</small></span>
      </label>
      {consent && (
        <label className="choice choice--check">
          <input type="checkbox" checked={ownerNamePublic} onChange={(e) => setOwnerNamePublic(e.target.checked)} />
          <span>Afficher mon nom dans l’annuaire</span>
        </label>
      )}
      <p className="field-hint">La position, la ville et le quartier déterminent le code : pour les changer, créez une nouvelle adresse.</p>
      {contentChanged && decided && <p className="alert alert--warning">Modifier le nom, le type ou les repères renverra l’adresse en vérification.</p>}
      {feedback && <p className={`alert alert--${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}
      <div><button className="button button-primary" type="submit" disabled={busy}><Save aria-hidden="true" />{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>
    </form>
  )
}

function SmsForm({ address }: { address: OwnerAddress }) {
  const [phone, setPhone] = useState('')
  const { busy, feedback, fieldErrors: fe, run } = useRunner()
  const [unavailable, setUnavailable] = useState(false)
  const [sentLink, setSentLink] = useState<string | null>(null)
  const message = `Voici mon adresse SamaAdresse ${address.publicCode} : ${publicAddressUrl(address.publicCode)}`

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(
      (token) => sendAddressSms(token, address.id, phone).catch((error) => {
        if (error instanceof ApiError && error.status === 503) setUnavailable(true)
        throw error
      }),
      (result) => {
        setSentLink(result.link)
        return result.status === 'SENT'
          ? { tone: 'success', text: `SMS confié au fournisseur ${result.provider} pour le ${result.to}. Lien envoyé : ${result.link}` }
          : { tone: 'warning', text: `Mode simulation du serveur : AUCUN SMS n’a été envoyé (destinataire ${result.to}). Configurez un fournisseur pour un envoi réel.` }
      },
    )
  }

  return (
    <form className="stack-form manage__sms" onSubmit={submit} noValidate aria-label="Envoyer le lien par SMS">
      <h3><MessageSquare aria-hidden="true" className="inline-icon" /> Envoyer le lien par SMS</h3>
      <div className="manage__sms-row">
        <FormField id="sms-phone" label="Numéro du destinataire" error={fe.phone} hint="Ex. 77 123 45 67 ou +221 77 123 45 67">
          <input id="sms-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} aria-invalid={!!fe.phone}
            aria-describedby={describedBy('sms-phone', fe.phone, 'hint')} onChange={(e) => setPhone(e.target.value)} />
        </FormField>
        <button className="button button-success" type="submit" disabled={busy || !phone.trim()}><Send aria-hidden="true" />{busy ? 'Envoi…' : 'Envoyer'}</button>
      </div>
      {feedback && <p className={`alert alert--${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}
      {sentLink && <LocalLinkWarning url={sentLink} />}
      {unavailable && (
        <a className="button button-secondary" href={`sms:${encodeURIComponent(phone)}?&body=${encodeURIComponent(message)}`}>
          <MessageSquare aria-hidden="true" />Ouvrir ma messagerie à la place
        </a>
      )}
    </form>
  )
}

function ArchiveControl({ address, onChanged }: { address: OwnerAddress; onChanged: (a: OwnerAddress) => void }) {
  const [confirming, setConfirming] = useState(false)
  const { busy, feedback, run } = useRunner()
  return (
    <div className="manage__archive">
      {confirming ? (
        <>
          <p className="alert alert--warning" role="status">Archiver {address.publicCode} ? La fiche publique, le lien et le QR code cesseront de fonctionner. C’est définitif.</p>
          <div className="manage__actions">
            <button className="button button-danger" type="button" disabled={busy}
              onClick={() => void run((token) => archiveMyAddress(token, address.id), (updated) => { onChanged(updated); return null })}>
              <Archive aria-hidden="true" />Confirmer l’archivage
            </button>
            <button className="button button-secondary" type="button" disabled={busy} onClick={() => setConfirming(false)}>Annuler</button>
          </div>
        </>
      ) : (
        <button className="button button-secondary" type="button" onClick={() => setConfirming(true)}><Archive aria-hidden="true" />Archiver l’adresse</button>
      )}
      {feedback && <p className="alert alert--error" role="alert">{feedback.text}</p>}
    </div>
  )
}
