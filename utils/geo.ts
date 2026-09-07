import type { Coordinates } from '~/types'

export function haversineDistance(a: Coordinates, b: Coordinates): number {
  const R = 6371000 // rayon de la Terre en metres
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)

  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)

  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng

  return 2 * R * Math.asin(Math.sqrt(h))
}
