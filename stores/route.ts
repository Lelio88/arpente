import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { RouteThematic } from '~/types'

export const useRouteStore = defineStore('route', () => {
  const activeRoute = ref<RouteThematic | null>(null)
  const currentPoiIndex = ref(0)
  const visitedSlugs = ref<string[]>([])

  const isNavigating = computed(() => activeRoute.value !== null)

  const currentPoiSlug = computed(() => {
    if (!activeRoute.value) return null
    return activeRoute.value.pois[currentPoiIndex.value]?.slug ?? null
  })

  const totalPois = computed(() => activeRoute.value?.pois.length ?? 0)

  const visitedCount = computed(() => visitedSlugs.value.length)

  const isLastPoi = computed(() => {
    if (!activeRoute.value) return false
    return currentPoiIndex.value >= activeRoute.value.pois.length - 1
  })

  const nextUnvisitedSlug = computed(() => {
    if (!activeRoute.value) return null
    return activeRoute.value.pois.find(
      (p) => !visitedSlugs.value.includes(p.slug),
    )?.slug ?? null
  })

  const allVisited = computed(() => {
    if (!activeRoute.value) return false
    return activeRoute.value.pois.every((p) => visitedSlugs.value.includes(p.slug))
  })

  function startRoute(route: RouteThematic) {
    activeRoute.value = route
    currentPoiIndex.value = 0
    visitedSlugs.value = loadVisited(route.slug)
  }

  function toggleVisited(slug: string) {
    const idx = visitedSlugs.value.indexOf(slug)
    if (idx >= 0) {
      visitedSlugs.value.splice(idx, 1)
    } else {
      visitedSlugs.value.push(slug)
    }
    saveVisited()
  }

  function isVisited(slug: string): boolean {
    return visitedSlugs.value.includes(slug)
  }

  function nextPoi() {
    if (!activeRoute.value) return
    if (currentPoiIndex.value < activeRoute.value.pois.length - 1) {
      currentPoiIndex.value++
    }
  }

  function previousPoi() {
    if (currentPoiIndex.value > 0) {
      currentPoiIndex.value--
    }
  }

  function stopRoute() {
    activeRoute.value = null
    currentPoiIndex.value = 0
    visitedSlugs.value = []
  }

  function loadVisited(routeSlug: string): string[] {
    if (typeof localStorage === 'undefined') return []
    const data = localStorage.getItem(`arpente-route-${routeSlug}`)
    return data ? JSON.parse(data) : []
  }

  function saveVisited() {
    if (typeof localStorage === 'undefined' || !activeRoute.value) return
    localStorage.setItem(
      `arpente-route-${activeRoute.value.slug}`,
      JSON.stringify(visitedSlugs.value),
    )
  }

  return {
    activeRoute,
    currentPoiIndex,
    visitedSlugs,
    isNavigating,
    currentPoiSlug,
    totalPois,
    visitedCount,
    isLastPoi,
    nextUnvisitedSlug,
    allVisited,
    startRoute,
    toggleVisited,
    isVisited,
    nextPoi,
    previousPoi,
    stopRoute,
  }
})
