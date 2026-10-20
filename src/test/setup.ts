import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'
import { createElement } from 'react'
import { vi } from 'vitest'

// Les pages chargées à la demande (lazy) peuvent dépasser 1 s à la première transformation
// quand toute la suite tourne en parallèle : on laisse plus de marge aux attentes asynchrones.
configure({ asyncUtilTimeout: 4000 })

// Leaflet a besoin d'un vrai moteur de rendu (dimensions, canvas) : dans jsdom, les cartes sont
// remplacées par des doublures simples. Le rendu réel est vérifié dans Chrome (docs/PROGRESS.md).
vi.mock('../components/map/AddressMap', () => ({
  AddressMap: ({ addresses, label }: { addresses: Array<{ key: string; publicCode: string }>; label: string }) =>
    createElement('ul', { 'aria-label': label, 'data-testid': 'address-map' },
      addresses.map((a) => createElement('li', { key: a.key }, `marqueur ${a.publicCode}`))),
}))

vi.mock('../components/map/LocationPicker', () => ({
  LocationPicker: ({ onChange }: { onChange: (lat: number, lng: number) => void }) =>
    createElement('button', { type: 'button', onClick: () => onChange(14.5, -15.5) }, 'Cliquer sur la carte (test)'),
}))

// jsdom ne fournit pas les URL d'objets (aperçus de photos) : simples doublures.
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:aperçu-test')
  URL.revokeObjectURL = vi.fn()
}
