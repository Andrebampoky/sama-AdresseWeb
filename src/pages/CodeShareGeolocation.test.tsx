import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import jsQR from 'jsqr'
import QRCode from 'qrcode'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { SESSION_KEY } from '../auth/AuthProvider'
import type { OwnerAddress, PublicAddress } from '../lib/api'

const api = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createMyAddress: vi.fn(),
  getMyAddress: vi.fn(),
  getPublicAddress: vi.fn(),
  fetchProtectedPhoto: vi.fn(),
  sendAddressSms: vi.fn(),
  getRoute: vi.fn(),
  reportAddress: vi.fn(),
}))

vi.mock('../lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api')>()
  return { ...original, ...api }
})

const user = { id: 'u1', email: 'demo@exemple.test', displayName: 'Compte démo', role: 'USER' as const, createdAt: '2026-10-19T08:00:00Z' }
// Données fictives. Le code renvoyé par le « serveur » porte un chiffre de départage (case déjà occupée).
const created: OwnerAddress = {
  id: 'a1', publicCode: 'DAK-PLA-93551', title: 'Lieu fictif', placeType: 'HOUSE', district: 'Plateau', city: 'Dakar',
  description: null, latitude: 14.6937, longitude: -17.4441, status: 'PENDING_VALIDATION', publicationConsent: true,
  publiclyAccessible: false, createdAt: '2026-10-20T08:00:00Z', updatedAt: null, moderatedAt: null, hasPhoto: false, ownerNamePublic: false,
}
const publicAddress: PublicAddress = {
  publicCode: 'DAK-PLA-93551', title: 'Lieu fictif', placeType: 'HOUSE', district: 'Plateau', city: 'Dakar',
  description: null, latitude: 14.6937, longitude: -17.4441, photoUrl: null, ownerName: null,
}

type GeoEvent = { lat: number; lng: number; accuracy: number } | { error: number }

