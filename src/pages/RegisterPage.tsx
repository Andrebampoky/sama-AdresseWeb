import { useState, type FormEvent } from 'react'
import { UserPlus } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { AuthShell } from '../components/AuthShell'
import { FormField } from '../components/FormField'
import { PasswordInput } from '../components/PasswordInput'
import { describedBy } from '../lib/forms'
import { ApiError, type FieldErrors } from '../lib/api'
import { errorMessage } from '../lib/errors'

const PASSWORD_HINT = 'Au moins 10 caractères, dont une lettre et un chiffre.'

/** Mêmes règles que le serveur, pour un retour immédiat ; le serveur reste l'autorité. */
function validate(displayName: string, email: string, password: string, confirmation: string): FieldErrors {
  const errors: FieldErrors = {}
  if (displayName.trim().length < 2) errors.displayName = 'Le nom affiché doit contenir au moins 2 caractères.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'L’e-mail n’est pas valide.'
  if (password.length < 10 || password.length > 72) errors.password = 'Le mot de passe doit contenir entre 10 et 72 caractères.'
  else if (!/\p{L}/u.test(password) || !/\d/.test(password)) errors.password = 'Le mot de passe doit contenir au moins une lettre et un chiffre.'
  if (confirmation !== password) errors.confirmation = 'Les deux mots de passe ne correspondent pas.'
  return errors
}

export function RegisterPage() {
  const { register, status } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'authenticated' && !submitting) return <Navigate to="/mes-adresses" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validate(displayName, email, password, confirmation)
    setFieldErrors(errors)
    setError(null)
    if (Object.keys(errors).length > 0) return
    setSubmitting(true)
    try {
      await register(email, password, displayName)
      navigate('/tableau-de-bord', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors)
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      kicker="Nouveau compte"
      title="Créer un compte"
      intro="Un compte vous permet d’enregistrer vos lieux et d’obtenir leur code SamaAdresse."
      footer={<p>Déjà inscrit ? <Link to="/connexion">Se connecter</Link></p>}
    >
      <form className="stack-form" onSubmit={handleSubmit} noValidate aria-label="Inscription">
        <FormField id="register-name" label="Nom affiché" error={fieldErrors.displayName}>
          <input id="register-name" autoComplete="nickname" value={displayName} aria-invalid={!!fieldErrors.displayName}
            aria-describedby={describedBy('register-name', fieldErrors.displayName)} onChange={(e) => setDisplayName(e.target.value)} />
        </FormField>
        <FormField id="register-email" label="E-mail" error={fieldErrors.email}>
          <input id="register-email" type="email" autoComplete="email" value={email} aria-invalid={!!fieldErrors.email}
            aria-describedby={describedBy('register-email', fieldErrors.email)} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField id="register-password" label="Mot de passe" error={fieldErrors.password} hint={PASSWORD_HINT}>
          <PasswordInput id="register-password" autoComplete="new-password" value={password} aria-invalid={!!fieldErrors.password}
            aria-describedby={describedBy('register-password', fieldErrors.password, PASSWORD_HINT)} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <FormField id="register-confirmation" label="Confirmer le mot de passe" error={fieldErrors.confirmation}>
          <PasswordInput id="register-confirmation" autoComplete="new-password" value={confirmation} aria-invalid={!!fieldErrors.confirmation}
            aria-describedby={describedBy('register-confirmation', fieldErrors.confirmation)} onChange={(e) => setConfirmation(e.target.value)} />
        </FormField>
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <button className="button button-primary button-block" type="submit" disabled={submitting}>
          <UserPlus aria-hidden="true" />{submitting ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>
    </AuthShell>
  )
}
