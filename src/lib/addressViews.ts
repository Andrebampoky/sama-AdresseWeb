import type { MapAddress } from '../components/map/AddressMap'
import type { OwnerAddress } from './api'

export function toMapAddress(address: OwnerAddress): MapAddress {
  return {
    key: address.id,
    publicCode: address.publicCode,
    title: address.title,
    placeType: address.placeType,
    district: address.district,
    latitude: address.latitude,
    longitude: address.longitude,
    status: address.status,
    href: `/mes-adresses/${address.id}`,
  }
}

export function countByStatus(addresses: OwnerAddress[]) {
  return {
    validated: addresses.filter((a) => a.status === 'VALIDATED').length,
    pending: addresses.filter((a) => a.status === 'PENDING_VALIDATION').length,
    rejected: addresses.filter((a) => a.status === 'REJECTED').length,
    /** Validées ET publication consentie : seules celles-ci ont un lien public et un QR code. */
    publicOnes: addresses.filter((a) => a.publiclyAccessible).length,
  }
}
