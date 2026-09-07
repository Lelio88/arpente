import { ref, watch, type Ref } from 'vue'
import type { Coordinates } from '~/types'

interface RoutingResult {
  coordinates: Coordinates[]
  distance: number // en metres
  duration: number // en secondes
}

export function useRouting(
  userPosition: Ref<Coordinates | null>,
  destination: Ref<Coordinates | null>,
) {
  const route = ref<RoutingResult | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function fetchRoute(from: Coordinates, to: Coordinates) {
    isLoading.value = true
    error.value = null

    try {
      const url = `https://router.project-osrm.org/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
      const response = await fetch(url)
      const data = await response.json()

      if (data.code !== 'Ok' || !data.routes?.[0]) {
        error.value = 'Itineraire introuvable'
        route.value = null
        return
      }

      const osrmRoute = data.routes[0]
      const coords: Coordinates[] = osrmRoute.geometry.coordinates.map(
        (c: [number, number]) => ({ lat: c[1], lng: c[0] }),
      )

      route.value = {
        coordinates: coords,
        distance: Math.round(osrmRoute.distance),
        duration: Math.round(osrmRoute.duration),
      }
    } catch {
      error.value = 'Erreur de calcul d\'itineraire'
      route.value = null
    } finally {
      isLoading.value = false
    }
  }

  // Recalculer l'itineraire quand la position ou la destination change
  watch(
    [userPosition, destination],
    ([pos, dest]) => {
      if (!pos || !dest) {
        route.value = null
        return
      }

      // Debounce de 5 secondes pour ne pas spammer l'API
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        fetchRoute(pos, dest)
      }, 5000)

      // Premier appel immediat
      if (!route.value) {
        if (debounceTimer) clearTimeout(debounceTimer)
        fetchRoute(pos, dest)
      }
    },
    { immediate: true },
  )

  function formatDistance(meters: number): string {
    if (meters < 1000) return `${meters}m`
    return `${(meters / 1000).toFixed(1)}km`
  }

  function formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `${minutes}min`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h${remainingMinutes.toString().padStart(2, '0')}`
  }

  return {
    route,
    isLoading,
    error,
    formatDistance,
    formatDuration,
  }
}
