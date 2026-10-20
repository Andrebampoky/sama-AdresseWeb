export type PlaceType = 'HOUSE' | 'BUSINESS' | 'INSTITUTION' | 'OTHER'
export type AddressStatus = 'PENDING_VALIDATION' | 'VALIDATED' | 'REJECTED' | 'ARCHIVED'

export interface PublicAddress {
  publicCode: string
  title: string
  placeType: PlaceType
  district: string
  city: string
  description: string | null
  latitude: number
  longitude: number
  photoUrl: string | null
  /** Nom du propriétaire, seulement s'il a accepté de figurer dans l'annuaire. */
  ownerName: string | null
}

export interface User {
  id: string
  email: string
  displayName: string
  role: 'USER' | 'ADMIN'
  createdAt: string
}

export interface AuthResponse {
  accessToken: string
  tokenType: 'Bearer'
  expiresAt: string
  user: User
}

/** Adresse telle que la voit son propriétaire (GET/POST /api/v1/me/addresses). */
export interface OwnerAddress {
  id: string
  publicCode: string
  title: string
  placeType: PlaceType
  district: string
  city: string
  description: string | null
  latitude: number
  longitude: number
  status: AddressStatus
  publicationConsent: boolean
  publiclyAccessible: boolean
  createdAt: string
  updatedAt: string | null
  moderatedAt: string | null
  /** Photo de façade enregistrée (servie par l'API, jamais par une URL externe). */
  hasPhoto: boolean
  ownerNamePublic: boolean
}

export interface Page<T> {
  items: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

/** Le code public, le statut et le propriétaire ne sont jamais envoyés : le serveur les attribue. */
export interface NewAddressInput {
  title: string
  placeType: PlaceType
  district: string
  city: string
  description: string | null
  latitude: number
  longitude: number
  publicationConsent: boolean
  ownerNamePublic?: boolean
}

export type FieldErrors = Record<string, string>

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: FieldErrors

