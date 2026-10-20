import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { SESSION_KEY } from '../auth/AuthProvider'
import { ApiError, type OwnerAddress } from '../lib/api'

const api = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  getCurrentUser: vi.fn(),
  listMyAddresses: vi.fn(),
  createMyAddress: vi.fn(),
  getMyAddress: vi.fn(),
  uploadMyAddressPhoto: vi.fn(),
  fetchProtectedPhoto: vi.fn(),
  searchDirectory: vi.fn(),
}))

vi.mock('../lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api')>()
  return { ...original, ...api }
})

const user = { id: 'u1', email: 'demo@exemple.test', displayName: 'Compte démo', role: 'USER' as const, createdAt: '2026-10-19T08:00:00Z' }
const authResponse = { accessToken: 'jeton-test', tokenType: 'Bearer' as const, expiresAt: new Date(Date.now() + 3600_000).toISOString(), user }
const created: OwnerAddress = {
  id: 'a1', publicCode: 'VIL-QUA-0042', title: 'Lieu fictif', placeType: 'HOUSE', district: 'Quartier Exemple',
  city: 'Ville Exemple', description: null, latitude: 14.5, longitude: -15.5, status: 'PENDING_VALIDATION',
  publicationConsent: true, publiclyAccessible: false, createdAt: '2026-10-19T08:00:00Z', updatedAt: null, moderatedAt: null,
  hasPhoto: false, ownerNamePublic: false,
}
const page = (items: OwnerAddress[]) => ({ items, page: 0, size: 50, totalElements: items.length, totalPages: items.length ? 1 : 0 })

function visit(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

function signIn() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'jeton-test', expiresAt: authResponse.expiresAt, user }))
  api.getCurrentUser.mockResolvedValue(user)
}

type U = ReturnType<typeof userEvent.setup>

async function fillInformationStep(u: U, placeType = 'HOUSE') {
  await u.selectOptions(await screen.findByLabelText('Type de lieu'), placeType)
  await u.type(screen.getByLabelText('Nom du lieu'), 'Lieu fictif')
  await u.type(screen.getByLabelText('Ville ou commune'), 'Ville Exemple')
  await u.type(screen.getByLabelText('Quartier'), 'Quartier Exemple')
  await u.click(screen.getByRole('button', { name: /Suivant/ }))
}

