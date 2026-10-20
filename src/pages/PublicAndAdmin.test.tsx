import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { SESSION_KEY } from '../auth/AuthProvider'
import { ApiError, type OwnerAddress, type PublicAddress } from '../lib/api'

const api = vi.hoisted(() => ({
  getPublicAddress: vi.fn(),
  getCurrentUser: vi.fn(),
  listAdminAddresses: vi.fn(),
  moderateAddress: vi.fn(),
  getAdminStats: vi.fn(),
  listReports: vi.fn(),
  listUsers: vi.fn(),
  resolveReport: vi.fn(),
}))

vi.mock('../lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api')>()
  return { ...original, ...api }
})

const publicAddress: PublicAddress = {
  publicCode: 'VIL-QUA-0042', title: 'Lieu fictif', placeType: 'BUSINESS', district: 'Quartier Exemple',
  city: 'Ville Exemple', description: 'Portail bleu.', latitude: 14.5, longitude: -15.5, photoUrl: null, ownerName: null,
}
const pending: OwnerAddress = {
  ...publicAddress, id: 'p1', publicCode: 'VIL-QUA-0099', status: 'PENDING_VALIDATION', publicationConsent: true,
  publiclyAccessible: false, createdAt: new Date().toISOString(), updatedAt: null, moderatedAt: null, hasPhoto: false, ownerNamePublic: false,
}

function visit(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

function signInAs(role: 'USER' | 'ADMIN') {
  const user = { id: 'u1', email: 'admin@exemple.test', displayName: 'Admin Démo', role, createdAt: '2026-10-19T08:00:00Z' }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'jeton', expiresAt: new Date(Date.now() + 3600_000).toISOString(), user }))
  api.getCurrentUser.mockResolvedValue(user)
}

const emptyPage = { items: [], page: 0, size: 50, totalElements: 0, totalPages: 0 }

const report = {
  id: 'r1', reason: 'WRONG_LOCATION', comment: 'Mauvaise rue', status: 'OPEN', createdAt: new Date().toISOString(), resolvedAt: null,
  reporterName: 'Bob', addressId: 'a1', publicCode: 'VIL-QUA-0042', addressTitle: 'Lieu fictif', district: 'Quartier Exemple',
  city: 'Ville Exemple', addressStatus: 'VALIDATED',
}

/** Réponses d'administration fictives mais cohérentes (données de test). */
function stubAdmin() {
  const zeroTypes = { HOUSE: 0, BUSINESS: 0, INSTITUTION: 0, OTHER: 0 }
  api.getAdminStats.mockResolvedValue({
    totalAddresses: 42, byStatus: { PENDING_VALIDATION: 5, VALIDATED: 30, REJECTED: 5, ARCHIVED: 2 },
    byType: { HOUSE: 20, BUSINESS: 12, INSTITUTION: 6, OTHER: 4 }, publicAddresses: 25, openReports: 3, users: 10, activeUsers: 9,
    monthly: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, total: i, byType: zeroTypes })),
  })
  api.listReports.mockResolvedValue({ ...emptyPage, items: [report], totalElements: 1, totalPages: 1 })
  api.listUsers.mockResolvedValue({ ...emptyPage, items: [{ id: 'u2', email: 'awa@exemple.test', displayName: 'Awa Exemple', role: 'USER', enabled: true, createdAt: new Date().toISOString(), addressCount: 2 }], totalElements: 1, totalPages: 1 })
  api.listAdminAddresses.mockResolvedValue(emptyPage)
}

describe('pages publiques', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset())
    sessionStorage.clear()
  })
  afterEach(() => cleanup())

  it('affiche la fiche publique sans aucune donnée de compte', async () => {
    api.getPublicAddress.mockResolvedValue(publicAddress)
    visit('/a/VIL-QUA-0042')

    expect(await screen.findByRole('heading', { name: 'VIL-QUA-0042' })).toBeInTheDocument()
    expect(screen.getByText('Portail bleu.')).toBeInTheDocument()
    expect(screen.getByText('Aucune photo publiée')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Itinéraire/ })).toHaveAttribute('href', expect.stringContaining('openstreetmap.org/directions'))
    expect(screen.getByRole('link', { name: /QR code/ })).toHaveAttribute('href', '/a/VIL-QUA-0042/partage')
  })

  it('indique honnêtement une adresse introuvable ou non publiée', async () => {
    api.getPublicAddress.mockRejectedValue(new ApiError('absente', 404))
    visit('/a/VIL-QUA-0000')

    expect(await screen.findByRole('heading', { name: 'Adresse introuvable' })).toBeInTheDocument()
  })

  it('génère un vrai QR code contenant uniquement l’URL publique', async () => {
    api.getPublicAddress.mockResolvedValue(publicAddress)
    visit('/a/VIL-QUA-0042/partage')

    const qr = await screen.findByRole('img', { name: /QR code menant à/ })
    expect(qr.querySelector('svg')).not.toBeNull()
    expect(qr).toHaveAccessibleName(`QR code menant à ${window.location.origin}/a/VIL-QUA-0042`)
    expect(screen.getByLabelText('Lien public')).toHaveValue(`${window.location.origin}/a/VIL-QUA-0042`)
    expect(screen.getByRole('link', { name: /Envoyer par SMS/ }).getAttribute('href')).toMatch(/^sms:/)
  })

  it('lance la recherche transmise dans l’adresse de la page', async () => {
    api.getPublicAddress.mockResolvedValue(publicAddress)
    visit('/recherche?code=vil-qua-0042')

    expect(await screen.findByRole('heading', { name: 'VIL-QUA-0042' })).toBeInTheDocument()
    expect(api.getPublicAddress).toHaveBeenCalledWith('VIL-QUA-0042')
    expect(screen.getByRole('link', { name: /Voir la fiche/ })).toHaveAttribute('href', '/a/VIL-QUA-0042')
  })
})