  constructor(message: string, status: number, fieldErrors: FieldErrors = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

/**
 * Adresse de l'API. Sans VITE_API_BASE_URL, on vise le port 8080 de la machine qui sert la page :
 * « localhost » sur l'ordinateur de développement, son adresse réseau (192.168…) depuis un téléphone.
 */
function defaultApiBaseUrl() {
  if (typeof window === 'undefined' || !window.location.hostname) return 'http://localhost:8080'
  return `${window.location.protocol}//${window.location.hostname}:8080`
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl())
  .replace(/\/+$/, '')

/** En-tête ajouté par le Service Worker quand la fiche vient du cache (pas du réseau). */
export const OFFLINE_HEADER = 'X-SamaAdresse-Offline'

export interface PublicAddressResult extends PublicAddress {
  /** Date de la copie hors ligne affichée, si la fiche vient du cache du Service Worker. */
  offlineCopyAt?: string
}

export async function getPublicAddress(code: string): Promise<PublicAddressResult> {
  let response: Response
  try {
    response = await fetch(
      `${apiBaseUrl}/api/v1/addresses/${encodeURIComponent(code.trim())}`,
      { headers: { Accept: 'application/json' } },
    )
  } catch {
    throw new ApiError('Le service est injoignable. Vérifiez votre connexion.', 0)
  }

  if (!response.ok) {
    throw new ApiError('La recherche de cette adresse a échoué.', response.status)
  }

  const address = await response.json() as PublicAddressResult
  const offline = response.headers.get(OFFLINE_HEADER)
  return offline ? { ...address, offlineCopyAt: offline } : address
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  token?: string
}

/** URL absolue d'un chemin renvoyé par l'API (ex. photoUrl « /api/v1/addresses/…/photo »). */
export function apiUrl(path: string) {
  return /^https?:\/\//.test(path) ? path : `${apiBaseUrl}${path}`
}

/**
 * Appel JSON commun. Les erreurs du backend (application/problem+json) sont converties en
 * ApiError avec leur message (« detail ») et, si présentes, les erreurs par champ (« errors »).
 */
async function request<T>(path: string, { method = 'GET', body, token }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const multipart = body instanceof FormData
  // Pour un envoi de fichier, le navigateur fixe lui-même Content-Type et la frontière multipart.
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json'
  // Le jeton circule uniquement dans l'en-tête Authorization, jamais dans l'URL.
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : multipart ? (body as FormData) : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Le service est injoignable. Vérifiez votre connexion.', 0)
  }

  if (!response.ok) {
    let detail = 'La requête a échoué.'
    let fieldErrors: FieldErrors = {}
    try {
      const problem = await response.json() as { detail?: string; errors?: FieldErrors }
      if (problem.detail) detail = problem.detail
      if (problem.errors) fieldErrors = problem.errors
    } catch {
      // Réponse sans corps JSON : on garde le message générique.
    }
    throw new ApiError(detail, response.status, fieldErrors)
  }

  return response.json() as Promise<T>
}

export function register(input: { email: string; password: string; displayName: string }) {
  return request<AuthResponse>('/api/v1/auth/register', { method: 'POST', body: input })
}

export function login(input: { email: string; password: string }) {
  return request<AuthResponse>('/api/v1/auth/login', { method: 'POST', body: input })
}

export function getCurrentUser(token: string) {
  return request<User>('/api/v1/auth/me', { token })
}

export function createMyAddress(token: string, input: NewAddressInput) {
  return request<OwnerAddress>('/api/v1/me/addresses', { method: 'POST', body: input, token })
}

export function listMyAddresses(token: string, page = 0, size = 20) {
  return request<Page<OwnerAddress>>(`/api/v1/me/addresses?page=${page}&size=${size}`, { token })
}

export function getMyAddress(token: string, id: string) {
  return request<OwnerAddress>(`/api/v1/me/addresses/${encodeURIComponent(id)}`, { token })
}

/** Routes /admin : le backend refuse (403) tout compte non ADMIN, quoi qu'affiche l'interface. */
export function listAdminAddresses(token: string, status: AddressStatus, page = 0, size = 20) {
  return request<Page<OwnerAddress>>(`/api/v1/admin/addresses?status=${status}&page=${page}&size=${size}`, { token })
}

export function moderateAddress(token: string, id: string, decision: 'validate' | 'reject') {
  return request<OwnerAddress>(`/api/v1/admin/addresses/${encodeURIComponent(id)}/${decision}`, { method: 'POST', token })
}

/** Ajoute ou remplace la photo de façade (adresse en attente de validation uniquement). */
export function uploadMyAddressPhoto(token: string, id: string, photo: Blob) {
  const form = new FormData()
  form.append('photo', photo, 'facade.jpg')
  return request<OwnerAddress>(`/api/v1/me/addresses/${encodeURIComponent(id)}/photo`, { method: 'PUT', body: form, token })
}

export function deleteMyAddressPhoto(token: string, id: string) {
  return request<OwnerAddress>(`/api/v1/me/addresses/${encodeURIComponent(id)}/photo`, { method: 'DELETE', token })
}

/**
 * Photo protégée (propriétaire ou administrateur) : une balise <img> ne peut pas envoyer le jeton,
 * on la télécharge donc avec l'en-tête Authorization puis on l'affiche via une URL locale (blob:).
 */
export async function fetchProtectedPhoto(token: string, path: string): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new ApiError('Le service est injoignable. Vérifiez votre connexion.', 0)
  }
  if (!response.ok) throw new ApiError('Photo indisponible.', response.status)
  return response.blob()
}

export const myPhotoPath = (id: string) => `/api/v1/me/addresses/${encodeURIComponent(id)}/photo`
export const adminPhotoPath = (id: string) => `/api/v1/admin/addresses/${encodeURIComponent(id)}/photo`

/* ---------- Annuaire public ---------- */

export interface DirectoryQuery {
  q?: string
  code?: string
  owner?: string
  district?: string
  city?: string
  type?: PlaceType | ''
}

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value))
  })
  return search.toString()
}

/** GET /api/v1/addresses : adresses validées et publiques uniquement, paginées côté serveur. */
export function searchDirectory(query: DirectoryQuery, page = 0, size = 20) {
  return request<Page<PublicAddress>>(`/api/v1/addresses?${queryString({ ...query, page, size })}`)
}

