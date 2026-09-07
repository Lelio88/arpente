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
  const currentCity = ref<City>(loadCity())

  const currentCityConfig = computed<CityConfig>(
    () => CITIES.find((c) => c.slug === currentCity.value) || CITIES[0]!,
  )

  function setCity(city: City) {
    currentCity.value = city
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, city)
    }
  }

  function loadCity(): City {
    if (typeof localStorage === 'undefined') return 'caen'
    const stored = localStorage.getItem(STORAGE_KEY)
    return CITIES.some((c) => c.slug === stored) ? (stored as City) : 'caen'
  }

  return {
    currentCity,
    currentCityConfig,
    cities: CITIES,
    setCity,
  }
})