describe('administration', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset())
    sessionStorage.clear()
  })
  afterEach(() => cleanup())

  it('refuse l’affichage à un compte non administrateur', async () => {
    signInAs('USER')
    api.listAdminAddresses.mockRejectedValue(new ApiError('Droits insuffisants', 403))
    visit('/admin')

    expect(await screen.findByRole('heading', { name: 'Accès réservé aux administrateurs' })).toBeInTheDocument()
  })

  it('affiche les indicateurs exacts du serveur, les signalements et les utilisateurs récents', async () => {
    signInAs('ADMIN')
    stubAdmin()
    api.listAdminAddresses.mockImplementation((_token: string, status: string) =>
      Promise.resolve(status === 'PENDING_VALIDATION' ? { ...emptyPage, items: [pending], totalElements: 1, totalPages: 1 } : emptyPage))
    visit('/admin')

    expect(await screen.findByText('Signalements en attente', { selector: 'small' })).toBeInTheDocument()
    expect(screen.getByText('Adresses enregistrées', { selector: 'small' }).parentElement).toHaveTextContent('42')
    expect(screen.getByText('Signalements en attente', { selector: 'small' }).parentElement).toHaveTextContent('3')
    expect(screen.getByText('Position incorrecte')).toBeInTheDocument()
    expect(screen.getByText('Awa Exemple')).toBeInTheDocument()
    expect(await screen.findByLabelText('3 signalements ouverts')).toBeInTheDocument()
    expect(screen.getByLabelText('5 en attente')).toBeInTheDocument()
  })

  it('écarte un signalement après confirmation', async () => {
    signInAs('ADMIN')
    stubAdmin()
    api.resolveReport.mockResolvedValue({ ...report, status: 'DISMISSED' })
    const u = userEvent.setup()
    visit('/admin/signalements')

    await u.click(await screen.findByRole('button', { name: 'Écarter le signalement sur VIL-QUA-0042' }))
    expect(api.resolveReport).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Confirmer : écarter' }))
    expect(api.resolveReport).toHaveBeenCalledWith('jeton', 'r1', 'dismiss')
    expect(await screen.findByText(/écarté : l’adresse reste en ligne/)).toBeInTheDocument()
  })

  it('valide une adresse de la file seulement après confirmation', async () => {
    signInAs('ADMIN')
    stubAdmin()
    api.listAdminAddresses.mockResolvedValue({ ...emptyPage, items: [pending], totalElements: 1, totalPages: 1 })
    api.moderateAddress.mockResolvedValue({ ...pending, status: 'VALIDATED' })
    const u = userEvent.setup()
    visit('/admin/moderation')

    expect(await screen.findByRole('heading', { name: 'VIL-QUA-0099' })).toBeInTheDocument()
    expect(screen.getByText(/consultable par toute personne connaissant son code/)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Valider VIL-QUA-0099' }))
    expect(api.moderateAddress).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Confirmer la validation' }))

    expect(api.moderateAddress).toHaveBeenCalledWith('jeton', 'p1', 'validate')
    expect(await screen.findByText('VIL-QUA-0099 : adresse validée.')).toBeInTheDocument()
  })

  it('signale une adresse déjà modérée par quelqu’un d’autre (409)', async () => {
    signInAs('ADMIN')
    stubAdmin()
    api.listAdminAddresses.mockResolvedValue({ ...emptyPage, items: [pending], totalElements: 1, totalPages: 1 })
    api.moderateAddress.mockRejectedValue(new ApiError('Déjà modérée', 409))
    const u = userEvent.setup()
    visit('/admin/moderation')

    await u.click(await screen.findByRole('button', { name: 'Rejeter VIL-QUA-0099' }))
    await u.click(screen.getByRole('button', { name: 'Confirmer le rejet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('VIL-QUA-0099 a déjà été modérée par un autre administrateur.')
  })
})