describe('parcours compte et adresses', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset())
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('redirige un visiteur anonyme vers la connexion', async () => {
    visit('/mes-adresses')

    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument()
    expect(api.listMyAddresses).not.toHaveBeenCalled()
  })

  it('valide l’inscription côté client sans appeler l’API', async () => {
    const u = userEvent.setup()
    visit('/inscription')

    await u.type(screen.getByLabelText('E-mail'), 'pas-un-email')
    await u.type(screen.getByLabelText('Mot de passe'), 'court')
    await u.click(screen.getByRole('button', { name: 'Créer mon compte' }))

    expect(screen.getByText('L’e-mail n’est pas valide.')).toBeInTheDocument()
    expect(screen.getByText('Le mot de passe doit contenir entre 10 et 72 caractères.')).toBeInTheDocument()
    expect(api.register).not.toHaveBeenCalled()
  })

  it('permet d’afficher le mot de passe saisi', async () => {
    const u = userEvent.setup()
    visit('/connexion')

    const input = screen.getByLabelText('Mot de passe')
    expect(input).toHaveAttribute('type', 'password')
    await u.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }))
    expect(input).toHaveAttribute('type', 'text')
  })

  it('connecte la personne puis affiche son tableau de bord avec des chiffres réels', async () => {
    api.login.mockResolvedValue(authResponse)
    api.listMyAddresses.mockResolvedValue(page([created, { ...created, id: 'a2', publicCode: 'VIL-QUA-0043', status: 'VALIDATED' }]))
    const u = userEvent.setup()
    visit('/connexion')

    await u.type(screen.getByLabelText('E-mail'), 'demo@exemple.test')
    await u.type(screen.getByLabelText('Mot de passe'), 'motdepasse-42')
    await u.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(await screen.findByRole('heading', { name: 'Bonjour Compte' })).toBeInTheDocument()
    const stats = await screen.findByText('Mes adresses', { selector: 'small' })
    expect(stats.parentElement).toHaveTextContent('2')
    expect(screen.getByText('Validées', { selector: 'small' }).parentElement).toHaveTextContent('1')
    expect(screen.getByText('marqueur VIL-QUA-0042')).toBeInTheDocument()
    expect(api.listMyAddresses).toHaveBeenCalledWith('jeton-test', 0, 50)
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}').token).toBe('jeton-test')
  })

  it('affiche le message générique en cas d’identifiants refusés', async () => {
    api.login.mockRejectedValue(new ApiError('E-mail ou mot de passe incorrect.', 401))
    const u = userEvent.setup()
    visit('/connexion')

    await u.type(screen.getByLabelText('E-mail'), 'demo@exemple.test')
    await u.type(screen.getByLabelText('Mot de passe'), 'mauvais-42')
    await u.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou mot de passe incorrect.')
  })

  it('bloque le passage à l’étape suivante tant que les informations sont incomplètes', async () => {
    signIn()
    const u = userEvent.setup()
    visit('/mes-adresses/nouvelle')

    await u.click(await screen.findByRole('button', { name: /Suivant/ }))

    expect(screen.getByText('Choisissez un type de lieu.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Étape 1 sur 4/ })).toBeInTheDocument()
  })

  it('refuse un point hors de la zone couverte dès l’étape de localisation', async () => {
    signIn()
    const u = userEvent.setup()
    visit('/mes-adresses/nouvelle')

    await fillInformationStep(u)
    await u.type(screen.getByLabelText('Latitude'), '48.85')
    await u.type(screen.getByLabelText('Longitude'), '2.35')
    await u.click(screen.getByRole('button', { name: /Suivant/ }))

    expect(screen.getByText('Ce point est hors de la zone couverte (Sénégal).')).toBeInTheDocument()
  })

  it('crée l’adresse en trois étapes sans envoyer de code ni de statut', async () => {
    signIn()
    api.createMyAddress.mockResolvedValue(created)
    api.getMyAddress.mockResolvedValue(created)
    const u = userEvent.setup()
    visit('/mes-adresses/nouvelle')

    await fillInformationStep(u)
    await u.click(screen.getByRole('button', { name: 'Cliquer sur la carte (test)' }))
    expect(screen.getByLabelText('Latitude')).toHaveValue('14.500000')
    await u.click(screen.getByRole('button', { name: /Suivant/ }))
    expect(screen.getByRole('heading', { name: /Étape 3 sur 4 : photo/ })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: /Suivant/ }))

    await u.click(screen.getByRole('button', { name: /Enregistrer l’adresse/ }))
    expect(screen.getByText('Indiquez si cette adresse peut être publiée.')).toBeInTheDocument()
    expect(api.createMyAddress).not.toHaveBeenCalled()

    await u.click(screen.getByLabelText('J’autorise la publication de cette adresse après validation'))
    await u.click(screen.getByRole('button', { name: /Enregistrer l’adresse/ }))

    expect(api.createMyAddress).toHaveBeenCalledWith('jeton-test', {
      title: 'Lieu fictif', placeType: 'HOUSE', city: 'Ville Exemple', district: 'Quartier Exemple',
      description: null, latitude: 14.5, longitude: -15.5, publicationConsent: true, ownerNamePublic: false,
    })
    expect(await screen.findByRole('heading', { name: 'VIL-QUA-0042' })).toBeInTheDocument()
    // Le message de confirmation reprend le code définitif renvoyé par le serveur.
    expect(screen.getByText(/Adresse enregistrée avec le code définitif/)).toHaveTextContent(
      'Adresse enregistrée avec le code définitif VIL-QUA-0042. Elle est maintenant en attente de validation.')
    // Pas de lien public ni de QR tant que l'adresse n'est pas validée.
    expect(screen.queryByRole('link', { name: /QR code/ })).not.toBeInTheDocument()
    expect(api.uploadMyAddressPhoto).not.toHaveBeenCalled()
  })

  it('ramène à la bonne étape pour une erreur de champ renvoyée par le serveur', async () => {
    signIn()
    api.createMyAddress.mockRejectedValue(new ApiError('Certains champs sont invalides.', 400, {
      title: 'Le nom du lieu doit contenir entre 2 et 160 caractères.',
    }))
    const u = userEvent.setup()
    visit('/mes-adresses/nouvelle')

    await fillInformationStep(u, 'OTHER')
    await u.type(screen.getByLabelText('Latitude'), '14.5')
    await u.type(screen.getByLabelText('Longitude'), '-15,5')
    await u.click(screen.getByRole('button', { name: /Suivant/ }))
    await u.click(screen.getByRole('button', { name: /Suivant/ }))
    await u.click(screen.getByLabelText('Je garde cette adresse privée'))
    await u.click(screen.getByRole('button', { name: /Enregistrer l’adresse/ }))

    expect(await screen.findByText('Le nom du lieu doit contenir entre 2 et 160 caractères.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Étape 1 sur 4/ })).toBeInTheDocument()
    expect(api.createMyAddress.mock.calls[0][1]).toMatchObject({ publicationConsent: false, longitude: -15.5 })
  })

  it('déconnecte la personne si le serveur refuse le jeton', async () => {
    signIn()
    api.listMyAddresses.mockRejectedValue(new ApiError('Authentification requise.', 401))
    visit('/mes-adresses')

    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument()
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('ferme la session depuis la navigation latérale', async () => {
    signIn()
    api.listMyAddresses.mockResolvedValue(page([]))
    const u = userEvent.setup()
    visit('/mes-adresses')

    expect(await screen.findByText('Aucune adresse pour le moment')).toBeInTheDocument()
    await u.click(within(screen.getByRole('complementary')).getByRole('button', { name: 'Se déconnecter' }))

    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    expect(await screen.findByRole('link', { name: 'Se connecter' })).toBeInTheDocument()
  })

  it('n’affiche pas l’entrée Administration à un utilisateur ordinaire', async () => {
    signIn()
    api.listMyAddresses.mockResolvedValue(page([]))
    visit('/tableau-de-bord')

    await screen.findByRole('heading', { name: 'Bonjour Compte' })
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument()
  })

  it('annonce le préfixe du futur code avant l’enregistrement', async () => {
    signIn()
    const u = userEvent.setup()
    visit('/mes-adresses/nouvelle')
    await u.selectOptions(await screen.findByLabelText('Type de lieu'), 'HOUSE')
    await u.type(screen.getByLabelText('Nom du lieu'), 'Lieu fictif')
    await u.type(screen.getByLabelText('Ville ou commune'), 'Ziguinchor')
    await u.type(screen.getByLabelText('Quartier'), 'Kandé')
    await u.click(screen.getByRole('button', { name: /Suivant/ }))
    await u.click(screen.getByRole('button', { name: 'Cliquer sur la carte (test)' }))
    await u.click(screen.getByRole('button', { name: /Suivant/ }))
    await u.click(screen.getByRole('button', { name: /Suivant/ }))

    expect(screen.getByLabelText('Aperçu du code')).toHaveTextContent('ZIG-KAN-')
  })

  it('montre le suivi d’une adresse rejetée', async () => {
    signIn()
    api.getMyAddress.mockResolvedValue({ ...created, status: 'REJECTED', moderatedAt: '2026-10-19T09:00:00Z' })
    visit('/mes-adresses/a1')

    expect(await screen.findByText('Adresse rejetée')).toBeInTheDocument()
    expect(screen.getByText(/enregistrez une nouvelle adresse corrigée/)).toBeInTheDocument()
  })

  it('cherche dans l’annuaire public par quartier', async () => {
    api.searchDirectory.mockResolvedValue({ items: [{ publicCode: 'ZIG-KAN-6826', title: 'Boutique', placeType: 'BUSINESS',
      district: 'Kandé', city: 'Ziguinchor', description: null, latitude: 12.5, longitude: -16.2, photoUrl: null, ownerName: 'Awa' }],
    page: 0, size: 10, totalElements: 1, totalPages: 1 })
    const u = userEvent.setup()
    visit('/recherche?par=quartier')

    await u.type(await screen.findByLabelText('Quartier', { selector: 'input' }), 'Kandé')
    await u.type(screen.getByLabelText('Ville (facultatif)'), 'Ziguinchor')
    await u.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findByText('ZIG-KAN-6826')).toBeInTheDocument()
    expect(screen.getByText(/Commerce · Kandé · Ziguinchor · Awa/)).toBeInTheDocument()
    expect(api.searchDirectory).toHaveBeenCalledWith({ district: 'Kandé', city: 'Ziguinchor' }, 0, 10)
    expect(screen.getByRole('link', { name: /ZIG-KAN-6826/ })).toHaveAttribute('href', '/a/ZIG-KAN-6826')
  })

  it('refuse une recherche par propriétaire trop courte et annonce un résultat vide', async () => {
    api.searchDirectory.mockResolvedValue({ items: [], page: 0, size: 10, totalElements: 0, totalPages: 0 })
    const u = userEvent.setup()
    visit('/recherche?par=proprietaire')

    await u.type(await screen.findByLabelText('Nom du propriétaire'), 'A')
    await u.click(screen.getByRole('button', { name: 'Rechercher' }))
    expect(screen.getByRole('alert')).toHaveTextContent('au moins 2 lettres')
    expect(api.searchDirectory).not.toHaveBeenCalled()

    await u.type(screen.getByLabelText('Nom du propriétaire'), 'wa')
    await u.click(screen.getByRole('button', { name: 'Rechercher' }))
    expect(await screen.findByText('Aucune adresse publique ne correspond à cette recherche.')).toBeInTheDocument()
  })

  it('envoie la photo de façade juste après la création de l’adresse', async () => {
    signIn()
    api.createMyAddress.mockResolvedValue(created)
    api.getMyAddress.mockResolvedValue({ ...created, hasPhoto: true })
    api.uploadMyAddressPhoto.mockResolvedValue({ ...created, hasPhoto: true })
    api.fetchProtectedPhoto.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
    const u = userEvent.setup()
    visit('/mes-adresses/nouvelle')

    await fillInformationStep(u)
    await u.click(screen.getByRole('button', { name: 'Cliquer sur la carte (test)' }))
    await u.click(screen.getByRole('button', { name: /Suivant/ }))
    const photo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'facade.png', { type: 'image/png' })
    await u.upload(screen.getByLabelText('Choisir une photo'), photo)
    expect(await screen.findByAltText('Aperçu de la photo choisie')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: /Suivant/ }))
    expect(screen.getByText('Jointe (envoyée après l’enregistrement)')).toBeInTheDocument()
    await u.click(screen.getByLabelText('J’autorise la publication de cette adresse après validation'))
    await u.click(screen.getByRole('button', { name: /Enregistrer l’adresse/ }))

    expect(await screen.findByRole('heading', { name: 'VIL-QUA-0042' })).toBeInTheDocument()
    expect(api.uploadMyAddressPhoto).toHaveBeenCalledWith('jeton-test', 'a1', photo)
  })

  it('refuse un fichier qui n’est pas une image', async () => {
    signIn()
    const u = userEvent.setup({ applyAccept: false })
    visit('/mes-adresses/nouvelle')
    await fillInformationStep(u)
    await u.click(screen.getByRole('button', { name: 'Cliquer sur la carte (test)' }))
    await u.click(screen.getByRole('button', { name: /Suivant/ }))

    await u.upload(screen.getByLabelText('Choisir une photo'), new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choisissez une photo (JPEG, PNG ou WebP).')
  })

  it('garde l’adresse créée et propose de réessayer si l’envoi de la photo échoue', async () => {
    signIn()
    api.createMyAddress.mockResolvedValue(created)
    api.getMyAddress.mockResolvedValue(created)
    api.uploadMyAddressPhoto.mockRejectedValue(new ApiError('Certains champs sont invalides.', 400, { photo: 'Image illisible ou endommagée.' }))
    const u = userEvent.setup()
    visit('/mes-adresses/nouvelle')
    await fillInformationStep(u)
    await u.click(screen.getByRole('button', { name: 'Cliquer sur la carte (test)' }))
    await u.click(screen.getByRole('button', { name: /Suivant/ }))
    await u.upload(screen.getByLabelText('Choisir une photo'), new File(['x'], 'f.jpg', { type: 'image/jpeg' }))
    await u.click(screen.getByRole('button', { name: /Suivant/ }))
    await u.click(screen.getByLabelText('Je garde cette adresse privée'))
    await u.click(screen.getByRole('button', { name: /Enregistrer l’adresse/ }))

    expect(await screen.findByText(/La photo n’a pas pu être envoyée \(Image illisible ou endommagée\.\)/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'VIL-QUA-0042' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Photo de la façade/ })).toBeInTheDocument()
  })
})
