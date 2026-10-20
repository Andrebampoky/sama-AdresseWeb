import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createMyAddress, getCurrentUser, getPublicAddress, listMyAddresses, login } from './api'

describe('getPublicAddress', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('récupère une fiche publique avec le code saisi', async () => {
    const address = {
      publicCode: 'ZIG-KBG-4271',
      title: 'Maison familiale',
      placeType: 'HOUSE',
      district: 'Kandé',
      city: 'Ziguinchor',
      description: null,
      latitude: 12.56,
      longitude: -16.27,
      photoUrl: null,
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(address), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getPublicAddress(' ZIG-KBG-4271 ')).resolves.toEqual(address)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/addresses/ZIG-KBG-4271',
      { headers: { Accept: 'application/json' } },
    )
  })

  it('remonte le statut HTTP pour afficher un état de recherche adapté', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    await expect(getPublicAddress('INCONNU')).rejects.toBeInstanceOf(ApiError)
    await expect(getPublicAddress('INCONNU')).rejects.toMatchObject({ status: 404 })
  })

  it('encode les caractères spéciaux du code dans le chemin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await getPublicAddress('A/B')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/addresses/A%2FB',
      { headers: { Accept: 'application/json' } },
    )
  })
})

describe('requêtes authentifiées', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('envoie les identifiants en JSON pour la connexion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"accessToken":"t"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await login({ email: 'a@exemple.test', password: 'secret-123456' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/v1/auth/login')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers.Authorization).toBeUndefined()
    expect(JSON.parse(init.body)).toEqual({ email: 'a@exemple.test', password: 'secret-123456' })
  })

  it('transmet le jeton dans l’en-tête Authorization et jamais dans l’URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"items":[]}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await listMyAddresses('jeton-abc')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/v1/me/addresses?page=0&size=20')
    expect(url).not.toContain('jeton-abc')
    expect(init.headers.Authorization).toBe('Bearer jeton-abc')
  })

  it('remonte le message et les erreurs par champ du backend', async () => {
    const problem = { status: 400, detail: 'Certains champs sont invalides.', errors: { latitude: 'Hors zone.' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(problem), { status: 400 })))

    const error = await createMyAddress('t', {
      title: 'Lieu', placeType: 'HOUSE', district: 'Q', city: 'V', description: null,
      latitude: 48.8, longitude: 2.3, publicationConsent: true,
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, message: 'Certains champs sont invalides.', fieldErrors: { latitude: 'Hors zone.' } })
  })

  it('signale une API injoignable avec le statut 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(getCurrentUser('t')).rejects.toMatchObject({ status: 0 })
  })
})
