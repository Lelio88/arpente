import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { City, CityConfig } from '~/types'

export const CITIES: CityConfig[] = [
  {
    slug: 'caen',
    name: 'Caen',
    center: { lat: 49.1829, lng: -0.3707 },
    zoom: 15,
  },
  {
    slug: 'troyes',
    name: 'Troyes',
    center: { lat: 48.2965, lng: 4.0745 },
    zoom: 15,
  },
]

const STORAGE_KEY = 'arpente-city'

export const useCityStore = defineStore('city', () => {
  // Toujours demarrer sur 'caen' : le rendu serveur n'a pas acces au localStorage,
  // donc l'etat initial doit etre identique cote serveur et cote client pour eviter
  // un mismatch d'hydratation. La vraie valeur est restauree par hydrateFromStorage()
  // depuis un hook client-only (voir layouts/default.vue).
  const currentCity = ref<City>('caen')

  const currentCityConfig = computed<CityConfig>(
    () => CITIES.find((c) => c.slug === currentCity.value) || CITIES[0]!,
  )

  function setCity(city: City) {
    currentCity.value = city
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, city)
    }
  }

  function hydrateFromStorage() {
    if (typeof localStorage === 'undefined') return
    const stored = localStorage.getItem(STORAGE_KEY)
    if (CITIES.some((c) => c.slug === stored)) {
      currentCity.value = stored as City
    }
  }

  return {
    currentCity,
    currentCityConfig,
    cities: CITIES,
    setCity,
    hydrateFromStorage,
  }
})
