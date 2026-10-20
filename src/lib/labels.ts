import type { AddressStatus, PlaceType, ReportReason } from './api'

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  HOUSE: 'Maison',
  BUSINESS: 'Commerce',
  INSTITUTION: 'Institution',
  OTHER: 'Autre lieu',
}

export const STATUS_LABELS: Record<AddressStatus, string> = {
  PENDING_VALIDATION: 'En attente de validation',
  VALIDATED: 'Validée',
  REJECTED: 'Rejetée',
  ARCHIVED: 'Archivée',
}

export function visibilityLabel(address: { status: AddressStatus; publicationConsent: boolean; publiclyAccessible: boolean }) {
  if (address.publiclyAccessible) return 'Consultable publiquement par son code'
  if (!address.publicationConsent) return 'Privée : vous n’avez pas autorisé la publication'
  if (address.status === 'PENDING_VALIDATION') return 'Sera publique après validation'
  return 'Non publiée'
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value))
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase()
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(value))
}

export const REPORT_REASONS: Record<ReportReason, string> = {
  WRONG_LOCATION: 'Position incorrecte',
  NOT_EXISTING: 'Le lieu n’existe pas',
  INAPPROPRIATE: 'Contenu inapproprié',
  DUPLICATE: 'Adresse en double',
  OTHER: 'Autre problème',
}
