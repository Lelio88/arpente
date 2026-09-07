import { ref, watch, type Ref } from 'vue'
import type { Coordinates, Poi } from '~/types'

export function useProximity(
  position: Ref<Coordinates | null>,
  pois: Ref<Poi[]>,
) {
  const nearbyPoi = ref<Poi | null>(null)
  const distanceToPoi = ref<number | null>(null)

  watch(position, (pos) => {
    if (!pos) {
      nearbyPoi.value = null
      distanceToPoi.value = null
      return
    }

    let closest: Poi | null = null
    let closestDistance = Infinity

    for (const poi of pois.value) {
      const dist = haversineDistance(pos, { lat: poi.lat, lng: poi.lng })
      if (dist < poi.proximityRadius && dist < closestDistance) {
        closest = poi
        closestDistance = dist
      }
    }

    // Vibration quand on entre dans le rayon d'un POI
    const previous = nearbyPoi.value
    if (!previous && closest) {
      navigator.vibrate?.(150)
    }

    nearbyPoi.value = closest
    distanceToPoi.value = closest ? closestDistance : null
  })

  return {
    nearbyPoi,
    distanceToPoi,
  }
}
