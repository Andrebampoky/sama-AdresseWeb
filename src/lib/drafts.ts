import { ApiError, createMyAddress, uploadMyAddressPhoto, type NewAddressInput, type OwnerAddress } from './api'

/**
 * Brouillons hors ligne : une adresse saisie sans connexion est gardée sur l'appareil
 * (IndexedDB, photo comprise) avec son code PROVISOIRE, puis envoyée au serveur dès le retour du
 * réseau. Rien n'est présenté comme enregistré tant que le serveur n'a pas répondu.
 * Les brouillons sont rangés par compte : un autre compte du même appareil ne les voit pas.
 */
export interface AddressDraft {
  id: string
  userId: string
  createdAt: string
  input: NewAddressInput
  provisionalCode: string
  photo: Blob | null
  lastError: string | null
}

export const DRAFTS_CHANGED = 'samaadresse:drafts-changed'
const DB_NAME = 'samaadresse'
const STORE = 'drafts'

export function draftsSupported() {
  return typeof indexedDB !== 'undefined'
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('userId', 'userId')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = action(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

function notify() {
  window.dispatchEvent(new Event(DRAFTS_CHANGED))
}

export async function saveDraft(userId: string, input: NewAddressInput, provisionalCode: string, photo: Blob | null) {
  const draft: AddressDraft = {
    id: crypto.randomUUID(), userId, createdAt: new Date().toISOString(), input, provisionalCode, photo, lastError: null,
  }
  await run('readwrite', (store) => store.put(draft))
  notify()
  return draft
}

export async function listDrafts(userId: string): Promise<AddressDraft[]> {
  if (!draftsSupported()) return []
  const all = await run<AddressDraft[]>('readonly', (store) => store.index('userId').getAll(userId) as IDBRequest<AddressDraft[]>)
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function deleteDraft(id: string) {
  await run('readwrite', (store) => store.delete(id))
  notify()
}

export interface SyncReport {
  synced: OwnerAddress[]
  failed: number
  offline: boolean
}

let syncing: Promise<SyncReport> | null = null

/**
 * Envoie les brouillons dans l'ordre. Une coupure réseau arrête la synchronisation (on réessaiera) ;
 * un refus du serveur (données invalides) est noté sur le brouillon pour que la personne le corrige.
 * Un seul envoi à la fois : évite de créer deux fois la même adresse.
 */
export function syncDrafts(token: string, userId: string): Promise<SyncReport> {
  if (!syncing) {
    syncing = doSync(token, userId).finally(() => { syncing = null })
  }
  return syncing
}

async function doSync(token: string, userId: string): Promise<SyncReport> {
  const report: SyncReport = { synced: [], failed: 0, offline: false }
  for (const draft of await listDrafts(userId)) {
    let created: OwnerAddress
    try {
      created = await createMyAddress(token, draft.input)
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        report.offline = true
        break
      }
      report.failed++
      const message = error instanceof ApiError ? Object.values(error.fieldErrors)[0] ?? error.message : 'Erreur inattendue.'
      await run('readwrite', (store) => store.put({ ...draft, lastError: message }))
      continue
    }
    // L'adresse existe : on retire le brouillon même si la photo échoue (elle pourra être renvoyée).
    await deleteDraft(draft.id)
    if (draft.photo) {
      try {
        created = await uploadMyAddressPhoto(token, created.id, draft.photo)
      } catch {
        report.failed++
      }
    }
    report.synced.push(created)
  }
  notify()
  return report
}