/** Capteur de position SIMULÉ pour les tests : rejoue les relevés fournis, rien d'autre. */
function installGeolocation(events: GeoEvent[]) {
  const geo = {
    getCurrentPosition: vi.fn(),
    clearWatch: vi.fn(),
    watchPosition: vi.fn((success: PositionCallback, failure: PositionErrorCallback) => {
      setTimeout(() => {
        for (const e of events) {
          if ('error' in e) failure({ code: e.error, message: 'test', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
          else success({ coords: { latitude: e.lat, longitude: e.lng, accuracy: e.accuracy } as GeolocationCoordinates, timestamp: Date.now() } as GeolocationPosition)
        }
      }, 0)
      return 1
    }),
  }
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
  return geo
}

function visit(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

type U = ReturnType<typeof userEvent.setup>

async function goToLocationStep(u: U) {
  visit('/mes-adresses/nouvelle')
  await u.selectOptions(await screen.findByLabelText('Type de lieu'), 'HOUSE')
  await u.type(screen.getByLabelText('Nom du lieu'), 'Lieu fictif')
  await u.type(screen.getByLabelText('Ville ou commune'), 'Dakar')
  await u.type(screen.getByLabelText('Quartier'), 'Plateau')
  await u.click(screen.getByRole('button', { name: /Suivant/ }))
  await screen.findByLabelText('Latitude')
}

describe('code, partage et géolocalisation', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset())
    sessionStorage.clear()
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'jeton', expiresAt: new Date(Date.now() + 3600_000).toISOString(), user }))
    api.getCurrentUser.mockResolvedValue(user)
  })
  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(navigator, 'geolocation')
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('garde la mesure GPS la plus précise, envoie exactement ces coordonnées et affiche le code du serveur', async () => {
    installGeolocation([{ lat: 14.71, lng: -17.40, accuracy: 1800 }, { lat: 14.6937, lng: -17.4441, accuracy: 12 }])
    api.createMyAddress.mockResolvedValue(created)
    api.getMyAddress.mockResolvedValue(created)
    const u = userEvent.setup()
    await goToLocationStep(u)

    await u.click(screen.getByRole('button', { name: 'Utiliser ma position actuelle' }))
    expect(await screen.findByText(/précise à environ 12 m/)).toBeInTheDocument()
    expect(screen.getByLabelText('Latitude')).toHaveValue('14.693700')
    expect(screen.getByLabelText('Longitude')).toHaveValue('-17.444100')

    await u.click(screen.getByRole('button', { name: /Suivant/ }))
    await u.click(await screen.findByRole('button', { name: /Suivant/ }))
    await u.click(await screen.findByLabelText('J’autorise la publication de cette adresse après validation'))
    await u.click(screen.getByRole('button', { name: /Enregistrer l’adresse/ }))

    expect(api.createMyAddress).toHaveBeenCalledWith('jeton', expect.objectContaining({ latitude: 14.6937, longitude: -17.4441 }))
    // Le code affiché est celui renvoyé par le serveur, jamais le code provisoire.
    expect(await screen.findByRole('heading', { level: 1, name: 'DAK-PLA-93551' })).toBeInTheDocument()
    expect(screen.getByText(/Adresse enregistrée avec le code définitif/)).toHaveTextContent('DAK-PLA-93551')
    expect(screen.getByText(/code provisoire DAK-PLA-9355 était déjà pris/)).toBeInTheDocument()
  })

  it('prévient quand la position est approximative (Wi-Fi, réseau)', async () => {
    installGeolocation([{ lat: 14.70, lng: -17.45, accuracy: 2500 }, { error: 3 }])
    const u = userEvent.setup()
    await goToLocationStep(u)
    await u.click(screen.getByRole('button', { name: 'Utiliser ma position actuelle' }))
    expect(await screen.findByText(/Position approximative/)).toHaveTextContent(/2,5 km/)
    expect(screen.getByText(/Wi-Fi ou du réseau/)).toBeInTheDocument()
  })

  it('explique un refus d’autorisation sans remplir de position', async () => {
    installGeolocation([{ error: 1 }])
    const u = userEvent.setup()
    await goToLocationStep(u)
    await u.click(screen.getByRole('button', { name: 'Utiliser ma position actuelle' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Accès à la position refusé/)
    expect(screen.getByLabelText('Latitude')).toHaveValue('')
  })

  it('ne reprend pas une position hors du Sénégal renvoyée par l’appareil', async () => {
    installGeolocation([{ lat: 48.8566, lng: 2.3522, accuracy: 15 }])
    const u = userEvent.setup()
    await goToLocationStep(u)
    await u.click(screen.getByRole('button', { name: 'Utiliser ma position actuelle' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/hors du Sénégal/)
    expect(screen.getByLabelText('Latitude')).toHaveValue('')
  })

  it('accepte la virgule décimale et repère une inversion latitude/longitude', async () => {
    api.createMyAddress.mockResolvedValue(created)
    api.getMyAddress.mockResolvedValue(created)
    const u = userEvent.setup()
    await goToLocationStep(u)
    await u.type(screen.getByLabelText('Latitude'), '-17,4441')
    await u.type(screen.getByLabelText('Longitude'), '14,6937')
    await u.click(screen.getByRole('button', { name: /Suivant/ }))
    expect(await screen.findByText(/semblent inversées/)).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Inverser latitude et longitude' }))
    expect(screen.getByLabelText('Latitude')).toHaveValue('14,6937')
    await u.click(screen.getByRole('button', { name: /Suivant/ }))
    await u.click(await screen.findByRole('button', { name: /Suivant/ }))
    await u.click(await screen.findByLabelText('Je garde cette adresse privée'))
    await u.click(screen.getByRole('button', { name: /Enregistrer l’adresse/ }))
    expect(api.createMyAddress).toHaveBeenCalledWith('jeton', expect.objectContaining({ latitude: 14.6937, longitude: -17.4441 }))
  })

  it('répartit une paire « latitude, longitude » collée dans un champ', async () => {
    const u = userEvent.setup()
    await goToLocationStep(u)
    await u.click(screen.getByLabelText('Latitude'))
    await u.paste('14.6937, -17.4441')
    expect(screen.getByLabelText('Latitude')).toHaveValue('14.6937')
    expect(screen.getByLabelText('Longitude')).toHaveValue('-17.4441')
  })

  it('copie le code même sans API presse-papiers (page http)', async () => {
    api.getMyAddress.mockResolvedValue(created)
    const u = userEvent.setup()
    // Comme sur une page http://192.168… : le navigateur ne fournit pas navigator.clipboard.
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    document.execCommand = vi.fn().mockReturnValue(true)
    visit('/mes-adresses/a1')
    await u.click(await screen.findByRole('button', { name: /Copier le code/ }))
    expect(await screen.findByText('Code copié.')).toBeInTheDocument()
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('génère le QR code depuis l’URL de la fiche publique et prévient si le lien est local', async () => {
    api.getPublicAddress.mockResolvedValue(publicAddress)
    const toString = vi.spyOn(QRCode, 'toString')
    visit('/a/DAK-PLA-93551/partage')
    const expected = `${window.location.origin}/a/DAK-PLA-93551`
    expect(await screen.findByLabelText('Lien public')).toHaveValue(expected)
    await waitFor(() => expect(toString).toHaveBeenCalledWith(expected, expect.objectContaining({ type: 'svg' })))
    expect(await screen.findByRole('img', { name: `QR code menant à ${expected}` })).toBeInTheDocument()
    // jsdom sert les pages sur http://localhost:3000 : le lien de test est signalé comme local.
    expect(screen.getByRole('note')).toHaveTextContent(/ne s’ouvrira que sur cet ordinateur/)
  })
})

describe('contenu réel du QR code', () => {
  it('se décode exactement en URL de la fiche publique', () => {
    const url = 'https://samaadresse.sn/a/DAK-PLA-93551'
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
    const scale = 4
    const margin = 4
    const size = (qr.modules.size + margin * 2) * scale
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255)
    for (let row = 0; row < qr.modules.size; row++) {
      for (let col = 0; col < qr.modules.size; col++) {
        if (!qr.modules.get(row, col)) continue
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const i = (((row + margin) * scale + dy) * size + (col + margin) * scale + dx) * 4
            pixels[i] = pixels[i + 1] = pixels[i + 2] = 0
          }
        }
      }
    }
    expect(jsQR(pixels, size, size)?.data).toBe(url)
  })
})
