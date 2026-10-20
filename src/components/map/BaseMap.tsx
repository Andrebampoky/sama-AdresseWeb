import 'leaflet/dist/leaflet.css'
import type { ReactNode } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { SENEGAL_CENTER } from '../../lib/geo'

interface BaseMapProps {
  center?: [number, number]
  zoom?: number
  interactive?: boolean
  label: string
  children?: ReactNode
}

/**
 * Carte Leaflet avec tuiles OpenStreetMap et attribution visible.
 * Note : les tuiles publiques d'OSM conviennent au développement ; en production à fort trafic,
 * utiliser un fournisseur de tuiles respectant sa politique d'usage.
 */
export function BaseMap({ center = SENEGAL_CENTER, zoom = 6, interactive = true, label, children }: BaseMapProps) {
  return (
    <div className="map-canvas" role="region" aria-label={label}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        zoomControl={interactive}
        keyboard={interactive}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>'
          maxZoom={19}
        />
        {children}
      </MapContainer>
    </div>
  )
}
