import { Building2, House, Landmark, Store } from 'lucide-react'
import type { PlaceType } from './api'

export const PLACE_TYPE_ICONS: Record<PlaceType, typeof House> = {
  HOUSE: House,
  BUSINESS: Store,
  INSTITUTION: Landmark,
  OTHER: Building2,
}
