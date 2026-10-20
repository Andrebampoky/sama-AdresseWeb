import { useEffect, useState } from 'react'
import { useAuth } from '../auth/authContext'
import { fetchProtectedPhoto } from '../lib/api'

/**
 * Télécharge une photo protégée avec le jeton et renvoie une URL locale (blob:) affichable,
 * libérée automatiquement. `path` null = pas de photo ; changer `version` force un rechargement.
 */
export function useProtectedPhoto(path: string | null, version = 0) {
  const { token } = useAuth()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setUrl(null)
    setFailed(false)
    if (!path || !token) return
    let cancelled = false
    let objectUrl: string | null = null
    fetchProtectedPhoto(token, path)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, token, version])

  return { url, failed }
}
