import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from '../lib/api'
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext'

/**
 * Stockage du jeton : sessionStorage (onglet courant, effacé à la fermeture du navigateur).
 * Compromis documenté : un script injecté (XSS) pourrait le lire ; d'où une durée de vie courte
 * côté serveur (1 h par défaut) et l'absence de tout contenu HTML non échappé dans l'interface.
 */
export const SESSION_KEY = 'samaadresse.session'

interface StoredSession {
  token: string
  expiresAt: string
  user: api.User
}

function readSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as StoredSession
    return new Date(session.expiresAt).getTime() > Date.now() ? session : null
  } catch {
    return null
  }
}

function writeSession(session: StoredSession | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Stockage indisponible (navigation privée stricte) : la session reste en mémoire.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(readSession)
  const [status, setStatus] = useState<AuthStatus>(() => (readSession() ? 'checking' : 'anonymous'))

  const applySession = useCallback((next: StoredSession | null) => {
    writeSession(next)
    setSession(next)
    setStatus(next ? 'authenticated' : 'anonymous')
  }, [])

  const logout = useCallback(() => applySession(null), [applySession])

  // Au rechargement, on revérifie le jeton auprès du serveur : compte désactivé ou clé changée → déconnexion.
  useEffect(() => {
    if (status !== 'checking' || !session) return
    let cancelled = false
    api.getCurrentUser(session.token)
      .then((user) => { if (!cancelled) applySession({ ...session, user }) })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof api.ApiError && error.status === 401) applySession(null)
        else setStatus('authenticated') // API momentanément injoignable : on garde la session locale.
      })
    return () => { cancelled = true }
  }, [status, session, applySession])

  // Déconnexion automatique à l'expiration du jeton.
  useEffect(() => {
    if (!session) return
    const delay = new Date(session.expiresAt).getTime() - Date.now()
    const timer = window.setTimeout(logout, Math.max(delay, 0))
    return () => window.clearTimeout(timer)
  }, [session, logout])

  const fromResponse = useCallback((response: api.AuthResponse) => {
    applySession({ token: response.accessToken, expiresAt: response.expiresAt, user: response.user })
  }, [applySession])

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user: session?.user ?? null,
    token: session?.token ?? null,
    expiresAt: session?.expiresAt ?? null,
    login: async (email, password) => fromResponse(await api.login({ email: email.trim(), password })),
    register: async (email, password, displayName) =>
      fromResponse(await api.register({ email: email.trim(), password, displayName: displayName.trim() })),
    logout,
  }), [status, session, fromResponse, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
