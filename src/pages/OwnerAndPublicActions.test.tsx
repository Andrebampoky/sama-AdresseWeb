import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { SESSION_KEY } from '../auth/AuthProvider'
import { ApiError, type OwnerAddress, type PublicAddress } from '../lib/api'

const api = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getMyAddress: vi.fn(),
  updateMyAddress: vi.fn(),
  archiveMyAddress: vi.fn(),
  sendAddressSms: vi.fn(),
  getPublicAddress: vi.fn(),
  getRoute: vi.fn(),
  reportAddress: vi.fn(),
  fetchProtectedPhoto: vi.fn(),
}))

vi.mock('../lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api')>()
  return { ...original, ...api }
})

const user = { id: 'u1', email: 'demo@exemple.test', displayName: 'Compte démo', role: 'USER' as const, createdAt: '2026-10-19T08:00:00Z' }
const validated: OwnerAddress = {
  id: 'a1', publicCode: 'ZIG-KAN-6826', title: 'Maison Diop', placeType: 'HOUSE', district: 'Kandé', city: 'Ziguinchor',
  description: null, latitude: 12.5681, longitude: -16.2733, status: 'VALIDATED', publicationConsent: true, publiclyAccessible: true,
  createdAt: '2026-10-19T08:00:00Z', updatedAt: null, moderatedAt: '2026-10-19T09:00:00Z', hasPhoto: false, ownerNamePublic: false,
}
const publicAddress: PublicAddress = {
  publicCode: 'ZIG-KAN-6826', title: 'Maison Diop', placeType: 'HOUSE', district: 'Kandé', city: 'Ziguinchor',
  description: null, latitude: 12.5681, longitude: -16.2733, photoUrl: null, ownerName: null,
}

function signIn() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'jeton', expiresAt: new Date(Date.now() + 3600_000).toISOString(), user }))
  api.getCurrentUser.mockResolvedValue(user)
}

function visit(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

describe('gestion par le propriétaire', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset())
    sessionStorage.clear()
    signIn()
    api.getMyAddress.mockResolvedValue(validated)
  })
  afterEach(() => cleanup())

  it('prévient qu’une modification renvoie l’adresse en vérification', async () => {
    api.updateMyAddress.mockResolvedValue({ ...validated, title: 'Maison Diop Kandé', status: 'PENDING_VALIDATION', publiclyAccessible: false })
    const u = userEvent.setup()
    visit('/mes-adresses/a1')

    const title = await screen.findByLabelText('Nom du lieu')
    await u.clear(title)
    await u.type(title, 'Maison Diop Kandé')
    expect(screen.getByText('Modifier le nom, le type ou les repères renverra l’adresse en vérification.')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(api.updateMyAddress).toHaveBeenCalledWith('jeton', 'a1', expect.objectContaining({ title: 'Maison Diop Kandé', publicationConsent: true }))
    expect(await screen.findByText(/repasse en vérification/)).toBeInTheDocument()
  })

  it('affiche honnêtement un SMS simulé et propose la messagerie si le service manque', async () => {
    api.sendAddressSms.mockResolvedValueOnce({ status: 'SIMULATED', provider: 'simulation', to: '+22177•••••67', link: 'x' })
    api.sendAddressSms.mockRejectedValueOnce(new ApiError('L’envoi automatique de SMS n’est pas configuré sur ce serveur.', 503))
    const u = userEvent.setup()
    visit('/mes-adresses/a1')

    await u.type(await screen.findByLabelText('Numéro du destinataire'), '77 123 45 67')
    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(await screen.findByText(/AUCUN SMS n’a été envoyé/)).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(await screen.findByText(/pas configuré/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ouvrir ma messagerie/ }).getAttribute('href')).toMatch(/^sms:/)
  })

  it('archive seulement après confirmation', async () => {
    api.archiveMyAddress.mockResolvedValue({ ...validated, status: 'ARCHIVED', publiclyAccessible: false })
    const u = userEvent.setup()
    visit('/mes-adresses/a1')

    await u.click(await screen.findByRole('button', { name: 'Archiver l’adresse' }))
    expect(api.archiveMyAddress).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Confirmer l’archivage' }))
    expect(api.archiveMyAddress).toHaveBeenCalledWith('jeton', 'a1')
    expect(await screen.findByText(/Adresse archivée : elle n’est plus publique/)).toBeInTheDocument()
  })
})

describe('fiche publique', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset())
    sessionStorage.clear()
  })
  afterEach(() => cleanup())

  it('garde la fiche utilisable si l’itinéraire est indisponible', async () => {
    api.getPublicAddress.mockResolvedValue(publicAddress)
    api.getRoute.mockRejectedValue(new ApiError('Calcul d’itinéraire indisponible : OpenRouteService n’est pas configuré sur ce serveur.', 503))
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { latitude: 12.56, longitude: -16.27 } } as GeolocationPosition))
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    const u = userEvent.setup()
    visit('/a/ZIG-KAN-6826')

    await u.click(await screen.findByRole('button', { name: 'À pied' }))
    expect(api.getRoute).toHaveBeenCalledWith({ lat: 12.56, lng: -16.27 }, 'ZIG-KAN-6826', 'foot-walking')
    expect(await screen.findByText(/OpenRouteService n’est pas configuré/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Itinéraire dans OpenStreetMap/ })).toHaveAttribute('href', expect.stringContaining('openstreetmap.org/directions'))
    expect(screen.getByRole('link', { name: /Connectez-vous pour la signaler/ })).toBeInTheDocument()
  })

  it('signale la copie hors ligne et l’absence de fiche jamais consultée', async () => {
    api.getPublicAddress.mockResolvedValueOnce({ ...publicAddress, offlineCopyAt: '2026-10-19T10:00:00Z' })
    visit('/a/ZIG-KAN-6826')
    expect(await screen.findByText(/Hors ligne : copie de cette fiche enregistrée sur l’appareil/)).toBeInTheDocument()
    cleanup()

    api.getPublicAddress.mockRejectedValueOnce(new ApiError('injoignable', 0))
    visit('/a/ZIG-KAN-0000')
    expect(await screen.findByRole('heading', { name: 'Vous êtes hors ligne' })).toBeInTheDocument()
  })

  it('transmet un signalement d’une personne connectée', async () => {
    signIn()
    api.getPublicAddress.mockResolvedValue(publicAddress)
    api.reportAddress.mockResolvedValue({ id: 'r1', status: 'OPEN' })
    const u = userEvent.setup()
    visit('/a/ZIG-KAN-6826')

    await u.click(await screen.findByRole('button', { name: 'Signaler un problème' }))
    await u.click(screen.getByLabelText('Position incorrecte'))
    await u.type(screen.getByLabelText('Précisions (facultatif)'), 'Rue voisine')
    await u.click(screen.getByRole('button', { name: 'Envoyer le signalement' }))
    expect(api.reportAddress).toHaveBeenCalledWith('jeton', 'ZIG-KAN-6826', 'WRONG_LOCATION', 'Rue voisine')
    expect(await screen.findByText(/transmis à l’équipe de modération/)).toBeInTheDocument()
  })
})
