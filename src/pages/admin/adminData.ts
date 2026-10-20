import { listAdminAddresses, type AddressStatus, type OwnerAddress } from '../../lib/api'
import { collectPages, type Collected } from '../../lib/collect'

export const ADMIN_STATUSES: AddressStatus[] = ['PENDING_VALIDATION', 'VALIDATED', 'REJECTED', 'ARCHIVED']
export type ByStatus = Record<AddressStatus, Collected<OwnerAddress>>

/** L'API liste les adresses par statut : on charge chaque statut puis on les réunit. */
export async function loadAllByStatus(token: string): Promise<ByStatus> {
  const results = await Promise.all(ADMIN_STATUSES.map((status) => collectPages((page) => listAdminAddresses(token, status, page, 50))))
  return Object.fromEntries(ADMIN_STATUSES.map((s, i) => [s, results[i]])) as ByStatus
}

export function flatten(data: ByStatus) {
  return ADMIN_STATUSES.flatMap((s) => data[s].items)
}

/** Nombre d'adresses créées pendant le mois civil en cours (indicateur « ce mois »). */
export function createdThisMonth(addresses: OwnerAddress[], now = new Date()) {
  return addresses.filter((a) => {
    const d = new Date(a.createdAt)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
}

/** Contexte transmis par AdminLayout aux pages : compteur de la file et rafraîchissement. */
export interface AdminOutletContext {
  pendingCount: number | null
  refreshPending: () => void
}