/* ---------- Gestion par le propriétaire ---------- */

export interface UpdateAddressInput {
  title: string
  placeType: PlaceType
  description: string | null
  publicationConsent: boolean
  ownerNamePublic: boolean
}

export function updateMyAddress(token: string, id: string, input: UpdateAddressInput) {
  return request<OwnerAddress>(`/api/v1/me/addresses/${encodeURIComponent(id)}`, { method: 'PUT', body: input, token })
}

export function archiveMyAddress(token: string, id: string) {
  return request<OwnerAddress>(`/api/v1/me/addresses/${encodeURIComponent(id)}/archive`, { method: 'POST', token })
}

export interface SmsResult {
  /** SIMULATED : mode test du serveur, AUCUN SMS n'a été envoyé. */
  status: 'SENT' | 'SIMULATED'
  provider: string
  to: string
  link: string
}

export function sendAddressSms(token: string, id: string, phone: string) {
  return request<SmsResult>(`/api/v1/me/addresses/${encodeURIComponent(id)}/sms`, { method: 'POST', body: { phone }, token })
}

/* ---------- Signalement et itinéraire ---------- */

export type ReportReason = 'WRONG_LOCATION' | 'NOT_EXISTING' | 'INAPPROPRIATE' | 'DUPLICATE' | 'OTHER'

export function reportAddress(token: string, code: string, reason: ReportReason, comment: string | null) {
  return request<{ id: string; status: string }>(`/api/v1/addresses/${encodeURIComponent(code)}/reports`, {
    method: 'POST', body: { reason, comment }, token,
  })
}

export type RouteProfile = 'foot-walking' | 'driving-car'

export interface RouteResult {
  profile: RouteProfile
  distanceMeters: number
  durationSeconds: number
  /** Points [latitude, longitude]. */
  coordinates: Array<[number, number]>
  /** Service réellement utilisé par le serveur. */
  provider: 'openrouteservice' | 'osrm'
}

/** Itinéraire OpenRouteService calculé par le serveur (la clé n'est jamais dans le navigateur). */
export function getRoute(from: { lat: number; lng: number }, toCode: string, profile: RouteProfile) {
  return request<RouteResult>(`/api/v1/routes?${queryString({ fromLat: from.lat, fromLng: from.lng, toCode, profile })}`)
}

/* ---------- Administration ---------- */

export interface AdminStats {
  totalAddresses: number
  byStatus: Record<AddressStatus, number>
  byType: Record<PlaceType, number>
  publicAddresses: number
  openReports: number
  users: number
  activeUsers: number
  monthly: Array<{ month: string; total: number; byType: Record<PlaceType, number> }>
}

export function getAdminStats(token: string) {
  return request<AdminStats>('/api/v1/admin/stats', { token })
}

export type ReportStatus = 'OPEN' | 'DISMISSED' | 'ACTION_TAKEN'

export interface AdminReport {
  id: string
  reason: ReportReason
  comment: string | null
  status: ReportStatus
  createdAt: string
  resolvedAt: string | null
  reporterName: string
  addressId: string
  publicCode: string
  addressTitle: string
  district: string
  city: string
  addressStatus: AddressStatus
}

export function listReports(token: string, status: ReportStatus, page = 0, size = 20) {
  return request<Page<AdminReport>>(`/api/v1/admin/reports?status=${status}&page=${page}&size=${size}`, { token })
}

export function resolveReport(token: string, id: string, decision: 'dismiss' | 'archive-address') {
  return request<AdminReport>(`/api/v1/admin/reports/${encodeURIComponent(id)}/${decision}`, { method: 'POST', token })
}

export interface AdminUser {
  id: string
  email: string
  displayName: string
  role: 'USER' | 'ADMIN'
  enabled: boolean
  createdAt: string
  addressCount: number
}

export function listUsers(token: string, page = 0, size = 20) {
  return request<Page<AdminUser>>(`/api/v1/admin/users?page=${page}&size=${size}`, { token })
}

export function setUserEnabled(token: string, id: string, enabled: boolean) {
  return request<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`, { method: 'POST', token })
}
