import { Check, Clock, Globe, Lock, ShieldCheck, X } from 'lucide-react'
import type { OwnerAddress } from '../lib/api'
import { formatDate } from '../lib/labels'

type StepState = 'done' | 'current' | 'failed' | 'todo'
interface Step { key: string; title: string; detail: string; state: StepState; icon: typeof Check }

/**
 * Cycle de vie d'une adresse tel que l'applique le backend :
 * enregistrement → vérification par l'équipe → validée ou rejetée → publique seulement si
 * validée ET publication consentie (publiclyAccessible).
 */
function lifecycleSteps(a: Pick<OwnerAddress, 'status' | 'publicationConsent' | 'publiclyAccessible' | 'createdAt' | 'moderatedAt'>): Step[] {
  const moderated = a.status === 'VALIDATED' || a.status === 'REJECTED'
  const steps: Step[] = [
    { key: 'created', title: 'Adresse enregistrée', detail: `Code attribué le ${formatDate(a.createdAt)}`, state: 'done', icon: Check },
    {
      key: 'review',
      title: 'Vérification par l’équipe',
      detail: moderated ? 'Vérification terminée' : 'L’équipe contrôle la position et les informations',
      state: moderated ? 'done' : a.status === 'PENDING_VALIDATION' ? 'current' : 'todo',
      icon: moderated ? Check : Clock,
    },
  ]
  if (a.status === 'REJECTED') {
    steps.push({ key: 'decision', title: 'Adresse rejetée', detail: a.moderatedAt ? `Décision du ${formatDate(a.moderatedAt)}` : 'Décision enregistrée', state: 'failed', icon: X })
    return steps
  }
  steps.push({
    key: 'decision',
    title: 'Adresse validée',
    detail: a.status === 'VALIDATED' && a.moderatedAt ? `Validée le ${formatDate(a.moderatedAt)}` : 'En attente de la décision',
    state: a.status === 'VALIDATED' ? 'done' : 'todo',
    icon: ShieldCheck,
  })
  steps.push(a.publicationConsent
    ? { key: 'public', title: 'Consultable par son code', detail: a.publiclyAccessible ? 'Lien public et QR code actifs' : 'Dès la validation', state: a.publiclyAccessible ? 'done' : 'todo', icon: Globe }
    : { key: 'public', title: 'Adresse privée', detail: 'Vous n’avez pas autorisé la publication : elle reste invisible au public', state: a.status === 'VALIDATED' ? 'done' : 'todo', icon: Lock })
  return steps
}

export function StatusTimeline({ address }: { address: OwnerAddress }) {
  return (
    <ol className="timeline" aria-label="Suivi de l’adresse">
      {lifecycleSteps(address).map(({ key, title, detail, state, icon: Icon }) => (
        <li key={key} className={`timeline__step timeline__step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
          <span className="timeline__dot"><Icon aria-hidden="true" /></span>
          <span className="timeline__text"><strong>{title}</strong><small>{detail}</small></span>
        </li>
      ))}
    </ol>
  )
}
