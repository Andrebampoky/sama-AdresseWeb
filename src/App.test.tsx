import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ApiError } from './lib/api'

const getPublicAddress = vi.hoisted(() => vi.fn())

vi.mock('./lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./lib/api')>()
  return { ...original, getPublicAddress }
})

describe('page d’accueil SamaAdresse', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    getPublicAddress.mockReset()
  })

  it('affiche une adresse trouvée par l’API', async () => {
    getPublicAddress.mockResolvedValue({
      publicCode: 'ZIG-KBG-4271',
      title: 'Maison familiale',
      placeType: 'HOUSE',
      district: 'Kandé',
      city: 'Ziguinchor',
      description: null,
      latitude: 12.56,
      longitude: -16.27,
      photoUrl: null,
    })
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Code SamaAdresse'), 'zig-kbg-4271')
    await user.click(within(screen.getByRole('form', { name: 'Recherche par code' }))
      .getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findByRole('heading', { name: 'ZIG-KBG-4271' })).toBeInTheDocument()
    expect(screen.getByText('Maison familiale · Kandé, Ziguinchor')).toBeInTheDocument()
  })

  it('annonce proprement un code sans résultat', async () => {
    getPublicAddress.mockRejectedValue(new ApiError('not found', 404))
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Code SamaAdresse'), 'ZIG-KBG-9999')
    await user.click(within(screen.getByRole('form', { name: 'Recherche par code' }))
      .getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Aucune adresse publique validée ne correspond à ce code.',
    )
  })

  it('indique à l’utilisateur que la recherche nécessite un code', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(within(screen.getByRole('form', { name: 'Recherche par code' }))
      .getByRole('button', { name: 'Rechercher' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Saisissez un code d’adresse pour lancer la recherche.',
    )
    expect(getPublicAddress).not.toHaveBeenCalled()
  })

  it('refuse un code mal formé sans appeler l’API', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Code SamaAdresse'), 'ZIG 4271')
    await user.click(within(screen.getByRole('form', { name: 'Recherche par code' }))
      .getByRole('button', { name: 'Rechercher' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Format attendu')
    expect(getPublicAddress).not.toHaveBeenCalled()
  })
})
