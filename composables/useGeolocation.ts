import { ref, onMounted, onUnmounted } from 'vue'
import type { Coordinates } from '~/types'

export function useGeolocation() {
  const position = ref<Coordinates | null>(null)
  const error = ref<string | null>(null)
  const isTracking = ref(false)

  let watchId: number | null = null

  function start() {
    if (!navigator.geolocation) {
      error.value = 'Geolocalisation non supportee'
      return
    }

    isTracking.value = true
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        position.value = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }
        error.value = null
      },
      (err) => {
        error.value = err.message
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      },
    )
  }

  function stop() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    isTracking.value = false
  }

  onMounted(() => start())
  onUnmounted(() => stop())

  return {
    position,
    error,
    isTracking,
    start,
    stop,
  }
}
