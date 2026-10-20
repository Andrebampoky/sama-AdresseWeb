import { ArrowLeft, ArrowLeftRight, ArrowRight, Check, Info, LocateFixed, Save } from 'lucide-react'
import { useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { FormField } from '../components/FormField'
import { AddressMap } from '../components/map/AddressMap'
import { LocationPicker } from '../components/map/LocationPicker'
import { PhotoPicker } from '../components/PhotoPicker'
import { provisionalCode } from '../lib/addressCode'
import { draftsSupported, saveDraft } from '../lib/drafts'
import { ApiError, createMyAddress, uploadMyAddressPhoto, type FieldErrors, type PlaceType } from '../lib/api'
import { errorMessage } from '../lib/errors'
import { describedBy } from '../lib/forms'
import { looksSwapped, parseCoordinate, parseCoordinatePair } from '../lib/coordinates'
import { isInServiceArea } from '../lib/geo'
import { accuracyLevel, formatDistance, GeolocationFailure, GEOLOCATION_MESSAGES, locateBestPosition } from '../lib/geolocation'
import { PLACE_TYPE_LABELS } from '../lib/labels'

type Consent = '' | 'yes' | 'no'
type GeoState =
  | { kind: 'idle' }
  | { kind: 'locating'; accuracy?: number }
  | { kind: 'done'; accuracy: number; timestamp: number }
  | { kind: 'error'; message: string }

interface FormValues {
  title: string
  placeType: PlaceType | ''
  city: string
  district: string
  description: string
  latitude: string
  longitude: string
  consent: Consent
  ownerNamePublic: boolean
}

const EMPTY: FormValues = { title: '', placeType: '', city: '', district: '', description: '', latitude: '', longitude: '', consent: '', ownerNamePublic: false }

/** La photo est facultative : elle est envoyée juste après la création de l'adresse. */
const STEPS = ['Informations', 'Localisation', 'Photo', 'Validation'] as const
const STEP_TITLES = ['informations générales', 'localisation', 'photo de la façade (facultative)', 'vérification et publication']
const STEP_FIELDS: Array<Array<string>> = [
  ['title', 'placeType', 'city', 'district', 'description'],
  ['latitude', 'longitude'],
  ['photo'],
  ['publicationConsent'],
]

/** Contrôles immédiats par étape ; le serveur revalide tout et reste l'autorité. */
function validateStep(step: number, values: FormValues): FieldErrors {
  const errors: FieldErrors = {}
  if (step === 0) {
    if (values.title.trim().length < 2) errors.title = 'Le nom du lieu doit contenir au moins 2 caractères.'
    if (!values.placeType) errors.placeType = 'Choisissez un type de lieu.'
    if (values.city.trim().length < 2) errors.city = 'La ville ou commune est obligatoire.'
    if (values.district.trim().length < 2) errors.district = 'Le quartier est obligatoire.'
    if (values.description.length > 1000) errors.description = 'La description ne doit pas dépasser 1000 caractères.'
  }
  if (step === 1) {
    const lat = parseCoordinate(values.latitude)
    const lng = parseCoordinate(values.longitude)
    if (lat === null || lat < -90 || lat > 90) errors.latitude = 'Saisissez une latitude valide (entre -90 et 90).'
    if (lng === null || lng < -180 || lng > 180) errors.longitude = 'Saisissez une longitude valide (entre -180 et 180).'
    if (!errors.latitude && !errors.longitude && !isInServiceArea(lat as number, lng as number)) {
      errors.latitude = looksSwapped(lat as number, lng as number)
        ? 'Latitude et longitude semblent inversées : au Sénégal, la latitude est entre 12 et 16,8 et la longitude est négative (entre -17,6 et -11,3).'
        : 'Ce point est hors de la zone couverte (Sénégal).'
    }
  }
  if (step === 3 && !values.consent) errors.publicationConsent = 'Indiquez si cette adresse peut être publiée.'
  return errors
}

export function NewAddressPage() {
  const { token, user, logout } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<FormValues>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [geo, setGeo] = useState<GeoState>({ kind: 'idle' })
  const [photo, setPhoto] = useState<Blob | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const geolocationAvailable = typeof navigator !== 'undefined' && 'geolocation' in navigator

  const lat = parseCoordinate(values.latitude)
  const lng = parseCoordinate(values.longitude)
  const point = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function setPoint(latitude: number, longitude: number) {
    setValues((current) => ({ ...current, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) }))
  }

  /** Placement manuel (clic, marqueur déplacé, saisie) : la précision GPS ne s'applique plus. */
  function placeManually(latitude: number, longitude: number) {
    setPoint(latitude, longitude)
    setGeo((current) => (current.kind === 'done' ? { kind: 'idle' } : current))
  }

  function changeCoordinate(key: 'latitude' | 'longitude', value: string) {
    update(key, value)
    setGeo((current) => (current.kind === 'done' ? { kind: 'idle' } : current))
  }

  /** « 14.6937, -17.4441 » collé (format Google Maps / OpenStreetMap) : réparti dans les deux champs. */
  function pasteCoordinates(event: ClipboardEvent<HTMLInputElement>) {
    const pair = parseCoordinatePair(event.clipboardData.getData('text'))
    if (!pair) return
    event.preventDefault()
    setValues((current) => ({ ...current, latitude: String(pair.lat), longitude: String(pair.lng) }))
    setGeo((current) => (current.kind === 'done' ? { kind: 'idle' } : current))
  }

  function swapCoordinates() {
    setValues((current) => ({ ...current, latitude: current.longitude, longitude: current.latitude }))
    setFieldErrors((current) => ({ ...current, latitude: '', longitude: '' }))
  }

  function goTo(next: number) {
    setStep(next)
    setError(null)
    // Le focus revient sur le titre de l'étape pour les lecteurs d'écran.
    requestAnimationFrame(() => headingRef.current?.focus())
  }

  function next() {
    const errors = validateStep(step, values)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setError('Corrigez les champs signalés pour continuer.')
      return
    }
    goTo(step + 1)
  }

  async function locateMe() {
    setGeo({ kind: 'locating' })
    // Le navigateur demande l'autorisation : aucune position n'est lue sans l'accord de la personne.
    // Les relevés successifs affinent la position ; on garde le plus précis.
    try {
      const fix = await locateBestPosition(undefined, {
        onProgress: (progress) => setGeo({ kind: 'locating', accuracy: progress.accuracy }),
      })
      if (!isInServiceArea(fix.latitude, fix.longitude)) {
        setGeo({
          kind: 'error',
          message: `L’appareil situe cette position hors du Sénégal (${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)}, à ${formatDistance(fix.accuracy)} près). Elle n’a pas été reprise : placez le point sur la carte.`,
        })
        return
      }
      setPoint(fix.latitude, fix.longitude)
      setGeo({ kind: 'done', accuracy: fix.accuracy, timestamp: fix.timestamp })
    } catch (failure) {
      setGeo({ kind: 'error', message: failure instanceof GeolocationFailure ? failure.message : GEOLOCATION_MESSAGES.unavailable })
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step < STEPS.length - 1) {
      next()
      return
    }
    // Revalide toutes les étapes avant l'envoi.
    for (let s = 0; s < STEPS.length; s++) {
      const errors = validateStep(s, values)
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors)
        setError('Corrigez les champs signalés avant d’enregistrer.')
        if (s !== step) goTo(s)
        return
      }
    }
    if (!token) return
    setSubmitting(true)
    setError(null)
    const input = {
      title: values.title.trim(),
      placeType: values.placeType as PlaceType,
      city: values.city.trim(),
      district: values.district.trim(),
      description: values.description.trim() || null,
      latitude: lat as number,
      longitude: lng as number,
      publicationConsent: values.consent === 'yes',
      ownerNamePublic: values.consent === 'yes' && values.ownerNamePublic,
    }
    try {
      const created = await createMyAddress(token, input)
      // L'adresse existe désormais : un échec d'envoi de la photo ne doit pas la faire perdre.
      let photoError: string | null = null
      if (photo) {
        try {
          await uploadMyAddressPhoto(token, created.id, photo)
        } catch (photoErr) {
          photoError = photoErr instanceof ApiError && photoErr.fieldErrors.photo ? photoErr.fieldErrors.photo : errorMessage(photoErr)
        }
      }
      navigate(`/mes-adresses/${created.id}`, {
        state: { justCreated: true, photoError, provisionalCode: provisionalCode(input.city, input.district, input.latitude, input.longitude) },
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      // Pas de réseau : l'adresse est gardée comme brouillon sur l'appareil, avec son code provisoire.
      if (err instanceof ApiError && err.status === 0 && user && draftsSupported()) {
        try {
          const draft = await saveDraft(user.id, input, provisionalCode(input.city, input.district, input.latitude, input.longitude), photo)
          navigate('/mes-adresses', { state: { draftSaved: draft.provisionalCode } })
          return
        } catch {
          // Stockage local refusé : on affiche l'erreur réseau ci-dessous.
        }
      }
      setSubmitting(false)
      setError(errorMessage(err))
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors)
        // Ramène la personne à l'étape qui contient le premier champ refusé par le serveur.
        const target = STEP_FIELDS.findIndex((fields) => fields.some((f) => f in err.fieldErrors))
        if (target >= 0 && target !== step) goTo(target)
      }
    }
  }

  const fe = fieldErrors
  return (
    <main className="app-page app-page--narrow">
      <Link className="back-link" to="/mes-adresses"><ArrowLeft aria-hidden="true" />Mes adresses</Link>
      <section className="panel wizard" aria-labelledby="new-address-title">
        <h1 id="new-address-title" className="wizard__title">Créer une nouvelle adresse</h1>
        <ol className="stepper" aria-label="Étapes de création">
          {STEPS.map((label, index) => (
            <li key={label} className={index === step ? 'stepper__item stepper__item--current' : index < step ? 'stepper__item stepper__item--done' : 'stepper__item'}
              aria-current={index === step ? 'step' : undefined}>
              <span className="stepper__num">{index < step ? <Check aria-hidden="true" /> : index + 1}</span>
              <span className="stepper__label">{label}</span>
            </li>
          ))}
        </ol>

        <form className="stack-form" onSubmit={handleSubmit} noValidate aria-label="Création d’adresse">
          <h2 className="wizard__step-title" ref={headingRef} tabIndex={-1}>
            Étape {step + 1} sur {STEPS.length} : {STEP_TITLES[step]}
          </h2>

          {step === 0 && (
            <div className="wizard__grid">
              <FormField id="address-type" label="Type de lieu" error={fe.placeType}>
                <select id="address-type" value={values.placeType} aria-invalid={!!fe.placeType}
                  aria-describedby={describedBy('address-type', fe.placeType)} onChange={(e) => update('placeType', e.target.value as PlaceType | '')}>
                  <option value="">Choisir…</option>
                  {(Object.keys(PLACE_TYPE_LABELS) as PlaceType[]).map((type) => (
                    <option key={type} value={type}>{PLACE_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </FormField>
              <FormField id="address-title" label="Nom du lieu" error={fe.title}>
                <input id="address-title" value={values.title} maxLength={160} aria-invalid={!!fe.title} placeholder="Ex. Maison familiale"
                  aria-describedby={describedBy('address-title', fe.title)} onChange={(e) => update('title', e.target.value)} />
              </FormField>
              <div className="field-row">
                <FormField id="address-city" label="Ville ou commune" error={fe.city}>
                  <input id="address-city" value={values.city} maxLength={100} aria-invalid={!!fe.city}
                    aria-describedby={describedBy('address-city', fe.city)} onChange={(e) => update('city', e.target.value)} />
                </FormField>
                <FormField id="address-district" label="Quartier" error={fe.district}>
                  <input id="address-district" value={values.district} maxLength={100} aria-invalid={!!fe.district}
                    aria-describedby={describedBy('address-district', fe.district)} onChange={(e) => update('district', e.target.value)} />
                </FormField>
              </div>
              <FormField id="address-description" label="Repères utiles (facultatif)" error={fe.description}>
                <textarea id="address-description" rows={3} maxLength={1000} value={values.description} aria-invalid={!!fe.description}
                  placeholder="Ex. portail bleu, à côté de la boutique"
                  aria-describedby={describedBy('address-description', fe.description)} onChange={(e) => update('description', e.target.value)} />
              </FormField>
            </div>
          )}

          {step === 1 && (
            <div className="wizard__location">
              <div className="wizard__location-controls">
                <button className="button button-secondary" type="button" onClick={() => void locateMe()}
                  disabled={!geolocationAvailable || geo.kind === 'locating'}>
                  <LocateFixed aria-hidden="true" />{geo.kind === 'locating' ? 'Localisation…' : 'Utiliser ma position actuelle'}
                </button>
                {!geolocationAvailable && <p className="field-hint">{GEOLOCATION_MESSAGES.unsupported}</p>}
                {geo.kind === 'locating' && geo.accuracy !== undefined && (
                  <p className="field-hint" role="status">Affinage de la position… meilleure précision actuelle : {formatDistance(geo.accuracy)}.</p>
                )}
                {geo.kind === 'done' && <GeoFeedback accuracy={geo.accuracy} timestamp={geo.timestamp} />}
                {geo.kind === 'error' && <p className="field-error" role="alert">{geo.message}</p>}
                <div className="field-row">
                  <FormField id="address-latitude" label="Latitude" error={fe.latitude}>
                    <input id="address-latitude" inputMode="decimal" value={values.latitude} aria-invalid={!!fe.latitude} placeholder="ex. 14,6937"
                      aria-describedby={fe.latitude ? 'address-latitude-error' : 'coordinates-hint'} onChange={(e) => changeCoordinate('latitude', e.target.value)} onPaste={pasteCoordinates} />
                  </FormField>
                  <FormField id="address-longitude" label="Longitude" error={fe.longitude}>
                    <input id="address-longitude" inputMode="decimal" value={values.longitude} aria-invalid={!!fe.longitude} placeholder="ex. -17,4441"
                      aria-describedby={fe.longitude ? 'address-longitude-error' : 'coordinates-hint'} onChange={(e) => changeCoordinate('longitude', e.target.value)} onPaste={pasteCoordinates} />
                  </FormField>
                </div>
                {point && looksSwapped(point.lat, point.lng) && (
                  <button className="button button-secondary button-sm" type="button" onClick={swapCoordinates}>
                    <ArrowLeftRight aria-hidden="true" />Inverser latitude et longitude
                  </button>
                )}
                {point && (
                  <p className="provisional-code" role="status">
                    Code provisoire : <strong>{provisionalCode(values.city, values.district, point.lat, point.lng)}</strong>
                    <small>calculé sur votre appareil, confirmé à l’enregistrement</small>
                  </p>
                )}
                <p className="field-hint" id="coordinates-hint">Cliquez sur la carte pour placer le point, puis déplacez le marqueur pour l’ajuster. Vous pouvez aussi coller « latitude, longitude » copié depuis une carte. Zone couverte : Sénégal.</p>
              </div>
              <div className="map-frame wizard__map">
                <LocationPicker value={point} onChange={placeManually} accuracy={geo.kind === 'done' ? geo.accuracy : undefined} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard__photo">
              <p className="muted">Une photo de la façade aide vos visiteurs et livreurs à reconnaître le lieu. Elle est vérifiée par l’équipe avec l’adresse, et n’est visible publiquement que si vous autorisez la publication.</p>
              <PhotoPicker value={photo} onChange={setPhoto} error={fe.photo} />
            </div>
          )}

          {step === 3 && (<>
            <div className="wizard__review">
              <div className="code-preview" aria-label="Aperçu du code">
                <small>Code provisoire</small>
                <strong>{point ? provisionalCode(values.city, values.district, point.lat, point.lng) : '—'}</strong>
                <p>Ville, quartier puis case de 100 m de la grille SamaAdresse, calculés sur l’appareil, même sans connexion. Le serveur confirme le code définitif (un chiffre est ajouté si la case est déjà occupée).</p>
              </div>
              {point && (
                <div className="map-frame wizard__review-map">
                  <AddressMap addresses={[{ key: 'apercu', publicCode: 'Aperçu', title: values.title, placeType: (values.placeType || 'OTHER') as PlaceType, district: values.district, latitude: point.lat, longitude: point.lng }]}
                    label="Position choisie" interactive={false} zoom={16} />
                </div>
              )}
            </div>
            <div className="wizard__grid">
              <dl className="summary">
                <div><dt>Lieu</dt><dd>{values.title} · {values.placeType && PLACE_TYPE_LABELS[values.placeType]}</dd></div>
                <div><dt>Quartier · Ville</dt><dd>{values.district}, {values.city}</dd></div>
                <div><dt>Coordonnées</dt><dd>{values.latitude}, {values.longitude}</dd></div>
                {values.description.trim() && <div><dt>Repères</dt><dd>{values.description}</dd></div>}
                <div><dt>Photo de façade</dt><dd>{photo ? 'Jointe (envoyée après l’enregistrement)' : 'Aucune'}</dd></div>
              </dl>
              <fieldset className="consent" aria-describedby={fe.publicationConsent ? 'consent-error' : 'consent-help'}>
                <legend>Publication</legend>
                <p className="field-hint" id="consent-help">Une adresse publique peut être retrouvée par toute personne connaissant son code, après validation par l’équipe. Votre e-mail n’est jamais affiché ; votre nom seulement si vous cochez l’option ci-dessous.</p>
                <label className="choice">
                  <input type="radio" name="consent" value="yes" checked={values.consent === 'yes'} onChange={() => update('consent', 'yes')} />
                  <span>J’autorise la publication de cette adresse après validation</span>
                </label>
                <label className="choice">
                  <input type="radio" name="consent" value="no" checked={values.consent === 'no'} onChange={() => update('consent', 'no')} />
                  <span>Je garde cette adresse privée</span>
                </label>
                {values.consent === 'yes' && (
                  <label className="choice choice--check">
                    <input type="checkbox" checked={values.ownerNamePublic} onChange={(e) => update('ownerNamePublic', e.target.checked)} />
                    <span>Afficher mon nom dans l’annuaire<small>On pourra retrouver cette adresse en cherchant votre nom affiché. Votre e-mail n’est jamais montré.</small></span>
                  </label>
                )}
                {fe.publicationConsent && <p className="field-error" id="consent-error">{fe.publicationConsent}</p>}
              </fieldset>
              <p className="alert"><Info aria-hidden="true" className="inline-icon" /> Le code définitif sera attribué par le serveur à l’enregistrement, puis l’adresse passera en vérification.</p>
            </div>
          </>)}

          {error && <p className="alert alert--error" role="alert">{error}</p>}
          <div className="wizard__nav">
            {step > 0
              ? <button className="button button-secondary" type="button" onClick={() => goTo(step - 1)}><ArrowLeft aria-hidden="true" />Précédent</button>
              : <span />}
            {step < STEPS.length - 1
              ? <button className="button button-primary" type="submit">Suivant<ArrowRight aria-hidden="true" /></button>
              : <button className="button button-primary" type="submit" disabled={submitting}><Save aria-hidden="true" />{submitting ? 'Enregistrement…' : 'Enregistrer l’adresse'}</button>}
          </div>
        </form>
      </section>
    </main>
  )
}

/** Précision du relevé GPS, expliquée simplement, avec l'heure de la mesure. */
function GeoFeedback({ accuracy, timestamp }: { accuracy: number; timestamp: number }) {
  const level = accuracyLevel(accuracy)
  const time = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'medium' }).format(new Date(timestamp))
  if (level === 'good') {
    return <p className="field-hint" role="status">Position de l’appareil relevée à {time}, précise à environ {formatDistance(accuracy)} (cercle bleu). Vérifiez-la sur la carte.</p>
  }
  return (
    <p className="alert alert--warning" role="status">
      Position approximative : l’appareil annonce une incertitude d’environ {formatDistance(accuracy)} (relevé de {time}, cercle bleu sur la carte).
      {level === 'poor' && ' Sur un ordinateur ou à l’intérieur, la position vient souvent du Wi-Fi ou du réseau et peut être éloignée du vrai lieu.'}
      {' '}Déplacez le marqueur sur l’entrée exacte avant d’enregistrer.
    </p>
  )
}
