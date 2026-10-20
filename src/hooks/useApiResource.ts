import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/authContext'
import { ApiError } from '../lib/api'
import { errorMessage } from '../lib/errors'

export type Resource<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; message: string; status: number }

/**
 * Charge une ressource authentifiée ; un 401 ferme la session (la garde de route renvoie
 * alors vers la connexion). `reload` relance le chargement après une action.
 */
export function useApiResource<T>(load: (token: string) => Promise<T>, deps: unknown[]) {
  const { token, logout } = useAuth()
  const [state, setState] = useState<Resource<T>>({ kind: 'loading' })
  const [version, setVersion] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loader = useCallback(load, deps)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setState({ kind: 'loading' })
    loader(token)
      .then((data) => { if (!cancelled) setState({ kind: 'ready', data }) })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) logout()
        else setState({ kind: 'error', message: errorMessage(error), status: error instanceof ApiError ? error.status : -1 })
      })
    return () => { cancelled = true }
  }, [token, loader, logout, version])

  return { state, reload: () => setVersion((v) => v + 1) }
}
