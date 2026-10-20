import { Flag } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { ApiError, reportAddress, type ReportReason } from '../lib/api'
import { errorMessage } from '../lib/errors'
import { REPORT_REASONS } from '../lib/labels'

/** Signalement d'une adresse publique (connexion requise) ; traité ensuite par un administrateur. */
export function ReportForm({ code }: { code: string }) {
  const { status, token, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason | ''>('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  if (status !== 'authenticated') {
    return <p className="report-link"><Flag aria-hidden="true" className="inline-icon" /> Une erreur sur cette fiche ? <Link to="/connexion" state={{ from: `/a/${code}` }}>Connectez-vous pour la signaler</Link>.</p>
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reason || !token) {
      setResult({ tone: 'error', text: 'Choisissez un motif.' })
      return
    }
    setBusy(true)
    try {
      await reportAddress(token, code, reason, comment.trim() || null)
      setResult({ tone: 'success', text: 'Merci : le signalement a été transmis à l’équipe de modération.' })
      setOpen(false)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { logout(); return }
      setResult({ tone: 'error', text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="report">
      {!open && <button className="button button-secondary button-sm" type="button" onClick={() => { setOpen(true); setResult(null) }}><Flag aria-hidden="true" />Signaler un problème</button>}
      {open && (
        <form className="stack-form report__form" onSubmit={submit} aria-label="Signaler cette adresse">
          <fieldset className="consent">
            <legend>Motif du signalement</legend>
            {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
              <label key={r} className="choice">
                <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                <span>{REPORT_REASONS[r]}</span>
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="report-comment">Précisions (facultatif)</label>
            <textarea id="report-comment" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <div className="manage__actions">
            <button className="button button-danger" type="submit" disabled={busy}><Flag aria-hidden="true" />{busy ? 'Envoi…' : 'Envoyer le signalement'}</button>
            <button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Annuler</button>
          </div>
        </form>
      )}
      {result && <p className={`alert alert--${result.tone}`} role={result.tone === 'error' ? 'alert' : 'status'}>{result.text}</p>}
    </div>
  )
}
