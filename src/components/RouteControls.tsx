import { Car, ExternalLink, Footprints, Navigation } from 'lucide-react'
import { useState } from 'react'
import { ApiError, getRoute, type RouteProfile, type RouteResult } from '../lib/api'
import { errorMessage } from '../lib/errors'
import { osmDirectionsUrl } from '../lib/geo'

type State =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'computing' }
  | { kind: 'done'; route: RouteResult }
  | { kind: 'error'; message: string }

function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

function formatDuration(s: number) {
  const minutes = Math.max(1, Math.round(s / 60))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

/**
 * Itinéraire depuis la position actuelle (OpenRouteService via l'API). En cas de refus de
 * géolocalisation, de service non configuré ou indisponible, un message clair s'affiche et le
 * lien d'itinéraire OpenStreetMap reste proposé : la fiche ne « plante » jamais.
 */
export function RouteControls({ code, latitude, longitude, onRoute }: {
  code: string
  latitude: number
  longitude: number
  onRoute: (route: Array<[number, number]> | undefined) => void
}) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [profile, setProfile] = useState<RouteProfile>('foot-walking')

  function start(selected: RouteProfile) {
    setProfile(selected)
    if (!('geolocation' in navigator)) {
      setState({ kind: 'error', message: 'Votre navigateur ne permet pas la géolocalisation.' })
      return
    }
    setState({ kind: 'locating' })
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setState({ kind: 'computing' })
        try {
          const route = await getRoute({ lat: position.coords.latitude, lng: position.coords.longitude }, code, selected)
          setState({ kind: 'done', route })
          onRoute(route.coordinates)
        } catch (error) {
          onRoute(undefined)
          setState({
            kind: 'error',
            message: error instanceof ApiError && error.status === 0
              ? 'Pas de connexion : l’itinéraire ne peut pas être calculé hors ligne.'
              : errorMessage(error),
          })
        }
      },
      (geoError) => setState({
        kind: 'error',
        message: geoError.code === geoError.PERMISSION_DENIED
          ? 'Accès à votre position refusé : impossible de calculer l’itinéraire depuis votre position.'
          : 'Votre position est indisponible pour le moment.',
      }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  const busy = state.kind === 'locating' || state.kind === 'computing'
  return (
    <div className="route-controls">
      <div className="route-controls__buttons">
        <button className="button button-primary" type="button" disabled={busy} onClick={() => start('foot-walking')}>
          <Footprints aria-hidden="true" />{busy && profile === 'foot-walking' ? 'Calcul…' : 'À pied'}
        </button>
        <button className="button button-primary" type="button" disabled={busy} onClick={() => start('driving-car')}>
          <Car aria-hidden="true" />{busy && profile === 'driving-car' ? 'Calcul…' : 'En voiture'}
        </button>
      </div>
      {state.kind === 'idle' && <p className="field-hint"><Navigation aria-hidden="true" className="inline-icon" /> Itinéraire depuis votre position (autorisation demandée).</p>}
      {state.kind === 'locating' && <p className="field-hint" role="status">Recherche de votre position…</p>}
      {state.kind === 'done' && (
        <p className="route-controls__summary" role="status">
          <strong>{formatDistance(state.route.distanceMeters)}</strong> · environ {formatDuration(state.route.durationSeconds)} {state.route.profile === 'driving-car' ? 'en voiture' : 'à pied'}
          <small>Calculé par {state.route.provider === 'openrouteservice' ? 'OpenRouteService' : 'OSRM (données OpenStreetMap)'}</small>
        </p>
      )}
      {state.kind === 'error' && <p className="alert alert--warning" role="alert">{state.message}</p>}
      <a className="button button-secondary button-block" href={osmDirectionsUrl(latitude, longitude)} target="_blank" rel="noopener noreferrer">
        <ExternalLink aria-hidden="true" />Itinéraire dans OpenStreetMap
      </a>
    </div>
  )
}
